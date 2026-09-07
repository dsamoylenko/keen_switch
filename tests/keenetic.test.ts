import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  assertNoRciError,
  buildQueryObject,
  extractByPath,
  KeeneticError,
  parseHosts,
  parsePolicies,
  readPolicyId,
} from '../src/lib/keenetic';
import { md5Hex } from '../src/lib/md5';
import {
  normalizeBaseUrl,
  originPattern,
  removeUnusedRouterPermissions,
} from '../src/lib/settings';

test('md5Hex совпадает с эталонной реализацией', () => {
  for (const input of ['', 'abc', 'admin:Keenetic Giga:s3cret', 'пароль'.repeat(40)]) {
    assert.equal(md5Hex(input), createHash('md5').update(Buffer.from(input, 'utf8')).digest('hex'));
  }
});

test('buildQueryObject разворачивает путь в вложенный объект', () => {
  assert.deepEqual(buildQueryObject('ip.hotspot.host', { mac: 'aa:bb', permit: true }), {
    ip: { hotspot: { host: { mac: 'aa:bb', permit: true } } },
  });
  assert.deepEqual(buildQueryObject('whoami', {}), { whoami: {} });
});

test('extractByPath достаёт полезную нагрузку и не падает на частичном ответе', () => {
  const response = { show: { ip: { policy: { Policy0: { description: 'VPN' } } } } };
  assert.deepEqual(extractByPath(response, 'show.ip.policy'), { Policy0: { description: 'VPN' } });
  // Роутер вернул ошибку вместо ожидаемой структуры — отдаём ответ как есть.
  const error = { status: [{ status: 'error', message: 'no such command' }] };
  assert.deepEqual(extractByPath(error, 'show.ip.policy'), error);
});

test('assertNoRciError различает ошибки и предупреждения', () => {
  assert.doesNotThrow(() => assertNoRciError({ status: [{ status: 'message', message: 'ok' }] }, 'x'));
  assert.throws(
    () => assertNoRciError({ status: [{ status: 'error', message: 'policy not found' }] }, 'Смена политики'),
    (error: unknown) =>
      error instanceof KeeneticError && error.kind === 'rci' && error.detail === 'policy not found',
  );
});

test('parsePolicies понимает и объект, и массив', () => {
  assert.deepEqual(
    parsePolicies({ Policy0: { description: 'Через VPN' }, Policy1: { description: '' } }),
    [
      { id: 'Policy0', label: 'Через VPN' },
      { id: 'Policy1', label: 'Policy1' },
    ],
  );
  assert.deepEqual(parsePolicies([{ name: 'Policy2', description: 'Прямой' }]), [
    { id: 'Policy2', label: 'Прямой' },
  ]);
  assert.deepEqual(parsePolicies(null), []);
});

test('parseHosts нормализует MAC, берёт лучшее имя и поднимает онлайн наверх', () => {
  const hosts = parseHosts({
    host: [
      { mac: 'AA:BB:CC:00:00:01', hostname: 'nas', ip: '192.168.1.10', active: false },
      { mac: 'aa:bb:cc:00:00:02', name: 'MacBook', ip: '192.168.1.20', active: true },
      { ip: '192.168.1.30' },
    ],
  });
  assert.deepEqual(hosts, [
    { mac: 'aa:bb:cc:00:00:02', label: 'MacBook', ip: '192.168.1.20', active: true },
    { mac: 'aa:bb:cc:00:00:01', label: 'nas', ip: '192.168.1.10', active: false },
  ]);
});

test('parseHosts принимает голый массив и объект-словарь', () => {
  const fromArray = parseHosts([{ mac: 'aa:bb:cc:00:00:01', ip: '10.0.0.1', link: 'up' }]);
  const fromMap = parseHosts({ '0': { mac: 'aa:bb:cc:00:00:01', ip: '10.0.0.1', link: 'up' } });
  assert.deepEqual(fromArray, fromMap);
  assert.equal(fromArray[0].active, true);
});

test('readPolicyId отличает назначенную политику от её отсутствия', () => {
  assert.equal(readPolicyId({ mac: 'aa', policy: 'Policy0' }), 'Policy0');
  assert.equal(readPolicyId({ mac: 'aa', permit: true }), null);
  assert.equal(readPolicyId(undefined), null);
});

test('normalizeBaseUrl и originPattern дают узкое host permission', () => {
  assert.equal(normalizeBaseUrl(' 192.168.1.1 '), 'http://192.168.1.1');
  assert.equal(normalizeBaseUrl('http://192.168.2.1/admin/'), 'http://192.168.2.1');
  assert.equal(normalizeBaseUrl('https://router.keenetic.link:8443'), 'https://router.keenetic.link:8443');
  assert.equal(originPattern('http://192.168.2.1'), 'http://192.168.2.1/*');
});

test('после сохранения остаётся разрешение только для выбранного роутера', async () => {
  let removedOrigins: string[] = [];
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    permissions: {
      getAll: async () => ({
        permissions: ['storage'],
        origins: ['http://192.168.1.1/*', 'https://abandoned.test/*', 'https://router.local/*'],
      }),
      remove: async ({ origins }) => {
        removedOrigins = origins ?? [];
        return true;
      },
    },
  } as typeof chrome;

  try {
    assert.equal(
      await removeUnusedRouterPermissions('https://router.local'),
      true,
    );
    assert.deepEqual(removedOrigins, ['http://192.168.1.1/*', 'https://abandoned.test/*']);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
