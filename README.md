# KeenSwitch

[Privacy Policy](PRIVACY.md)

A Chrome extension (Manifest V3) that switches any device on the network between
access policies (Policy) on a Keenetic router with one click from the popup—without
opening the router's web interface. The popup opens on the current device, while
the list at the top lets you switch to any other device; frequently used devices
can be starred and moved to the top of the list.

Equivalent CLI command:

```
ip hotspot host <MAC> policy PolicyN
```

## Requirements

* A Keenetic router with configured access policies (KeeneticOS 3.x–5.x).
* A computer on the same network as the router—the extension connects directly to
  its web interface.
* Node.js 20+ and npm for building.
* A router account with permission to change settings.

## Build and installation

```bash
npm install
npm run build
```

The build places the ready-to-use extension in `dist/`. This is a **development
build**: in `chrome://extensions` and the toolbar it is named `KeenSwitch Dev`,
and its icon has an orange corner badge so it cannot be confused with the Chrome
Web Store version. Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

Only `npm run package` creates the actual publication build (named `KeenSwitch`,
without the badge); see the Scripts table below.

## Initial setup

Open the extension settings (icon → **Settings**):

1. **Web interface address**—use the same address you use to open the Keenetic
   control panel, for example `http://192.168.1.1`. The scheme is optional;
   `http://` is added automatically.
2. Enter the router **username** and **password**. Choose whether to keep the
   password until the browser closes or save it permanently. The first option is
   safer and is enabled by default.
3. Click **Test connection**. Chrome will ask for permission to access the address;
   grant it, because without it the extension can neither contact the router nor
   send its session cookie. The device list is populated after the check. If the
   browser already has an authenticated router session, the extension clearly
   warns that it verified connectivity through that session but could not verify
   the entered password separately.
4. **My device** uses automatic detection by default: the router reports the MAC
   address of the connecting client (RCI `whoami`), so no selection is necessary.
   If detection returns the wrong MAC address because of a VPN, bridge, or dock,
   switch to manual selection from the list.
5. Click **Save**.

If no router is available during initial setup, click **Start demo without a
router**. Demo mode shows fictional devices and policies, makes no network
requests, and asks for no site access. The demo entry button is no longer shown
after a real router connection succeeds.

From then on, click the extension icon and select the desired policy. The current
policy is marked with a check. **No policy** removes the assignment, causing the
device to use the default policy.

### Other devices

The device card in the popup is a button. It expands a list of active network
devices, allowing you to switch the policy for any of them, not just your own.
The star on the right adds a device to favorites and moves it to a group at the
top. Favorites are stored locally (`chrome.storage.local`, under a key separate
from settings) and are not sent to the router.

The popup always opens on the device selected in settings; choosing another device
lasts until the popup is closed. Only active devices appear in the list, so a
powered-off device disappears even when starred.

## Testing without the extension

If something is not working, you can run the same flow from a terminal. The script
is independent of the extension and prints the router's exact responses:

```bash
node scripts/probe-router.mjs --url http://192.168.1.1 --login admin
```

The password is requested interactively and does not enter shell history. The
script shows the router model, policy list, default policy, current device MAC
address, and its current policy. To switch a policy from the terminal:

```bash
node scripts/probe-router.mjs --url http://192.168.1.1 --set Policy0
```

`--set none` removes the policy assignment.

## How it works

The RCI schema was derived from a real router running KeeneticOS 5.01 and from the
web control panel source, rather than from documentation, because it changes
between Keenetic firmware versions.

**Authentication** (`x-ndw2-interactive`):

```
GET  /auth  -> 401, X-NDM-Realm and X-NDM-Challenge headers, Set-Cookie
POST /auth  {"login": "...", "password": SHA256(challenge + MD5("login:realm:password"))}
GET  /auth  -> 200 if the session is alive
```

Every session has a different cookie name (for example `YN6zYK2JB8xV4E`), so the
extension does not parse cookies itself. It relies on the browser cookie jar by
using `credentials: 'include'` plus host permission for exactly the router address.

**CSRF protection.** KeeneticOS returns `403 Forbidden` for any `/rci/` request
whose `Origin` or `Referer` does not match the router itself. Chrome always adds
`Origin: chrome-extension://<id>` to extension requests, and JavaScript cannot
remove it because fetch treats `Origin` and `Referer` as forbidden headers.
Therefore:

* A `declarativeNetRequest` session rule replaces `Origin` only for the router
  address and only for requests outside browser tabs; it does not affect traffic
  from an open web control panel. See [`src/lib/dnr.ts`](src/lib/dnr.ts).
* Fetch suppresses `Referer` directly through `referrerPolicy: 'no-referrer'`.

The `/auth` endpoint does not apply this check, so authentication succeeds without
the replacement and the first `/rci/` request is where the failure would occur.

**Commands:** `POST /rci/` accepts an array of objects. Each command path expands
into a nested object, and responses arrive in the same order.

