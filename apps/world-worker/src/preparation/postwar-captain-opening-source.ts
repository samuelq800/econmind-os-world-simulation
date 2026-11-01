/** Adopted new-scenario rule, not an Owner signature or release approval.
 * All outputs are immutable source DATA. Only the fixed controlled publisher
 * can register them; a running/existing initialized World is never reset. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalSerialize,
  POLITICAL_CAPITAL_BUCKETS,
  validatePoliticalCapitalSnapshot,
  type PoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  createCaptainSourcePublicationPacket,
  publishCaptainOperatingSourceFrom,
  type CaptainSourcePublicationPacket,
} from '../persistence/postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from '../persistence/captain-operating-source-custody.js';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
export const CAPTAIN_OPENING_POLICY_SHA256 =
  '9d5731f10ad8b6f647569b0f13f3199383c9056c84fb20be77c2f2629164f152';
export const CAPTAIN_OPENING_RECEIPT_SHA256 =
  'fe4aed9252f7555eade1b52ebf66b6c8a510cfb7e723bc6194e93a0bdfe7ce01';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('ADOPTED_CAPTAIN_OPENING:' + s);
}
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
}
export interface AdoptedCaptainOpeningPolicy {
  readonly kind: 'ADOPTED_CAPTAIN_OPENING_70_7X10_V1';
}
const policies = new WeakMap<
  object,
  Readonly<{ policyBytes: string; receiptBytes: string }>
>();
export function parseAdoptedCaptainOpeningPolicy(input: {
  policyBytes: string;
  receiptBytes: string;
}): Readonly<AdoptedCaptainOpeningPolicy> {
  if (
    sha(input.policyBytes) !== CAPTAIN_OPENING_POLICY_SHA256 ||
    sha(input.receiptBytes) !== CAPTAIN_OPENING_RECEIPT_SHA256
  )
    invalid('EXACT_ADOPTED_POLICY_AND_OWNER_RECEIPT_REQUIRED');
  const p = JSON.parse(input.policyBytes) as {
    adoptionReceiptSha256: string;
    opening: string;
    generated: string;
    spent: string;
    buckets: { bucket: string; amount: string }[];
  };
  if (
    p.adoptionReceiptSha256 !== CAPTAIN_OPENING_RECEIPT_SHA256 ||
    p.opening !== '70' ||
    p.generated !== '0' ||
    p.spent !== '0' ||
    p.buckets.length !== 7 ||
    p.buckets.some(
      (b, i) => b.bucket !== POLITICAL_CAPITAL_BUCKETS[i] || b.amount !== '10',
    )
  )
    invalid('ADOPTED_SEVENTY_SEVEN_TENS_REQUIRED');
  const token = Object.freeze({
    kind: 'ADOPTED_CAPTAIN_OPENING_70_7X10_V1' as const,
  });
  policies.set(token, Object.freeze({ ...input }));
  return token;
}
export async function loadAdoptedCaptainOpeningPolicy(repositoryRoot: string) {
  const [policyBytes, receiptBytes] = await Promise.all([
    readFile(
      resolve(repositoryRoot, 'config/postwar-genesis/captain-opening.v1.json'),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'config/postwar-genesis/captain-opening-adoption.v1.json',
      ),
      'utf8',
    ),
  ]);
  return parseAdoptedCaptainOpeningPolicy({ policyBytes, receiptBytes });
}
export interface AdoptedCaptainOpeningCandidate {
  readonly schemaVersion: 'adopted-captain-opening-candidate-v1';
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly worldAdmissionRef: string;
  readonly policySha256: string;
  readonly adoptionReceiptSha256: string;
  readonly fingerprint: string;
  readonly documents: readonly {
    path: string;
    sha256: string;
    bytes: string;
  }[];
  readonly packets: readonly CaptainSourcePublicationPacket[];
  readonly effects: Readonly<{
    financialPostings: '0';
    inventoryPostings: '0';
    politicalCapitalGenerationEvents: '0';
  }>;
}
/** Deterministic review artifact only. Countries are selected from real adopted
 * roster by the guarded server preparation below, never from HTTP. */
