/**
 * Тесты написаны на TypeScript и импортируют модули расширения без расширений
 * файлов, поэтому перед запуском собираем их в ESM-бандлы через esbuild
 * (он уже стоит как зависимость Vite) и отдаём встроенному тест-раннеру Node.
 */
import { readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const outdir = '.test-build';

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: [
    'tests/keenetic.test.ts',
    'tests/auth.test.ts',
    'tests/devices.test.ts',
    'tests/manifest.test.ts',
    'tests/settings.test.ts',
  ],
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
