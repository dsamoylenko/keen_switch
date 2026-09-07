import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { DEMO_HOSTS, fetchDemoPopupState, setDemoDevicePolicy } from '../src/lib/demo';

let values: Record<string, unknown>;
let originalChrome: typeof chrome;

beforeEach(() => {
  values = {};
  originalChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      session: {
        get: async (key: string) => ({ [key]: values[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(values, items),
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
});

test('демо отдаёт устройства и стартовую политику без сети', async () => {
  const state = await fetchDemoPopupState();
  assert.equal(state.devices.length, DEMO_HOSTS.length);
  assert.equal(state.device.label, 'MacBook');
  assert.equal(state.device.currentPolicyId, 'Policy0');
});

test('смена демо-политики сохраняется в storage.session', async () => {
  const mac = DEMO_HOSTS[1].mac;
  await setDemoDevicePolicy(mac, null);
  assert.equal((await fetchDemoPopupState(mac)).device.currentPolicyId, null);

  await setDemoDevicePolicy(mac, 'Policy2');
  assert.equal((await fetchDemoPopupState(mac)).device.currentPolicyId, 'Policy2');
});
