import {
  fetchHosts,
  fetchOverview,
  fetchPopupState,
  KeeneticError,
  setDevicePolicy,
} from './lib/keenetic';
import { installOriginRule } from './lib/dnr';
import { DEMO_HOSTS, fetchDemoPopupState, setDemoDevicePolicy } from './lib/demo';
import type { Request, Response, SerializedError } from './lib/messages';
import {
  hasRouterPermission,
  loadSettings,
  restrictStorageAccess,
  type Settings,
} from './lib/settings';

/**
 * Вся сетевая работа живёт здесь, а не в попапе: попап закрывается по клику
 * «мимо», и незавершённый fetch вместе с ним умирает — а смена политики
 * дополнительно сохраняет конфигурацию роутера и занимает пару секунд.
 */

void restrictStorageAccess().catch(() => {
  // Старые версии Chrome могут не поддерживать управление уровнем доступа.
});

function serializeError(error: unknown): SerializedError {
  if (error instanceof KeeneticError) {
    return { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: 'network', message: error instanceof Error ? error.message : String(error) };
}

/** Проверяет, что расширение вообще настроено и имеет доступ к адресу роутера. */
async function requireReadySettings(override?: Settings): Promise<Settings> {
  const settings = override ?? (await loadSettings());

  if (!settings.baseUrl) {
    throw new KeeneticError('config', 'errBaseUrlNotSet');
  }
  if (!settings.password) {
    throw new KeeneticError('config', 'errPasswordNotSet');
  }
  if (!(await hasRouterPermission(settings.baseUrl))) {
    throw new KeeneticError('permission', 'errNoPermission', {
      detailKey: 'errNoPermissionDetail',
      detailSubs: settings.baseUrl,
    });
  }

  // Без подмены Origin роутер отвечает 403 на каждый запрос к /rci/.
  await installOriginRule(settings.baseUrl);

  return settings;
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'getState': {
      const settings = await loadSettings();
      return settings.demoMode
        ? fetchDemoPopupState(request.mac)
        : fetchPopupState(await requireReadySettings(settings), request.mac);
    }
    case 'setPolicy': {
      const settings = await loadSettings();
      return settings.demoMode
        ? setDemoDevicePolicy(request.mac, request.policyId)
        : setDevicePolicy(await requireReadySettings(settings), request.mac, request.policyId);
    }
    case 'listHosts': {
      const settings = request.settings ?? (await loadSettings());
      return settings.demoMode ? DEMO_HOSTS : fetchHosts(await requireReadySettings(settings));
    }
    case 'testConnection': {
      const settings = await requireReadySettings(request.settings);
      const { hosts, whoamiMac, credentialsVerified } = await fetchOverview(settings);
      return {
        realmProduct: new URL(settings.baseUrl).host,
        hosts,
        whoamiMac,
        credentialsVerified,
      };
    }
    default: {
      const exhaustive: never = request;
      throw new Error(`Неизвестный запрос: ${JSON.stringify(exhaustive)}`);
    }
  }
}

chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
  handle(request)
    .then((data) => sendResponse({ ok: true, data } satisfies Response<unknown>))
    .catch((error: unknown) =>
      sendResponse({ ok: false, error: serializeError(error) } satisfies Response<never>),
    );
  return true;
});
