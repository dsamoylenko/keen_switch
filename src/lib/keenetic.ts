/**
 * Клиент RCI (Remote Control Interface) KeeneticOS.
 *
 * Схема снята с живого роутера (KeeneticOS 5.01) и с кода веб-панели:
 *
 *   GET  /auth                     -> 401 + заголовки X-NDM-Realm / X-NDM-Challenge
 *                                     и Set-Cookie со СЛУЧАЙНЫМ именем сессионной cookie
 *   POST /auth {login, password}   -> password = SHA256(challenge + MD5("login:realm:password"))
 *   GET  /auth                     -> 200, если сессия авторизована
 *
 *   POST /rci/  [ {…}, {…} ]       -> батч команд; каждая команда — это путь вида
 *                                     `ip.hotspot.host`, развёрнутый в вложенный объект
 *                                     {"ip":{"hotspot":{"host":{…}}}}; ответ — массив
 *                                     в том же порядке.
 *
 * Имя сессионной cookie у каждой сессии своё, поэтому мы не трогаем её руками, а
 * полагаемся на cookie jar браузера (`credentials: 'include'` + host permission).
 */

import { selectableHosts } from './devices';
import { md5Hex } from './md5';
import { t } from './i18n';
import type { Settings } from './settings';

export type ErrorKind = 'config' | 'permission' | 'network' | 'auth' | 'rci';

export interface KeeneticErrorOptions {
  /** Подстановки в основное сообщение. */
  subs?: string | string[];
  /** Ключ каталога для пояснения. */
  detailKey?: string;
  /** Подстановки в пояснение. */
  detailSubs?: string | string[];
  /** Готовое пояснение от роутера или браузера — диагностика, она не переводится. */
  detailText?: string;
}

/**
 * Ошибка несёт ключ каталога, а не готовый текст: `key` — машинная
 * идентичность ошибки, по ней ассертят тесты и ветвится UI, а формулировка
 * живёт в _locales и меняется независимо.
 */
export class KeeneticError extends Error {
  readonly detail?: string;

  constructor(
    readonly kind: ErrorKind,
    readonly key: string,
    options: KeeneticErrorOptions = {},
  ) {
    super(t(key, options.subs));
    this.name = 'KeeneticError';
    this.detail =
      options.detailText ??
      (options.detailKey ? t(options.detailKey, options.detailSubs) : undefined);
  }
}

export interface Policy {
  id: string;
  label: string;
}

export interface HostSummary {
  mac: string;
  label: string;
  ip: string;
  active: boolean;
}

export type AuthenticationStatus = 'existing-session' | 'credentials-verified';

export interface DeviceState {
  /** MAC устройства, для которого показываются политики. */
  mac: string;
  label: string;
  ip: string;
  /** Роутер знает это устройство (есть в списке хостов). */
  known: boolean;
  /**
   * Как выбран MAC: роутер узнал устройство сам (`whoami`), оно задано вручную
   * в настройках (`manual`) или выбрано в списке попапа (`picked`).
   */
  detectedBy: 'whoami' | 'manual' | 'picked';
  policies: Policy[];
  /** Политика, действующая на устройства без явной привязки. */
  defaultPolicyId: string | null;
  /** Текущая политика устройства; null — «без политики» (используется политика по умолчанию). */
  currentPolicyId: string | null;
  /** Устройству запрещён доступ в интернет (`deny` в hotspot). */
  blocked: boolean;
}

/* Внутренние помощники ниже экспортируются ради тестов в tests/. */

const PATH_POLICIES = 'show.sc.ip.policy';
const PATH_HOST_CONFIG = 'show.sc.ip.hotspot.host';
const PATH_DEFAULT_POLICY = 'show.sc.ip.hotspot.default-policy';
const PATH_HOTSPOT = 'show.ip.hotspot';
const PATH_WHOAMI = 'whoami';
const PATH_WRITE_HOST = 'ip.hotspot.host';
const PATH_SAVE_CONFIG = 'system.configuration.save';

