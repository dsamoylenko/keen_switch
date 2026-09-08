/**
 * Избранные устройства — MAC-адреса, которые попап поднимает в начало списка.
 *
 * Живут в отдельном ключе storage, а не внутри `settings`: Options page
 * сохраняет настройки целиком одним объектом, и звезда, поставленная в попапе,
 * была бы затёрта устаревшим состоянием формы настроек.
 */

import { normalizeMac } from './keenetic';

const STORAGE_KEY = 'favorites';

function sanitize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const macs = value.map(normalizeMac).filter((mac) => mac.length > 0);
  return [...new Set(macs)];
}

export async function loadFavorites(): Promise<string[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return sanitize(stored[STORAGE_KEY]);
}

/** Добавляет или убирает MAC и возвращает получившийся список. */
export async function toggleFavorite(mac: string, favorites: string[]): Promise<string[]> {
  const normalized = normalizeMac(mac);
  if (!normalized) return favorites;

  const next = favorites.includes(normalized)
    ? favorites.filter((item) => item !== normalized)
    : [...favorites, normalized];

  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
