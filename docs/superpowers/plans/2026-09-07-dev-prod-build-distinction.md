# Различение dev/prod сборок расширения — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать так, чтобы dev-сборка (unpacked из `dist/`) визуально отличалась от prod-сборки (Chrome Web Store) именем и иконкой, а единственным способом получить настоящий prod-артефакт остался `npm run package`.

**Architecture:** `manifest.config.ts` превращается из статического объекта в функцию `createManifest(mode)`, которая по значению `mode` (переданному из `vite.config.ts` через функциональную форму `defineConfig`) выбирает имя и набор иконок. По умолчанию (любой `mode`, кроме кастомного `'release'`) — dev-вид; `release` получается только через `vite build --mode release`, на который переключается `npm run package`. Dev-иконки — статические файлы, один раз сгенерированные скриптом на `sharp` и закоммиченные. `scripts/package.mjs` дополнительно проверяет итоговый `manifest.json` перед архивацией.

**Tech Stack:** TypeScript, Vite 6, `@crxjs/vite-plugin`, Node.js встроенный `--test`, `sharp` (новая devDependency, только для генерации иконок).

## Global Constraints

- Сравнение режима должно быть именно с `'release'`, а не с `'production'` — иначе дефолтный `production`-mode обычного `vite build` тоже станет «релизом», и вся защита теряет смысл.
- `npm run dev` и обычный `npm run build` должны ВСЕГДА давать dev-вид (имя `KeenSwitch Dev`, иконки из `icons-dev/`) — это самый частый путь, и он должен быть «безопасным» по умолчанию.
- `npm run package` — единственный npm-скрипт, который производит prod-артефакт; он обязан пересобирать `dist/` сам (`build:release`), а не полагаться на то, что там уже лежит.
- `scripts/package.mjs` обязан отказаться архивировать `dist/`, если `manifest.json` там не prod-вида.
- Dev-иконки — обычные закоммиченные PNG в `public/icons-dev/`, не генерируются на каждой сборке; `sharp` нужен только при явном перезапуске генератора.

---

## Файлы

- `manifest.config.ts` — было: статический экспорт объекта. Станет: `export function createManifest(mode: string)`.
- `vite.config.ts` — переход на функциональную форму `defineConfig(({ mode }) => ...)`.
- `tests/manifest.test.ts` — новый, проверяет `createManifest` для release/dev режимов.
- `scripts/test.mjs` — добавить `tests/manifest.test.ts` в `entryPoints`.
- `scripts/generate-dev-icons.mjs` — новый, генерирует `public/icons-dev/*.png` через `sharp`.
- `public/icons-dev/icon-{16,32,48,128}.png` — новые сгенерированные и закоммиченные файлы.
- `package.json` — новая devDependency `sharp`, новые скрипты `build:release` и `icons:dev`, скрипт `package` переключается на `build:release`.
- `scripts/package.mjs` — добавить проверку prod-имени перед архивацией.
- `README.md` — обновить раздел «Сборка и установка» и таблицу «Скрипты».

---

### Task 1: Генерация dev-иконок

