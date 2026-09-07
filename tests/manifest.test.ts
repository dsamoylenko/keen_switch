import assert from 'node:assert/strict';
import test from 'node:test';

import { createManifest } from '../manifest.config';

interface ManifestShape {
  name: string;
  icons?: Record<number, string>;
  action?: { default_title?: string; default_icon?: Record<number, string> };
}

test('createManifest: release-режим — прод-имя и прод-иконки', () => {
  const manifest = createManifest('release') as ManifestShape;
  assert.equal(manifest.name, 'KeenSwitch');
  assert.equal(manifest.action?.default_title, 'KeenSwitch');
  assert.equal(manifest.icons?.[16], 'icons/icon-16.png');
  assert.equal(manifest.action?.default_icon?.[16], 'icons/icon-16.png');
});

test('createManifest: любой другой режим — dev-имя и dev-иконки', () => {
  for (const mode of ['development', 'production', 'test', '']) {
    const manifest = createManifest(mode) as ManifestShape;
    assert.equal(manifest.name, 'KeenSwitch Dev');
    assert.equal(manifest.action?.default_title, 'KeenSwitch Dev');
    assert.equal(manifest.icons?.[16], 'icons-dev/icon-16.png');
    assert.equal(manifest.action?.default_icon?.[16], 'icons-dev/icon-16.png');
  }
});
