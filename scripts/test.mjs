/**
 * Тесты написаны на TypeScript и импортируют модули расширения без расширений
 * файлов, поэтому перед запуском собираем их в ESM-бандлы через esbuild
 * (он уже стоит как зависимость Vite) и отдаём встроенному тест-раннеру Node.
 */
import { readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const outdir = '.test-build';

// Список тестов читается с диска: иначе новый файл в tests/ молча не запустится.
const entryPoints = (await readdir('tests'))
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => `tests/${name}`);

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints,
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
});

const files = (await readdir(outdir)).filter((name) => name.endsWith('.test.mjs')).map((name) => `${outdir}/${name}`);
const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
