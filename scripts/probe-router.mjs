#!/usr/bin/env node
/**
 * Проверка RCI роутера без расширения: авторизуется, показывает политики,
 * текущее устройство и его политику, при желании переключает политику.
 *
 * Пароль спрашивается интерактивно (не попадает в историю команд) либо берётся
 * из переменной окружения KEENETIC_PASSWORD.
 *
 *   node scripts/probe-router.mjs --url http://192.168.1.1 --login admin
 *   node scripts/probe-router.mjs --url http://192.168.1.1 --set Policy0
 *   node scripts/probe-router.mjs --url http://192.168.1.1 --set none
 *
 * Node не хранит cookie между запросами, поэтому сессия ведётся вручную —
 * в расширении этим занимается сам браузер.
 */
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const args = parseArgs(process.argv.slice(2));
const baseUrl = (args.url ?? 'http://192.168.1.1').replace(/\/+$/, '');
const login = args.login ?? 'admin';

let cookie = '';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

function askPassword() {
  if (process.env.KEENETIC_PASSWORD) return Promise.resolve(process.env.KEENETIC_PASSWORD);
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = process.stdout.write.bind(process.stdout);
    write(`Пароль для ${login}@${baseUrl}: `);
    // Гасим эхо ввода, но обязательно возвращаем stdout на место —
    // иначе весь дальнейший вывод скрипта уйдёт в никуда.
    process.stdout.write = () => true;
    rl.question('', (answer) => {
      process.stdout.write = write;
      rl.close();
      write('\n');
      resolve(answer);
    });
  });
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const entry of setCookie) cookie = entry.split(';')[0];
  return response;
}

async function authenticate(password) {
  const probe = await request('/auth');
  if (probe.status === 200) return;
  if (probe.status !== 401) throw new Error(`GET /auth вернул HTTP ${probe.status}`);

  const realm = probe.headers.get('x-ndm-realm');
  const challenge = probe.headers.get('x-ndm-challenge');
  if (!realm || !challenge) throw new Error('Роутер не прислал realm/challenge — это точно KeeneticOS?');
  console.log(`Роутер: ${realm} (${probe.headers.get('x-ndm-product') ?? 'неизвестная модель'})`);

  const md5 = createHash('md5').update(`${login}:${realm}:${password}`, 'utf8').digest('hex');
  const hashed = createHash('sha256').update(challenge + md5, 'utf8').digest('hex');

  const response = await request('/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password: hashed }),
  });
  if (response.status === 401) throw new Error('Неверный логин или пароль');
  if (!response.ok) throw new Error(`POST /auth вернул HTTP ${response.status}`);

  const verify = await request('/auth');
  if (verify.status !== 200) throw new Error('Сессия не установилась после успешного POST /auth');
}

async function rci(queries) {
  const body = queries.map(({ path, data = {} }) =>
    path.split('.').reduceRight((acc, key) => ({ [key]: acc }), data),
  );
  const response = await request('/rci/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST /rci/ вернул HTTP ${response.status}`);
  const parsed = await response.json();
  return queries.map(({ path }, index) =>
    path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : acc), parsed[index]),
  );
}

const asArray = (value) =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

async function main() {
  await authenticate(await askPassword());

  if (args.set) {
    const target = args.set === 'none' ? null : args.set;
    const [{ mac }] = await rci([{ path: 'whoami' }]);
    console.log(`\nПереключаю ${mac} -> ${target ?? 'без политики'}`);
    const result = await rci([
      {
        path: 'ip.hotspot.host',
        data: target
          ? { mac, permit: true, policy: target }
          : { mac, permit: true, conform: false, policy: { no: true } },
      },
      { path: 'system.configuration.save' },
    ]);
    console.log(JSON.stringify(result, null, 2));
  }

  const [policies, hostConfig, defaultPolicy, hotspot, whoami] = await rci([
    { path: 'show.sc.ip.policy' },
    { path: 'show.sc.ip.hotspot.host' },
    { path: 'show.sc.ip.hotspot.default-policy' },
    { path: 'show.ip.hotspot' },
    { path: 'whoami' },
  ]);

  console.log('\nПолитики:');
  for (const [id, value] of Object.entries(policies ?? {})) {
    console.log(`  ${id}${value?.description ? ` — ${value.description}` : ''}`);
  }
  console.log(`Политика по умолчанию: ${defaultPolicy?.policy ?? '(нет)'}`);

  const mac = String(whoami?.mac ?? '').toLowerCase();
  const hosts = asArray(hotspot?.host ?? hotspot);
  const me = hosts.find((host) => String(host?.mac ?? '').toLowerCase() === mac);
  const myConfig = asArray(hostConfig).find((entry) => String(entry?.mac ?? '').toLowerCase() === mac);

  console.log(`\nЭто устройство: ${me?.name ?? me?.hostname ?? '(не в списке)'} ${whoami?.host ?? ''} ${mac}`);
  console.log(`Текущая политика: ${myConfig?.policy ?? '(без политики)'}`);
  console.log(`Всего устройств у роутера: ${hosts.length}`);
}

main().catch((error) => {
  console.error(`\nОшибка: ${error.message}`);
  process.exit(1);
});
