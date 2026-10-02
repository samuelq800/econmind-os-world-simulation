import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL(
  '../../apps/world-web/public/season1-immersive/',
  import.meta.url,
);
const css = readFileSync(new URL('../country-home-layout.css', root), 'utf8');
const js = readFileSync(new URL('country-game.js', root), 'utf8');

describe('country-home map layout guardrails', () => {
  it('contains every mobile drawer variant in the viewport despite legacy inline bounds', () => {
    expect(css).toMatch(
      /\.national-drawer\s*\{[^}]*position: fixed !important;[^}]*top: max\(12px, env\(safe-area-inset-top\)\) !important;[^}]*bottom: max\(12px, env\(safe-area-inset-bottom\)\) !important;[^}]*width: auto;[^}]*max-height: none !important;[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/,
    );
    expect(js).toContain("el.style.bottom='auto'");
    expect(js).toContain(
      "el.style.maxHeight='min(380px,calc(100dvh - 190px))'",
    );
  });

  it('keeps the drawer close header reachable while long lists scroll internally', () => {
    expect(css).toMatch(
      /\.country-game:has\(\.national-drawer:not\(\[hidden\]\)\)\s*\{[^}]*z-index: 6;/,
    );
    expect(css).toMatch(
      /\.national-drawer-head\s*\{[^}]*position: sticky;[^}]*top: -16px;[^}]*z-index: 1;[^}]*background:/,
    );
    expect(css).toMatch(
      /\.national-drawer-head button\s*\{[^}]*flex: 0 0 32px;/,
    );
    expect(css).toContain('scroll-padding-top: 72px');
    expect(js).toContain('trigger?.focus()');
  });

  it('wraps complete mobile site labels, IDs and provenance instead of clipping a two-column grid', () => {
    expect(css).toMatch(
      /\.national-site-list\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /\.national-drawer\s+:is\(button, h3, p, small, span, strong, pre\)\s*\{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/,
    );
    expect(css).not.toContain('ellipsis');
    expect(css).toMatch(
      /\.national-source-json\s*\{[^}]*white-space: pre-wrap;/,
    );
  });

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

  it('keeps the original desktop projection and does not fabricate anchorless map pins', () => {
    expect(css).not.toContain('anchor-size(');
    expect(css).not.toContain('scale(');
    expect(css).toContain(
      'clip-path: inset(205px 460px 250px calc(31% + 28px))',
    );
    expect(css).toMatch(
      /\.national-site-pins button:not\(\[style\*=['"]left:['"]\]\)\s*\{\s*display: none;/,
    );
    expect(js).toContain('if(!anchor)continue');
    expect(js).toContain("commands['country-sites']");
  });

  it('docks selected source details instead of stacking them over plans or missions', () => {
    expect(css).toContain('top: 460px !important');
    expect(css).toContain('.country-map-home .national-destination[hidden]');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toMatch(
      /\.national-destination\s*\{[^}]*position: relative;[^}]*top: auto !important;/,
    );
  });

  it('exposes the whole mobile role title and separates toolbar from the HUD', () => {
    expect(css).toMatch(/\.national-identity\s*\{[^}]*grid-column: 1 \/ -1;/);
    expect(css).toMatch(
      /\.national-identity strong\s*\{[^}]*width: 100%;[^}]*max-width: none;/,
    );
    expect(css).toMatch(
      /\.national-tools\s*\{[^}]*position: relative;[^}]*top: auto;/,
    );
  });

  it('rebases unchanged source anchors to the flowing scene only when CSS anchors are supported', () => {
    expect(css).toContain('@supports (top: anchor(--country-scene center))');
    expect(css).toContain('anchor-name: --country-scene');
    expect(css).toMatch(
      /\.national-site-pins\s*\{[^}]*top: anchor\(--country-scene center\);[^}]*height: 100%;[^}]*transform: translateY\(-50%\);/,
    );
    expect(css).toContain('aspect-ratio: 1');
    expect(css).toContain('.national-world-status');
  });
});
