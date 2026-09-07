# Distinguishing development and production extension builds

Date: 2026-09-07

## Problem

Two versions of the extension can exist on the same machine at the same time:

* **production**—installed from the Chrome Web Store;
* **development**—an unpacked build from `dist/`, loaded manually for development
  and local testing before publication.

Both versions are currently named `KeenSwitch` and use the same icons, making them
indistinguishable in `chrome://extensions`, the toolbar, and the tooltip. It is easy
to mistake one version for the other.

There is an additional constraint: Vite's `build` command always sets
`NODE_ENV=production`, whether it was invoked to create `dist/` for local testing
(`npm run build`) or to prepare a store ZIP (`npm run package`). Therefore,
development and production cannot be distinguished through `NODE_ENV`: both
commands produce the same value.

## Approach

The distinction is based on Vite's `--mode` rather than `NODE_ENV`, and the safe
default is the **development appearance**. The real production appearance—the one
submitted to the store—is produced only by the explicit `--mode release` flag,
which is used exclusively by the publication command.

| Command | Invocation | `mode` | Result |
| --- | --- | --- | --- |
| `npm run dev` | `vite` | `development` (default) | Development appearance |
| `npm run build` | `vite build` | `production` (build default) | Development appearance, because the comparison is against custom `release`, not `production` |
| `npm run build:release` (new) | `vite build --mode release` | `release` | Production appearance |
| `npm run package` | `npm run build:release && node scripts/package.mjs` | `release` | Production appearance included in the ZIP |

Consequently, the ordinary local `npm run build` used by developers for testing
**always** keeps the development appearance and cannot be mistaken for the store
build. Only one explicit path, `npm run package`, produces the production version.

### Differences between development and production

* **Name** (`manifest.name`) and `action.default_title`: production uses
  `KeenSwitch`; development uses `KeenSwitch Dev`.
* **Icon**: production uses the existing `public/icons/icon-*.png`; development
  uses the same icons with an opaque orange triangular corner badge at the bottom
  right (about 40% of the area), recognizable even at 16 px. These are stored as
  separate static files in `public/icons-dev/icon-*.png`.

## Implementation

### 1. Generate development icons

A one-off `scripts/generate-dev-icons.mjs` script using `sharp` (a new development
dependency) reads `public/icons/icon-{16,32,48,128}.png`, overlays an orange
triangular badge, and writes the result to
`public/icons-dev/icon-{16,32,48,128}.png`. The files are committed as ordinary
static assets. They need to be regenerated manually only when the source icons
change. `sharp` is not required during normal development (`npm run dev` or
`npm run build`).

### 2. `manifest.config.ts` and `vite.config.ts`

`manifest.config.ts` exports a `createManifest(mode: string)` function instead of
a static object. `vite.config.ts` adopts the functional
`defineConfig(({ mode }) => ...)` form and passes `mode` to `createManifest`.

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
    // Everything else remains unchanged.
  });
}
```

`isRelease` deliberately compares the value with `'release'`, not `'production'`.
Otherwise, the default `production` mode of an ordinary `vite build` would also be
treated as a release and defeat the entire scheme (see Problem above).

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

### 4. Safety check in `scripts/package.mjs`

Before creating the archive, the script additionally verifies that
`dist/manifest.json` contains the production name and production icons:

```js
if (manifest.name !== 'KeenSwitch') {
  throw new Error(
    `dist/ contains a development build ("${manifest.name}"). Rebuild it with: npm run build:release`
  );
}
```

This protects against accidentally leaving a development build in `dist/`, such
as when `package.mjs` is run directly instead of through `npm run package`, and
prevents the wrong variant from being archived.

### 5. Documentation

Update `README.md` as follows:

* Clarify in **Build and installation** that `npm run build` produces the
  development appearance (`Dev` name suffix and orange corner badge) for local
  testing.
* Add `build:release` and `icons:dev` to the **Scripts** table and clarify that
  `npm run package` is the only way to create a production ZIP for the store.

## Verification

* `npm run dev` → after loading `dist/` in `chrome://extensions`, `KeenSwitch Dev`
  and the corner-badged icon are visible.
* `npm run build` → produces the same development appearance without creating a
  store build.
* `npm run build:release` → `dist/manifest.json` contains `"name": "KeenSwitch"`
  and paths under `icons/`, with neither `Dev` nor `icons-dev/`.
* `npm run package` on a clean `dist/` produced by `build:release` → creates the
  archive successfully.
* Running `npm run package` after manually placing the result of an ordinary
  `npm run build` (development appearance) in `dist/` → fails with a clear error
  before creating an archive.

## Out of scope

* Separate extension IDs or keys for development and production are unnecessary:
  unpacked and store builds receive different Chrome extension IDs regardless of
  their names and icons.
* Automating publication to the Chrome Web Store through its upload API is outside
  this task's scope.
