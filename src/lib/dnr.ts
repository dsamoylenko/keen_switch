/**
 * KeeneticOS отвечает `403 Forbidden` на любой запрос к `/rci/`, у которого
 * `Origin` или `Referer` не совпадают с самим роутером — это его защита от CSRF.
 * Chrome же обязательно проставляет к запросам расширения
 * `Origin: chrome-extension://<id>`, а убрать этот заголовок из JS нельзя:
 * fetch считает `Origin` и `Referer` forbidden headers и молча игнорирует
 * попытки их задать.
 *
 * Поэтому `Origin` подменяется правилом declarativeNetRequest — единственным
 * способом, доступным расширению в Manifest V3. С `Referer` проще: его мы
 * гасим на стороне fetch через `referrerPolicy: 'no-referrer'`, и правило для
 * него не нужно. Правило живёт в session-scope (не переживает перезапуск
 * браузера, что и нужно) и ограничено:
 *   * адресом роутера из настроек,
 *   * запросами XHR/fetch,
 *   * запросами вне вкладок — то есть только нашим service worker.
 * Трафик открытой в соседней вкладке веб-панели роутера правило не трогает.
 */

const RULE_ID = 1;

/** tabs.TAB_ID_NONE: запросы, не принадлежащие ни одной вкладке. */
const TAB_ID_NONE = -1;

/** Кеш по origin: если адрес роутера сменят в настройках, правило переставится. */
let installedFor: string | null = null;

export async function installOriginRule(baseUrl: string): Promise<void> {
  const { origin } = new URL(baseUrl);
  if (installedFor === origin) return;

  await updateRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: origin,
            },
          ],
        },
        condition: {
          urlFilter: `|${origin}/`,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          tabIds: [TAB_ID_NONE],
        },
      },
    ],
  });

  installedFor = origin;
}

async function updateRules(options: chrome.declarativeNetRequest.UpdateRuleOptions): Promise<void> {
  try {
    await chrome.declarativeNetRequest.updateSessionRules(options);
  } catch (cause) {
    throw new Error(
      `Не удалось установить правило подмены Origin: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
