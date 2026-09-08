import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { authenticate, KeeneticError } from '../src/lib/keenetic';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  baseUrl: 'http://192.168.1.1',
  login: 'admin',
  password: 's3cret',
};

interface FakeRouter {
  calls: string[];
  challenges: string[];
}

/**
 * Роутер, повторяющий поведение KeeneticOS: каждый GET /auth выдаёт новый
 * challenge, а POST /auth принимается только если хеш посчитан по challenge из
 * последнего выданного.
 */
function installFakeRouter(options: { acceptPasswords: boolean }): FakeRouter {
  const state: FakeRouter = { calls: [], challenges: [] };
  let authorized = false;
  let counter = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    state.calls.push(`${method} ${new URL(url).pathname}`);

    if (method === 'GET') {
      if (authorized) return new Response('', { status: 200 });
      counter += 1;
      const challenge = `challenge-${counter}`;
      state.challenges.push(challenge);
      return new Response('', {
        status: 401,
        headers: { 'X-NDM-Realm': 'Keenetic Giga', 'X-NDM-Challenge': challenge },
      });
    }

    if (options.acceptPasswords) authorized = true;
    return new Response('', { status: options.acceptPasswords ? 200 : 401 });
  }) as typeof fetch;

  return state;
}

afterEach(() => {
  // @ts-expect-error — возвращаем окружение в исходное состояние
  delete globalThis.fetch;
});

test('параллельные вызовы authenticate делят один хендшейк', async () => {
  const router = installFakeRouter({ acceptPasswords: true });

  await Promise.all([authenticate(settings), authenticate(settings), authenticate(settings)]);

  const posts = router.calls.filter((call) => call.startsWith('POST'));
  assert.equal(posts.length, 1, `ожидался один POST /auth, было: ${router.calls.join(', ')}`);
  // Один challenge на хендшейк: иначе POST ушёл бы с cookie от чужой сессии.
  assert.equal(router.challenges.length, 1);
});

test('параллельные вызовы с другими credentials не делят результат хендшейка', async () => {
  const router = installFakeRouter({ acceptPasswords: true });

  const [first, second] = await Promise.all([
    authenticate(settings),
    authenticate({ ...settings, password: 'другой пароль' }),
  ]);

  assert.equal(first, 'credentials-verified');
  assert.equal(second, 'existing-session');
  assert.equal(router.calls.filter((call) => call.startsWith('POST')).length, 1);
});

test('после успешного хендшейка повторный вызов не ходит на POST /auth', async () => {
  const router = installFakeRouter({ acceptPasswords: true });

  assert.equal(await authenticate(settings), 'credentials-verified');
  const afterFirst = router.calls.length;
  assert.equal(await authenticate({ ...settings, password: 'wrong' }), 'existing-session');

  assert.equal(router.calls.length, afterFirst + 1);
  assert.equal(router.calls.at(-1), 'GET /auth');
});

test('сетевой таймаут превращается в понятную ошибку', async () => {
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.signal, 'каждый запрос должен иметь AbortSignal');
    throw new DOMException('timed out', 'TimeoutError');
  }) as typeof fetch;

  await assert.rejects(
    authenticate(settings),
    (error: unknown) =>
      // Ассерт по ключу, а не по формулировке — как и в остальных тестах ошибок.
      error instanceof KeeneticError &&
      error.kind === 'network' &&
      error.key === 'errRouterTimeout' &&
      error.detail === 'errRouterTimeoutDetail',
  );
});

test('отклонённый пароль повторяется один раз и даёт честную ошибку', async () => {
  const router = installFakeRouter({ acceptPasswords: false });

  await assert.rejects(
    authenticate(settings),
    // Ассерт по ключу, а не по формулировке: текст живёт в _locales и меняется
    // без участия теста, идентичность ошибки — нет.
    (error: unknown) =>
      error instanceof KeeneticError &&
      error.kind === 'auth' &&
      error.key === 'errAuthRejected' &&
      error.detail === 'errAuthRejectedDetail',
  );

  assert.equal(router.calls.filter((call) => call.startsWith('POST')).length, 2);
});
