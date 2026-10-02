import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cameraForViewport,
  isUsableViewport,
  type ExplorerCamera,
  type ExplorerCameraFit,
} from '../../apps/world-web/src/map-explorer/viewport-camera.js';
import scenes from '../../apps/world-web/src/assets/country-scenes/index.json';
import partition from '../../apps/world-web/src/map-lab/land-partition.json';

const initial = { x: 887, y: 443.5, width: 1900 };
const sizes = [
  { width: 1110, height: 794 },
  { width: 390, height: 480 },
  { width: 1110, height: 794 },
  { width: 1110, height: 650 },
  { width: 1110, height: 482 },
  { width: 390, height: 390 },
];
const target = (country: string): ExplorerCameraFit => {
  const scene = scenes.find(
    (scene) => scene.id === `visual-territory-${country}`,
  )!;
  const [x, y, width, height] = scene.frame;
  return {
    kind: 'bounds',
    bounds: [x!, y!, x! + width!, y! + height!],
    padding: 1.015,
  };
};

describe('Root viewport FIT versus MANUAL camera policy', () => {
  it('allows short desktop fitting while preserving usable mobile map/sidebar flow', () => {
    const css = readFileSync(
      new URL(
        '../../apps/world-web/src/map-explorer/world-explorer.css',
        import.meta.url,
      ),
      'utf8',
    );
    expect(css).toMatch(/\.world-explorer\s*\{[^}]*min-height:\s*0;/u);
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.world-explorer\s*\{\s*min-height:\s*696px;/u,
    );
    expect(css).toMatch(/\.explorer-viewport\s*\{\s*min-height:\s*390px;/u);
    expect(css).toMatch(
      /\.explorer-sidebar\s*\{\s*width:\s*100%;\s*height:\s*250px;/u,
    );
  });
  it.each(['01', '70'])(
    'keeps country %s frame inside every viewport after rotation/details/short-window resize',
    (country) => {
      const fit = target(country);
      if (fit.kind !== 'bounds') throw new Error('bounds expected');
      const [left, top, right, bottom] = fit.bounds;
      let camera: ExplorerCamera = initial;
      for (const size of sizes) {
        camera = cameraForViewport(camera, size, fit);
        const height = (camera.width * size.height) / size.width;
        expect(camera.x - camera.width / 2).toBeLessThanOrEqual(left);
        expect(camera.x + camera.width / 2).toBeGreaterThanOrEqual(right);
        expect(camera.y - height / 2).toBeLessThanOrEqual(top);
        expect(camera.y + height / 2).toBeGreaterThanOrEqual(bottom);
      }
      expect(cameraForViewport(camera, sizes[0]!, fit)).toEqual(
        cameraForViewport(initial, sizes[0]!, fit),
      );
    },
  );

  it('preserves exact user pan/zoom in MANUAL rather than stealing the camera on resize', () => {
    const manual = { x: 1150.25, y: 190.625, width: 57.125 };
    for (const size of sizes)
      expect(cameraForViewport(manual, size, null)).toBe(manual);
  });

  it('restores responsive fitting when reset or country navigation installs a fit target', () => {
    const manual = { x: -10, y: 15, width: 5 };
    const first = cameraForViewport(manual, sizes[0]!, target('01'));
    expect(first).not.toEqual(manual);
    const second = cameraForViewport(first, sizes[1]!, target('70'));
    expect(second).toEqual(cameraForViewport(initial, sizes[1]!, target('70')));
  });

  it.each([
    { width: 0, height: 480 },
    { width: 390, height: 0 },
    { width: -1, height: 480 },
    { width: Infinity, height: 480 },
    { width: 390, height: NaN },
  ])(
    'ignores transient invalid viewport %j without corrupting camera or discarding FIT',
    (size) => {
      expect(isUsableViewport(size)).toBe(false);
      expect(cameraForViewport(initial, size, target('01'))).toBe(initial);
      expect(
        cameraForViewport(initial, sizes[0]!, target('01')).width,
      ).toBeGreaterThan(0);
    },
  );

  it('keeps the complete overview source frame on mobile/short desktop without changing its center or margin', () => {
    const fit: ExplorerCameraFit = {
      kind: 'world',
      camera: initial,
      frame: [partition.width, partition.height],
    };
    for (const size of [
      { width: 390, height: 730 },
      { width: 1440, height: 394 },
      { width: 390, height: 390 },
      { width: 1440, height: 794 },
    ]) {
      const camera = cameraForViewport(initial, size, fit);
      const height = (camera.width * size.height) / size.width;
      expect(camera.x).toBe(initial.x);
      expect(camera.y).toBe(initial.y);
      expect(camera.x - camera.width / 2).toBeLessThanOrEqual(0);
      expect(camera.x + camera.width / 2).toBeGreaterThanOrEqual(
        partition.width,
      );
      expect(camera.y - height / 2).toBeLessThanOrEqual(0);
      expect(camera.y + height / 2).toBeGreaterThanOrEqual(partition.height);
      const manual = { x: 900, y: 400, width: 700 };
      expect(cameraForViewport(manual, size, null)).toBe(manual);
      // 0/center restore the full overview fit even after manual zoom/pan.
      expect(cameraForViewport(manual, size, fit)).toEqual(camera);
    }
    expect(cameraForViewport(initial, sizes[1]!, fit).width).toBe(1900);
    expect(cameraForViewport(initial, sizes[0]!, fit)).toEqual(initial);
  });

  it('restores full overview fitting through resize round trips and keeps continent bounds fitting', () => {
    const fit: ExplorerCameraFit = {
      kind: 'world',
      camera: initial,
      frame: [partition.width, partition.height],
    };
    const desktop = { width: 1440, height: 794 },
      mobile = { width: 390, height: 730 },
      short = { width: 1440, height: 394 };
    const first = cameraForViewport(initial, desktop, fit);
    const resized = cameraForViewport(
      cameraForViewport(first, mobile, fit),
      short,
      fit,
    );
    expect(resized.width).toBeGreaterThan(1900);
    expect(cameraForViewport(resized, desktop, fit)).toEqual(first);
    const continent: ExplorerCameraFit = {
      kind: 'bounds',
      bounds: [200, 100, 600, 400],
      padding: 1.06,
    };
    const camera = cameraForViewport(initial, sizes[4]!, continent);
    expect(camera).toEqual({
      x: 400,
      y: 250,
      width: ((300 * sizes[4]!.width) / sizes[4]!.height) * 1.06,
    });
  });
});
