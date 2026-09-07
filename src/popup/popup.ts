import { icon, type IconName } from '../lib/icons';
import type { DeviceState } from '../lib/keenetic';
import { send } from '../lib/messages';

const deviceEl = document.querySelector<HTMLElement>('#device')!;
const policiesEl = document.querySelector<HTMLUListElement>('#policies')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;

document.querySelector<HTMLButtonElement>('#open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

type Tone = 'error' | 'ok' | 'muted';

const STATUS_ICON: Record<Tone, IconName> = {
  error: 'alert-circle',
  ok: 'check-circle',
  muted: 'info',
};

function setStatus(message: string, tone: Tone, detail?: string): void {
  statusEl.hidden = false;
  statusEl.dataset.tone = tone;
  statusEl.replaceChildren();

  const body = document.createElement('span');
  body.className = 'status-body';

  const text = document.createElement('span');
  text.textContent = message;
  body.append(text);

  if (detail) {
    const detailEl = document.createElement('small');
    detailEl.className = 'status-detail';
    detailEl.textContent = detail;
    body.append(detailEl);
  }

  statusEl.append(icon(STATUS_ICON[tone]), body);
}

function clearStatus(): void {
  statusEl.hidden = true;
  statusEl.replaceChildren();
  delete statusEl.dataset.tone;
}

/** Добавляет кнопку в текущую строку статуса (например «Открыть настройки»). */
function addStatusAction(label: string, onClick: () => void): void {
  const body = statusEl.querySelector('.status-body');
  if (!body) return;

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'link-button';
  action.textContent = label;
  action.addEventListener('click', onClick);
  body.append(action);
}

function renderDevice(state: DeviceState): void {
  deviceEl.removeAttribute('aria-busy');
  deviceEl.replaceChildren();

  const badge = document.createElement('span');
  badge.className = 'device-icon';
  badge.append(icon(state.blocked ? 'shield-off' : 'monitor'));

  const text = document.createElement('span');
  text.className = 'device-text';

  const name = document.createElement('span');
  name.className = 'device-name';
  name.textContent = state.label;
  name.title = state.label;

  const meta = document.createElement('span');
  meta.className = 'device-meta';
  for (const value of [state.ip, state.mac].filter(Boolean)) {
    const part = document.createElement('code');
    part.textContent = value;
    meta.append(part);
  }

  text.append(name, meta);
  deviceEl.append(badge, text);

  // Одна плашка справа — самое важное отклонение от нормы.
  const chip = document.createElement('span');
  chip.className = 'chip';
  if (state.blocked) {
    chip.dataset.tone = 'danger';
    chip.textContent = 'доступ запрещён';
  } else if (!state.known) {
    chip.dataset.tone = 'warn';
    chip.textContent = 'нет в сети';
  } else if (state.detectedBy === 'manual') {
    chip.textContent = 'вручную';
  }
  if (chip.textContent) deviceEl.append(chip);
}

function renderPolicies(state: DeviceState): void {
  policiesEl.replaceChildren();
  delete policiesEl.dataset.busy;

  const defaultPolicyLabel =
    state.policies.find((policy) => policy.id === state.defaultPolicyId)?.label ??
    state.defaultPolicyId;

  const options: { id: string | null; label: string; sub?: string }[] = [
    {
      id: null,
      label: 'Без политики',
      sub: defaultPolicyLabel
        ? `политика по умолчанию: ${defaultPolicyLabel}`
        : 'общий доступ, как у остальных устройств',
    },
    ...state.policies.map((policy) => ({ id: policy.id as string | null, label: policy.label })),
  ];

  for (const option of options) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'policy';
    const isCurrent = option.id === state.currentPolicyId;
    button.setAttribute('aria-current', String(isCurrent));

    const mark = document.createElement('span');
    mark.className = 'policy-mark';
    mark.append(icon('check'));

    const text = document.createElement('span');
    text.className = 'policy-text';

    const label = document.createElement('span');
    label.className = 'policy-label';
    label.textContent = option.label;
    text.append(label);

    if (option.sub) {
      const sub = document.createElement('small');
      sub.className = 'policy-sub';
      sub.textContent = option.sub;
      text.append(sub);
    }

    button.append(mark, text);
    button.addEventListener('click', () => {
      void switchPolicy(state, option.id, option.label, button);
    });

    item.append(button);
    policiesEl.append(item);
  }
}

/** Блокирует список и показывает спиннер прямо в выбранной строке. */
function lockPolicies(pending: HTMLButtonElement): void {
  policiesEl.dataset.busy = 'true';
  for (const button of policiesEl.querySelectorAll('button')) {
    button.disabled = true;
  }
  pending.dataset.pending = 'true';
  pending.querySelector('.policy-mark')?.replaceChildren(
    Object.assign(document.createElement('span'), { className: 'spinner' }),
  );
}

function reportError(error: unknown): void {
  const kind = (error as { kind?: string }).kind;
  const message = error instanceof Error ? error.message : String(error);
  const detail = (error as { detail?: string }).detail;

  setStatus(message, 'error', detail);

  if (kind === 'config' || kind === 'permission') {
    addStatusAction('Открыть настройки', () => chrome.runtime.openOptionsPage());
  }
}

async function switchPolicy(
  state: DeviceState,
  policyId: string | null,
  label: string,
  button: HTMLButtonElement,
): Promise<void> {
  if (policyId === state.currentPolicyId) return;

  lockPolicies(button);
  setStatus(`Переключаю на «${label}»…`, 'muted');

  try {
    const updated = await send({ type: 'setPolicy', mac: state.mac, policyId });
    renderDevice(updated);
    renderPolicies(updated);
    setStatus(`Готово: «${label}»`, 'ok');
  } catch (error) {
    renderPolicies(state);
    reportError(error);
  }
}

/** Пустое состояние — вместо пустого списка объясняем, что делать. */
function renderEmptyPolicies(): void {
  const item = document.createElement('li');
  const note = document.createElement('p');
  note.className = 'note';
  note.append(icon('info'));

  const text = document.createElement('span');
  text.textContent = 'На роутере не настроено ни одной политики доступа — создайте её в панели Keenetic.';
  note.append(text);

  item.append(note);
  policiesEl.replaceChildren(item);
}

async function init(): Promise<void> {
  try {
    const state = await send({ type: 'getState' });
    clearStatus();
    renderDevice(state);

    if (state.policies.length === 0) {
      renderEmptyPolicies();
    } else {
      renderPolicies(state);
    }

    if (state.blocked) {
      setStatus('Этому устройству запрещён доступ в интернет в настройках роутера.', 'error');
    }
  } catch (error) {
    deviceEl.removeAttribute('aria-busy');
    deviceEl.replaceChildren();

    const badge = document.createElement('span');
    badge.className = 'device-icon';
    badge.append(icon('alert-triangle'));

    const text = document.createElement('span');
    text.className = 'device-text';
    const name = document.createElement('span');
    name.className = 'device-name';
    name.textContent = 'Нет связи с роутером';
    text.append(name);

    deviceEl.append(badge, text);
    policiesEl.replaceChildren();
    reportError(error);
  }
}

void init();