**Files:**
- Modify: `package.json` (devDependencies + скрипт `icons:dev`)
- Create: `scripts/generate-dev-icons.mjs`
- Create: `public/icons-dev/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

**Interfaces:**
- Produces: каталог `public/icons-dev/icon-{16,32,48,128}.png` — используется в Task 2 (`manifest.config.ts` ссылается на эти пути в dev-режиме).

- [ ] **Step 1: Добавить `sharp` в devDependencies и скрипт `icons:dev`**

В `package.json` добавить в `"devDependencies"` (сохранив остальные строки как есть):

```json
"sharp": "^0.35.4",
```

и в `"scripts"` добавить строку:

```json
"icons:dev": "node scripts/generate-dev-icons.mjs",
```

Установить зависимость:

```bash
npm install
```

- [ ] **Step 2: Написать `scripts/generate-dev-icons.mjs`**

```js
/**
 * Генерирует dev-варианты иконок: те же PNG из public/icons/, но с оранжевым
 * треугольником-бейджем в углу — чтобы dev-сборку нельзя было спутать с
 * прод-версией из Chrome Web Store. Запускать вручную (npm run icons:dev),
 * когда меняются исходные иконки — результат коммитится в репозиторий.
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const sizes = [16, 32, 48, 128];
const srcDir = 'public/icons';
const outDir = 'public/icons-dev';
const badgeColor = '#FF6A00';

await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  const corner = Math.round(size * 0.55);
  const badge = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${size - corner},${size} ${size},${size - corner} ${size},${size}" fill="${badgeColor}" />
    </svg>`
  );

  await sharp(`${srcDir}/icon-${size}.png`)
    .composite([{ input: badge }])
    .png()
    .toFile(`${outDir}/icon-${size}.png`);

  console.log(`${outDir}/icon-${size}.png`);
}
```

- [ ] **Step 3: Запустить генератор**

```bash
npm run icons:dev
```

Ожидается вывод четырёх путей:

```
public/icons-dev/icon-16.png
public/icons-dev/icon-32.png
public/icons-dev/icon-48.png
public/icons-dev/icon-128.png
```

- [ ] **Step 4: Проверить размеры и что бейдж действительно наложен**

```bash
node -e '
import { readFile } from "node:fs/promises";
import sharp from "sharp";
const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const devBuf = await readFile(`public/icons-dev/icon-${size}.png`);
  const srcBuf = await readFile(`public/icons/icon-${size}.png`);
  const meta = await sharp(devBuf).metadata();
  if (meta.width !== size || meta.height !== size) {
    throw new Error(`icon-${size}.png: wrong size ${meta.width}x${meta.height}`);
  }
  if (devBuf.equals(srcBuf)) {
    throw new Error(`icon-${size}.png: identical to source, badge missing`);
  }
  console.log(`icon-${size}.png OK (${meta.width}x${meta.height})`);
}
'
```

Ожидается: `icon-16.png OK (16x16)`, `icon-32.png OK (32x32)`, `icon-48.png OK (48x48)`, `icon-128.png OK (128x128)`, без ошибок.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/generate-dev-icons.mjs public/icons-dev
git commit -m "feat: add dev icon badge generator and generated dev icons"
```

---

### Task 2: `createManifest(mode)` — переключение имени и иконок

**Files:**
- Modify: `manifest.config.ts`
- Modify: `vite.config.ts`
- Create: `tests/manifest.test.ts`
- Modify: `scripts/test.mjs`

**Interfaces:**
- Consumes: `public/icons-dev/icon-{16,32,48,128}.png` из Task 1 (пути на них зашиваются в манифест; для юнит-теста в этой задаче сами файлы не нужны — сравниваются только строки путей).
- Produces: `createManifest(mode: string)` — именованный экспорт из `manifest.config.ts`, используется в `vite.config.ts` и в тестах.

- [ ] **Step 1: Написать падающий тест `tests/manifest.test.ts`**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createManifest } from '../manifest.config';

interface ManifestShape {
  name: string;
  icons?: Record<number, string>;
  action?: { default_title?: string; default_icon?: Record<number, string> };
}

test('createManifest: release-режим — прод-имя и прод-иконки', () => {
  const manifest = createManifest('release') as ManifestShape;
  assert.equal(manifest.name, 'KeenSwitch');
  assert.equal(manifest.action?.default_title, 'KeenSwitch');
  assert.equal(manifest.icons?.[16], 'icons/icon-16.png');
  assert.equal(manifest.action?.default_icon?.[16], 'icons/icon-16.png');
});

test('createManifest: любой другой режим — dev-имя и dev-иконки', () => {
  for (const mode of ['development', 'production', 'test', '']) {
    const manifest = createManifest(mode) as ManifestShape;
    assert.equal(manifest.name, 'KeenSwitch Dev');
    assert.equal(manifest.action?.default_title, 'KeenSwitch Dev');
    assert.equal(manifest.icons?.[16], 'icons-dev/icon-16.png');
    assert.equal(manifest.action?.default_icon?.[16], 'icons-dev/icon-16.png');
  }
});
```

- [ ] **Step 2: Подключить новый тестовый файл к раннеру**

В `scripts/test.mjs` изменить `entryPoints` в вызове `build({...})`:

```js
entryPoints: ['tests/keenetic.test.ts', 'tests/auth.test.ts', 'tests/manifest.test.ts'],
```

(остальной файл `scripts/test.mjs` не меняется).

- [ ] **Step 3: Убедиться, что тест падает (манифест ещё статический)**

```bash
npm test
```

Ожидается: сборка тестов падает с ошибкой TypeScript/esbuild вида `"createManifest" is not exported by "manifest.config.ts"` (или аналогичной) — потому что `manifest.config.ts` пока экспортирует объект по умолчанию, а не функцию `createManifest`.

- [ ] **Step 4: Переписать `manifest.config.ts` на `createManifest(mode)`**

Полное содержимое файла:

```ts
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export function createManifest(mode: string) {
  const isRelease = mode === 'release';
  const name = isRelease ? 'KeenSwitch' : 'KeenSwitch Dev';
  const iconDir = isRelease ? 'icons' : 'icons-dev';
  const icons = {
    16: `${iconDir}/icon-16.png`,
    32: `${iconDir}/icon-32.png`,
    48: `${iconDir}/icon-48.png`,
    128: `${iconDir}/icon-128.png`,
  };

  return defineManifest({
    manifest_version: 3,
    name,
    version: pkg.version,
    description:
      'Переключение текущего устройства между политиками доступа (Policy) на роутере Keenetic в один клик.',
    icons,
    action: {
      default_popup: 'src/popup/index.html',
      default_title: name,
      default_icon: icons,
    },
    options_page: 'src/options/index.html',
    background: {
      service_worker: 'src/background.ts',
      type: 'module',
    },
    permissions: ['storage', 'declarativeNetRequestWithHostAccess'],
    // Конкретный origin роутера запрашивается в рантайме из Options page,
    // поэтому расширение не получает постоянного доступа ко всему вебу.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  });
}
```

- [ ] **Step 5: Обновить `vite.config.ts` на функциональную форму `defineConfig`**

Полное содержимое файла:

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { createManifest } from './manifest.config';

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest: createManifest(mode) })],
  build: {
    target: 'esnext',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
```

- [ ] **Step 6: Прогнать тесты и typecheck**

```bash
npm run typecheck && npm test
```

Ожидается: оба падающих ранее теста из `tests/manifest.test.ts` проходят, остальные (`keenetic.test.ts`, `auth.test.ts`) не сломались, `typecheck` без ошибок.

- [ ] **Step 7: Commit**

```bash
git add manifest.config.ts vite.config.ts tests/manifest.test.ts scripts/test.mjs
git commit -m "feat: parametrize manifest by build mode (dev vs release)"
```

---

### Task 3: npm-скрипт `build:release` и переключение `package`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `createManifest(mode)` из Task 2 — вызывается через `vite build --mode release`.
- Produces: команды `npm run build:release` (release-сборка в `dist/`) и обновлённый `npm run package`, на них полагается Task 4.

- [ ] **Step 1: Добавить скрипт `build:release` и переключить `package`**

В `package.json`, в блоке `"scripts"`, заменить текущие строки `"build"` и `"package"` и добавить `"build:release"` — итоговый блок `scripts`:

```json
"scripts": {
  "dev": "vite",
  "build": "npm run typecheck && vite build",
  "build:release": "npm run typecheck && vite build --mode release",
  "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.tests.json",
  "test": "node scripts/test.mjs",
  "package": "npm run build:release && node scripts/package.mjs",
  "icons:dev": "node scripts/generate-dev-icons.mjs"
}
```

- [ ] **Step 2: Проверить, что обычный `build` остаётся dev-видом**

```bash
npm run build
node -e '
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (manifest.name !== "KeenSwitch Dev") throw new Error(`expected KeenSwitch Dev, got ${manifest.name}`);
if (manifest.icons["16"] !== "icons-dev/icon-16.png") throw new Error(`expected dev icon, got ${manifest.icons["16"]}`);
console.log("OK:", manifest.name, manifest.icons["16"]);
'
```

Ожидается: `OK: KeenSwitch Dev icons-dev/icon-16.png`.

- [ ] **Step 3: Проверить, что `build:release` даёт prod-вид**

```bash
npm run build:release
node -e '
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (manifest.name !== "KeenSwitch") throw new Error(`expected KeenSwitch, got ${manifest.name}`);
if (manifest.icons["16"] !== "icons/icon-16.png") throw new Error(`expected prod icon, got ${manifest.icons["16"]}`);
console.log("OK:", manifest.name, manifest.icons["16"]);
'
```

Ожидается: `OK: KeenSwitch icons/icon-16.png`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add build:release script, package now builds in release mode"
```

---

### Task 4: Страховка в `scripts/package.mjs`

**Files:**
- Modify: `scripts/package.mjs`

**Interfaces:**
- Consumes: `dist/manifest.json`, произведённый Task 3 (`npm run build` для dev-сценария теста, `npm run build:release` для успешного сценария).

- [ ] **Step 1: Добавить проверку prod-имени перед архивацией**

В `scripts/package.mjs`, сразу после строки

```js
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
```

добавить:

```js
const RELEASE_NAME = 'KeenSwitch';

if (manifest.name !== RELEASE_NAME) {
  throw new Error(
    `В dist/ dev-сборка ("${manifest.name}"), а не "${RELEASE_NAME}". Пересоберите: npm run build:release`
  );
}
```

(остальной файл, включая проверку версии и описания, остаётся без изменений).

- [ ] **Step 2: Проверить, что скрипт отказывается архивировать dev-сборку**

```bash
npm run build
node scripts/package.mjs
```

Ожидается: процесс падает (ненулевой код выхода) с сообщением, содержащим `dev-сборка ("KeenSwitch Dev")` и `npm run build:release`. Архив `keen-switch-*.zip` не создаётся.

- [ ] **Step 3: Проверить, что полный `npm run package` всё ещё работает**

```bash
npm run package
```

Ожидается: скрипт сам пересобирает `dist/` в release-режиме (см. Task 3) и успешно создаёт `keen-switch-<версия>.zip`, печатая `Готово: keen-switch-<версия>.zip`.

- [ ] **Step 4: Убрать тестовый архив (он не коммитится, но и оставлять мусор не нужно)**

```bash
rm -f keen-switch-*.zip
```

- [ ] **Step 5: Commit**

```bash
git add scripts/package.mjs
git commit -m "fix: refuse to package a dev build into the store zip"
```

---

### Task 5: Документация в README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: имена npm-скриптов из Task 1 и Task 3 (`icons:dev`, `build:release`, обновлённый `package`).

- [ ] **Step 1: Обновить раздел «Сборка и установка»**

В `README.md` заменить блок (строки 20–31 в текущей версии):

```markdown
## Сборка и установка

```bash
npm install
npm run build
```

Сборка кладёт готовое расширение в `dist/`. Дальше:

1. Откройте `chrome://extensions`.
2. Включите **Режим разработчика**.
3. **Загрузить распакованное расширение** → выберите папку `dist`.
```

на:

```markdown
## Сборка и установка

```bash
npm install
npm run build
```

Сборка кладёт готовое расширение в `dist/`. Это **dev-сборка**: в
`chrome://extensions` и в тулбаре она называется `KeenSwitch Dev` и её иконка
помечена оранжевым уголком — чтобы не перепутать с версией из Chrome Web
Store. Дальше:

1. Откройте `chrome://extensions`.
2. Включите **Режим разработчика**.
3. **Загрузить распакованное расширение** → выберите папку `dist`.

Настоящую сборку для публикации (имя `KeenSwitch`, без бейджа) даёт только
`npm run package` — см. таблицу «Скрипты» ниже.
```

- [ ] **Step 2: Обновить таблицу «Скрипты»**

Заменить текущую таблицу (строки 192–197):

```markdown
| Команда | Что делает |
| --- | --- |
| `npm run build` | типы + сборка в `dist/` |
| `npm run dev` | Vite в watch-режиме (HMR для попапа и настроек) |
| `npm test` | тесты разбора ответов роутера и MD5 |
| `npm run typecheck` | только проверка типов |
```

на:

```markdown
| Команда | Что делает |
| --- | --- |
| `npm run build` | типы + dev-сборка в `dist/` (имя `KeenSwitch Dev`, иконка с бейджем) — для локальной проверки |
| `npm run build:release` | типы + prod-сборка в `dist/` (имя `KeenSwitch`, обычная иконка) |
| `npm run package` | prod-сборка (`build:release`) + ZIP для Chrome Web Store — единственный способ получить артефакт для публикации |
| `npm run dev` | Vite в watch-режиме (HMR для попапа и настроек), dev-вид |
| `npm run icons:dev` | перегенерировать `public/icons-dev/*.png` из `public/icons/*.png` (нужно только после смены исходных иконок) |
| `npm test` | тесты разбора ответов роутера, MD5 и выбора манифеста |
| `npm run typecheck` | только проверка типов |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document dev vs release build scripts"
```