export function createAdoptedCaptainOpeningCandidate(
  policy: AdoptedCaptainOpeningPolicy,
  input: {
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    worldAdmissionRef: string;
    countryIds: readonly string[];
  },
): Readonly<AdoptedCaptainOpeningCandidate> {
  const bytes = policies.get(policy);
  if (!bytes) invalid('GENUINE_ADOPTED_POLICY_REQUIRED');
  const countries = [...input.countryIds].sort();
  if (
    countries.length !== 70 ||
    new Set(countries).size !== 70 ||
    countries.some((c, i) => c !== 'COUNTRY_' + String(i + 1).padStart(2, '0'))
  )
    invalid('EXACT_ADOPTED_SEVENTY_COUNTRY_ROSTER_REQUIRED');
  const evidence = sha(
    canonicalSerialize({
      policySha256: CAPTAIN_OPENING_POLICY_SHA256,
      receiptSha256: CAPTAIN_OPENING_RECEIPT_SHA256,
      questionMessageId: 'Sentinel_d3c8418a3a448191b1f1b580d6b92b01',
      answerMessageId: 'Sentinel_6ada18b33d9881919c978cd5d95ab680',
      directQuestionCallId: 'call_0f9ec64182754b11958c32f44b80f5ff',
    }),
  );
  const packets = countries.map((countryId) => {
    const id = sha(
      canonicalSerialize({
        worldId: input.worldId,
        seedId: input.seedId,
        seedFingerprint: input.seedFingerprint,
        countryId,
        policySha256: CAPTAIN_OPENING_POLICY_SHA256,
      }),
    )
      .slice(0, 32)
      .toUpperCase();
    const q = (amount: string) => ({ amount, unit: 'political_capital' });
    const capital: PoliticalCapitalSnapshot = validatePoliticalCapitalSnapshot({
      capitalRef: 'CAPITAL_ADOPTED_' + id,
      countryRef: countryId,
      opening: q('70'),
      generated: q('0'),
      total: q('70'),
      available: q('70'),
      spent: q('0'),
      closing: q('70'),
      buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket) => ({
        bucket,
        balance: q('10'),
      })),
    });
    const original = (
      factRef: string,
      payload: unknown,
    ): CaptainOperatingOriginal => {
      const raw = canonicalSerialize(payload);
      return {
        recordId: factRef,
        revision: 'POSTWAR_CAPTAIN_OPENING_70_7X10_V1',
        factRef,
        sourceRef: 'CAPTAIN_POLICY_' + CAPTAIN_OPENING_POLICY_SHA256,
        predecessorFactRefs: [
          'OWNER_CAPTAIN_ADOPTION_' + CAPTAIN_OPENING_RECEIPT_SHA256,
        ],
        issuerRef: 'PROJECT_OWNER_ADOPTED_GENERATED_POLICY',
        custodianRef: 'CONTROLLED_CAPTAIN_SOURCE_PUBLICATION',
        admissionRef: 'CAPTAIN_POLICY_ADOPTION_' + id,
        admissionRevision: 'POSTWAR_CAPTAIN_OPENING_70_7X10_V1',
        sourceClass: 'ADMITTED_ORIGINAL',
        effectiveFromSimTime: '0',
        effectiveUntilSimTime: null,
        revokedByRevision: null,
        canonicalPayload: raw,
        payloadSHA256: sha(raw),
      };
    };
    const genesis = original('CAPTAIN_GENESIS_' + id, {
      schemaVersion: 'captain-operating-genesis-v1',
      worldId: input.worldId,
      countryId,
      seedId: input.seedId,
      seedFingerprint: input.seedFingerprint,
      semanticRevision: 'POSTWAR_CAPTAIN_OPENING_70_7X10_V1',
      capital,
    });
    return createCaptainSourcePublicationPacket({
      adoption: {
        adoptionRef: 'CAPTAIN_OPENING_' + id,
        worldId: input.worldId,
        countryId,
        seedId: input.seedId,
        seedFingerprint: input.seedFingerprint,
        worldAdmissionRef: input.worldAdmissionRef,
        issuerRef: genesis.issuerRef,
        custodianRef: genesis.custodianRef,
        admissionRef: genesis.admissionRef,
        admissionRevision: genesis.admissionRevision,
        originalAdmissionEvidenceSha256: evidence,
      },
      genesis,
      reasons: [
        original('CAPTAIN_OPENING_REASON_' + id, {
          schemaVersion: 'captain-operating-reason-v1',
          worldId: input.worldId,
          countryId,
          reason: {
            countryRef: countryId,
            recordRef: 'OWNER_ADOPTION_' + id,
            reason:
              '用户已采用新战后场景开局规则：每国70点、七桶各10点（含危机预留），开局新增与花费为0。本原件记录政策采纳依据，不是对任何具体未来再分配的批准；每次命令仍须真实Captain权限及完整来源验证。',
          },
        }),
      ],
    });
  });
  const intent = {
    schemaVersion: 'adopted-captain-opening-candidate-v1' as const,
    worldId: input.worldId,
    seedId: input.seedId,
    seedFingerprint: input.seedFingerprint,
    worldAdmissionRef: input.worldAdmissionRef,
    policySha256: CAPTAIN_OPENING_POLICY_SHA256,
    adoptionReceiptSha256: CAPTAIN_OPENING_RECEIPT_SHA256,
    documents: [
      {
        path: 'config/postwar-genesis/captain-opening.v1.json',
        sha256: CAPTAIN_OPENING_POLICY_SHA256,
        bytes: bytes.policyBytes,
      },
      {
        path: 'config/postwar-genesis/captain-opening-adoption.v1.json',
        sha256: CAPTAIN_OPENING_RECEIPT_SHA256,
        bytes: bytes.receiptBytes,
      },
    ],
    packets,
    effects: {
      financialPostings: '0' as const,
      inventoryPostings: '0' as const,
      politicalCapitalGenerationEvents: '0' as const,
    },
  };
  return frozen({
    ...intent,
    fingerprint: 'sha256:' + sha('SHA-256\n' + canonicalSerialize(intent)),
  });
}
const scopes = new WeakMap<
  object,
  { executor: SqlExecutor; active: boolean }