interface RciQuery {
  path: string;
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ auth */

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const ROUTER_TIMEOUT_MS = 15_000;

async function routerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    // no-referrer: KeeneticOS отвечает 403, если Referer не совпадает с ним самим,
    // а Chrome иначе подставил бы сюда chrome-extension://<id>/.
    return await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
      ...init,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new KeeneticError('network', 'errRouterTimeout', {
        detailKey: 'errRouterTimeoutDetail',
        detailSubs: String(ROUTER_TIMEOUT_MS / 1000),
      });
    }
    throw new KeeneticError('network', 'errRouterUnreachable', {
      detailText: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/**
 * Один хендшейк: GET /auth за challenge, POST /auth с ответом на него.
 *
 * Важное свойство KeeneticOS: КАЖДЫЙ `GET /auth` выдаёт новую сессионную cookie
 * и новый challenge, а роутер сверяет присланный хеш с challenge той сессии,
 * cookie которой пришла вместе с POST. Значит между GET и POST не должно
 * вклиниться ни одного чужого `GET /auth` — иначе cookie в браузере уже от
 * другой сессии, хеш не сойдётся и роутер ответит 401, неотличимым от
 * настоящего «неверный пароль».
 */
async function performHandshake(
  settings: Settings,
): Promise<AuthenticationStatus | 'rejected'> {
  const authUrl = `${settings.baseUrl}/auth`;

  const probe = await routerFetch(authUrl, { method: 'GET' });
  if (probe.status === 200) return 'existing-session';
  if (probe.status !== 401) {
    throw new KeeneticError('auth', 'errAuthUnexpectedStatus', { subs: String(probe.status) });
  }

  const realm = probe.headers.get('X-NDM-Realm');
  const challenge = probe.headers.get('X-NDM-Challenge');
  if (!realm || !challenge) {
    throw new KeeneticError('auth', 'errNoChallenge', { detailKey: 'errNoChallengeDetail' });
  }

  if (!settings.password) {
    throw new KeeneticError('config', 'errPasswordNotSet');
  }

  const hashedPassword = await sha256Hex(
    challenge + md5Hex(`${settings.login}:${realm}:${settings.password}`),
  );

  const response = await routerFetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: settings.login, password: hashedPassword }),
  });

  if (response.status === 401 || response.status === 403) return 'rejected';
  if (!response.ok) {
    throw new KeeneticError('auth', 'errAuthFailedStatus', { subs: String(response.status) });
  }

  // Проверяем, что сессионная cookie действительно сохранилась в браузере:
  // без этого следующие запросы к /rci/ молча вернут 401.
  const verify = await routerFetch(authUrl, { method: 'GET' });
  if (verify.status !== 200) {
    throw new KeeneticError('auth', 'errSessionNotStored', {
      detailKey: 'errSessionNotStoredDetail',
    });
  }
  return 'credentials-verified';
}

async function performAuthentication(settings: Settings): Promise<AuthenticationStatus> {
  const firstAttempt = await performHandshake(settings);
  if (firstAttempt !== 'rejected') return firstAttempt;

  // Сессию мог перебить чужой `GET /auth` — например, открытая в соседней
  // вкладке веб-панель роутера ходит туда сама. Прежде чем обвинять пароль,
  // пробуем ещё раз с заново взятым challenge.
  const secondAttempt = await performHandshake(settings);
  if (secondAttempt !== 'rejected') return secondAttempt;

  throw new KeeneticError('auth', 'errAuthRejected', { detailKey: 'errAuthRejectedDetail' });
}

let pendingAuth: Promise<AuthenticationStatus> | null = null;
let pendingAuthKey = '';

/**
 * Гарантирует авторизованную сессию. Идемпотентна и single-flight: параллельные
 * вызовы разделяют один хендшейк, иначе их `GET /auth` перетирают друг другу
 * сессионную cookie.
 */
export function authenticate(settings: Settings): Promise<AuthenticationStatus> {
  const key = JSON.stringify([settings.baseUrl, settings.login, settings.password]);

  if (pendingAuth) {
    if (pendingAuthKey === key) return pendingAuth;
    // Другие credentials нельзя смешивать с текущим handshake: ждём его
    // завершения и запускаем отдельную проверку со своими настройками.
    return pendingAuth.catch(() => undefined).then(() => authenticate(settings));
  }

  pendingAuthKey = key;
  const tracked = performAuthentication(settings).finally(() => {
    if (pendingAuth === tracked) {
      pendingAuth = null;
      pendingAuthKey = '';
    }
  });
  pendingAuth = tracked;
  return tracked;
}

/* ------------------------------------------------------------------- rci */

export function buildQueryObject(path: string, data: Record<string, unknown>): unknown {
  const segments = path.split('.');
  let result: unknown = data;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    result = { [segments[i]]: result };
  }
  return result;
}

export function extractByPath(response: unknown, path: string): unknown {
  let cursor: unknown = response;
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(segment in cursor)) {
      return response;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Ищет в ответе RCI записи `status` с уровнем `error` и превращает их в исключение. */
export function assertNoRciError(value: unknown, actionKey: string): void {
  if (value === null || typeof value !== 'object') return;
  const status = (value as Record<string, unknown>).status;
  if (!Array.isArray(status)) return;

  const failures = status.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).status === 'error',
  );
  if (failures.length === 0) return;

  const message = failures
    .map((entry) => String(entry.message ?? entry.code ?? 'unknown error'))
    .join('; ');
  throw new KeeneticError('rci', 'errRciAction', { subs: t(actionKey), detailText: message });
}

