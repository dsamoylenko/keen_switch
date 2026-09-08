# Distinguishing development and production extension builds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the development build (unpacked from `dist/`) visually distinct
from the production build (Chrome Web Store) by name and icon, while keeping
`npm run package` as the only way to create a genuine production artifact.

**Architecture:** Convert `manifest.config.ts` from a static object into a
`createManifest(mode)` function that selects the name and icon set based on the
`mode` passed from `vite.config.ts` through the functional `defineConfig` form.
Every mode except the custom `'release'` uses the development appearance by
default. The `release` mode is produced only by `vite build --mode release`, used
by `npm run package`. Development icons are static files generated once with a
`sharp` script and committed. Before archiving, `scripts/package.mjs` additionally
validates the resulting `manifest.json`.

**Tech stack:** TypeScript, Vite 6, `@crxjs/vite-plugin`, Node.js built-in
`--test`, and `sharp` as a new development dependency used only for icon
generation.

## Global constraints

- Compare the mode specifically with `'release'`, not `'production'`; otherwise
  the default `production` mode of an ordinary `vite build` would also become a
  release and defeat the safeguard.
- `npm run dev` and an ordinary `npm run build` must ALWAYS produce the development
  appearance (`KeenSwitch Dev`, with icons from `icons-dev/`). This is the most
  common path and must be safe by default.
- `npm run package` must be the only npm script that produces a production
  artifact. It must rebuild `dist/` itself with `build:release` instead of relying
  on existing contents.
- `scripts/package.mjs` must refuse to archive `dist/` when `manifest.json` does
  not describe the production variant.
- Development icons are regular committed PNGs under `public/icons-dev/`. They are
  not generated on every build; `sharp` is required only when the generator is
  explicitly rerun.

---

## Files

- `manifest.config.ts`—change from a static object export to
  `export function createManifest(mode: string)`.
- `vite.config.ts`—adopt the functional `defineConfig(({ mode }) => ...)` form.
- `tests/manifest.test.ts`—new tests for `createManifest` in release and
  development modes.
- `scripts/test.mjs`—add `tests/manifest.test.ts` to `entryPoints`.
- `scripts/generate-dev-icons.mjs`—new script that generates
  `public/icons-dev/*.png` with `sharp`.
- `public/icons-dev/icon-{16,32,48,128}.png`—new generated and committed files.
- `package.json`—add the `sharp` development dependency, add `build:release` and
  `icons:dev`, and switch `package` to `build:release`.
- `scripts/package.mjs`—add a production-name check before archiving.
- `README.md`—update **Build and installation** and the **Scripts** table.

---

### Task 1: Generate development icons

**Files:**
- Modify: `package.json` (development dependency and `icons:dev` script)
- Create: `scripts/generate-dev-icons.mjs`
- Create: `public/icons-dev/icon-16.png`, `icon-32.png`, `icon-48.png`,
  `icon-128.png`

**Interfaces:**
- Produces the `public/icons-dev/icon-{16,32,48,128}.png` directory consumed by
  Task 2, where `manifest.config.ts` references these paths in development mode.

- [ ] **Step 1: Add `sharp` to development dependencies and add `icons:dev`**

Add the following to `"devDependencies"` in `package.json`, preserving all other
lines:

```json
"sharp": "^0.35.4",
```

Add this line to `"scripts"`:

```json
"icons:dev": "node scripts/generate-dev-icons.mjs",
```

Install the dependency:

```bash
npm install
```

- [ ] **Step 2: Write `scripts/generate-dev-icons.mjs`**

