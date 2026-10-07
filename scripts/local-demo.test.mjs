import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { demoSource } from './local-demo-source.mjs';
import { localFile } from './local-demo-server.mjs';
import { fitBounds } from '../apps/world-web/public/local-demo/map-camera.js';

test('local mount rejects non-demo routes and traversal', () => {
  for (const route of [
    '/api/world',
    '/season1-immersive/game.js',
    '/local-demo/%2e%2e/package.json',
    '/local-demo/%5csecret',
    '/local-demo/%00',
    '/local-demo/%zz',
  ])
    assert.equal(localFile(route), null);
  assert.ok(
    localFile('/local-demo/office/countries/').endsWith('countries/index.html'),
  );
});

test('derived source isolates storage and excludes production execution', async () => {
  const game = await readFile(localFile('/local-demo/office/game.js'), 'utf8');
  assert.ok(
    demoSource('game.js', game).includes("const KEY='econmind-DEMO_LOCAL-v1'"),
  );
  assert.ok(game.includes("const KEY='econmind-immersive-game-v1'"));
  const context = await readFile(
    localFile('/local-demo/office/country-context.js'),
    'utf8',
  );
  assert.ok(
    !demoSource('country-context.js', context).includes(
      'if(countryScope){openModule=function(id)',
    ),
  );
  const country = await readFile(
    localFile('/local-demo/office/country-game.js'),
    'utf8',
  );
  assert.ok(
    !demoSource('country-game.js', country).includes(
      '// A stable built module reuses the reviewed local controller',
    ),
  );
  assert.throws(() => demoSource('game.js', ''), /DRIFT/);
  const html = await readFile(localFile('/local-demo/office/'), 'utf8');
  assert.match(html, /DEMO_LOCAL/);
  assert.doesNotMatch(
    html,
    /world-clock\.js|seat-boundaries\.js|runtime-config/,
  );
});

test('all 70 country data, scene and detail assets remain available', async () => {
  const countries = JSON.parse(
    await readFile(localFile('/local-demo/office/countries/data/index.json')),
  );
  const partition = JSON.parse(
    await readFile(localFile('/local-demo/map/partition.json')),
  );
  assert.equal(countries.length, 70);
  assert.equal(partition.territories.length, 70);
  assert.equal(new Set(partition.territories.map((t) => t.number)).size, 70);
  for (const c of countries) {
    const data = JSON.parse(
      await readFile(
        localFile(`/local-demo/office/countries/data/${c.number}.json`),
      ),
    );
    assert.equal(data.id, c.id);
    for (const asset of [data.scene, data.detail])
      assert.ok(
        (await stat(localFile(`/local-demo/office/countries/${asset}`))).size >
          100,
      );
    const shape = partition.territories.find((t) => t.id === c.id);
    assert.ok(shape.path.length > 20);
    const points = shape.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const xs = points.filter((_, i) => i % 2 === 0),
      ys = points.filter((_, i) => i % 2 === 1);
    const [x, y, w, h] = fitBounds(
      [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ],
      [partition.width, partition.height],
    );
    assert.ok(
      x >= 0 &&
        y >= 0 &&
        w > 0 &&
        h > 0 &&
        x + w <= partition.width &&
        y + h <= partition.height,
    );
  }
});

test('original module catalog remains complete across six offices', async () => {
  const catalog = JSON.parse(
    await readFile(localFile('/local-demo/office/catalog.json')),
  );
  assert.equal(catalog.modules.length, 120);
  assert.equal(new Set(catalog.modules.map((m) => m.role)).size, 6);
});
