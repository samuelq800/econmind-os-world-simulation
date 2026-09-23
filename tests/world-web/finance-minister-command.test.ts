import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const financeCommand = readFileSync(
  'apps/world-web/src/prototype/FinanceMinisterCommand.tsx',
  'utf8',
);
const g01 = readFileSync(
  'apps/world-web/src/prototype/SixOfficesG01.tsx',
  'utf8',
);
const styles = readFileSync(
  'apps/world-web/src/prototype/six-offices.css',
  'utf8',
);

describe('Finance Minister funding route surface', () => {
  it('turns a funding request into a cash-and-capital mission loop', () => {
    for (const label of [
      'Treasury survival turn',
      'Cash is a clock.',
      'Riverside Capacity Link',
      'Read runway',
      'Open request',
      'Build structure',
      'Close stack',
      'Record route',
      'Treasury first',
      'Balanced structure',
      'Phase the build',
      'Open publish review',
      'Record local funding route',
      'Open next funding turn',
    ]) {
      expect(financeCommand).toContain(label);
    }
    expect(financeCommand).toContain('Every source leaves a different bill.');
    expect(financeCommand).toContain(
      'Industry owns the project; Finance owns the',
    );
    expect(financeCommand).toContain('funding route.');
  });

  it('shows concrete fiscal consequences and blocks an unsafe Treasury-first route', () => {
    expect(financeCommand).toContain('Before');
    expect(financeCommand).toContain('Proposed');
    expect(financeCommand).toContain('Difference');
    expect(financeCommand).toContain(
      'Day 11 issue window; market demand stays uncertain.',
    );
    expect(financeCommand).toContain('Cannot record this route.');
    expect(financeCommand).toContain('below the');
    expect(financeCommand).toContain('Rebuild with balanced structure');
    expect(financeCommand).toContain('stackClosed && cashGuardrailMet');
    expect(financeCommand).toContain('if (!runwayRead || published) return;');
    expect(financeCommand).toContain('No world state changed.');
  });

  it('keeps the Finance route local and role-bounded', () => {
    expect(financeCommand).toContain('no Treasury transaction, debt issue, or');
    expect(financeCommand).toContain('approval is submitted.');
    expect(financeCommand).not.toContain('fetch(');
    expect(financeCommand).not.toContain('submitCommand');
    expect(financeCommand).not.toContain('@econmind/core');
    expect(financeCommand).not.toContain('Fiscal Space');
    expect(financeCommand).not.toContain('Debt Stress');
  });

  it('routes Finance to its own role page while preserving the existing office surfaces', () => {
    expect(g01).toContain('import { FinanceMinisterCommand }');
    expect(g01).toContain('FINANCE_NAV_GROUPS');
    expect(g01).toContain("actingOffice.officeId === 'FINANCE'");
    expect(g01).toContain('<FinanceMinisterCommand');
    expect(g01).toContain('<CaptainCommandCenter');
    expect(g01).toContain('<CentralBankGovernor');
    expect(g01).toContain('<LivingNationScene');
  });

  it('uses the existing World visual system with keyboard-visible interactive routes', () => {
    expect(styles).toContain('.finance-command');
    expect(styles).toContain('.finance-runway__chart');
    expect(styles).toContain('.finance-path-grid');
    expect(styles).toContain('.finance-source-card');
    expect(styles).toContain('.finance-publish-review');
    expect(styles).toContain('.finance-button:focus-visible');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
  });
});
