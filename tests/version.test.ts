import assert from 'node:assert/strict';
import test from 'node:test';

import { nextVersion } from '../scripts/version.mjs';

test('nextVersion: patch увеличивает последнюю цифру', () => {
  assert.equal(nextVersion('1.0.0', 'patch'), '1.0.1');
  assert.equal(nextVersion('1.2.9', 'patch'), '1.2.10');
});

test('nextVersion: minor обнуляет patch', () => {
  assert.equal(nextVersion('1.2.9', 'minor'), '1.3.0');
});

test('nextVersion: major обнуляет minor и patch', () => {
  assert.equal(nextVersion('1.2.9', 'major'), '2.0.0');
});

test('nextVersion: неизвестный уровень бампа кидает ошибку', () => {
  assert.throws(() => nextVersion('1.0.0', 'sideways'), /Неизвестный уровень/);
});

test('nextVersion: версия не в формате major.minor.patch кидает ошибку', () => {
  assert.throws(() => nextVersion('1.0', 'patch'), /не в формате/);
});
