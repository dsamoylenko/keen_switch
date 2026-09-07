# Различение dev- и prod-сборок расширения

Дата: 2026-09-07

## Проблема

Расширение существует в двух видах на одной машине одновременно:

* **prod** — установлено из Chrome Web Store.
* **dev** — распакованная сборка из `dist/`, загруженная вручную для разработки
  и локальной проверки перед публикацией.

Обе версии сейчас называются `KeenSwitch` и используют одинаковые иконки, поэтому
в `chrome://extensions`, в тулбаре и в тултипе их нельзя отличить друг от друга —
легко перепутать, с какой версией сейчас работаешь.

Дополнительное ограничение: у Vite команда `build` всегда выставляет
`NODE_ENV=production`, независимо от того, зачем её вызвали — собрать `dist/`
для локальной проверки (`npm run build`) или подготовить ZIP для стора
(`npm run package`). Значит различать dev/prod по `NODE_ENV` нельзя: обе команды
дают одно и то же значение.

## Подход

Различение строится на Vite `--mode`, а не на `NODE_ENV`, и по умолчанию
**«безопасно» = dev-вид**. Настоящий prod-вид (то, что реально уходит в стор)
получается только по явному флагу `--mode release`, которым пользуется
исключительно команда публикации.

| Команда | Как вызывается | `mode` | Результат |
| --- | --- | --- | --- |
| `npm run dev` | `vite` | `development` (дефолт) | dev-вид |
| `npm run build` | `vite build` | `production` (дефолт для build) | dev-вид (сравниваем не с `production`, а с кастомным `release`) |
| `npm run build:release` (новый) | `vite build --mode release` | `release` | prod-вид |
| `npm run package` | `npm run build:release && node scripts/package.mjs` | `release` | prod-вид, попадает в ZIP |

Таким образом обычный локальный `npm run build`, которым разработчик пользуется
для проверки на своей машине, **всегда** остаётся dev-видом — его нельзя
случайно принять за то, что уйдёт в стор. Prod-вид производит только один явный
путь — `npm run package`.

### Отличия dev-вида от prod-вида

* **Имя** (`manifest.name`) и `action.default_title`: prod — `KeenSwitch`,
  dev — `KeenSwitch Dev`.
* **Иконка**: prod — как сейчас (`public/icons/icon-*.png`), dev — те же иконки
  с наложенным непрозрачным оранжевым треугольником-уголком в правом нижнем углу
  (~40% площади), узнаваемым даже на 16px. Хранятся как отдельные статические
  файлы в `public/icons-dev/icon-*.png`.

## Реализация

### 1. Генерация dev-иконок

Одноразовый скрипт `scripts/generate-dev-icons.mjs` на `sharp` (новая
devDependency) берёт `public/icons/icon-{16,32,48,128}.png`, накладывает
оранжевый треугольник-бейдж и сохраняет результат в
`public/icons-dev/icon-{16,32,48,128}.png`. Файлы коммитятся в репозиторий как
обычные статические ассеты — перегенерировать нужно только если поменяются
исходные иконки, вручную запуская этот скрипт. Во время обычной разработки
(`npm run dev` / `npm run build`) `sharp` не требуется.

### 2. `manifest.config.ts` и `vite.config.ts`

`manifest.config.ts` экспортирует функцию `createManifest(mode: string)` вместо
статического объекта. `vite.config.ts` переходит на функциональную форму
`defineConfig(({ mode }) => ...)` и передаёт `mode` в `createManifest`.

```ts
// manifest.config.ts
export function createManifest(mode: string) {
  const isRelease = mode === 'release';

  const icons = isRelease
    ? { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }
    : { 16: 'icons-dev/icon-16.png', 32: 'icons-dev/icon-32.png', 48: 'icons-dev/icon-48.png', 128: 'icons-dev/icon-128.png' };

  return defineManifest({
    manifest_version: 3,
    name: isRelease ? 'KeenSwitch' : 'KeenSwitch Dev',
    version: pkg.version,
    description: '...',
    icons,
    action: {
      default_popup: 'src/popup/index.html',
      default_title: isRelease ? 'KeenSwitch' : 'KeenSwitch Dev',
      default_icon: icons,
    },
    // остальное без изменений
  });
}
```

`isRelease` намеренно сравнивается с `'release'`, а не с `'production'` — иначе
дефолтный `production`-режим обычного `vite build` тоже посчитался бы релизом,
и вся схема потеряла бы смысл (см. «Проблема» выше).

### 3. `package.json`

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "build:release": "npm run typecheck && vite build --mode release",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.tests.json",
    "test": "node scripts/test.mjs",
    "package": "npm run build:release && node scripts/package.mjs",
    "icons:dev": "node scripts/generate-dev-icons.mjs"
  },
  "devDependencies": {
    "sharp": "^0.33.0"
  }
}
```

### 4. Страховка в `scripts/package.mjs`

Перед архивацией скрипт дополнительно проверяет, что `dist/manifest.json`
содержит prod-имя и prod-иконки:

```js
if (manifest.name !== 'KeenSwitch') {
  throw new Error(
    `В dist/ dev-сборка ("${manifest.name}"). Пересоберите: npm run build:release`
  );
}
```

Это защищает от ситуации, когда в `dist/` случайно оказалась dev-сборка (например,
`package.mjs` запущен напрямую, в обход `npm run package`), и не даёт заархивировать
не тот вариант.

### 5. Документация

`README.md`:

* раздел «Сборка и установка» — уточнить, что `npm run build` даёт dev-вид
  (имя с суффиксом `Dev`, иконка с оранжевым уголком) для локальной проверки;
* таблица «Скрипты» — добавить строки `build:release` и `icons:dev`, уточнить,
  что `npm run package` — единственный путь получить prod-ZIP для стора.

## Проверка

* `npm run dev` → в `chrome://extensions` после загрузки `dist/` видно
  `KeenSwitch Dev` и иконку с уголком.
* `npm run build` → тот же результат (dev-вид) без сборки для стора.
* `npm run build:release` → `dist/manifest.json` содержит `"name": "KeenSwitch"`
  и ссылки на `icons/`, без `Dev` и без `icons-dev/`.
* `npm run package` на чистом `dist/` из `build:release` → архив собирается.
* `npm run package`, если руками подсунуть в `dist/` результат обычного
  `npm run build` (dev-вид) → падает с понятной ошибкой до архивации.

## Не входит в объём

* Раздельные ID/ключи расширения для dev и prod — не требуется: unpacked-сборка
  и store-сборка и так получают разные extension ID от Chrome независимо от
  имени и иконки.
* Автоматизация публикации в Chrome Web Store (upload API) — вне рамок этой задачи.