| Purpose | RCI path |
| --- | --- |
| List policies | `show.sc.ip.policy` |
| Read the default policy | `show.sc.ip.hotspot.default-policy` |
| Read device policy assignments | `show.sc.ip.hotspot.host` |
| List network devices | `show.ip.hotspot` |
| Identify the current device | `whoami` |
| Assign a policy | `ip.hotspot.host` |
| Save the configuration | `system.configuration.save` |

Policy assignment mirrors the request sent by the web control panel:

```jsonc
// Assign a policy
{"ip": {"hotspot": {"host": {"mac": "…", "permit": true, "policy": "Policy0"}}}}
// Remove a policy assignment
{"ip": {"hotspot": {"host": {"mac": "…", "permit": true, "conform": false, "policy": {"no": true}}}}}
```

After writing, the extension reads the router state again and compares it with the
expected state. It reports success only after the router confirms the change. The
configuration is saved with `system.configuration.save`; otherwise the setting
would be lost after a router reboot.

## Permissions

* `storage`—stores settings.
* `declarativeNetRequestWithHostAccess`—replaces the `Origin` header as described
  above. It works only where host permission has been granted and does not let the
  extension inspect other traffic.
* `optional_host_permissions: http://*/*, https://*/*`—**not granted during
  installation**. At runtime, the extension requests access to exactly one origin:
  the address entered in settings (`http://192.168.1.1/*`). The effective grant is
  visible in `chrome://extensions`.

A service worker is used because clicking outside the popup closes it and cancels
unfinished requests, while changing a policy and saving the configuration takes a
few seconds.

## Security

The username and other settings are stored in `chrome.storage.local`. By default,
the password is stored only in `chrome.storage.session` and is deleted when the
browser closes. Settings allow permanent storage, but this puts the password in
`chrome.storage.local` without encryption, and the extension explicitly warns
about it. The password itself is never sent over the network: only SHA-256 of the
challenge and MD5 hash is sent, and only to the configured router address.

## If the extension says “The router rejected the username and password”

When the credentials are correct, the usual cause is a mismatched session.
KeeneticOS issues a **new session cookie and challenge on every `GET /auth`**, and
validates the password hash against the challenge from the session whose cookie
arrives with `POST /auth`. Any unrelated `GET /auth` inserted between those calls
breaks authentication, causing a `401` response indistinguishable from an actual
password error.

The extension protects itself with a single-flight handshake (parallel requests
share one authentication attempt) and retries once with a new challenge. However,
an **open router web panel in another tab** may still replace the session because
it calls `/auth` itself. Close that tab if the error repeats.

You can verify that the password is not the problem with the script, which manages
the session itself and does not depend on the browser:

```bash
node scripts/probe-router.mjs --url http://192.168.1.1 --login admin
```

## Limitations

* The router has flood protection. Too many requests can make it stop accepting
  connections on port 80 for several minutes while still responding to ping. The
  extension does not poll the router, but debugging scripts can trigger this limit,
  which looks like “Router unavailable.”
* The computer must be on the same network as the router. Otherwise the popup shows
  “Router unavailable.” If the web interface is externally available through
  KeenDNS, that address can be used, but host permission is then granted for a
  public domain.
* In a Keenetic mesh network, policies live on the controller. Use the controller
  address rather than an extender address.
* Automatic device detection assumes that the browser connects directly to the
  router. Through a VPN or proxy, the router sees another MAC address; select the
  device manually in that case.
* With **Private Wi-Fi Address** enabled, macOS presents a randomized MAC address
  to the router. It remains stable for that network, so everything works, but the
  computer may have an unfamiliar name in the device list.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Type checking plus a development build in `dist/` (`KeenSwitch Dev` with a badged icon), for local testing |
| `npm run build:release` | Type checking plus a production build in `dist/` (`KeenSwitch` with the regular icon) |
| `npm run package` | Production build (`build:release`) plus a Chrome Web Store ZIP; the only way to create a publication artifact |
| `npm run dev` | Vite in watch mode (HMR for popup and settings), using the development appearance |
| `npm run icons:dev` | Regenerate `public/icons-dev/*.png` from `public/icons/*.png`; needed only after source icons change |
| `npm test` | Tests for router-response parsing, MD5, and manifest selection |
| `npm run typecheck` | Type checking only |

## Structure

```
manifest.config.ts        MV3 manifest
src/lib/keenetic.ts       RCI client: authentication, batched requests, response parsing
src/lib/md5.ts            MD5 (required for authentication; unavailable in WebCrypto)
src/lib/settings.ts       settings, password in chrome.storage.session/local, and host permission
src/lib/favorites.ts      favorite devices (separate chrome.storage.local key)
src/lib/devices.ts        device selection and grouping for the popup list
src/lib/icons.ts          interface SVG icons (Lucide style)
src/ui.css                design system: theme tokens and popup/settings components
src/background.ts         service worker: all network operations
src/popup/                popup: device selection, policy list, and switching
src/options/              settings: router, access, and device selection
scripts/probe-router.mjs  test a router from the terminal
tests/                    tests
```
