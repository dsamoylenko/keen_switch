import type { DeviceState, ErrorKind, HostSummary } from './keenetic';
import type { Settings } from './settings';

export type Request =
  | { type: 'getState' }
  | { type: 'setPolicy'; mac: string; policyId: string | null }
  | { type: 'listHosts'; settings?: Settings }
  | { type: 'testConnection'; settings: Settings };

export interface TestConnectionResult {
  realmProduct: string;
  hosts: HostSummary[];
  whoamiMac: string;
}

export interface ResponseMap {
  getState: DeviceState;
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
    throw new Error('Фоновый скрипт расширения не ответил');
  }
  if (!response.ok) {
    const error = new Error(response.error.message) as Error & SerializedError;
    error.kind = response.error.kind;
    error.detail = response.error.detail;
    throw error;
  }
  return response.data;
}
