import { icon, type IconName } from '../lib/icons';
import { localizeDocument, t } from '../lib/i18n';
import type { HostSummary } from '../lib/keenetic';
import { send } from '../lib/messages';
import {
  DEFAULT_SETTINGS,
  hasRouterPermission,
  loadSettings,
  normalizeBaseUrl,
  originPattern,
  saveSettings,
  type Settings,
} from '../lib/settings';

const baseUrlInput = document.querySelector<HTMLInputElement>('#base-url')!;
const loginInput = document.querySelector<HTMLInputElement>('#login')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const passwordToggle = document.querySelector<HTMLButtonElement>('#toggle-password')!;
const modeAuto = document.querySelector<HTMLInputElement>('#mode-auto')!;
const modeManual = document.querySelector<HTMLInputElement>('#mode-manual')!;
const deviceSelect = document.querySelector<HTMLSelectElement>('#device')!;
const deviceField = document.querySelector<HTMLElement>('#device-field')!;
const deviceHint = document.querySelector<HTMLSpanElement>('#device-hint')!;
const permissionState = document.querySelector<HTMLElement>('#permission-state')!;
const testButton = document.querySelector<HTMLButtonElement>('#test')!;
const testResult = document.querySelector<HTMLSpanElement>('#test-result')!;
const saveForm = document.querySelector<HTMLFormElement>('#settings-form')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const saveResult = document.querySelector<HTMLSpanElement>('#save-result')!;

let knownHosts: HostSummary[] = [];

/** Возвращает '' вместо исключения, если в поле адреса что-то нечитаемое. */
function safeBaseUrl(): string {
  try {
    return normalizeBaseUrl(baseUrlInput.value);
  } catch {
    return '';
  }
}

function readForm(): Settings {
  return {
    baseUrl: safeBaseUrl(),
    login: loginInput.value.trim() || DEFAULT_SETTINGS.login,
    password: passwordInput.value,
    autoDetectDevice: modeAuto.checked,
    deviceMac: deviceSelect.value,
    deviceLabel: knownHosts.find((host) => host.mac === deviceSelect.value)?.label ?? '',
  };
}

type Tone = 'error' | 'ok' | 'muted';

const FEEDBACK_ICON: Record<Tone, IconName> = {
  error: 'alert-circle',
  ok: 'check-circle',
  muted: 'info',
};

/** Сообщение с иконкой: смысл читается не только цветом. */
function setFeedback(element: HTMLElement, message: string, tone: Tone): void {
  element.dataset.tone = tone;
  element.replaceChildren();
  if (!message) return;

  const text = document.createElement('span');
  text.textContent = message;
  element.append(icon(FEEDBACK_ICON[tone]), text);
}

function setPending(element: HTMLElement, message: string): void {
  element.dataset.tone = 'muted';
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const text = document.createElement('span');
  text.textContent = message;
  element.replaceChildren(spinner, text);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = (error as { detail?: string }).detail;
  return detail ? `${message}. ${detail}` : message;
}

function syncDeviceMode(): void {
  deviceField.hidden = modeAuto.checked;
  deviceSelect.disabled = modeAuto.checked || knownHosts.length === 0;
  deviceHint.textContent =
    !modeAuto.checked && knownHosts.length === 0 ? t('deviceHintNeedTest') : '';
}

function renderHosts(hosts: HostSummary[], selectedMac: string, whoamiMac: string): void {
  knownHosts = hosts;
  deviceSelect.replaceChildren();

  if (hosts.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = t('deviceListEmpty');
    deviceSelect.append(option);
    syncDeviceMode();
    return;
  }

  for (const host of hosts) {
    const option = document.createElement('option');
    option.value = host.mac;
    const marks = [host.ip, host.mac];
    if (host.mac === whoamiMac) marks.push(t('markThisDevice'));
    else if (!host.active) marks.push(t('markOffline'));
    option.textContent = `${host.label} (${marks.filter(Boolean).join(', ')})`;
    deviceSelect.append(option);
  }

  const preferred =
    hosts.find((host) => host.mac === selectedMac) ?? hosts.find((host) => host.mac === whoamiMac);
  deviceSelect.value = preferred?.mac ?? hosts[0].mac;
  syncDeviceMode();
}

async function refreshPermissionState(baseUrl: string): Promise<void> {
  if (!baseUrl) {
    setFeedback(permissionState, t('permNeedUrl'), 'muted');
    return;
  }
  const granted = await hasRouterPermission(baseUrl);
  setFeedback(
    permissionState,
    granted ? t('permGranted', baseUrl) : t('permNotGranted', baseUrl),
    granted ? 'ok' : 'muted',
  );
}

