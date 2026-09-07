/**
 * Собирает ZIP для загрузки в Chrome Web Store.
 *
 * Store ждёт архив, в корне которого лежит manifest.json — то есть архивировать
 * нужно содержимое dist/, а не саму папку dist. Служебные файлы macOS
 * (.DS_Store, ресурс-форки __MACOSX) в архив попадать не должны: ревью на них
 * ругается.
 */
import { readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));

const RELEASE_NAME = 'KeenSwitch';

if (manifest.name !== RELEASE_NAME) {
  throw new Error(
    `В dist/ dev-сборка ("${manifest.name}"), а не "${RELEASE_NAME}". Пересоберите: npm run build:release`
  );
}

if (manifest.version !== pkg.version) {
  throw new Error(`Версии разошлись: package.json ${pkg.version}, dist/manifest.json ${manifest.version}. Пересоберите: npm run build`);
}
if (manifest.description.length > 132) {
  throw new Error(`Описание длиннее 132 символов (${manifest.description.length}) — Chrome Web Store его не примет`);
}

const archive = `keen-switch-${pkg.version}.zip`;
await rm(archive, { force: true });
await run('zip', ['-r', '-X', `../${archive}`, '.', '-x', '.DS_Store', '-x', '__MACOSX/*'], { cwd: 'dist' });

const { stdout } = await run('unzip', ['-l', archive]);
console.log(stdout.trim());
console.log(`\nГотово: ${archive}`);
console.log(`Версия: ${manifest.version} · описание: ${manifest.description.length}/132 символов`);
