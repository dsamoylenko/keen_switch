export interface Settings {
  /** Базовый адрес веб-интерфейса роутера, например `http://192.168.1.1`. */
  baseUrl: string;
  login: string;
  password: string;
  /** Где хранить пароль: только в памяти сессии или постоянно в профиле Chrome. */
  passwordStorage: PasswordStorage;
  /** true — MAC берётся у роутера через RCI `whoami` при каждом открытии попапа. */
  autoDetectDevice: boolean;
  /** MAC выбранного вручную устройства (нижний регистр, через `:`). */
  deviceMac: string;
  /** Человекочитаемое имя выбранного устройства — только для отображения. */
  deviceLabel: string;
}

export type PasswordStorage = 'session' | 'local';

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://192.168.1.1',
  login: 'admin',
  password: '',
  passwordStorage: 'session',
  autoDetectDevice: true,
  deviceMac: '',
  deviceLabel: '',
};

const STORAGE_KEY = 'settings';
const PASSWORD_KEY = 'routerPassword';

type StoredSettings = Omit<Settings, 'password'> & {
  /** Старые версии хранили пароль прямо в объекте settings. */
  password?: string;
};

export async function loadSettings(): Promise<Settings> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEY, PASSWORD_KEY]),
    chrome.storage.session.get(PASSWORD_KEY),
  ]);
  const stored = (local[STORAGE_KEY] as Partial<StoredSettings> | undefined) ?? {};
  const hasLegacyPassword = typeof stored.password === 'string';
  const legacyPassword = hasLegacyPassword ? stored.password! : '';
  const passwordStorage: PasswordStorage =
    stored.passwordStorage === 'local' || legacyPassword ? 'local' : 'session';
  const password =
    passwordStorage === 'local'
      ? ((local[PASSWORD_KEY] as string | undefined) ?? legacyPassword)
      : ((session[PASSWORD_KEY] as string | undefined) ?? '');
  const { password: _legacyPassword, ...settingsWithoutLegacyPassword } = stored;

  // Одноразовая миграция: пароль больше не лежит внутри общего объекта настроек.
  if (hasLegacyPassword) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...settingsWithoutLegacyPassword, passwordStorage },
      ...(legacyPassword ? { [PASSWORD_KEY]: legacyPassword } : {}),
    });
    if (!legacyPassword) await chrome.storage.local.remove(PASSWORD_KEY);
  }

  return {
    ...DEFAULT_SETTINGS,
    ...settingsWithoutLegacyPassword,
    password,
    passwordStorage,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const { password, ...storedSettings } = settings;

  if (!password) {
    await Promise.all([
      chrome.storage.local.set({ [STORAGE_KEY]: storedSettings }),
      chrome.storage.local.remove(PASSWORD_KEY),
      chrome.storage.session.remove(PASSWORD_KEY),
    ]);
    return;
  }

  if (settings.passwordStorage === 'local') {
    await Promise.all([
      chrome.storage.local.set({
        [STORAGE_KEY]: storedSettings,
        [PASSWORD_KEY]: password,
      }),
      chrome.storage.session.remove(PASSWORD_KEY),
    ]);
    return;
  }

  await Promise.all([
    chrome.storage.local.set({ [STORAGE_KEY]: storedSettings }),
    chrome.storage.local.remove(PASSWORD_KEY),
    chrome.storage.session.set({ [PASSWORD_KEY]: password }),
  ]);
}

/** Не даёт будущим content scripts читать настройки и пароль напрямую. */
export async function restrictStorageAccess(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}

/** Приводит введённый пользователем адрес к виду `http://host[:port]` без хвостового слэша. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  return `${url.protocol}//${url.host}`;
}

/** Шаблон host permission ровно для одного роутера, например `http://192.168.1.1/*`. */
export function originPattern(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}/*`;
}

export async function hasRouterPermission(baseUrl: string): Promise<boolean> {
  if (!baseUrl) return false;
  return chrome.permissions.contains({ origins: [originPattern(baseUrl)] });
}

/** Оставляет host permission только для сохранённого адреса роутера. */
export async function removeUnusedRouterPermissions(baseUrl: string): Promise<boolean> {
  const keptPattern = originPattern(baseUrl);
  const granted = await chrome.permissions.getAll();
  const staleOrigins = (granted.origins ?? []).filter(
    (pattern) => /^https?:\/\//.test(pattern) && pattern !== keptPattern,
  );
  if (staleOrigins.length === 0) return false;
  return chrome.permissions.remove({ origins: staleOrigins });
}
