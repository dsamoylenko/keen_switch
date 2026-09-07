import { groupDevices, type DeviceOption } from '../lib/devices';
import { loadFavorites, toggleFavorite } from '../lib/favorites';
import { icon, type IconName } from '../lib/icons';
import type { DeviceState, HostSummary } from '../lib/keenetic';
import { send } from '../lib/messages';

const deviceEl = document.querySelector<HTMLButtonElement>('#device')!;
const menuEl = document.querySelector<HTMLElement>('#device-menu')!;
const policiesEl = document.querySelector<HTMLUListElement>('#policies')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;

document.querySelector<HTMLButtonElement>('#open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

/** Состояние попапа. Меняется только через applyState / selectDevice. */
let device: DeviceState | null = null;
let devices: HostSummary[] = [];
let whoamiMac = '';
let favorites: string[] = [];

/**
 * Номер последнего запроса состояния: пока идёт загрузка одного устройства,
 * пользователь успевает выбрать другое, и ответ на отменённый выбор не должен
 * перерисовывать попап поверх актуального.
 */
let requestId = 0;

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

function reportError(error: unknown): void {
  const kind = (error as { kind?: string }).kind;
  const message = error instanceof Error ? error.message : String(error);
  const detail = (error as { detail?: string }).detail;

  setStatus(message, 'error', detail);

  if (kind === 'config' || kind === 'permission') {
    addStatusAction('Открыть настройки', () => chrome.runtime.openOptionsPage());
  }
}

/* ------------------------------------------------------ карточка устройства */

/** Строка «192.168.2.15 · aa:bb:cc:dd:ee:ff» под именем устройства. */
function deviceMeta(parts: (string | undefined)[]): HTMLElement {
  const meta = document.createElement('span');
  meta.className = 'device-meta';
  for (const value of parts.filter((part): part is string => Boolean(part))) {
    const item = document.createElement('code');
    item.textContent = value;
    meta.append(item);
  }
  return meta;
}

function chip(text: string, tone?: 'warn' | 'danger'): HTMLElement {
  const element = document.createElement('span');
  element.className = 'chip';
  if (tone) element.dataset.tone = tone;
  element.textContent = text;
  return element;
}

/** Свёрнутый вид: выбранное устройство плюс стрелка, открывающая список. */
function renderDevice(state: DeviceState): void {
  deviceEl.removeAttribute('aria-busy');
  deviceEl.disabled = false;
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

  text.append(name, deviceMeta([state.ip, state.mac]));
  deviceEl.append(badge, text);

  // Одна плашка справа — самое важное отклонение от нормы.
  if (state.blocked) deviceEl.append(chip('заблокировано', 'danger'));
  else if (!state.known) deviceEl.append(chip('нет в сети', 'warn'));
  else if (state.detectedBy === 'manual') deviceEl.append(chip('вручную'));

  deviceEl.append(icon('chevron-down', 'icon device-caret'));
}

/* ------------------------------------------------------- список устройств */

function isMenuOpen(): boolean {
  return !menuEl.hidden;
}

/**
 * Chrome обрезает всё, что вылезло за высоту попапа, а абсолютно
 * спозиционированный список её не увеличивает — поэтому пока он открыт,
 * подпираем body минимальной высотой.
 */
function syncMenuHeight(): void {
  document.body.style.minHeight = isMenuOpen()
    ? `${Math.ceil(menuEl.getBoundingClientRect().bottom + 8)}px`
    : '';
}

function optionButtons(): HTMLButtonElement[] {
  return [...menuEl.querySelectorAll<HTMLButtonElement>('.device-option')];
}

function renderMenu(): void {
  const groups = groupDevices(devices, favorites, whoamiMac);
  menuEl.replaceChildren();

  const list = document.createElement('ul');
  list.className = 'device-list';

  const addGroup = (title: string, options: DeviceOption[]): void => {
    if (options.length === 0) return;

    const heading = document.createElement('li');
    heading.className = 'device-group';
    heading.textContent = title;
    list.append(heading);

    for (const option of options) list.append(renderOption(option));
  };

  addGroup('Избранные', groups.favorites);
  addGroup(groups.favorites.length > 0 ? 'Остальные' : 'Устройства', groups.others);

  if (list.childElementCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.append(icon('info'));
    const text = document.createElement('span');
    text.textContent = 'Роутер не видит ни одного активного устройства.';
    empty.append(text);
    menuEl.append(empty);
    return;
  }

  menuEl.append(list);
}

function renderOption(option: DeviceOption): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'device-row';

  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'device-option';
  select.dataset.mac = option.mac;
  const isCurrent = option.mac === device?.mac;
  select.setAttribute('aria-current', String(isCurrent));

  const badge = document.createElement('span');
  badge.className = 'device-icon';
  badge.append(icon('monitor'));

  const text = document.createElement('span');
  text.className = 'device-text';

  const name = document.createElement('span');
  name.className = 'device-name';
  name.textContent = option.label;
  name.title = option.label;
  text.append(name, deviceMeta([option.ip || option.mac]));

  select.append(badge, text);
  if (option.self) select.append(chip('это устройство'));
  else if (!option.active) select.append(chip('не в сети', 'warn'));

  select.addEventListener('click', () => {
    closeMenu();
    void selectDevice(option.mac);
  });

  item.append(select, renderStar(option));
  return item;
}

