import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { t } from '../src/lib/i18n';

const LOCALES_DIR = 'public/_locales';

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

/** readdir отдаёт и .DS_Store: без фильтра он попадёт в список локалей и уронит readCatalog. */
async function localeDirs(): Promise<string[]> {
  return (await readdir(LOCALES_DIR)).filter((name) => !name.startsWith('.'));
}

async function readCatalog(locale: string): Promise<Record<string, Entry>> {
  return JSON.parse(await readFile(`${LOCALES_DIR}/${locale}/messages.json`, 'utf8')) as Record<
    string,
    Entry
  >;
}

test('t() без глобального chrome возвращает ключ, а не падает', () => {
  // Тесты идут в голом Node: если t() полезет в chrome.i18n без проверки,
  // упадёт весь прогон на импорте keenetic.ts, а не один этот assert.
  assert.equal((globalThis as { chrome?: unknown }).chrome, undefined);
  assert.equal(t('errAuthRejected'), 'errAuthRejected');
  assert.equal(t('errRciAction', 'Смена политики'), 'errRciAction');
});

test('во всех каталогах одинаковый набор ключей', async () => {
  const locales = await localeDirs();
  const referenceKeys = Object.keys(await readCatalog('en')).sort();

  assert.ok(locales.includes('en'), 'каталог en обязателен: он источник правды');

  for (const locale of locales) {
    const keys = Object.keys(await readCatalog(locale)).sort();
    assert.deepEqual(keys, referenceKeys, `набор ключей в ${locale} разошёлся с en`);
  }
});

test('во всех каталогах одинаковые плейсхолдеры', async () => {
  const locales = await localeDirs();
  const reference = await readCatalog('en');

  for (const locale of locales) {
    const catalog = await readCatalog(locale);
    for (const [key, entry] of Object.entries(reference)) {
      assert.deepEqual(
        Object.keys(catalog[key].placeholders ?? {}).sort(),
        Object.keys(entry.placeholders ?? {}).sort(),
        `плейсхолдеры ключа ${key} в ${locale} разошлись с en`,
      );
    }
  }
});

test('appDesc укладывается в лимит Chrome Web Store во всех локалях', async () => {
  for (const locale of await localeDirs()) {
    const { appDesc } = await readCatalog(locale);
    assert.ok(
      appDesc.message.length <= 132,
      `appDesc в локали ${locale}: ${appDesc.message.length} символов при лимите 132`,
    );
  }
});

test('все data-i18n* атрибуты в HTML соответствуют ключам в каталоге', async () => {
  // Проверяет, что никакой тайпо в data-i18n="fieldPasword" не пройдёт в продакшн.
  const catalog = await readCatalog('en');
  const catalogKeys = new Set(Object.keys(catalog));

  const htmlFiles = ['src/popup/index.html', 'src/options/index.html'];

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');

    // Извлекаём все data-i18n* атрибуты (data-i18n, data-i18n-title, data-i18n-aria-label и т.д.).
    const attrMatches = html.matchAll(/data-i18n[a-zA-Z-]*="([^"]+)"/g);
    const foundKeys: string[] = [];

    for (const match of attrMatches) {
      const key = match[1];
      foundKeys.push(key);
      assert.ok(
        catalogKeys.has(key),
        `В файле ${htmlFile} атрибут с ключом "${key}" не найден в каталоге`,
      );
    }

    // Убеждаемся, что парсинг не упал молча (вернул пустой результат).
    assert.ok(foundKeys.length > 0, `В файле ${htmlFile} не найдено ни одного data-i18n* атрибута`);
  }
});