```js
/**
 * Generates development icon variants: the same PNGs from public/icons/, with
 * an orange triangular corner badge so the development build cannot be confused
 * with the production version from the Chrome Web Store. Run manually with
 * `npm run icons:dev` when the source icons change and commit the results.
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

- [ ] **Step 3: Run the generator**

```bash
npm run icons:dev
```

Expected output:

```
public/icons-dev/icon-16.png
public/icons-dev/icon-32.png
public/icons-dev/icon-48.png
public/icons-dev/icon-128.png
```

- [ ] **Step 4: Verify dimensions and confirm that the badge was applied**

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

Expected: four `icon-*.png OK` messages with the correct dimensions and no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/generate-dev-icons.mjs public/icons-dev
git commit -m "feat: add dev icon badge generator and generated dev icons"
```

---

### Task 2: `createManifest(mode)`—switch names and icons

**Files:**
- Modify: `manifest.config.ts`
- Modify: `vite.config.ts`
- Create: `tests/manifest.test.ts`
- Modify: `scripts/test.mjs`

**Interfaces:**
- Consumes the `public/icons-dev/icon-{16,32,48,128}.png` files from Task 1.
  The unit test compares only path strings, so the actual files are unnecessary
  for that test.
- Produces the named `createManifest(mode: string)` export used by
  `vite.config.ts` and the tests.

- [ ] **Step 1: Write the failing `tests/manifest.test.ts` test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createManifest } from '../manifest.config';

interface ManifestShape {
  name: string;
  icons?: Record<number, string>;
  action?: { default_title?: string; default_icon?: Record<number, string> };
}

test('createManifest: release mode uses production name and icons', () => {
  const manifest = createManifest('release') as ManifestShape;
  assert.equal(manifest.name, 'KeenSwitch');
  assert.equal(manifest.action?.default_title, 'KeenSwitch');
  assert.equal(manifest.icons?.[16], 'icons/icon-16.png');
  assert.equal(manifest.action?.default_icon?.[16], 'icons/icon-16.png');
});

test('createManifest: every other mode uses development name and icons', () => {
  for (const mode of ['development', 'production', 'test', '']) {
    const manifest = createManifest(mode) as ManifestShape;
    assert.equal(manifest.name, 'KeenSwitch Dev');
    assert.equal(manifest.action?.default_title, 'KeenSwitch Dev');
    assert.equal(manifest.icons?.[16], 'icons-dev/icon-16.png');
    assert.equal(manifest.action?.default_icon?.[16], 'icons-dev/icon-16.png');
  }
});
```

- [ ] **Step 2: Add the new test file to the runner**

Change `entryPoints` in the `build({...})` call in `scripts/test.mjs`:

```js
entryPoints: ['tests/keenetic.test.ts', 'tests/auth.test.ts', 'tests/manifest.test.ts'],
```

Leave the rest of `scripts/test.mjs` unchanged.

- [ ] **Step 3: Confirm that the test fails while the manifest is still static**

```bash
npm test
```

Expected: test compilation fails with a TypeScript/esbuild error such as
`"createManifest" is not exported by "manifest.config.ts"`, because the manifest
still exports a default object rather than a `createManifest` function.

- [ ] **Step 4: Rewrite `manifest.config.ts` to use `createManifest(mode)`**

Full file contents:

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
      'Switch the current device between access policies (Policy) on a Keenetic router with one click.',
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
    // The specific router origin is requested at runtime from the Options page,
    // so the extension never receives permanent access to the entire web.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  });
}
```

- [ ] **Step 5: Convert `vite.config.ts` to functional `defineConfig` form**

Full file contents:

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

- [ ] **Step 6: Run tests and type checking**

```bash
npm run typecheck && npm test
```

Expected: both formerly failing tests from `tests/manifest.test.ts` pass, the
existing `keenetic.test.ts` and `auth.test.ts` tests remain green, and type
checking reports no errors.

- [ ] **Step 7: Commit**

```bash
git add manifest.config.ts vite.config.ts tests/manifest.test.ts scripts/test.mjs
git commit -m "feat: parametrize manifest by build mode (dev vs release)"
```

---

### Task 3: Add `build:release` and update `package`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes `createManifest(mode)` from Task 2 through
  `vite build --mode release`.
