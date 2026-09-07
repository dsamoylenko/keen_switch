/**
 * Чистая логика списка устройств для выпадающего списка в попапе.
 *
 * Вынесена из UI отдельным модулем: правила «кого показывать» и «в каком
 * порядке» проверяются юнит-тестами без DOM и без роутера.
 */

import type { HostSummary } from './keenetic';

export interface DeviceOption extends HostSummary {
  /** Отмечено звездой — попадает в верхнюю группу списка. */
  favorite: boolean;
  /** Это устройство глазами роутера (RCI `whoami`). */
  self: boolean;
}

/**
 * Кандидаты для выбора: активные устройства плюс само выбранное.
 *
 * Выбранное добавляем всегда, даже если оно ушло в офлайн: иначе в свёрнутом
 * виде попап показывал бы устройство, которого нет в его же списке.
 */
export function selectableHosts(hosts: HostSummary[], selectedMac: string): HostSummary[] {
  return hosts.filter((host) => host.active || host.mac === selectedMac);
}

/**
 * Делит список на «Избранные» и «Устройства», сохраняя порядок из `parseHosts`
 * (активные выше, дальше по алфавиту) и поднимая текущее устройство в начало
 * своей группы.
 */
export function groupDevices(
  hosts: HostSummary[],
  favorites: string[],
  whoamiMac: string,
): { favorites: DeviceOption[]; others: DeviceOption[] } {
  const options: DeviceOption[] = hosts.map((host) => ({
    ...host,
    favorite: favorites.includes(host.mac),
    self: host.mac.length > 0 && host.mac === whoamiMac,
  }));

  const promoteSelf = (group: DeviceOption[]): DeviceOption[] => [
    ...group.filter((option) => option.self),
    ...group.filter((option) => !option.self),
  ];

  return {
    favorites: promoteSelf(options.filter((option) => option.favorite)),
    others: promoteSelf(options.filter((option) => !option.favorite)),
  };
}