>();
/** Scope is issued only from the actual fresh H0 database plus genuine adopted
 * H0 roster. An own isolated H0 clone is a new TEST instance; no original
 * reference/running World is modified. Callback must remain in the outer tx. */
export async function withAdoptedCaptainNewScenarioFrom<T>(
  tx: SqlExecutor,
  input: {
    policy: AdoptedCaptainOpeningPolicy;
    worldId: string;
    social: PostwarSocialRuntimeConnection;
  },
  consume: (candidate: Readonly<AdoptedCaptainOpeningCandidate>) => Promise<T>,
): Promise<T> {
  const b = readPostwarSocialRuntimeFinancialReplayBase(
    input.social,
    input.worldId,
  );
  const h = await tx.query<Record<string, unknown>>(
    'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)',
    [input.worldId, b.pins.contentHash, b.pins.admissionRef],
  );
  if (
    h.rows.length !== 1 ||
    h.rows[0]?.seed_id !== b.pins.seedRef ||
    h.rows[0]?.seed_fingerprint !== b.pins.contentHash ||
    h.rows[0]?.admission_ref !== b.pins.admissionRef
  )
    invalid('ACTUAL_NEW_SCENARIO_SCOPE_REQUIRED');
  const candidate = createAdoptedCaptainOpeningCandidate(input.policy, {
      worldId: input.worldId,
      seedId: b.pins.seedRef,
      seedFingerprint: b.pins.contentHash,
      worldAdmissionRef: b.pins.admissionRef,
      countryIds: b.document.countries.map((c) => c.countryId),
    }),
    scope = { executor: tx, active: true };
  scopes.set(candidate, scope);
  try {
    return await consume(candidate);
  } finally {
    scope.active = false;
    scopes.delete(candidate);
  }
}
/** Explicit controlled release action only, inside the same newly checked H0
 * transaction. Generic registry/publisher enforce exact bytes and idempotence. */
export async function publishAdoptedCaptainNewScenarioFrom(
  tx: SqlExecutor,
  candidate: AdoptedCaptainOpeningCandidate,
) {
  const scope = scopes.get(candidate);
  if (!scope?.active || scope.executor !== tx)
    invalid('GENUINE_LIVE_NEW_SCENARIO_SCOPE_REQUIRED');
  const result = [];
  for (const p of candidate.packets) {
    const raw = canonicalSerialize(p);
    await tx.query(
      'select world_v2.register_captain_source_publication($1,$2)',
      [raw, sha(raw)],
    );
    result.push(await publishCaptainOperatingSourceFrom(tx, p));
  }
  return frozen({
    status: 'SOURCE_PUBLISHED_NOT_WORLD_EXECUTION' as const,
    worldId: candidate.worldId,
    seedFingerprint: candidate.seedFingerprint,
    fingerprint: candidate.fingerprint,
    publicationCount: result.length,
    publications: result,
  });
}

/** Read-only confirmation after a lost publication acknowledgement. Only a
 * complete exact70 set at the same pristine H0 can be confirmed; no write or
 * blind retry occurs. A pure review candidate grants no mutation capability. */
export async function readbackAdoptedCaptainNewScenarioFrom(
  tx: SqlExecutor,
  policy: AdoptedCaptainOpeningPolicy,
  candidate: AdoptedCaptainOpeningCandidate,
) {
  const expected = createAdoptedCaptainOpeningCandidate(policy, {
    worldId: candidate.worldId,
    seedId: candidate.seedId,
    seedFingerprint: candidate.seedFingerprint,
    worldAdmissionRef: candidate.worldAdmissionRef,
    countryIds: candidate.packets.map((p) => p.adoption.countryId),
  });
  if (canonicalSerialize(expected) !== canonicalSerialize(candidate))
    invalid('EXACT_ADOPTED_CANDIDATE_REQUIRED');
  const manifest = canonicalSerialize(
    candidate.packets.map((p) => ({
      countryId: p.adoption.countryId,
      adoptionRef: p.adoption.adoptionRef,
      packetSha256: sha(canonicalSerialize(p)),
    })),
  );
  const r = await tx.query<{ status: string; publication_count: number }>(
    'select * from world_v2.read_captain_opening_publication_readback($1,$2,$3,$4)',
    [
      candidate.worldId,
      candidate.seedFingerprint,
      candidate.worldAdmissionRef,
      manifest,
    ],
  );
  const row = r.rows[0];
  if (
    r.rows.length !== 1 ||
    !row ||
    !(
      (row.status === 'NOT_PUBLISHED' && row.publication_count === 0) ||
      (row.status === 'ALREADY_PUBLISHED' && row.publication_count === 70)
    )
  )
    invalid('EXACT_INITIALIZATION_READBACK_REQUIRED');
  return frozen({
    status: row.status as 'NOT_PUBLISHED' | 'ALREADY_PUBLISHED',
    publicationCount: row.publication_count,
    fingerprint: candidate.fingerprint,
    worldId: candidate.worldId,
    seedFingerprint: candidate.seedFingerprint,
  });
}
