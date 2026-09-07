export interface Settings {
  /** Базовый адрес веб-интерфейса роутера, например `http://192.168.1.1`. */
  baseUrl: string;
  login: string;
  /** Хранится в открытом виде в chrome.storage.local — см. предупреждение в Options. */
  password: string;
  /** true — MAC берётся у роутера через RCI `whoami` при каждом открытии попапа. */
  autoDetectDevice: boolean;
  /** MAC выбранного вручную устройства (нижний регистр, через `:`). */
  deviceMac: string;
  /** Человекочитаемое имя выбранного устройства — только для отображения. */
  deviceLabel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://192.168.1.1',
  login: 'admin',
  password: '',
  autoDetectDevice: true,
  deviceMac: '',
  deviceLabel: '',
};

const STORAGE_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
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