async function rci(settings: Settings, queries: RciQuery[]): Promise<unknown[]> {
  const response = await routerFetch(`${settings.baseUrl}/rci/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queries.map((query) => buildQueryObject(query.path, query.data ?? {}))),
  });

  if (response.status === 401) {
    throw new KeeneticError('auth', 'errSessionExpired');
  }
  if (response.status === 403) {
    throw new KeeneticError('rci', 'errForbidden', { detailKey: 'errForbiddenDetail' });
  }
  if (!response.ok) {
    throw new KeeneticError('rci', 'errRciHttp', { subs: String(response.status) });
  }

  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body) || body.length !== queries.length) {
    throw new KeeneticError('rci', 'errBadResponse');
  }

  return queries.map((query, index) => extractByPath(body[index], query.path));
}

/** Один повтор после переавторизации: сессия роутера живёт недолго. */
async function rciWithAuth(settings: Settings, queries: RciQuery[]): Promise<unknown[]> {
  return (await rciWithAuthStatus(settings, queries)).values;
}

async function rciWithAuthStatus(
  settings: Settings,
  queries: RciQuery[],
): Promise<{ values: unknown[]; credentialsVerified: boolean }> {
  let credentialsVerified = (await authenticate(settings)) === 'credentials-verified';
  try {
    return { values: await rci(settings, queries), credentialsVerified };
  } catch (error) {
    if (error instanceof KeeneticError && error.kind === 'auth') {
      credentialsVerified =
        (await authenticate(settings)) === 'credentials-verified' || credentialsVerified;
      return { values: await rci(settings, queries), credentialsVerified };
    }
    throw error;
  }
}

/* --------------------------------------------------------------- parsing */

function toArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    );
  }
  return [];
}

export function normalizeMac(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * `show.sc.ip.policy` отдаёт объект вида `{ Policy0: { description: "…" } }`.
 * На части прошивок это массив — обрабатываем оба варианта.
 */
export function parsePolicies(raw: unknown): Policy[] {
  if (raw === null || typeof raw !== 'object') return [];

  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((item) => [String((item as Record<string, unknown>)?.name ?? ''), item])
    : Object.entries(raw as Record<string, unknown>);

  return entries
    .filter(([id]) => id.length > 0)
    .map(([id, value]) => {
      const description =
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>).description
          : undefined;
      return {
        id,
        label: typeof description === 'string' && description.trim() ? description.trim() : id,
      };
    });
}

export function parseHosts(raw: unknown): HostSummary[] {
  const source =
    raw !== null && typeof raw === 'object' && 'host' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).host
      : raw;

  return toArray(source)
    .map((entry) => {
      const mac = normalizeMac(entry.mac);
      const name = [entry.name, entry.hostname, entry.ip, mac].find(
        (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
      );
      return {
        mac,
        label: (name ?? mac).trim(),
        ip: typeof entry.ip === 'string' ? entry.ip : '',
        active: entry.active === true || entry.link === 'up',
      };
    })
    .filter((host) => host.mac.length > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label, 'ru'));
}

function findHostConfig(raw: unknown, mac: string): Record<string, unknown> | undefined {
  return toArray(raw).find((entry) => normalizeMac(entry.mac) === mac);
}

export function readPolicyId(entry: Record<string, unknown> | undefined): string | null {
  if (!entry) return null;
  const policy = entry.policy;
  return typeof policy === 'string' && policy.length > 0 ? policy : null;
}

/* ------------------------------------------------------------------- API */

export async function fetchHosts(settings: Settings): Promise<HostSummary[]> {
  const [hotspot] = await rciWithAuth(settings, [{ path: PATH_HOTSPOT }]);
  return parseHosts(hotspot);
}

/** MAC текущего устройства глазами роутера. */
export async function fetchWhoami(settings: Settings): Promise<{ mac: string; ip: string }> {
  const [whoami] = await rciWithAuth(settings, [{ path: PATH_WHOAMI }]);
  return parseWhoami(whoami);
}

function parseWhoami(raw: unknown): { mac: string; ip: string } {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    mac: normalizeMac(record.mac),
    ip: typeof record.host === 'string' ? record.host : '',
  };
}

/**
 * Список устройств и MAC текущего — одним батчем. Отдельными запросами делать
 * нельзя: параллельные вызовы устроили бы гонку за сессию роутера.
 */
export async function fetchOverview(
  settings: Settings,
): Promise<{ hosts: HostSummary[]; whoamiMac: string; credentialsVerified: boolean }> {
  const { values, credentialsVerified } = await rciWithAuthStatus(settings, [
    { path: PATH_HOTSPOT },
    { path: PATH_WHOAMI },
  ]);
  const [hotspot, whoami] = values;
  return { hosts: parseHosts(hotspot), whoamiMac: parseWhoami(whoami).mac, credentialsVerified };
}

/** Один батч, покрывающий всё, что нужно попапу: политики, хосты и whoami. */
const STATE_QUERIES: RciQuery[] = [
  { path: PATH_POLICIES },
  { path: PATH_HOST_CONFIG },
  { path: PATH_DEFAULT_POLICY },
  { path: PATH_HOTSPOT },
  { path: PATH_WHOAMI },
];

export interface RawState {
  policies: Policy[];
  hostConfigs: unknown;
  defaultPolicyId: string | null;
  hosts: HostSummary[];
  whoamiMac: string;
}

async function fetchRawState(settings: Settings): Promise<RawState> {
  const [rawPolicies, rawHostConfig, rawDefaultPolicy, rawHotspot, rawWhoami] = await rciWithAuth(
    settings,
    STATE_QUERIES,
  );

  return {
    policies: parsePolicies(rawPolicies),
    hostConfigs: rawHostConfig,
    defaultPolicyId: readPolicyId(rawDefaultPolicy as Record<string, unknown> | undefined),
    hosts: parseHosts(rawHotspot),
    whoamiMac: parseWhoami(rawWhoami).mac,
  };
}

/**
 * Собирает состояние одного устройства.
 *
 * `requestedMac` — устройство, выбранное в списке попапа; без него берётся то,
 * что задано настройками: MAC от роутера (`whoami`) либо выбранный вручную.
 */
export function resolveDevice(
  raw: RawState,
  settings: Settings,
  requestedMac?: string,
): DeviceState {
  const requested = normalizeMac(requestedMac);
  const mac =
    requested || (settings.autoDetectDevice ? raw.whoamiMac : normalizeMac(settings.deviceMac));

  if (!mac) {
    throw new KeeneticError(
      'config',
      settings.autoDetectDevice ? 'errWhoamiFailed' : 'errNoDeviceSelected',
    );
  }

  const host = raw.hosts.find((item) => item.mac === mac);
  const hostConfig = findHostConfig(raw.hostConfigs, mac);

  return {
    mac,
    label: host?.label || (mac === normalizeMac(settings.deviceMac) ? settings.deviceLabel : '') || mac,
    ip: host?.ip ?? '',
    known: host !== undefined,
    // Своё устройство остаётся «своим», даже если его выбрали в списке руками.
    detectedBy: mac === raw.whoamiMac ? 'whoami' : requested ? 'picked' : 'manual',
    policies: raw.policies,
    defaultPolicyId: raw.defaultPolicyId,
    currentPolicyId: readPolicyId(hostConfig),
    blocked: hostConfig?.deny === true,
  };
}

export async function fetchDeviceState(
  settings: Settings,
  requestedMac?: string,
): Promise<DeviceState> {
  return resolveDevice(await fetchRawState(settings), settings, requestedMac);
}

export interface PopupState {
  device: DeviceState;
  /** Устройства для выпадающего списка: активные плюс само выбранное. */
  devices: HostSummary[];
  whoamiMac: string;
}

/**
 * Состояние попапа целиком — одним обращением к роутеру. Отдельными запросами
 * делать нельзя: параллельные вызовы устроили бы гонку за сессию роутера.
 */
export async function fetchPopupState(
  settings: Settings,
  requestedMac?: string,
): Promise<PopupState> {
  const raw = await fetchRawState(settings);
  const device = resolveDevice(raw, settings, requestedMac);
  return {
    device,
    devices: selectableHosts(raw.hosts, device.mac),
    whoamiMac: raw.whoamiMac,
  };
}

/**
 * Назначает устройству политику (`policyId`) либо снимает её (`null` — устройство
 * начинает ходить по политике по умолчанию). Payload повторяет то, что шлёт
 * веб-панель: `{mac, permit: true, policy}` / `{mac, permit: true, conform: false,
 * policy: {no: true}}`.
 */
export async function setDevicePolicy(
  settings: Settings,
  mac: string,
  policyId: string | null,
): Promise<DeviceState> {
  const data: Record<string, unknown> = policyId
    ? { mac, permit: true, policy: policyId }
    : { mac, permit: true, conform: false, policy: { no: true } };

  const [writeResult, saveResult] = await rciWithAuth(settings, [
    { path: PATH_WRITE_HOST, data },
    { path: PATH_SAVE_CONFIG },
  ]);

  assertNoRciError(writeResult, 'actionSetPolicy');
  assertNoRciError(saveResult, 'actionSaveConfig');

  // Перечитываем состояние с роутера: единственный честный способ убедиться,
  // что политика действительно применилась.
  const state = await fetchDeviceState(settings, mac);
  if (state.currentPolicyId !== policyId) {
    throw new KeeneticError('rci', 'errPolicyNotApplied', {
      detailKey: 'errPolicyNotAppliedDetail',
      detailSubs: [
        policyId ?? t('policyNoneInline'),
        state.currentPolicyId ?? t('policyNoneInline'),
      ],
    });
  }
  return state;
}