- Produces `npm run build:release` (a release build in `dist/`) and an updated
  `npm run package`, on which Task 4 depends.

- [ ] **Step 1: Add `build:release` and update `package`**

Replace the current `"build"` and `"package"` entries in the `"scripts"` block
of `package.json`, add `"build:release"`, and make the final block:

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

- [ ] **Step 2: Verify that an ordinary `build` keeps the development appearance**

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

Expected: `OK: KeenSwitch Dev icons-dev/icon-16.png`.

- [ ] **Step 3: Verify that `build:release` produces the production appearance**

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

Expected: `OK: KeenSwitch icons/icon-16.png`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add build:release script, package now builds in release mode"
```

---

### Task 4: Add a safety check to `scripts/package.mjs`

**Files:**
- Modify: `scripts/package.mjs`

**Interfaces:**
- Consumes the `dist/manifest.json` produced by Task 3: `npm run build` for the
  development failure scenario and `npm run build:release` for the successful
  scenario.

- [ ] **Step 1: Add a production-name check before archiving**

Immediately after this line in `scripts/package.mjs`:

```js
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
```

add:

```js
const RELEASE_NAME = 'KeenSwitch';

if (manifest.name !== RELEASE_NAME) {
  throw new Error(
    `dist/ contains a development build ("${manifest.name}"), not "${RELEASE_NAME}". Rebuild it with: npm run build:release`
  );
}
```

Leave the rest of the file, including version and description checks, unchanged.

- [ ] **Step 2: Verify that the script refuses to archive a development build**

```bash
npm run build
node scripts/package.mjs
```

Expected: the process exits with a nonzero code and a message containing
`development build ("KeenSwitch Dev")` and `npm run build:release`. No
`keen-switch-*.zip` archive is created.

- [ ] **Step 3: Verify that the full `npm run package` still works**

```bash
npm run package
```

Expected: the script rebuilds `dist/` in release mode as described in Task 3 and
successfully creates `keen-switch-<version>.zip`, printing
`Done: keen-switch-<version>.zip`.

- [ ] **Step 4: Remove the test archive**

The archive is not committed and should not remain as workspace clutter:

```bash
rm -f keen-switch-*.zip
```

- [ ] **Step 5: Commit**

```bash
git add scripts/package.mjs
git commit -m "fix: refuse to package a dev build into the store zip"
```

---

### Task 5: Update README documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes the npm script names introduced in Tasks 1 and 3 (`icons:dev`,
  `build:release`, and the updated `package`).

- [ ] **Step 1: Update the Build and installation section**

Replace the existing block in `README.md` with:

````markdown
## Build and installation

```bash
npm install
npm run build
```

The build places the ready-to-use extension in `dist/`. This is a **development
build**: in `chrome://extensions` and the toolbar it is named `KeenSwitch Dev`,
and its icon has an orange corner badge so it cannot be confused with the Chrome
Web Store version. Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

Only `npm run package` creates the actual publication build (named `KeenSwitch`,
without the badge); see the Scripts table below.
````

- [ ] **Step 2: Update the Scripts table**

Replace the existing table with:

```markdown
| Command | Description |
| --- | --- |
| `npm run build` | Type checking plus a development build in `dist/` (`KeenSwitch Dev` with a badged icon), for local testing |
| `npm run build:release` | Type checking plus a production build in `dist/` (`KeenSwitch` with the regular icon) |
| `npm run package` | Production build (`build:release`) plus a Chrome Web Store ZIP; the only way to create a publication artifact |
| `npm run dev` | Vite in watch mode (HMR for popup and settings), using the development appearance |
| `npm run icons:dev` | Regenerate `public/icons-dev/*.png` from `public/icons/*.png`; needed only after source icons change |
| `npm test` | Tests for router-response parsing, MD5, and manifest selection |
| `npm run typecheck` | Type checking only |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document dev vs release build scripts"
```
