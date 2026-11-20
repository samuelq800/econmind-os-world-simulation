import { describe, it, expect } from 'vitest';
import {
  isExactColdFxSourceRevocation,
  wireColdError,
} from '../../tools/office-connection/native-mixed-cold-errors.mjs';
function revoked() {
  const sql = Object.assign(Error('FX_SOURCE_REVOKED'), { code: '55000' });
  const domain = Object.assign(
    Error('POSTWAR_DAY_ONE_FX_CUSTODY:FX_SOURCE_REVOKED', { cause: sql }),
    { name: 'DomainError', code: 'TRANSITION_EVIDENCE_INVALID' },
  );
  return Object.assign(
    Error('PostgreSQL transaction failed: ROLLED_BACK', { cause: domain }),
    { name: 'PostgresTransactionError', outcome: 'ROLLED_BACK' },
  );
}
describe('cold host exact nested source-revocation diagnostics', () => {
  it('recognizes the actual PostgreSQL transaction -> DomainError -> SQL55000 structure and its wire form', () => {
    const error = revoked();
    expect(isExactColdFxSourceRevocation(error)).toBe(true);
    expect(
      isExactColdFxSourceRevocation(
        Object.assign(
          Error('PostgreSQL transaction failed: ROLLED_BACK', {
            cause: Object.assign(Error('FX_SOURCE_REVOKED'), { code: '55000' }),
          }),
          { name: 'PostgresTransactionError', outcome: 'ROLLED_BACK' },
        ),
      ),
    ).toBe(true);
    const wire = wireColdError(error);
    expect(wire).toMatchObject({
      name: 'PostgresTransactionError',
      outcome: 'ROLLED_BACK',
      cause: {
        name: 'DomainError',
        cause: { code: '55000', message: 'FX_SOURCE_REVOKED' },
      },
    });
    expect(
      isExactColdFxSourceRevocation(JSON.parse(JSON.stringify(wire))),
    ).toBe(true);
  });
  it('finds expected chains through AggregateError.errors while preserving both branches', () => {
    const wire = wireColdError(
      new AggregateError([revoked(), revoked()], 'expected rollback errors', {
        cause: revoked(),
      }),
    );
    expect(isExactColdFxSourceRevocation(wire)).toBe(true);
    expect(wire.errors).toHaveLength(2);
    expect(wire.cause).toBeDefined();
  });
  it.each(['55001', '42501', 'ETIMEDOUT'])(
    'rejects mismatched SQL/error code %s',
    (code) => {
      const e = revoked();
      Object.assign((e.cause as Error).cause as Error, { code });
      expect(isExactColdFxSourceRevocation(e)).toBe(false);
    },
  );
  it('rejects generic, timeout and unrelated Aggregate siblings even beside the expected cause', () => {
    for (const e of [
      Error('unavailable'),
      Error('POSTWAR_DAY_ONE_FX_CUSTODY:FX_SOURCE_REVOKED'),
      Object.assign(Error('timeout'), { code: 'ETIMEDOUT' }),
      new AggregateError([revoked(), Error('unrelated')], 'mixed'),
    ])
      expect(isExactColdFxSourceRevocation(e)).toBe(false);
  });
  it('requires exact mapped messages but also accepts the actual bare SQL55000 custody leaf', () => {
    const e = revoked();
    Object.assign(e.cause as Error, {
      message: 'prefix POSTWAR_DAY_ONE_FX_CUSTODY:FX_SOURCE_REVOKED suffix',
    });
    expect(isExactColdFxSourceRevocation(e)).toBe(false);
    expect(
      isExactColdFxSourceRevocation(
        Object.assign(Error('FX_SOURCE_REVOKED'), { code: '55000' }),
      ),
    ).toBe(true);
  });
  it.each(['COMMIT_OUTCOME_UNKNOWN', 'ROLLBACK_UNCONFIRMED', 'NOT_STARTED'])(
    'rejects uncertain transaction outcome %s',
    (outcome) => {
      const e = revoked();
      e.outcome = outcome;
      expect(isExactColdFxSourceRevocation(e)).toBe(false);
      if (outcome === 'ROLLBACK_UNCONFIRMED') {
        const contradictory = Object.assign(revoked(), {
          rollbackError: Error('rollback timeout'),
        });
        expect(isExactColdFxSourceRevocation(contradictory)).toBe(false);
        expect(wireColdError(contradictory)).toMatchObject({
          outcome: 'ROLLED_BACK',
          rollbackError: { kind: 'ERROR', message: 'rollback timeout' },
        });
      }
    },
  );
  it('bounds cause cycles and depth without losing a visible reason for rejection', () => {
    const cycle = revoked();
    Object.defineProperty((cycle.cause as Error).cause, 'cause', {
      value: cycle,
    });
    expect(isExactColdFxSourceRevocation(cycle)).toBe(false);
    expect(JSON.stringify(wireColdError(cycle))).toContain('CYCLE');
    let deep: Error = revoked();
    for (let i = 0; i < 70; i++) deep = new AggregateError([deep], 'nested');
    expect(isExactColdFxSourceRevocation(deep)).toBe(false);
    expect(JSON.stringify(wireColdError(deep))).toContain('TRUNCATED');
  });
});
