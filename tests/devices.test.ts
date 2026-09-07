import assert from 'node:assert/strict';
import test from 'node:test';

import { groupDevices, selectableHosts } from '../src/lib/devices';
import { KeeneticError, resolveDevice, type RawState } from '../src/lib/keenetic';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings';

const host = (mac: string, label: string, active = true) => ({
  mac,
  label,
  ip: `192.168.2.${mac.slice(-1)}`,
  active,
});

const LAPTOP = host('aa:bb:cc:dd:ee:01', 'MacBook');
const PHONE = host('aa:bb:cc:dd:ee:02', 'iPhone');
const TV = host('aa:bb:cc:dd:ee:03', 'TV', false);

test('selectableHosts оставляет активные и всегда само выбранное устройство', () => {
  assert.deepEqual(selectableHosts([LAPTOP, PHONE, TV], LAPTOP.mac), [LAPTOP, PHONE]);
  // Выбранное устройство ушло в офлайн — оно всё равно должно остаться в списке.
  assert.deepEqual(selectableHosts([LAPTOP, PHONE, TV], TV.mac), [LAPTOP, PHONE, TV]);
  assert.deepEqual(selectableHosts([], LAPTOP.mac), []);
});

test('groupDevices поднимает избранные наверх, а своё устройство — в начало группы', () => {
  const groups = groupDevices([LAPTOP, PHONE, TV], [TV.mac, PHONE.mac], PHONE.mac);

  assert.deepEqual(
    groups.favorites.map((option) => option.label),
    ['iPhone', 'TV'],
  );
  assert.deepEqual(
    groups.others.map((option) => option.label),
    ['MacBook'],
  );
  assert.equal(groups.favorites[0].self, true);
  assert.equal(groups.favorites[1].favorite, true);
  assert.equal(groups.others[0].favorite, false);
});

test('groupDevices без избранного отдаёт один список', () => {
  const groups = groupDevices([LAPTOP, PHONE], [], '');
  assert.deepEqual(groups.favorites, []);
  assert.equal(groups.others.length, 2);
  // Пустой whoami не должен пометить «своим» устройство с пустым MAC.
  assert.equal(
    groupDevices([{ ...LAPTOP, mac: '' }], [], '').others[0].self,
    false,
  );
});

const RAW: RawState = {
  policies: [{ id: 'Policy0', label: 'Через VPN' }],
  hostConfigs: [
    { mac: LAPTOP.mac, policy: 'Policy0' },
    { mac: TV.mac, deny: true },
  ],
  defaultPolicyId: 'Policy1',
  hosts: [LAPTOP, PHONE, TV],
  whoamiMac: LAPTOP.mac,
};

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

test('resolveDevice без запроса берёт устройство из настроек', () => {
  const auto = resolveDevice(RAW, settings({ autoDetectDevice: true }));
  assert.equal(auto.mac, LAPTOP.mac);
  assert.equal(auto.detectedBy, 'whoami');
  assert.equal(auto.currentPolicyId, 'Policy0');
  assert.equal(auto.defaultPolicyId, 'Policy1');
  assert.equal(auto.blocked, false);

  const manual = resolveDevice(
    RAW,
    settings({ autoDetectDevice: false, deviceMac: PHONE.mac, deviceLabel: 'Мой телефон' }),
  );
  assert.equal(manual.mac, PHONE.mac);
  assert.equal(manual.detectedBy, 'manual');
  // Роутер знает устройство — его имя важнее сохранённого в настройках.
  assert.equal(manual.label, 'iPhone');
  assert.equal(manual.currentPolicyId, null);
});

test('resolveDevice отдаёт выбранное в списке устройство', () => {
  const picked = resolveDevice(RAW, settings({ autoDetectDevice: true }), TV.mac.toUpperCase());
  assert.equal(picked.mac, TV.mac);
  assert.equal(picked.detectedBy, 'picked');
  assert.equal(picked.blocked, true);
  assert.equal(picked.known, true);

  // Своё устройство остаётся «своим», даже если выбрано в списке руками.
  assert.equal(resolveDevice(RAW, settings(), LAPTOP.mac).detectedBy, 'whoami');
});

test('resolveDevice не теряет устройство, которого нет среди хостов', () => {
  const unknown = resolveDevice(RAW, settings(), 'aa:bb:cc:dd:ee:09');
  assert.equal(unknown.known, false);
  assert.equal(unknown.label, 'aa:bb:cc:dd:ee:09');
  assert.equal(unknown.ip, '');
});

test('resolveDevice сообщает, когда устройство определить нечем', () => {
  const blind: RawState = { ...RAW, whoamiMac: '' };
  assert.throws(
    () => resolveDevice(blind, settings({ autoDetectDevice: true })),
    (error: unknown) => error instanceof KeeneticError && error.kind === 'config',
  );
  assert.throws(
    () => resolveDevice(blind, settings({ autoDetectDevice: false, deviceMac: '' })),
    (error: unknown) => error instanceof KeeneticError && error.kind === 'config',
  );
});
