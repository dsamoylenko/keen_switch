/**
 * Каждая сборка для Chrome Web Store обязана иметь версию выше предыдущей
 * загруженной, поэтому npm run package бампает её сам — не нужно помнить
 * об этом при каждой публикации. По умолчанию patch; BUMP=minor|major меняет
 * уровень (например: BUMP=minor npm run package).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { nextVersion } from './version.mjs';

const level = process.env.BUMP ?? 'patch';

const pkgText = await readFile('package.json', 'utf8');
const pkg = JSON.parse(pkgText);
const from = pkg.version;
pkg.version = nextVersion(from, level);

// Сохраняем форматирование (2 пробела, финальный перевод строки), как в существующем package.json.
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Версия: ${from} -> ${pkg.version} (${level})`);
