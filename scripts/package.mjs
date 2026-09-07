/**
 * Собирает ZIP для загрузки в Chrome Web Store.
 *
 * Store ждёт архив, в корне которого лежит manifest.json — то есть архивировать
 * нужно содержимое dist/, а не саму папку dist. Служебные файлы macOS
 * (.DS_Store, ресурс-форки __MACOSX) в архив попадать не должны: ревью на них
 * ругается.
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const DESCRIPTION_LIMIT = 132;

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));

if (manifest.version !== pkg.version) {
  throw new Error(`Версии разошлись: package.json ${pkg.version}, dist/manifest.json ${manifest.version}. Пересоберите: npm run build`);
}

// description в манифесте — это __MSG_appDesc__, мерить его длину бессмысленно.
// Store применяет лимит к описанию каждой локали по отдельности.
const locales = (await readdir('dist/_locales')).filter((name) => !name.startsWith('.'));
if (locales.length === 0) {
  throw new Error('В dist/_locales нет ни одной локали. Пересоберите: npm run build');
}
for (const locale of locales) {
  const catalog = JSON.parse(await readFile(`dist/_locales/${locale}/messages.json`, 'utf8'));
  const length = catalog.appDesc.message.length;
  if (length > DESCRIPTION_LIMIT) {
    throw new Error(`Описание локали ${locale} длиннее ${DESCRIPTION_LIMIT} символов (${length}) — Chrome Web Store его не примет`);
  }
}

const archive = `keen-switch-${pkg.version}.zip`;
await rm(archive, { force: true });
await run('zip', ['-r', '-X', `../${archive}`, '.', '-x', '.DS_Store', '-x', '__MACOSX/*'], { cwd: 'dist' });

const { stdout } = await run('unzip', ['-l', archive]);
console.log(stdout.trim());
console.log(`\nГотово: ${archive}`);
console.log(`Версия: ${manifest.version} · локалей: ${locales.length} (${locales.join(', ')})`);
