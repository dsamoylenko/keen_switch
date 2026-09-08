import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../src/lib/settings';

type Values = Record<string, unknown>;

function storageArea(values: Values): chrome.storage.StorageArea {
  return {
    get: async (keys?: string | string[] | Values | null) => {
      if (keys == null) return { ...values };
      const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(names.filter((name) => name in values).map((name) => [name, values[name]]));
    },
    set: async (items: Values) => {
      Object.assign(values, items);
    },
    remove: async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    },
  } as chrome.storage.StorageArea;
}

let local: Values;
let session: Values;
let originalChrome: typeof chrome;

beforeEach(() => {
  local = {};
  session = {};
  originalChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: storageArea(local),
      session: storageArea(session),
    },
  } as typeof chrome;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
});

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, password: 's3cret', ...overrides };
}

test('по умолчанию пароль хранится только в storage.session', async () => {
  await saveSettings(settings());

  assert.equal((local.settings as Values).password, undefined);
  assert.equal(local.routerPassword, undefined);
  assert.equal(session.routerPassword, 's3cret');
  assert.deepEqual(await loadSettings(), settings());
});

test('режим «навсегда» хранит пароль отдельным ключом в storage.local', async () => {
  const expected = settings({ passwordStorage: 'local' });
  await saveSettings(expected);

  assert.equal((local.settings as Values).password, undefined);
  assert.equal(local.routerPassword, 's3cret');
  assert.equal(session.routerPassword, undefined);
  assert.deepEqual(await loadSettings(), expected);
});

test('переключение на хранение до закрытия удаляет постоянную копию', async () => {
  await saveSettings(settings({ passwordStorage: 'local' }));
  await saveSettings(settings({ passwordStorage: 'session' }));

  assert.equal(local.routerPassword, undefined);
  assert.equal(session.routerPassword, 's3cret');
});

test('старый пароль мигрирует из settings в отдельный постоянный ключ', async () => {
  local.settings = { ...DEFAULT_SETTINGS, password: 'old-secret' };

  const loaded = await loadSettings();

  assert.equal(loaded.password, 'old-secret');
  assert.equal(loaded.passwordStorage, 'local');
  assert.equal((local.settings as Values).password, undefined);
  assert.equal(local.routerPassword, 'old-secret');
});

test('существующая сохранённая настройка считается завершённой без нового флага', async () => {
  local.settings = {
    baseUrl: 'http://192.168.1.1',
    login: 'admin',
    passwordStorage: 'session',
  };

  assert.equal((await loadSettings()).setupComplete, true);
});
