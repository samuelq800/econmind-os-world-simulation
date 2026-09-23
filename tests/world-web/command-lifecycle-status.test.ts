import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  commandLifecycleCopy,
  fixtureLifecycleFromReceipt,
  type CommandLifecycleState,
} from '../../apps/world-web/src/prototype/CommandLifecycleStatus.js';
import { fixtureProjectionForOffice } from '../../apps/world-web/src/prototype/fixtures.js';
import { fixtureLifecycleForOfficeAction } from '../../apps/world-web/src/prototype/NationalOverview.js';
import { preparationOfficeActionAdapter } from '../../apps/world-web/src/prototype/office-action-adapter.js';

const componentSource = readFileSync(
  'apps/world-web/src/prototype/CommandLifecycleStatus.tsx',
  'utf8',
);
const g01Source = readFileSync(
  'apps/world-web/src/prototype/SixOfficesG01.tsx',
  'utf8',
);
const legacyBriefSource = readFileSync(
  'apps/world-web/src/prototype/WorldCommandBrief.tsx',
  'utf8',
);

describe('preparation-only Command lifecycle presentation', () => {
  it('distinguishes unavailable, approval required, pending approval and pending final receipt', () => {
    const states: readonly CommandLifecycleState[] = [
      {
        source: 'LOCAL_FIXTURE',
        kind: 'UNAVAILABLE',
        reason: 'No authorized port.',
      },
      {
        source: 'LOCAL_FIXTURE',
        kind: 'APPROVAL_REQUIRED',
        reason: 'Finance must approve.',
      },
      {
        source: 'LOCAL_FIXTURE',
        kind: 'AWAITING_APPROVAL',
        approvalRequestId: 'LOCAL-APPROVAL-1',
      },
      {
        source: 'LOCAL_FIXTURE',
        kind: 'SUBMITTED_AWAITING_FINAL_RECEIPT',
        commandId: 'LOCAL-COMMAND-1',
      },
    ];
    const copies = states.map(commandLifecycleCopy);

    expect(copies.map((copy) => copy.title)).toEqual([
      'Command unavailable',
      'Approval required',
      'Rehearsal · awaiting approval',
      'Rehearsal · awaiting final receipt',
    ]);
    expect(copies[1]?.nextStep).toContain(
      'No approval request has been submitted',
    );
    expect(copies[0]?.nextStep).toBe(
      'No live Command can be sent from this page.',
    );
    expect(copies[2]?.referenceValue).toBe('LOCAL-APPROVAL-1');
    expect(copies[3]?.nextStep).toContain('do not resubmit automatically');
    expect(copies.every((copy) => copy.tone !== 'success')).toBe(true);
  });

  it('requires a supplied final receipt reference for success or rejection and never calls a fixture result actual', () => {
    const receipt = fixtureProjectionForOffice('TRADE').recentReceipt!;
    const success = fixtureLifecycleFromReceipt(receipt);
    const rejected = fixtureLifecycleFromReceipt({
      ...receipt,
      outcome: 'REJECTED',
      reasonCode: 'INSUFFICIENT_FUNDS',
      worldVersionAfter: null,
    });
    const revoked = fixtureLifecycleFromReceipt({
      ...receipt,
      outcome: 'AUTHORIZATION_REVOKED',
      reasonCode: 'APPOINTMENT_CHANGED',
      worldVersionAfter: null,
    });

    expect(success).toMatchObject({
      source: 'LOCAL_FIXTURE',
      kind: 'SUCCEEDED',
      receipt: { commandId: receipt.commandId },
    });
    expect(commandLifecycleCopy(success)).toMatchObject({
      title: 'Rehearsal receipt · succeeded',
      detail: 'Fixture result only. No World State changed.',
    });
    expect(commandLifecycleCopy(rejected)).toMatchObject({
      title: 'Rehearsal receipt · rejected',
      liveRegion: 'alert',
      referenceValue: receipt.commandId,
    });
    expect(commandLifecycleCopy(revoked)).toMatchObject({
      title: 'Rehearsal access revoked',
      nextStep: 'Stop; refresh Office authorization before acting.',
    });
    expect(componentSource).toContain('LOCAL REHEARSAL · NOT ACTUAL');
    expect(componentSource).not.toContain('fetch(');
    expect(componentSource).not.toContain('submitCommand(');
  });

  it('makes version conflict and revocation urgent without implying a committed outcome', () => {
    const conflict: CommandLifecycleState = {
      source: 'LOCAL_FIXTURE',
      kind: 'VERSION_CONFLICT',
      expectedWorldVersion: '1842',
      observedWorldVersion: '1843',
    };
    const revoked: CommandLifecycleState = {
      source: 'LOCAL_FIXTURE',
      kind: 'AUTHORIZATION_REVOKED',
      reason: 'Appointment changed.',
    };

    expect(commandLifecycleCopy(conflict)).toMatchObject({
      liveRegion: 'alert',
      detail: 'Expected v1842; current version v1843.',
    });
    expect(commandLifecycleCopy(revoked)).toMatchObject({
      liveRegion: 'alert',
      detail: 'Appointment changed.',
    });
    expect(commandLifecycleCopy(conflict).nextStep).toContain(
      'rebuild the draft',
    );
  });

  it('keeps an authorized read-model label distinct from a local rehearsal label', () => {
    const authorized: CommandLifecycleState = {
      source: 'AUTHORIZED_READ_MODEL',
      kind: 'UNAVAILABLE',
      reason: 'Office appointment is not active.',
    };

    expect(commandLifecycleCopy(authorized)).toMatchObject({
      title: 'Command unavailable',
      nextStep: 'No Command can be sent from this page.',
    });
    expect(componentSource).toContain('AUTHORIZED READ MODEL · DISPLAY ONLY');
  });

  it('maps a required approval to required, not falsely to an already pending request', () => {
    const finance = fixtureProjectionForOffice('FINANCE');
    const trade = fixtureProjectionForOffice('TRADE');
    const financeModel = preparationOfficeActionAdapter.readModel({
      projection: finance,
      event: finance.events[1]!,
      state: 'ready',
    });
    const tradeModel = preparationOfficeActionAdapter.readModel({
      projection: trade,
      event: trade.events[0]!,
      state: 'ready',
    });

    expect(fixtureLifecycleForOfficeAction(financeModel)).toMatchObject({
      kind: 'APPROVAL_REQUIRED',
      reason: 'This route needs an approval decision.',
    });
    expect(fixtureLifecycleForOfficeAction(tradeModel)).toMatchObject({
      kind: 'UNAVAILABLE',
      reason:
        'Live Command submission is not connected in this preparation build.',
    });
  });

  it('mounts the shared card on G01 and G02 while correcting the legacy fixture receipt label', () => {
    expect(g01Source).toContain('<CommandLifecycleStatus');
    expect(g01Source).toContain("kind: 'UNAVAILABLE'");
    expect(legacyBriefSource).toContain('<CommandLifecycleStatus');
    expect(legacyBriefSource).toContain('Fixture receipt example');
    expect(legacyBriefSource).toContain('not actual');
    expect(legacyBriefSource).not.toContain('World change evidence');
  });
});
