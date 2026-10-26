/** Wire/controller unit fixtures only; no API, native, economic or browser acceptance. */
import { describe, expect, it, vi } from 'vitest';
import {
  createSocialDemoClient,
  type SocialDemoClient,
} from '../../apps/world-web/src/social-office-demo/client.js';
import {
  createSocialDemoController,
  type SocialDemoPendingStore,
} from '../../apps/world-web/src/social-office-demo/controller.js';
import {
  parseSocialDemoProjection,
  parseSocialDemoRequest,
  type SocialDemoProjection,
  type SocialDemoReceipt,
} from '../../apps/world-web/src/social-office-demo/contract.js';

const ID = '11111111-1111-4111-8111-111111111111';
const fixture: SocialDemoProjection = {
  schemaVersion: 'g-social-office-projection-v1',
  sourceClass: 'SIMULATED_OPENING',
  sourceAdmitted: false,
  worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1',
  countryId: 'COUNTRY_01',
  worldVersion: '0',
  eventSequence: '0',
  dayIndex: '0',
  sourceGeneration: '1',
  sourceManifestHash: '1'.repeat(64),
  labour: {
    total: '24',
    employed: '6',
    student: '5',
    searching: '13',
    low: '12',
    medium: '8',
    high: '4',
  },
  employment: {
    vacancies: '1',
    freeServiceSlots: '6',
    planState: 'NONE',
    matched: null,
    planCommandId: null,
    settlementCommandId: null,
  },
  college: {
    students: '3',
    graduates: '0',
    freeSeats: '3',
    budgetCommitted: '150',
    budgetRemaining: '150',
    currency: 'XAA',
    cohorts: [
      {
        cohortId: 'SIM_COHORT_RETURNING_01',
        state: 'OPEN',
        enrolled: '3',
        graduates: '0',
        retained: '3',
      },
    ],
  },
  clinic: {
    served: null,
    backlog: '4',
    medicineAvailable: '5',
    budgetCommitted: '0',
    budgetRemaining: '400',
    currency: 'XAA',
  },
  availableActions: ['PLAN', 'ADMIT', 'SERVE'],
};
function receipt(status: SocialDemoReceipt['status']): SocialDemoReceipt {
  return {
    schemaVersion: 'g-social-office-receipt-v1',
    requestId: ID,
    commandId: 'G_DEMO_TEST_ORIGINAL',
    status,
    worldVersion: status === 'FINAL' ? '1' : null,
    message: 'UNIT_FIXTURE_NOT_A_REAL_RECEIPT',
  };
}
function rig() {
  let stored: string | null = null;
  const store: SocialDemoPendingStore = {
    read: () => stored,
    write: (v) => {
      stored = v;
    },
    clear: () => {
      stored = null;
    },
  };
  const client: SocialDemoClient = {
    session: vi.fn(async () => {}),
    projection: vi.fn(async () => fixture),
    command: vi.fn(async () => receipt('QUEUED')),
    receipt: vi.fn(async () => receipt('UNKNOWN')),
  };
  const nextId = vi.fn(() => ID),
    render = vi.fn();
  const make = () =>
    createSocialDemoController({
      client,
      render,
      pendingStore: store,
      newRequestId: nextId,
    });
  return { client, store, make, nextId, render };
}
describe('isolated Social browser wire and receipt recovery', () => {
  it('refuses injected authority, time, foreign scope and unknown response fields', () => {
    expect(() =>
      parseSocialDemoProjection({ ...fixture, sourceAdmitted: true }),
    ).toThrow();
    expect(() =>
      parseSocialDemoProjection({ ...fixture, countryId: 'COUNTRY_02' }),
    ).toThrow();
    expect(() =>
      parseSocialDemoProjection({ ...fixture, ledgerBefore: {} }),
    ).toThrow();
    expect(() =>
      parseSocialDemoRequest({
        requestId: ID,
        action: 'PLAN',
        expectedWorldVersion: '0',
        simTime: '0',
      }),
    ).toThrow();
    expect(() =>
      parseSocialDemoRequest({
        requestId: ID,
        action: 'MATCH',
        expectedWorldVersion: '0',
      }),
    ).toThrow();
  });
  it('retains exact numeric wire values and refuses malformed quantities', () => {
    const p = parseSocialDemoProjection(fixture);
    expect(Object.isFrozen(p.college)).toBe(true);
    expect(p.college.budgetCommitted).toBe('150');
    expect(() =>
      parseSocialDemoProjection({
        ...fixture,
        labour: { ...fixture.labour, total: 'NaN' },
      }),
    ).toThrow();
  });
  it('connects only to the allocated loopback origin', () => {
    for (const origin of [
      'https://example.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000/extra',
      'http://127.0.0.1:3000/',
    ])
      expect(() => createSocialDemoClient(origin)).toThrow();
    expect(() => createSocialDemoClient('http://127.0.0.1:3000')).not.toThrow();
  });
  it('keeps QUEUED pending and never labels it FINAL or computes a local outcome', async () => {
    const r = rig(),
      c = r.make();
    await c.start();
    await c.submit('PLAN');
    expect(c.snapshot().phase).toBe('PENDING');
    expect(c.snapshot().projection).toBe(fixture);
    expect(r.client.command).toHaveBeenCalledTimes(1);
    expect(r.store.read()).toContain(ID);
    await c.submit('ADMIT');
    expect(r.client.command).toHaveBeenCalledTimes(1);
  });
  it('after a lost response queries the same original request and does not resubmit', async () => {
    const r = rig();
    vi.mocked(r.client.command).mockRejectedValueOnce(Error('lost response'));
    const c = r.make();
    await c.start();
    await c.submit('PLAN');
    expect(c.snapshot().phase).toBe('UNKNOWN');
    await c.poll();
    expect(r.client.receipt).toHaveBeenLastCalledWith(ID);
    expect(r.client.command).toHaveBeenCalledTimes(1);
    expect(r.nextId).toHaveBeenCalledTimes(1);
    const reopened = r.make();
    await reopened.start();
    expect(r.client.command).toHaveBeenCalledTimes(1);
    expect(r.client.receipt).toHaveBeenLastCalledWith(ID);
  });
  it('confirms only a FINAL server receipt and then reads a new authorized projection', async () => {
    const r = rig();
    const after = {
      ...fixture,
      worldVersion: '1',
      eventSequence: '1',
      availableActions: [],
    };
    const c = r.make();
    await c.start();
    await c.submit('PLAN');
    vi.mocked(r.client.receipt).mockResolvedValueOnce(receipt('FINAL'));
    vi.mocked(r.client.projection).mockResolvedValueOnce(after);
    await c.poll();
    expect(c.snapshot().phase).toBe('FINAL');
    expect(c.snapshot().projection).toBe(after);
    expect(r.store.read()).toBeNull();
  });
  it('wipes a pending private view on receipt refusal while retaining the original identity without resubmitting', async () => {
    const r = rig(),
      c = r.make();
    await c.start();
    await c.submit('PLAN');
    expect(c.snapshot().projection).not.toBeNull();
    vi.mocked(r.client.receipt).mockRejectedValueOnce(
      Error('current read permission revoked'),
    );
    await c.poll();
    expect(c.snapshot().projection).toBeNull();
    expect(c.snapshot().phase).toBe('UNKNOWN');
    expect(c.snapshot().pending?.requestId).toBe(ID);
    expect(r.store.read()).toContain(ID);
    expect(r.client.receipt).toHaveBeenLastCalledWith(ID);
    expect(r.client.command).toHaveBeenCalledTimes(1);
    expect(r.nextId).toHaveBeenCalledTimes(1);
  });
  it('retains confirmed status but wipes the projection if its fresh authorized read fails', async () => {
    const r = rig(),
      c = r.make();
    await c.start();
    await c.submit('PLAN');
    vi.mocked(r.client.receipt).mockResolvedValueOnce(receipt('FINAL'));
    vi.mocked(r.client.projection).mockRejectedValueOnce(
      Error('current grant revoked'),
    );
    await c.poll();
    expect(c.snapshot().phase).toBe('FINAL');
    expect(c.snapshot().projection).toBeNull();
    expect(c.snapshot().pending).toBeNull();
    expect(r.store.read()).toBeNull();
  });
  it('does not send a command if the pending marker cannot be saved first', async () => {
    const r = rig();
    r.store.write = () => {
      throw Error('storage unavailable');
    };
    const c = r.make();
    await c.start();
    await c.submit('PLAN');
    expect(r.client.command).not.toHaveBeenCalled();
    expect(c.snapshot().phase).toBe('ERROR');
    expect(c.snapshot().pending).toBeNull();
  });
  it('retains FINAL even if clearing a stored marker fails; reload will query that original receipt', async () => {
    const r = rig(),
      c = r.make();
    await c.start();
    await c.submit('PLAN');
    r.store.clear = () => {
      throw Error('storage unavailable');
    };
    vi.mocked(r.client.receipt).mockResolvedValue(receipt('FINAL'));
    await c.poll();
    expect(c.snapshot().phase).toBe('FINAL');
    expect(c.snapshot().pending).toBeNull();
    expect(r.store.read()).toContain(ID);
    await r.make().start();
    expect(r.client.command).toHaveBeenCalledTimes(1);
    expect(r.client.receipt).toHaveBeenLastCalledWith(ID);
  });
});
