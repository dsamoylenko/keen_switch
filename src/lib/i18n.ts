/**
 * Единственная точка доступа к каталогам переводов
 * (`public/_locales/<locale>/messages.json`).
 *
 * Расширение локализуется нативным chrome.i18n: язык интерфейса равен языку
 * интерфейса Chrome и внутри расширения не переключается — это осознанный
 * компромисс, см. docs/superpowers/specs/2026-09-07-i18n-design.md.
 *
 * Тесты выполняются в голом Node, где глобального `chrome` нет вовсе. Поэтому
 * доступ к API идёт через `api()` с проверкой: без неё импорт этого модуля в
 * keenetic.ts уронил бы весь тестовый прогон ещё до первого assert.
 */

interface I18nApi {
  getMessage(key: string, substitutions?: string | string[]): string;
  getUILanguage(): string;
}

/** Локальный интерфейс вместо typeof chrome.i18n: модуль не должен зависеть от наличия @types/chrome в рантайме тестов. */
function api(): I18nApi | undefined {
  return (globalThis as { chrome?: { i18n?: I18nApi } }).chrome?.i18n;
}

/**
 * Перевод по ключу. `getMessage` отдаёт '' для неизвестного ключа и undefined
 * при некорректном вызове — оба случая схлопываются в сам ключ, чтобы в UI
 * было видно, чего не хватает, а не пустое место.
 */
export function t(key: string, subs?: string | string[]): string {
  return api()?.getMessage(key, subs) || key;
}

/** Атрибут в разметке -> атрибут, куда пишется перевод. */
const ATTRIBUTE_TARGETS: readonly (readonly [string, string])[] = [
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
  ['data-i18n-placeholder', 'placeholder'],
];

/** Подставляет тексты в статическую разметку. */
export function applyI18n(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = t(element.getAttribute('data-i18n') ?? '');
  }

  for (const [source, target] of ATTRIBUTE_TARGETS) {
    for (const element of root.querySelectorAll<HTMLElement>(`[${source}]`)) {
      element.setAttribute(target, t(element.getAttribute(source) ?? ''));
    }
  }
}

/** Локализует страницу целиком: тексты плюс `lang` для переносов и скринридеров. */
export function localizeDocument(): void {
  document.documentElement.lang = api()?.getUILanguage() ?? 'en';
  applyI18n(document);
}
