import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const css = readFileSync(new URL('../country-home-layout.css', root), 'utf8');
const js = readFileSync(new URL('country-game.js', root), 'utf8');

describe('country-home map layout guardrails', () => {
  it('keeps the country scene complete and permits page scroll', () => {
    expect(css).toMatch(
      /\.country-map-home \.national-world\s*\{[^}]*background-size: contain;/,
    );
    expect(css).toMatch(
      /\.country-map-home \.country-game\s*\{[^}]*height: auto;[^}]*min-height: max\(930px, 100dvh\);/,
    );
    expect(js).toContain("layoutLink.href='../country-home-layout.css'");
  });

  it('positions site pins against the contained square image', () => {
    expect(js).toMatch(/function positionSites\(\).*scale=Math\.min\(w,h\)/);
  });
});