function renderStar(option: DeviceOption): HTMLButtonElement {
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star-button';
  star.classList.toggle('is-favorite', option.favorite);
  star.setAttribute('aria-pressed', String(option.favorite));

  const label = option.favorite
    ? `Убрать «${option.label}» из избранного`
    : `Добавить «${option.label}» в избранное`;
  star.setAttribute('aria-label', label);
  star.title = label;
  star.append(icon('star'));

  // Список не закрываем: обычно звёзд расставляют несколько подряд.
  star.addEventListener('click', async () => {
    favorites = await toggleFavorite(option.mac, favorites);
    renderMenu();
    syncMenuHeight();
    menuEl
      .querySelector<HTMLButtonElement>(`.device-option[data-mac="${CSS.escape(option.mac)}"]`)
      ?.parentElement?.querySelector<HTMLButtonElement>('.star-button')
      ?.focus();
  });

  return star;
}

function openMenu(focusFirst = false): void {
  if (isMenuOpen() || deviceEl.disabled) return;

  renderMenu();
  menuEl.hidden = false;
  deviceEl.setAttribute('aria-expanded', 'true');
  syncMenuHeight();

  if (focusFirst) optionButtons()[0]?.focus();
}

function closeMenu(restoreFocus = false): void {
  if (!isMenuOpen()) return;

  menuEl.hidden = true;
  menuEl.replaceChildren();
  deviceEl.setAttribute('aria-expanded', 'false');
  syncMenuHeight();

  if (restoreFocus) deviceEl.focus();
}

deviceEl.addEventListener('click', () => {
  if (isMenuOpen()) closeMenu();
  else openMenu();
});

deviceEl.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    openMenu(true);
  }
});

/** Стрелками ходим по строкам, Esc возвращает фокус на свёрнутую карточку. */
menuEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  const options = optionButtons();
  if (options.length === 0) return;

  event.preventDefault();
  const active = document.activeElement;
  const from = options.findIndex((option) => option.contains(active as Node) || option === active);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next = from === -1 ? 0 : (from + step + options.length) % options.length;
  options[next].focus();
});

document.addEventListener('click', (event) => {
  const target = event.target as Node;
  if (!menuEl.contains(target) && !deviceEl.contains(target)) closeMenu();
});

document.addEventListener('focusin', (event) => {
  const target = event.target as Node;
  if (!menuEl.contains(target) && !deviceEl.contains(target)) closeMenu();
});

/* -------------------------------------------------------- список политик */

function renderPolicies(state: DeviceState): void {
  policiesEl.replaceChildren();
  delete policiesEl.dataset.busy;

  if (state.policies.length === 0) {
    renderEmptyPolicies();
    return;
  }

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

/** Скелетон на время загрузки политик другого устройства. */
function renderPoliciesSkeleton(): void {
  policiesEl.dataset.busy = 'true';
  policiesEl.replaceChildren(
    ...Array.from({ length: 3 }, () => {
      const item = document.createElement('li');
      const row = document.createElement('span');
      row.className = 'skeleton skeleton-row';
      row.setAttribute('aria-hidden', 'true');
      item.append(row);
      return item;
    }),
  );
}

/** Блокирует список и показывает спиннер прямо в выбранной строке. */
function lockPolicies(pending: HTMLButtonElement): void {
  closeMenu();
  deviceEl.disabled = true;
  deviceEl.setAttribute('aria-busy', 'true');
  policiesEl.dataset.busy = 'true';
  for (const button of policiesEl.querySelectorAll('button')) {
    button.disabled = true;
  }
  pending.dataset.pending = 'true';
  pending.querySelector('.policy-mark')?.replaceChildren(
    Object.assign(document.createElement('span'), { className: 'spinner' }),
  );
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
    device = updated;
    renderDevice(updated);
    renderPolicies(updated);
    setStatus(`Готово: «${label}»`, 'ok');
  } catch (error) {
    renderDevice(state);
    renderPolicies(state);
    reportError(error);
  }
}

/* ---------------------------------------------------------------- запуск */

function applyState(state: DeviceState): void {
  device = state;
  renderDevice(state);
  renderPolicies(state);

  if (state.blocked) {
    setStatus('Этому устройству запрещён доступ в интернет в настройках роутера.', 'error');
  } else {
    clearStatus();
  }
}

/** Показывает карточку недоступного роутера вместо устройства. */
function renderDisconnected(): void {
  deviceEl.removeAttribute('aria-busy');
  deviceEl.disabled = true;
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
}

/** Перечитывает состояние для выбранного устройства (без mac — для стартового). */
async function loadState(mac?: string): Promise<void> {
  const id = (requestId += 1);

  try {
    const state = await send({ type: 'getState', mac });
    if (id !== requestId) return;

    devices = state.devices;
    whoamiMac = state.whoamiMac;
    applyState(state.device);
  } catch (error) {
    if (id !== requestId) return;
    if (mac) {
      // Стартовое устройство и список остаются на экране: сбоила смена, не связь.
      if (device) renderPolicies(device);
      reportError(error);
      return;
    }
    renderDisconnected();
    reportError(error);
  }
}

async function selectDevice(mac: string): Promise<void> {
  if (mac === device?.mac) return;

  renderPoliciesSkeleton();
  setStatus('Загружаю политики устройства…', 'muted');
  await loadState(mac);
}

async function init(): Promise<void> {
  favorites = await loadFavorites();
  await loadState();
}

void init();
