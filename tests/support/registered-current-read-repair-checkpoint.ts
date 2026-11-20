/** TEST_ONLY fixed read-repair checkpoint binding. Metadata is evidence only;
 * the new Node must still issue its actual full private source proof. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import {
  registeredFinalAssert as must,
  registeredFinalRecord as record,
} from './postwar-registered-final-driver.js';

const directory =
  '/workspace/.cloud-setup/evidence/trade-current-h3-repair-final13-20261108';
const originalDirectory = '/workspace/.cloud-setup/evidence/ru-c2-07';
export const CURRENT_READ_REPAIR_NAME =
  'postwar-complete-opening-inventory-read-repair';
const repairSha256 =
  'aa47ebbae894c4c9f0dbaff22a18757962a294e5fa18fb0fcea802ae8454cb37';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fixedNames = [
  'publish_postwar_office_projection',
  'read_postwar_office_projection_h0_page',
  'read_postwar_physical_opening_facts_page',
  'publish_postwar_inventory_provenance_v2',
  'read_postwar_inventory_provenance_v2_page',
  'postwar_write_trade_current_document',
  'publish_postwar_paged_trade_current',
  'read_postwar_trade_current_page',
  'read_postwar_narrow_trade_current_source',
  'read_postwar_narrow_trade_automatic_source',
  'read_postwar_narrow_trade_current_paged_scope',
  'read_postwar_narrow_trade_automatic_paged_scope',
  'postwar_projection_current_inventory_balance',
];
/** The canonical loader has 74 selected entries; 60 were executed after the
 * initializer. The two explicit fixture prerequisites complete the 76 receipts. */
export function assertRegisteredReadRepairReceiptCoverage(input: {
  installed: Readonly<Record<string, string>>;
  planNames: readonly string[];
  runtimeReceiptNames: readonly string[];
}): readonly string[] {
  const base = input.planNames.filter((x) => x !== CURRENT_READ_REPAIR_NAME);
  const expected = new Set([
    ...base,
    'current-authorization-writer-preparation',
    'postwar-runtime-source-read-policy',
  ]);
  const observed = Object.keys(input.installed).filter(
    (x) => !/^\d{4}_/u.test(x),
  );
  must(
    base.length === 74 &&
      expected.size === 76 &&
      observed.length === 76 &&
      observed.every((x) => expected.has(x)) &&
      input.runtimeReceiptNames.length === 60 &&
      new Set(input.runtimeReceiptNames).size === 60 &&
      input.runtimeReceiptNames.every((x) => expected.has(x)),
    'EXACT_BASE76_RUNTIME60_RECEIPT_UNION_REQUIRED',
  );
  return Object.freeze([...expected].sort());
}

