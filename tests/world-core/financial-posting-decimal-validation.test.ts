/** Exact real PostgreSQL function regression, not an authority/admission test.
 * The opt-in cfc native suite installs this proposal only into its own clone. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
const root = path.resolve(import.meta.dirname, '../..');
const oldFile = await readFile(
  path.join(
    root,
    'database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
  ),
  'utf8',
);
const proposal = await readFile(
  path.join(
    root,
    'database/proposals/financial-posting-decimal-validation.sql',
  ),
  'utf8',
);
const start = oldFile.indexOf(
  'create or replace function world_v2.validate_financial_posting_payload(',
);
const oldFunction = oldFile.slice(start, oldFile.indexOf('\n$$;', start) + 4);
const correctedFunction = oldFunction.replace(String.raw`(?:\\.`, '(?:[.]');
function sample(amount = '1.23') {
  const account = (id: string) => ({
    accountClass: 'CASH',
    accountId: id,
    claimId: null,
    counterpartyEntityId: null,
    countryId: 'COUNTRY_01',
    currency: 'XAA',
    ownerId: 'ENTITY_TEST_ONLY_' + id,
    worldId: 'WORLD_TEST_ONLY_DECIMAL',
  });
  return {
    batchId: 'BATCH_TEST_ONLY_DECIMAL',
    causationCommandId: 'COMMAND_TEST_ONLY_DECIMAL',
    causationEventIds: ['EVENT_TEST_ONLY_DECIMAL'],
    schemaVersion: 'financial-posting-v1',
    settlementCurrency: 'XAA',
    simTime: '0',
    transitionBinding: {},
    worldId: 'WORLD_TEST_ONLY_DECIMAL',
    worldVersionAfter: '1',
    worldVersionBefore: '0',
    legs: [
      {
        legId: 'LEG_TEST_ONLY_DEBIT',
        account: account('ACCOUNT_DEBIT'),
        amount: { amount, currency: 'XAA' },
        direction: 'DEBIT',
        counterpartyAccountId: 'ACCOUNT_CREDIT',
      },
      {
        legId: 'LEG_TEST_ONLY_CREDIT',
        account: account('ACCOUNT_CREDIT'),
        amount: { amount, currency: 'XAA' },
        direction: 'CREDIT',
        counterpartyAccountId: 'ACCOUNT_DEBIT',
      },
    ],
  };
}
async function database() {
  const db = new PGlite();
  await db.exec(
    `create schema world_v2;create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,transition_binding text,settlement_currency text);`,
  );
  await db.exec(oldFunction);
  return db;
}
async function validate(db: PGlite, payload: ReturnType<typeof sample>) {
  const row = {
    world_id: 'WORLD_TEST_ONLY_DECIMAL',
    batch_id: 'BATCH_TEST_ONLY_DECIMAL',
    causation_command_id: 'COMMAND_TEST_ONLY_DECIMAL',
    world_version_before: 0,
    world_version_after: 1,
    sim_time: 0,
    event_ids: ['EVENT_TEST_ONLY_DECIMAL'],
    transition_binding: '{}',
    settlement_currency: 'XAA',
  };
  return db.query(
    'select world_v2.validate_financial_posting_payload($1::jsonb,jsonb_populate_record(null::world_v2.financial_posting_batch,$2::jsonb))',
    [JSON.stringify(payload), JSON.stringify(row)],
  );
}
describe('financial posting decimal validator candidate', () => {
  it('changes exactly the demonstrated decimal-dot token and leaves registered migration bytes intact', () => {
    expect(createHash('sha256').update(oldFile).digest('hex')).toBe(
      '88d54a0abccc91e23a1384c5cff4fe2918671169db6e2c67fc9a6440a6cdfa11',
    );
    expect(oldFunction).not.toBe(correctedFunction);
    expect(
      proposal.slice(proposal.indexOf('create or replace function')).trim(),
    ).toBe(correctedFunction);
  });
  it('reproduces the old PG rejection and accepts canonical decimal/integer amounts without changing owner/ACL', async () => {
    const db = await database();
    try {
      await db.exec(
        'create role decimal_validator_test_owner nologin;create role decimal_validator_test_reader nologin;alter function world_v2.validate_financial_posting_payload(jsonb,world_v2.financial_posting_batch)owner to decimal_validator_test_owner;revoke execute on function world_v2.validate_financial_posting_payload(jsonb,world_v2.financial_posting_batch)from public;grant execute on function world_v2.validate_financial_posting_payload(jsonb,world_v2.financial_posting_batch)to decimal_validator_test_reader;',
      );
      const metadata = () =>
        db.query(
          "select pg_get_userbyid(proowner)as owner,proacl::text as acl,prosecdef,provolatile from pg_proc where oid='world_v2.validate_financial_posting_payload(jsonb,world_v2.financial_posting_batch)'::regprocedure",
        );
      const before = (await metadata()).rows;
      expect(
        (
          await db.query(
            "select current_setting('standard_conforming_strings')as value",
          )
        ).rows,
      ).toEqual([{ value: 'on' }]);
      await validate(db, sample('100'));
      await expect(validate(db, sample('1.23'))).rejects.toMatchObject({
        code: '23514',
      });
      await db.exec(proposal);
      expect((await metadata()).rows).toEqual(before);
      for (const amount of ['100', '1.23', '99.9999993', '0.000001'])
        await validate(db, sample(amount));
      await db.exec(proposal);
      await validate(db, sample('1.23'));
      expect((await metadata()).rows).toEqual(before);
    } finally {
      await db.close();
    }
  });
  it('retains lexical, positivity, exact balance, account, currency and counterparty rejection', async () => {
    const db = await database();
    try {
      await db.exec(proposal);
      for (const amount of [
        '01.2',
        '+1.2',
        '1e2',
        '1.230',
        '1.',
        '-1',
        '0',
        '0.000000',
      ])
        await expect(validate(db, sample(amount))).rejects.toBeDefined();
      const unbalanced = sample();
      unbalanced.legs[1]!.amount.amount = '1.24';
      await expect(validate(db, unbalanced)).rejects.toMatchObject({
        code: '23514',
      });
      const duplicate = sample();
      duplicate.legs[1]!.account.accountId =
        duplicate.legs[0]!.account.accountId;
      await expect(validate(db, duplicate)).rejects.toMatchObject({
        code: '23514',
      });
      const currency = sample();
      currency.legs[0]!.amount.currency = 'GCU';
      await expect(validate(db, currency)).rejects.toMatchObject({
        code: '23514',
      });
      const counterparty = sample();
      counterparty.legs[0]!.counterpartyAccountId = 'MISSING_COUNTERPARTY';
      await expect(validate(db, counterparty)).rejects.toMatchObject({
        code: '23514',
      });
      const rowMismatch = sample();
      rowMismatch.worldVersionAfter = '2';
      await expect(validate(db, rowMismatch)).rejects.toMatchObject({
        code: '23514',
      });
      const extra = sample();
      Object.assign(extra.legs[0]!, { unreviewed: true });
      await expect(validate(db, extra)).rejects.toMatchObject({
        code: '23514',
      });
    } finally {
      await db.close();
    }
  });
});
