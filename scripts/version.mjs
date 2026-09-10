/**
 * Чистая логика семвер-бампа, вынесена отдельно от bump-version.mjs
 * ради юнит-теста без обращения к файловой системе.
 */
export function nextVersion(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Версия "${current}" не в формате major.minor.patch`);
  const [, major, minor, patch] = match.map(Number);

  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Неизвестный уровень бампа: "${level}" (ожидались patch/minor/major)`);
}
