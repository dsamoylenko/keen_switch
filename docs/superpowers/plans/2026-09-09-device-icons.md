# Иконки по типу устройства — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В попапе каждое устройство показывает иконку по своему типу (телефон, планшет, ноутбук, ТВ, приставка, принтер, компьютер) вместо одной и той же иконки-монитора для всех.

**Architecture:** Чистая функция `guessDeviceKind(label)` в `src/lib/devices.ts` угадывает категорию по ключевым словам в имени хоста (юнит-тестируется без DOM). `src/popup/popup.ts` мапит категорию на существующий/новый `IconName` из `src/lib/icons.ts` и подставляет иконку в свёрнутую карточку устройства и в строки выпадающего списка. Данные и `keenetic.ts`/`DeviceState` не меняются — иконка вычисляется на лету из уже готового `label`.

**Tech Stack:** TypeScript, Vite/CRXJS, `node:test` + `node:assert/strict`, esbuild-бандлинг тестов через `scripts/test.mjs`.

## Global Constraints

- Ключевые слова эвристики — только на английском (RU-варианты не используются).
- Матчинг: `label.toLowerCase().includes(keyword)`, без учёта границ слов; первая совпавшая категория по порядку списка побеждает.
- Нераспознанное имя и пустая строка → категория `unknown`, иконка `monitor` (как сейчас, поведение не меняется).
- Заблокированное устройство в свёрнутой карточке по-прежнему показывает `shield-off` вместо иконки типа — приоритет не меняется.
- Новые SVG-иконки — в том же стиле, что и существующие в `src/lib/icons.ts`: `viewBox="0 0 24 24"`, `stroke-width="1.75"`, `stroke="currentColor"`, `fill="none"`.
- `src/options/*` не трогаем — там нативный `<select>` без иконок.

Полная спека: [docs/superpowers/specs/2026-09-09-device-icons-design.md](../specs/2026-09-09-device-icons-design.md).

---

### Task 1: `guessDeviceKind` — эвристика типа устройства

**Files:**
- Modify: `src/lib/devices.ts`
- Test: `tests/devices.test.ts`

**Interfaces:**
- Produces: `export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'tv' | 'console' | 'printer' | 'computer' | 'unknown';` и `export function guessDeviceKind(label: string): DeviceKind` — оба из `src/lib/devices.ts`, использует Task 3.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `tests/devices.test.ts` (после существующего импорта расширить список, остальной файл не трогать):

```ts
import { groupDevices, guessDeviceKind, selectableHosts } from '../src/lib/devices';
```

(это заменяет текущую строку `import { groupDevices, selectableHosts } from '../src/lib/devices';` на первой строке файла)

И в конец файла:

```ts

test('guessDeviceKind различает категории по ключевым словам в имени', () => {
  assert.equal(guessDeviceKind('Dmitrys-iPhone'), 'phone');
  assert.equal(guessDeviceKind('Samsung Galaxy S23'), 'phone');
  assert.equal(guessDeviceKind('iPad Pro'), 'tablet');
  assert.equal(guessDeviceKind('MacBook Pro'), 'laptop');
  assert.equal(guessDeviceKind('Living Room Smart-TV'), 'tv');
  assert.equal(guessDeviceKind('PS5'), 'console');
  assert.equal(guessDeviceKind('HP Printer'), 'printer');
  assert.equal(guessDeviceKind('Desktop-PC'), 'computer');
});

test('guessDeviceKind отдаёт unknown для нераспознанных и пустых имён', () => {
  assert.equal(guessDeviceKind('Haier AS35S2SF1FA'), 'unknown');
  assert.equal(guessDeviceKind(''), 'unknown');
});

test('guessDeviceKind не чувствителен к регистру', () => {
  assert.equal(guessDeviceKind('IPHONE 15'), 'phone');
  assert.equal(guessDeviceKind('macbook air'), 'laptop');
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `guessDeviceKind` не экспортируется из `src/lib/devices.ts` (ошибка импорта/сборки esbuild или `TypeError: guessDeviceKind is not a function`).

- [ ] **Step 3: Реализовать `guessDeviceKind`**

Добавить в `src/lib/devices.ts` после блока импортов (после строки `import type { HostSummary } from './keenetic';`):

```ts

export type DeviceKind =
  | 'phone'
  | 'tablet'
  | 'laptop'
  | 'tv'
  | 'console'
  | 'printer'
  | 'computer'
  | 'unknown';

