import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createSocialOfficeSimulatedAtomicRepository } from '../../apps/world-worker/src/persistence/social-office-atomic-repository.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  config,
  command,
  match,
  principal,
  socialScenario,
} from '../support/social-office-atomic-fixture.js';

describe('D closed server-only Social atomic composition', () => {
  it('refuses injected readiness, callbacks, before-state and the old seed pin without connecting', async () => {
    const s = await socialScenario(),
      pool = new Pool({ host: '/no-connection-expected' }),
      c = config(new PostgresSqlDatabase(pool), s);
    for (const extra of [
      { ready: true },
      { resolver: () => true },
      { inventoryBefore: {} },
      { clock: () => 0 },
    ])
      expect(() =>
        createSocialOfficeSimulatedAtomicRepository({ ...c, ...extra }),
      ).toThrow('closed inert');
    expect(() =>
      createSocialOfficeSimulatedAtomicRepository({
        ...c,
        seed: {
          ...c.seed,
          seedFingerprint:
            'sha256:75ad9f48846a605b4c5eafb8d56927ec240a8c62b567ce38291c6eed53c425c3',
        },
      }),
    ).toThrow('fixed simulated');
    expect(() =>
      createSocialOfficeSimulatedAtomicRepository({
        ...c,
        publisher: { ...c.publisher, actorId: s.actorId },
      }),
    ).toThrow('fixed simulated');
    await pool.end();
  });
  it('forbids MATCH on the manual route and rejects wrong verified subject or expiry before connecting', async () => {
    const s = await socialScenario(),
      pool = new Pool({ host: '/no-connection-expected' }),
      repo = createSocialOfficeSimulatedAtomicRepository(
        config(new PostgresSqlDatabase(pool), s),
      );
    const plan = command(s, 'PLAN'),
      due = match(s, plan, '0');
    await expect(
      repo.executeManual({ command: due, principal: principal() }),
    ).rejects.toThrow('fixed command scope');
    const p = principal();
    await expect(
      repo.executeManual({
        command: plan,
        principal: { ...p, token: { ...p.token, subject: 'bad' } },
      }),
    ).rejects.toThrow('principal mismatch');
    await expect(
      repo.executeManual({
        command: plan,
        principal: {
          ...p,
          token: {
            ...p.token,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      }),
    ).rejects.toThrow('principal mismatch');
    await pool.end();
  });
});
