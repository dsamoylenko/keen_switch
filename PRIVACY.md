# Политика конфиденциальности KeenSwitch

Дата вступления в силу: 8 сентября 2026 года

KeenSwitch — расширение браузера для управления политиками доступа устройств на
роутере Keenetic. Расширение работает напрямую между браузером пользователя и
адресом роутера, который указал пользователь.

## Какие данные обрабатывает расширение

Для своей основной функции KeenSwitch обрабатывает:

- адрес веб-интерфейса роутера;
- логин и пароль от роутера;
- сведения, полученные от роутера: модель роутера, названия, IP- и MAC-адреса и
  состояние устройств, настроенные политики доступа и их назначения;
- выбранное пользователем устройство, режим его определения и список избранных
  устройств;
- сессионные данные авторизации роутера, которыми управляет браузер.

KeenSwitch не собирает историю просмотров, содержимое обычных веб-страниц или
данные из вкладок браузера.

## Как используются данные

Данные используются только для подключения к выбранному пользователем роутеру,
показа устройств и политик доступа, назначения выбранной политики и сохранения
изменения в конфигурации роутера.

Расширение не использует аналитику, телеметрию, рекламу или технологии
отслеживания. Данные не продаются и не используются для рекламы, кредитного
скоринга или иных целей, не связанных с основной функцией KeenSwitch.

## Где хранятся данные

Адрес роутера, логин, режим определения устройства, выбранное устройство и
избранные устройства хранятся локально в профиле Chrome с помощью
`chrome.storage.local`. Эти данные не синхронизируются через
`chrome.storage.sync`.

По умолчанию пароль хранится в `chrome.storage.session` и удаляется при завершении
сессии браузера. Пользователь может явно выбрать постоянное хранение пароля. В
этом случае пароль сохраняется в `chrome.storage.local` без шифрования. Интерфейс
расширения предупреждает об этом до выбора постоянного хранения.

Данные, прочитанные с роутера для отображения текущего состояния, обрабатываются
в памяти расширения и не отправляются разработчику.

## Передача и раскрытие данных

KeenSwitch передаёт данные только на адрес роутера, который указал пользователь.
Расширение не использует сервер разработчика и не передаёт данные разработчику,
рекламным сетям, аналитическим сервисам или другим третьим лицам.

Пароль от роутера не отправляется по сети в открытом виде. Для авторизации
расширение формирует ответ на challenge роутера согласно протоколу Keenetic.
Сессионными cookie управляет браузер.

Если пользователь выбирает адрес с `http://`, транспорт между браузером и
роутером не шифруется. Такой режим следует использовать только в доверенной
локальной сети. Если роутер поддерживает HTTPS, рекомендуется указывать адрес с
`https://`.

## Разрешения браузера

KeenSwitch использует следующие разрешения:

- `storage` — для хранения настроек, избранных устройств и выбранного
  пользователем режима хранения пароля;
- `declarativeNetRequestWithHostAccess` — для установки сессионного правила,
  необходимого для запросов к RCI роутера Keenetic; правило применяется только к
  запросам расширения на выбранный пользователем адрес;
- необязательный доступ к HTTP/HTTPS-адресам — запрашивается отдельным действием
  пользователя только для указанного им адреса роутера. Доступ ко всем сайтам при
  установке не выдаётся.

## Управление данными и удаление

Пользователь может изменить сохранённые данные в настройках KeenSwitch. Чтобы
удалить сохранённый пароль, нужно очистить поле пароля и сохранить настройки либо
переключиться на хранение только в рамках сессии браузера. Доступ к адресу роутера
можно отозвать в настройках разрешений расширения в Chrome.

Удаление KeenSwitch из Chrome удаляет локальное хранилище расширения и выданные
ему разрешения. Изменения политик, ранее сохранённые самим роутером, при удалении
расширения не отменяются.

## Ограниченное использование данных