/**
 * Порядок категорий важен: проверяются сверху вниз, побеждает первое
 * совпадение. Только английские ключевые слова — см. дизайн-спеку.
 */
const KIND_KEYWORDS: readonly (readonly [DeviceKind, readonly string[]])[] = [
  ['phone', ['iphone', 'android', 'galaxy', 'pixel', 'xiaomi', 'redmi', 'poco', 'huawei', 'honor', 'oneplus', 'realme', 'oppo', 'vivo']],
  ['tablet', ['ipad', 'tablet', 'matepad', 'tab']],
  ['laptop', ['macbook', 'notebook', 'thinkpad', 'laptop']],
  ['tv', ['smart-tv', 'smarttv', 'android tv', 'apple tv', 'chromecast']],
  ['console', ['playstation', 'xbox', 'nintendo', 'switch', 'ps4', 'ps5']],
  ['printer', ['printer']],
  ['computer', ['pc', 'desktop', 'imac']],
];

/** Угадывает тип устройства по имени хоста — для выбора иконки в попапе. */
export function guessDeviceKind(label: string): DeviceKind {
  const value = label.toLowerCase();
  for (const [kind, keywords] of KIND_KEYWORDS) {
    if (keywords.some((keyword) => value.includes(keyword))) return kind;
  }
  return 'unknown';
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — все тесты, включая три новых.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/devices.ts tests/devices.test.ts
git commit -m "$(cat <<'EOF'
Добавить эвристику типа устройства по имени хоста

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Иконки устройств в `icons.ts`

**Files:**
- Modify: `src/lib/icons.ts`

**Interfaces:**
- Consumes: ничего из Task 1.
- Produces: `IconName` расширяется значениями `'smartphone' | 'tablet' | 'laptop' | 'tv' | 'gamepad' | 'printer'`; `icon(name)` из Task 3 обязан уметь принимать эти имена.

У модуля нет юнит-тестов (чистые SVG-константы, `icon()` создаёт DOM-элемент через `document.createElementNS`, а тесты гоняются в голом Node без DOM) — это уже так для всех существующих иконок, паттерн не меняем. Проверка — визуальная, в Task 3.

- [ ] **Step 1: Расширить `IconName` и добавить SVG-пути**

В `src/lib/icons.ts` заменить объявление `IconName`:

```ts
export type IconName =
  | 'router'
  | 'sliders'
  | 'check'
  | 'monitor'
  | 'smartphone'
  | 'tablet'
  | 'laptop'
  | 'tv'
  | 'gamepad'
  | 'printer'
  | 'alert-circle'
  | 'alert-triangle'
  | 'check-circle'
  | 'info'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'shield-off'
  | 'chevron-down'
  | 'star';
```

И в объекте `PATHS` добавить шесть новых записей сразу после `monitor` (перед `'alert-circle'`):

```ts
  'smartphone':
    '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.3h2"/>',
  tablet:
    '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M12 17.5h.01"/>',
  laptop:
    '<rect x="4" y="4.5" width="16" height="10.5" rx="1.5"/><path d="M2 19.5h20"/>',
  tv:
    '<rect x="2" y="6.5" width="20" height="13.5" rx="2.5"/><path d="m8 3 4 3.5 4-3.5"/><path d="M9.5 22h5"/>',
  gamepad:
    '<path d="M8 9v4"/><path d="M6 11h4"/><circle cx="16.5" cy="10" r="1"/><circle cx="14.5" cy="12.5" r="1"/><path d="M6.5 6h11a4.5 4.5 0 0 1 4.4 5.4l-1 5a3 3 0 0 1-5.3 1.3L14 16h-4l-1.6 1.7A3 3 0 0 1 3 16.4l-1-5A4.5 4.5 0 0 1 6.5 6Z"/>',
  printer:
    '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 16v5h10v-5"/><path d="M17 11h.01"/>',
```

- [ ] **Step 2: Типы и сборка проходят**

Run: `npm run typecheck`
Expected: без ошибок (новые ключи `PATHS` покрывают весь union `IconName`, `Record<IconName, string>` не жалуется на нехватку/лишние поля).

- [ ] **Step 3: Коммит**

```bash
git add src/lib/icons.ts
git commit -m "$(cat <<'EOF'
Добавить иконки smartphone/tablet/laptop/tv/gamepad/printer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Подключить иконки к попапу

**Files:**
- Modify: `src/popup/popup.ts`

**Interfaces:**
- Consumes: `guessDeviceKind`, `type DeviceKind` из `src/lib/devices.ts` (Task 1); `IconName` значения `'smartphone' | 'tablet' | 'laptop' | 'tv' | 'gamepad' | 'printer' | 'monitor'` из `src/lib/icons.ts` (Task 2).
- Produces: ничего для последующих тасков — это последний таск плана.

- [ ] **Step 1: Импортировать `guessDeviceKind` и завести маппинг на иконку**

В `src/popup/popup.ts` заменить первую строку импорта:

```ts
import { groupDevices, guessDeviceKind, type DeviceKind, type DeviceOption } from '../lib/devices';
```

(было `import { groupDevices, type DeviceOption } from '../lib/devices';`)

Добавить константу сразу после `STATUS_ICON` (после блока):

```ts
const STATUS_ICON: Record<Tone, IconName> = {
  error: 'alert-circle',
  ok: 'check-circle',
  muted: 'info',
};
```

вставить:

```ts

const DEVICE_ICON: Record<DeviceKind, IconName> = {
  phone: 'smartphone',
  tablet: 'tablet',
  laptop: 'laptop',
  tv: 'tv',
  console: 'gamepad',
  printer: 'printer',
  computer: 'monitor',
  unknown: 'monitor',
};
```

- [ ] **Step 2: Использовать маппинг в свёрнутой карточке устройства**

В функции `renderDevice` заменить строку:

```ts
  badge.append(icon(state.blocked ? 'shield-off' : 'monitor'));
```

на:

```ts
  badge.append(icon(state.blocked ? 'shield-off' : DEVICE_ICON[guessDeviceKind(state.label)]));
```

- [ ] **Step 3: Использовать маппинг в строках списка устройств**

В функции `renderOption` заменить строку:

```ts
  badge.append(icon('monitor'));
```

на:

```ts
  badge.append(icon(DEVICE_ICON[guessDeviceKind(option.label)]));
```

- [ ] **Step 4: Типы и тесты проходят**

Run: `npm run typecheck && npm test`
Expected: обе команды без ошибок; все тесты (включая добавленные в Task 1) проходят.

- [ ] **Step 5: Коммит**

```bash
git add src/popup/popup.ts
git commit -m "$(cat <<'EOF'
Показывать иконку устройства по его типу в попапе

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Ручная визуальная проверка**

Демо-режим (`src/lib/demo.ts`) даёт три фикстуры — `MacBook` (laptop), `iPhone` (phone), `Smart TV` (tv) — этого достаточно, чтобы глазами увидеть три разные иконки в одном попапе без реального роутера.

1. `npm run build` (dev-сборка, см. `README.md` — режим `KeenSwitch Dev`).
2. Открыть `chrome://extensions`, включить режим разработчика, **Load unpacked** → выбрать `dist`.
3. Открыть попап расширения, нажать «Начать демо без роутера» (demo mode).
4. Убедиться, что в свёрнутой карточке и в раскрытом списке устройств `MacBook` показывает иконку ноутбука, `iPhone` — иконку смартфона, `Smart TV` — иконку телевизора (все три разные и отличаются от прежней единой иконки-монитора).
5. Выбрать заблокированное устройство (если есть) или временно проверить логикой — что иконка `shield-off` по-прежнему появляется вместо типа устройства для заблокированных (эта ветка не в демо-фикстурах, проверяется чтением кода из Step 2 либо на реальном роутере с заблокированным хостом).

Остальные категории (`tablet`, `console`, `printer`, `computer`, `unknown`) уже покрыты юнит-тестами из Task 1 и не требуют отдельной визуальной проверки для завершения плана.

---

## Self-Review

- **Spec coverage:** категории и ключевые слова — Task 1; шесть новых иконок — Task 2; замена `'monitor'` на маппинг в обоих местах попапа (карточка + список), приоритет `shield-off` для заблокированных — Task 3; тесты `guessDeviceKind` — Task 1; `options/*` не тронут — нигде не упоминается изменение этих файлов, всё верно.
- **Placeholder scan:** плейсхолдеров, "TBD", "добавить обработку ошибок" — нет; каждый шаг несёт готовый код или точную команду.
- **Type consistency:** `DeviceKind` определён в Task 1 с восемью значениями; `DEVICE_ICON` в Task 3 покрывает все восемь; `IconName` в Task 2 добавляет ровно те шесть имён, что использует `DEVICE_ICON` (`smartphone`, `tablet`, `laptop`, `tv`, `gamepad`, `printer`) плюс уже существующий `monitor`. Имя функции `guessDeviceKind` и тип `DeviceKind` одинаковы во всех трёх тасках.
