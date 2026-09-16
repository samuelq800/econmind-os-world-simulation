import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const centralBankGovernor = readFileSync(
  'apps/world-web/src/prototype/CentralBankGovernor.tsx',
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

describe('Central Bank Governor policy meeting surface', () => {
  it('turns the policy-rate decision into a staged, explainable meeting loop', () => {
    for (const label of [
      'Monetary policy chamber',
      'Read price pressure',
      'Set rate path',
      'Choose guidance',
      'Issue statement',
      'Read the price signal',
      'Hold the rate',
      'Tighten 25 bp',
      'Tighten 50 bp',
      'MOVE PREVIEW',
      'Choose a policy card',
      'Card staged. You can still change the path before issuing the statement.',
      'Issue local policy statement',
      'Open next meeting',
    ]) {
      expect(centralBankGovernor).toContain(label);
    }
    expect(centralBankGovernor).toContain('Real policy rate');
    expect(centralBankGovernor).toContain(
      'Captain is notified after publication',
    );
    expect(centralBankGovernor).toContain(
      'Rates are not a balance-sheet shortcut.',
    );
  });

  it('keeps the meeting local and prevents publication before its prerequisites', () => {
    expect(centralBankGovernor).toContain(
      'if (!signalRead || published) return;',
    );
    expect(centralBankGovernor).toContain(
      'if (!rateChoiceId || published) return;',
    );
    expect(centralBankGovernor).toContain(
      'if (!selectedRate || !selectedGuidance || published) return;',
    );
    expect(centralBankGovernor).toContain('No World State changed.');
    expect(centralBankGovernor).not.toContain('fetch(');
    expect(centralBankGovernor).not.toContain('submitCommand');
    expect(centralBankGovernor).not.toContain('@econmind/core');
  });

  it('routes the Central Bank fixture to its own command page and preserves the wider map', () => {
    expect(g01).toContain('import { CentralBankGovernor }');
    expect(g01).toContain('CENTRAL_BANK_NAV_GROUPS');
    expect(g01).toContain("actingOffice.officeId === 'CENTRAL_BANK'");
    expect(g01).toContain('<CentralBankGovernor');
    expect(g01).toContain('<LivingNationScene');
  });

  it('uses the existing dark world system with focus and motion fallbacks', () => {
    expect(styles).toContain('.central-bank-command');
    expect(styles).toContain('.central-bank-signal__dial');
    expect(styles).toContain('.central-bank-rate-grid');
    expect(styles).toContain('.central-bank-impact-board');
    expect(styles).toContain('.central-bank-guidance');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
    expect(styles).toContain('(forced-colors: active)');
  });
});