export async function loadRegisteredCurrentReadRepairCheckpoint(
  repositoryRoot: string,
) {
  const raw = await readFile(
    path.join(
      repositoryRoot,
      'database/proposals/' + CURRENT_READ_REPAIR_NAME + '.sql',
    ),
    'utf8',
  );
  must(sha(raw) === repairSha256, 'EXACT_FINAL13_READ_REPAIR_SQL_REQUIRED');
  const checkpointRaw = await readFile(
    path.join(directory, 'retained-checkpoint.json'),
    'utf8',
  );
  const reportRaw = await readFile(path.join(directory, 'report.json'), 'utf8');
  const extraRaw = await readFile(
    path.join(directory, 'extra-ddl-receipt.json'),
    'utf8',
  );
  const appliedRaw = await readFile(
    path.join(directory, 'applied-adaptation-functions.json'),
    'utf8',
  );
  const extraReceipt = record(JSON.parse(extraRaw));
  const applied: unknown = JSON.parse(appliedRaw);
  const checkpoint = record(JSON.parse(checkpointRaw));
  const report = record(JSON.parse(reportRaw));
  must(
    extraReceipt.name === CURRENT_READ_REPAIR_NAME &&
      extraReceipt.sha256 === repairSha256 &&
      extraReceipt.status === 'DDL_COMMITTED' &&
      extraReceipt.database === checkpoint.templateDatabase &&
      extraReceipt.sourceCommit === record(checkpoint.candidate).commit &&
      record(checkpoint.candidate).commit ===
        '79a31c939789c300bfdb7249e72180082cda7554',
    'EXACT_ACTUAL_READ_REPAIR_DDL_RECEIPT_REQUIRED',
  );
  must(
    record(checkpoint.candidate).sha256 === repairSha256 &&
      report.candidateSha256 === repairSha256 &&
      report.status === 'PASS' &&
      checkpoint.parentCheckpoint ===
        path.join(originalDirectory, 'pg/retained-checkpoint.json') &&
      record(checkpoint.head).world_version === '3' &&
      record(checkpoint.head).event_sequence === '3',
    'ACTUAL_FINAL13_H3_REPAIR_APPLICATION_REQUIRED',
  );
  for (const table of [
    'world_head',
    'command_submission',
    'command_queue',
    'command_receipt',
    'authoritative_event',
    'financial_posting_batch',
    'inventory_posting',
    'opening_seed',
    'runtime_opening_admission',
    'runtime_admission_publication_permit',
    'runtime_admission_publication_revocation',
    'legacyDocuments',
    'legacyPages',
  ])
    must(
      isDeepStrictEqual(
        record(report.before)[table],
        record(report.after)[table],
      ),
      'REPAIR_CHANGED_IMMUTABLE_STATE:' + table,
    );
  const adaptations = [
    ...raw.matchAll(
      /-- Fixed adaptation: world_v2\.([^\n]+)\ndo \$adapt\$([\s\S]*?)end;\$adapt\$;/gu,
    ),
  ].map((match) => {
    const body = match[2]!;
    const owner = /pg_get_userbyid\(f.proowner\)<>'([^']+)'/u.exec(body)?.[1];
    const oldHash =
      /convert_to\(f.prosrc,'UTF8'\)\),'hex'\)<>\s*'([a-f0-9]{64})'/u.exec(
        body,
      )?.[1];
    const hashes = [...body.matchAll(/<>\s*'([a-f0-9]{64})'/gu)];
    const newHash = hashes.at(-1)?.[1];
    must(owner && oldHash && newHash, 'FIXED_ADAPTATION_IDENTITY_REQUIRED');
    return { signature: 'world_v2.' + match[1]!, owner, oldHash, newHash };
  });
  must(
    adaptations.length === 13 &&
      new Set(adaptations.map((x) => x.signature)).size === 13 &&
      fixedNames.every((name) =>
        adaptations.some((x) =>
          x.signature.startsWith('world_v2.' + name + '('),
        ),
      ),
    'ALL_THIRTEEN_FIXED_ADAPTATIONS_REQUIRED',
  );
  must(
    Array.isArray(applied) &&
      applied.length === 13 &&
      adaptations.every((expected) => {
        const matches = applied
          .map(record)
          .filter((x) => 'world_v2.' + x.signature === expected.signature);
        return (
          matches.length === 1 &&
          matches[0]!.oldHash === expected.oldHash &&
          matches[0]!.newHash === expected.newHash
        );
      }),
    'APPLIED_FINAL13_RECEIPT_AND_FROZEN_SQL_DIFFER',
  );
  return {
    checkpoint,
    originalDirectory,
    extraReceipt: {
      name: CURRENT_READ_REPAIR_NAME,
      sha256: repairSha256,
      status: 'DDL_COMMITTED',
    },
    adaptations,
    evidence: {
      checkpointFile: path.join(directory, 'retained-checkpoint.json'),
      checkpointSha256: sha(checkpointRaw),
      reportFile: path.join(directory, 'report.json'),
      reportSha256: sha(reportRaw),
      extraReceiptSha256: sha(extraRaw),
      appliedAdaptationsSha256: sha(appliedRaw),
      sqlSha256: repairSha256,
    },
  };
}
export async function verifyRegisteredCurrentReadRepairFunctionsFrom(
  pool: Pick<Pool, 'query'>,
  repair: Awaited<ReturnType<typeof loadRegisteredCurrentReadRepairCheckpoint>>,
) {
  const { rows } = await pool.query<{
    signature: string;
    prosrc_sha256: string;
    owner: string;
    prosecdef: boolean;
    proconfig: string[];
    acl: string | null;
  }>(
    `select s.signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')prosrc_sha256,
      pg_get_userbyid(p.proowner)owner,p.prosecdef,p.proconfig,p.proacl::text acl
     from unnest($1::text[])s(signature)join pg_proc p on p.oid=to_regprocedure(s.signature)`,
    [repair.adaptations.map((x) => x.signature)],
  );
  must(rows.length === 13, 'ACTUAL_THIRTEEN_REPAIRED_FUNCTIONS_REQUIRED');
  for (const expected of repair.adaptations) {
    const actual = rows.filter((x) => x.signature === expected.signature);
    must(
      actual.length === 1 &&
        actual[0]!.prosrc_sha256 === expected.newHash &&
        actual[0]!.owner === expected.owner &&
        actual[0]!.prosecdef === true &&
        isDeepStrictEqual(actual[0]!.proconfig, ['search_path=pg_catalog']),
      'ACTUAL_READ_REPAIR_FUNCTION_DIFFERS:' + expected.signature,
    );
  }
  return rows;
}

/** Preserve economic bytes while the explicit control generation/lease and
 * derived documents may legitimately change. Bounded tiny-H3 metadata only. */
export async function readRegisteredCurrentEconomicSnapshotFrom(
  pool: Pick<Pool, 'query'>,
  worldId: string,
) {
  const snapshot: Record<string, unknown> = {};
  for (const table of [
    'world_head',
    'command_submission',
    'command_queue',
    'command_receipt',
    'authoritative_event',
    'financial_posting_batch',
    'inventory_posting',
  ]) {
    const { rows } = await pool.query<{ count: string; sha256: string }>(
      `select count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')sha256 from world_v2.${table} t where world_id=$1`,
      [worldId],
    );
    must(rows.length === 1, 'EXACT_ECONOMIC_SNAPSHOT_REQUIRED');
    snapshot[table] = rows[0];
  }
  const { rows } = await pool.query<{
    document_count: string;
    page_count: string;
  }>(
    `select (select count(*)::text from world_v2.postwar_paged_current_document where world_id=$1)document_count,
     (select count(*)::text from world_v2.postwar_paged_current_page p join world_v2.postwar_paged_current_document d using(document_ref)where d.world_id=$1)page_count`,
    [worldId],
  );
  return { economic: snapshot, derived: rows[0] };
}