Использование данных в KeenSwitch соответствует требованиям Limited Use политики
пользовательских данных Chrome Web Store: данные используются только для
предоставления и улучшения явно описанной пользовательской функции расширения.

## Изменения политики

При изменении способов обработки данных эта политика будет обновлена, а дата
вступления в силу изменена. Если изменение потребует нового согласия пользователя,
KeenSwitch запросит его до начала новой обработки данных.

## Контакты

Вопросы о конфиденциальности можно задать через
[раздел Issues репозитория KeenSwitch](https://github.com/dsamoylenko/keen_switch/issues).

---

# KeenSwitch Privacy Policy

Effective date: September 8, 2026

KeenSwitch is a browser extension for managing device access policies on a
Keenetic router. The extension communicates directly between the user's browser
and the router address specified by the user.

## Data processed by the extension

To provide its single purpose, KeenSwitch processes:

- the router web interface address;
- the router username and password;
- information received from the router, including the router model, device names,
  IP and MAC addresses, device status, configured access policies, and policy
  assignments;
- the selected device, device detection preference, and favorite devices;
- router authentication session data managed by the browser.

KeenSwitch does not collect browsing history, ordinary web page content, or data
from browser tabs.

## How the data is used

The data is used only to connect to the router selected by the user, display
devices and access policies, assign a selected policy, and save that change to the
router configuration.

The extension does not use analytics, telemetry, advertising, or tracking
technologies. Data is not sold or used for advertising, credit scoring, or any
purpose unrelated to KeenSwitch's primary function.

## Data storage

The router address, username, device detection preference, selected device, and
favorite devices are stored locally in the Chrome profile using
`chrome.storage.local`. They are not synchronized through `chrome.storage.sync`.

By default, the password is stored in `chrome.storage.session` and is removed when
the browser session ends. A user may explicitly choose persistent password
storage. In that case, the password is stored unencrypted in
`chrome.storage.local`. The extension displays a warning before persistent
storage is selected.

Router data read to display the current state is processed in the extension's
memory and is not sent to the developer.

## Data transfer and disclosure

KeenSwitch sends data only to the router address specified by the user. The
extension does not use a developer-operated server and does not disclose data to
the developer, advertising networks, analytics services, or other third parties.

The router password is not transmitted in plain text. The extension calculates a
response to the router's challenge according to the Keenetic authentication
protocol. Router session cookies are managed by the browser.

When a user selects an `http://` address, transport between the browser and router
is not encrypted. This mode should be used only on a trusted local network. An
`https://` address is recommended when supported by the router.

## Browser permissions

KeenSwitch uses the following permissions:

- `storage` to store settings, favorite devices, and the user's password-storage
  preference;
- `declarativeNetRequestWithHostAccess` to install a session rule required for
  requests to the Keenetic RCI; the rule applies only to extension requests sent
  to the router address selected by the user;
- optional HTTP/HTTPS host access, requested through a separate user action only
  for the router address entered by the user. Access to all websites is not
  granted during installation.

## Data controls and deletion

Users can change stored data in the KeenSwitch settings. To remove a stored
password, clear the password field and save the settings, or switch to
session-only password storage. Access to the router address can be revoked in the
Chrome extension permission settings.

Uninstalling KeenSwitch from Chrome removes the extension's local storage and
granted permissions. Policy changes already saved by the router are not reverted
when the extension is uninstalled.

## Limited Use

KeenSwitch's use of data complies with the Chrome Web Store User Data Policy,
including the Limited Use requirements. Data is used only to provide and improve
the extension's prominently described user-facing functionality.

## Changes to this policy

If KeenSwitch changes how it processes data, this policy and its effective date
will be updated. If a change requires new user consent, KeenSwitch will request it
before the new data practice begins.

## Contact

Privacy questions may be submitted through the
[KeenSwitch repository issue tracker](https://github.com/dsamoylenko/keen_switch/issues).
