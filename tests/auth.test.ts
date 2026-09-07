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

test('после успешного хендшейка повторный вызов не ходит на POST /auth', async () => {
  const router = installFakeRouter({ acceptPasswords: true });

  await authenticate(settings);
  const afterFirst = router.calls.length;
  await authenticate(settings);

  assert.equal(router.calls.length, afterFirst + 1);
  assert.equal(router.calls.at(-1), 'GET /auth');
});

test('отклонённый пароль повторяется один раз и даёт честную ошибку', async () => {
  const router = installFakeRouter({ acceptPasswords: false });

  await assert.rejects(
    authenticate(settings),
    (error: unknown) =>
      error instanceof KeeneticError &&
      error.kind === 'auth' &&
      error.message === 'Роутер отклонил логин и пароль' &&
      String(error.detail).includes('веб-панель'),
  );

  assert.equal(router.calls.filter((call) => call.startsWith('POST')).length, 2);
});