/** Показать/скрыть пароль: без этого невозможно проверить опечатку. */
function syncPasswordToggle(visible: boolean): void {
  passwordInput.type = visible ? 'text' : 'password';
  passwordToggle.setAttribute('aria-pressed', String(visible));
  const label = t(visible ? 'passwordHide' : 'passwordShow');
  passwordToggle.setAttribute('aria-label', label);
  passwordToggle.title = label;
  passwordToggle.replaceChildren(icon(visible ? 'eye-off' : 'eye'));
}

passwordToggle.addEventListener('click', () => {
  syncPasswordToggle(passwordInput.type === 'password');
});

testButton.addEventListener('click', () => {
  const baseUrl = safeBaseUrl();

  if (!baseUrl) {
    setFeedback(testResult, t('badUrl'), 'error');
    baseUrlInput.focus();
    return;
  }
  if (!passwordInput.value) {
    setFeedback(testResult, t('needPassword'), 'error');
    passwordInput.focus();
    return;
  }

  // chrome.permissions.request обязан вызываться прямо в обработчике клика,
  // иначе Chrome считает, что жеста пользователя не было.
  testButton.disabled = true;
  setPending(testResult, t('testing'));

  chrome.permissions
    .request({ origins: [originPattern(baseUrl)] })
    .then(async (granted) => {
      if (!granted) {
        setFeedback(testResult, t('permDenied'), 'error');
        return;
      }
      await refreshPermissionState(baseUrl);

      const settings = { ...readForm(), baseUrl };
      const result = await send({ type: 'testConnection', settings });
      renderHosts(result.hosts, settings.deviceMac, result.whoamiMac);

      const whoamiHost = result.hosts.find((host) => host.mac === result.whoamiMac);
      setFeedback(
        testResult,
        result.whoamiMac
          ? t('testOkWhoami', [
              String(result.hosts.length),
              whoamiHost?.label ?? result.whoamiMac,
            ])
          : t('testOkNoWhoami', String(result.hosts.length)),
        'ok',
      );
    })
    .catch((error: unknown) => setFeedback(testResult, describeError(error), 'error'))
    .finally(() => {
      testButton.disabled = false;
    });
});

saveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const settings = readForm();

  if (!settings.baseUrl) {
    setFeedback(saveResult, t('badUrl'), 'error');
    baseUrlInput.focus();
    return;
  }
  if (!settings.autoDetectDevice && !settings.deviceMac) {
    setFeedback(saveResult, t('needDevice'), 'error');
    deviceSelect.focus();
    return;
  }

  saveButton.disabled = true;
  setPending(saveResult, t('saving'));

  saveSettings(settings)
    .then(() => refreshPermissionState(settings.baseUrl))
    .then(() => setFeedback(saveResult, t('saved'), 'ok'))
    .catch((error: unknown) => setFeedback(saveResult, describeError(error), 'error'))
    .finally(() => {
      saveButton.disabled = false;
    });
});

for (const radio of [modeAuto, modeManual]) {
  radio.addEventListener('change', syncDeviceMode);
}

baseUrlInput.addEventListener('change', () => {
  const normalized = safeBaseUrl();
  if (!normalized) {
    setFeedback(permissionState, t('badUrl'), 'error');
    return;
  }
  baseUrlInput.value = normalized;
  void refreshPermissionState(normalized);
});

async function init(): Promise<void> {
  localizeDocument();
  syncPasswordToggle(false);

  const settings = await loadSettings();
  baseUrlInput.value = settings.baseUrl;
  loginInput.value = settings.login;
  passwordInput.value = settings.password;
  modeAuto.checked = settings.autoDetectDevice;
  modeManual.checked = !settings.autoDetectDevice;

  if (settings.deviceMac) {
    const option = document.createElement('option');
    option.value = settings.deviceMac;
    option.textContent = settings.deviceLabel
      ? `${settings.deviceLabel} (${settings.deviceMac})`
      : settings.deviceMac;
    deviceSelect.replaceChildren(option);
    deviceSelect.value = settings.deviceMac;
    knownHosts = [{ mac: settings.deviceMac, label: settings.deviceLabel, ip: '', active: false }];
  }

  syncDeviceMode();
  await refreshPermissionState(settings.baseUrl);
}

void init();
