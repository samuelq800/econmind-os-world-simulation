/** TEST_ONLY isolated embedded SQL metadata. Genuine bounded functions/roles
 * execute, but fixture insertion is not official publication or economic proof. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import { createPostwarDayOneFxQuoteData } from '@econmind/core/postwar-day-one-treasury-fx';
import { createIndustryRunParametersSqlFixture } from './postwar-industry-run-parameters-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function createFxQuotesSqlFixture() {
  const original = await createIndustryRunParametersSqlFixture(),
    { db, f, tx } = original;
  try {
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-day-one-fx-quotes-read.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'FINANCE','FINANCE_BUDGET',$4,$5,true,now())",
      [f.world, f.subject, f.buyer, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values($1,$2::uuid,$3,'FINANCE',$4,$5)",
      [f.world, f.subject, f.buyer, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
      [
        f.world,
        f.subject,
        'OFFICE_' +
          Buffer.from(f.buyer).toString('hex').toUpperCase() +
          '_46494E414E4345',
        f.revision,
      ],
    );
    await db.query(
      `insert into world_v2.postwar_office_projection_document select 'FX_HEADER_TEST_ONLY',world_id,country_id,'FINANCE','currency-fx',projection_version,$2,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count,generated_at from world_v2.postwar_office_projection_document where world_id=$1 and office_id='INDUSTRY'`,
      [f.world, 'sha256:' + sha('TEST_ONLY_FX_HEADER')],
    );
    const quote = createPostwarDayOneFxQuoteData(
      {
        schemaVersion: 'postwar-day-one-fx-quote-v1',
        policyVersion: 'POSTWAR_DAY_ONE_FX_20261029_V1',
        worldId: f.world,
        seedFingerprint: f.seed.fingerprint,
        countryId: f.buyer,
        localCurrency: 'XBB',
        localCurrencyPerGcu: '2',
        governmentEntityId: 'GOV_TEST_ONLY',
        centralBankEntityId: 'CB_TEST_ONLY',
        bankEntityId: 'BANK_TEST_ONLY',
        dealerGcuAccountId: 'DEALER_TEST_ONLY',
        financialSourceId: 'SOURCE_TEST_ONLY_FINANCIAL',
        financialSourcePayloadHash: 'sha256:' + sha('F'),
        gcuSourceId: 'SOURCE_TEST_ONLY_GCU',
        gcuSourcePayloadHash: 'sha256:' + sha('G'),
        baselineFxVersion: 'TEST_ONLY',
        baselineSourceSha256: sha('BASE'),
        policySha256:
          '339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893',
        userReceiptSha256:
          '0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec',
        validFromSimTime: '0',
        validUntilSimTime: '86400000',
        spreadBps: '0',
        gcuQuantum: '0.000001',
      },
      sha,
    );
    const quoteText = C.canonicalSerialize(quote),
      registration = 'TEST_ONLY_FX_REG';
    await db.query(
      `insert into world_v2.postwar_day_one_fx_source_original values($1,$2,$3,$4,$5,$6,'{}',$7,$8,$9,'world_v2_day_one_fx_source_publisher')`,
      [
        f.world,
        registration,
        f.seed.seedId,
        f.seed.fingerprint,
        f.admissionRef,
        sha('TEST_ONLY_SEED'),
        sha('{}'),
        quote.policySha256,
        quote.userReceiptSha256,
      ],
    );
    await db.query(
      'insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,$3,$4,$5,$6)',
      [
        f.world,
        f.buyer,
        quote.quoteRef,
        'TEST_ONLY_FX_REV',
        quoteText,
        sha(quoteText),
      ],
    );
    return { ...original, quote, registration, tx };
  } catch (error) {
    await original.close();
    throw error;
  }
}
