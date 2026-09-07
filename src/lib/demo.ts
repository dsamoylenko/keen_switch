import type { DeviceState, HostSummary, Policy, PopupState } from './keenetic';

const DEMO_POLICY_KEY = 'demoPolicyAssignments';

export const DEMO_WHOAMI_MAC = '02:00:00:00:00:01';

export const DEMO_HOSTS: HostSummary[] = [
  { mac: DEMO_WHOAMI_MAC, label: 'MacBook', ip: '192.168.1.24', active: true },
  { mac: '02:00:00:00:00:02', label: 'iPhone', ip: '192.168.1.31', active: true },
  { mac: '02:00:00:00:00:03', label: 'Smart TV', ip: '192.168.1.42', active: true },
];

export const DEMO_POLICIES: Policy[] = [
  { id: 'Policy0', label: 'Основная' },
  { id: 'Policy1', label: 'Детская' },
  { id: 'Policy2', label: 'Гостевая' },
];

const DEFAULT_ASSIGNMENTS: Record<string, string | null> = {
  [DEMO_WHOAMI_MAC]: 'Policy0',
  '02:00:00:00:00:02': 'Policy1',
  '02:00:00:00:00:03': 'Policy2',
};

async function loadAssignments(): Promise<Record<string, string | null>> {
  const stored = await chrome.storage.session.get(DEMO_POLICY_KEY);
  return {
    ...DEFAULT_ASSIGNMENTS,
    ...((stored[DEMO_POLICY_KEY] as Record<string, string | null> | undefined) ?? {}),
  };
}

function createDeviceState(
  mac: string,
  assignments: Record<string, string | null>,
  requested: boolean,
): DeviceState {
  const host = DEMO_HOSTS.find((item) => item.mac === mac) ?? DEMO_HOSTS[0];
  return {
    ...host,
    known: true,
    detectedBy: host.mac === DEMO_WHOAMI_MAC ? 'whoami' : requested ? 'picked' : 'manual',
    policies: DEMO_POLICIES,
    defaultPolicyId: 'Policy0',
    currentPolicyId: assignments[host.mac] ?? null,
    blocked: false,
  };
}

export async function fetchDemoPopupState(requestedMac?: string): Promise<PopupState> {
  const requestedHost = DEMO_HOSTS.find((host) => host.mac === requestedMac);
  const mac = requestedHost?.mac ?? DEMO_WHOAMI_MAC;
  return {
    device: createDeviceState(mac, await loadAssignments(), Boolean(requestedHost)),
    devices: DEMO_HOSTS,
    whoamiMac: DEMO_WHOAMI_MAC,
  };
}

export async function setDemoDevicePolicy(
  mac: string,
  policyId: string | null,
): Promise<DeviceState> {
  const host = DEMO_HOSTS.find((item) => item.mac === mac);
  if (!host) throw new Error('Демо-устройство не найдено');
  if (policyId !== null && !DEMO_POLICIES.some((policy) => policy.id === policyId)) {
    throw new Error('Демо-политика не найдена');
  }

  const assignments = await loadAssignments();
  assignments[mac] = policyId;
  await chrome.storage.session.set({ [DEMO_POLICY_KEY]: assignments });
  return createDeviceState(mac, assignments, mac !== DEMO_WHOAMI_MAC);
}
