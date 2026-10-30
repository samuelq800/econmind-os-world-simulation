/** Approved generated first-day bank quote policy. Quotes grant no funds,
 * currentness, OP mandate, SQL role, activation or production admission. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSerialize,
  type OpeningSeed,
  SIMULATION_TICKS_PER_DAY,
} from '@econmind/core';
import {
  createPostwarDayOneFxQuoteData,
  POSTWAR_DAY_ONE_FX_POLICY_VERSION,
  type PostwarDayOneFxQuoteData,
} from '@econmind/core/postwar-day-one-treasury-fx';
import { verifyPostwarGcuBankOpeningSeed } from './postwar-gcu-bank-opening.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from './postwar-financial-office-originals.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const POSTWAR_DAY_ONE_FX_POLICY_SHA256 =
  '339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893';
export const POSTWAR_DAY_ONE_FX_USER_RECEIPT_SHA256 =
  '0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec';
export interface PostwarDayOneFxPolicy {
  readonly schemaVersion: 'postwar-day-one-fx-policy-candidate-v1';
  readonly provenanceKind: 'GENERATED_POLICY';
  readonly status: 'PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly quotes: readonly PostwarDayOneFxQuoteData[];
  readonly policyBytes: string;
  readonly userReceiptBytes: string;
  readonly fingerprint: string;
}
/** Exact monetary units come from the retained original formal financial
 * contract. Planning trade-price/freight files never enter this producer. */
export function createPostwarDayOneFxPolicy(input: {
  readonly seed: OpeningSeed;
  readonly policyBytes: string;
  readonly userReceiptBytes: string;
}): PostwarDayOneFxPolicy {
  if (
    sha(input.policyBytes) !== POSTWAR_DAY_ONE_FX_POLICY_SHA256 ||
    sha(input.userReceiptBytes) !== POSTWAR_DAY_ONE_FX_USER_RECEIPT_SHA256
  )
    throw Error('POSTWAR_DAY_ONE_FX_APPROVED_INPUT_PIN_REQUIRED');
  const user = JSON.parse(input.userReceiptBytes) as {
    answer?: unknown;
    authority?: unknown;
  };
  if (
    user.answer !== '采用上述首日换汇规则' ||
    user.authority !== 'EXPLICIT_USER_ANSWER_IN_THIS_TASK'
  )
    throw Error('POSTWAR_DAY_ONE_FX_ACTUAL_USER_ADOPTION_REQUIRED');
  const family = verifyPostwarGcuBankOpeningSeed(input.seed),
    originals = readPostwarFinancialOfficeOriginalsFromSeed(family.seed);
  const financial = family.seed.sources.find(
    (s) => s.sourceId === originals.financialSourceId,
  )!;
  const assembly = (
    JSON.parse(financial.canonicalPayload) as {
      assembly: {
        countries: {
          countryId: string;
          roster: { government: string; centralBank: string; bank: string };
        }[];
      };
    }
  ).assembly;
  const quotes = originals.contract.countries.map((country) => {
    const bank = family.accounts.filter(
        (a) => a.countryId === country.countryId,
      ),
      roster = assembly.countries.filter(
        (a) => a.countryId === country.countryId,
      );
    if (
      bank.length !== 1 ||
      roster.length !== 1 ||
      bank[0]!.bankId !== roster[0]!.roster.bank
    )
      throw Error('POSTWAR_DAY_ONE_FX_ACTUAL_BANK_ORIGINAL_REQUIRED');
    const fxDoc = originals.contract.documents.filter(
      (d) => d.documentId === country.openingFx.source.documentId,
    );
    if (fxDoc.length !== 1 || sha(fxDoc[0]!.bytes) !== fxDoc[0]!.sha256)
      throw Error('POSTWAR_DAY_ONE_FX_ORIGINAL_RATE_SOURCE_REQUIRED');
    return createPostwarDayOneFxQuoteData(
      {
        schemaVersion: 'postwar-day-one-fx-quote-v1',
        policyVersion: POSTWAR_DAY_ONE_FX_POLICY_VERSION,
        worldId: family.seed.worldId,
        seedFingerprint: family.seed.fingerprint,
        countryId: country.countryId,
        localCurrency: country.localCurrency,
        localCurrencyPerGcu: country.openingFx.localCurrencyPerGcu,
        governmentEntityId: roster[0]!.roster.government,
        centralBankEntityId: roster[0]!.roster.centralBank,
        bankEntityId: bank[0]!.bankId,
        dealerGcuAccountId: bank[0]!.cashAccountId,
        financialSourceId: financial.sourceId,
        financialSourcePayloadHash: financial.payloadHash,
        gcuSourceId: family.source.sourceId,
        gcuSourcePayloadHash: family.source.payloadHash,
        baselineFxVersion: country.openingFx.version,
        baselineSourceSha256: fxDoc[0]!.sha256,
        policySha256: POSTWAR_DAY_ONE_FX_POLICY_SHA256,
        userReceiptSha256: POSTWAR_DAY_ONE_FX_USER_RECEIPT_SHA256,
        validFromSimTime: '0',
        validUntilSimTime: SIMULATION_TICKS_PER_DAY,
        spreadBps: '0',
        gcuQuantum: '0.000001',
      },
      sha,
    );
  });
  if (
    quotes.length !== 70 ||
    new Set(quotes.map((q) => q.countryId)).size !== 70
  )
    throw Error('POSTWAR_DAY_ONE_FX_COMPLETE_70_COUNTRY_ROSTER_REQUIRED');
  const body = {
    schemaVersion: 'postwar-day-one-fx-policy-candidate-v1' as const,
    provenanceKind: 'GENERATED_POLICY' as const,
    status: 'PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED' as const,
    worldId: family.seed.worldId,
    seedFingerprint: family.seed.fingerprint,
    quotes: Object.freeze(quotes),
    policyBytes: input.policyBytes,
    userReceiptBytes: input.userReceiptBytes,
  };
  return Object.freeze({
    ...body,
    fingerprint: 'sha256:' + sha(canonicalHashInput(body)),
  });
}
export function verifyPostwarDayOneFxPolicy(input: {
  readonly seed: OpeningSeed;
  readonly candidate: PostwarDayOneFxPolicy;
}): PostwarDayOneFxPolicy {
  const expected = createPostwarDayOneFxPolicy({
    seed: input.seed,
    policyBytes: input.candidate.policyBytes,
    userReceiptBytes: input.candidate.userReceiptBytes,
  });
  if (canonicalSerialize(expected) !== canonicalSerialize(input.candidate))
    throw Error('POSTWAR_DAY_ONE_FX_POLICY_REDERIVATION_MISMATCH');
  return expected;
}
