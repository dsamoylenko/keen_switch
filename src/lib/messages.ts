import type { DeviceState, ErrorKind, HostSummary, PopupState } from './keenetic';
import type { Settings } from './settings';
import { t } from './i18n';

export type Request =
  /** `mac` — устройство, выбранное в списке попапа; без него берётся то, что задано настройками. */
  | { type: 'getState'; mac?: string }
  | { type: 'setPolicy'; mac: string; policyId: string | null }
  | { type: 'listHosts'; settings?: Settings }
  | { type: 'testConnection'; settings: Settings };

export interface TestConnectionResult {
  realmProduct: string;
  hosts: HostSummary[];
  whoamiMac: string;
  /** true, если этот тест выполнил challenge-response с введённым паролем. */
  credentialsVerified: boolean;
}

export interface ResponseMap {
  getState: PopupState;
  setPolicy: DeviceState;
  listHosts: HostSummary[];
  testConnection: TestConnectionResult;
}

export interface SerializedError {
  kind: ErrorKind;
  message: string;
  detail?: string;
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: SerializedError };

export async function send<T extends Request['type']>(
  request: Extract<Request, { type: T }>,
): Promise<ResponseMap[T]> {
  const response = (await chrome.runtime.sendMessage(request)) as Response<ResponseMap[T]> | undefined;
  if (!response) {
    throw new Error(t('errNoBackgroundResponse'));
  }
  if (!response.ok) {
    const error = new Error(response.error.message) as Error & SerializedError;
    error.kind = response.error.kind;
    error.detail = response.error.detail;
    throw error;
  }
  return response.data;
}
