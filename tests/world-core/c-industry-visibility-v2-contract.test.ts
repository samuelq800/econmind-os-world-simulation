import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ECONOMIC_READ_VISIBILITY_SCHEMA,
  ECONOMIC_READ_VISIBILITY_V2_SCHEMA,
} from '@econmind/core/economic-read-visibility-contract';
import type {
  EconomicReadVisibilitySummary as RootV1,
  EconomicReadVisibilitySummaryV2 as RootV2,
  IndustryProductionResultCauseBinding as RootCause,
  IndustryProductionResultDisclosure as RootDisclosure,
} from '@econmind/core';
import type {
  EconomicReadVisibilitySummary,
  EconomicReadVisibilitySummaryV2,
  IndustryProductionResultCauseBinding,
  IndustryProductionResultDisclosure,
} from '../../packages/core/src/authorization/economic-read-visibility-contract.js';
import type {
  DecisionResultCause,
  DecisionResultHead,
} from '../../packages/core/src/authorization/office-decision-result-contract.js';

type Authorized = Extract<
  IndustryProductionResultDisclosure,
  { status: 'AUTHORIZED_RESULT_ONLY' }
>;
type Denied = Extract<
  IndustryProductionResultDisclosure,
  { status: 'NOT_AUTHORIZED' }
>;
type Extends<From, To> = From extends To ? true : false;

// Declaration compatibility only. No source, classifier, publisher, API or
// browser is called; no fabricated authorized instance is production evidence.
// The companion strict tsc check is required: Vitest alone does not check types.
describe('C private Industry visibility-v2 declaration contract', () => {
  it('preserves the published v1 schema literal', () => {
    expect(ECONOMIC_READ_VISIBILITY_SCHEMA).toBe('economic-read-visibility-v1');
    expectTypeOf<
      typeof ECONOMIC_READ_VISIBILITY_SCHEMA
    >().toEqualTypeOf<'economic-read-visibility-v1'>();
  });

  it('publishes a distinct v2 literal through the existing narrow export', () => {
    expect(ECONOMIC_READ_VISIBILITY_V2_SCHEMA).toBe(
      'economic-read-visibility-v2',
    );
    expect(String(ECONOMIC_READ_VISIBILITY_V2_SCHEMA)).not.toBe(
      ECONOMIC_READ_VISIBILITY_SCHEMA,
    );
    expectTypeOf<
      typeof ECONOMIC_READ_VISIBILITY_V2_SCHEMA
    >().toEqualTypeOf<'economic-read-visibility-v2'>();
  });

  it('retains exactly four declared v1 keys and its denied stock literals', () => {
    expectTypeOf<keyof EconomicReadVisibilitySummary>().toEqualTypeOf<
      'schemaVersion' | 'financialDetail' | 'inventoryDetail' | 'countrySummary'
    >();
    expectTypeOf<
      EconomicReadVisibilitySummary['inventoryDetail']
    >().toEqualTypeOf<'NOT_AUTHORIZED'>();
    expectTypeOf<
      EconomicReadVisibilitySummary['countrySummary']
    >().toEqualTypeOf<'NOT_AUTHORIZED'>();
  });

  it('declares only the separate fifth result field in v2', () => {
    expectTypeOf<keyof EconomicReadVisibilitySummaryV2>().toEqualTypeOf<
      | 'schemaVersion'
      | 'financialDetail'
      | 'inventoryDetail'
      | 'countrySummary'
      | 'industryProductionResult'
    >();
    expectTypeOf<
      EconomicReadVisibilitySummaryV2['schemaVersion']
    >().toEqualTypeOf<'economic-read-visibility-v2'>();
    expectTypeOf<
      EconomicReadVisibilitySummaryV2['financialDetail']
    >().toEqualTypeOf<EconomicReadVisibilitySummary['financialDetail']>();
  });

  it('cannot declare a broad stock or country-summary grant in v2', () => {
    expectTypeOf<
      EconomicReadVisibilitySummaryV2['inventoryDetail']
    >().toEqualTypeOf<'NOT_AUTHORIZED'>();
    expectTypeOf<
      EconomicReadVisibilitySummaryV2['countrySummary']
    >().toEqualTypeOf<'NOT_AUTHORIZED'>();
    expectTypeOf<
      Extends<'AUTHORIZED', EconomicReadVisibilitySummaryV2['inventoryDetail']>
    >().toEqualTypeOf<false>();
  });

  it('declares the denied result variant as status only', () => {
    expectTypeOf<Denied>().toEqualTypeOf<
      Readonly<{ status: 'NOT_AUTHORIZED' }>
    >();
    expectTypeOf<keyof Denied>().toEqualTypeOf<'status'>();
  });

  it('declares the authorized result with exact purpose and four keys', () => {
    expectTypeOf<keyof Authorized>().toEqualTypeOf<
      'status' | 'purpose' | 'sourceHead' | 'causeBinding'
    >();
    expectTypeOf<
      Authorized['purpose']
    >().toEqualTypeOf<'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY'>();
    expectTypeOf<Authorized>().toEqualTypeOf<
      Readonly<{
        status: 'AUTHORIZED_RESULT_ONLY';
        purpose: 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY';
        sourceHead: Readonly<DecisionResultHead>;
        causeBinding: IndustryProductionResultCauseBinding;
      }>
    >();
  });

  it('reuses the exact three head and four cause identity fields only', () => {
    expectTypeOf<keyof Authorized['sourceHead']>().toEqualTypeOf<
      'worldId' | 'worldVersion' | 'eventSequence'
    >();
    expectTypeOf<keyof IndustryProductionResultCauseBinding>().toEqualTypeOf<
      'commandId' | 'commandFingerprint' | 'eventId' | 'eventFingerprint'
    >();
    expectTypeOf<IndustryProductionResultCauseBinding>().toEqualTypeOf<
      Readonly<
        Pick<
          DecisionResultCause,
          'commandId' | 'commandFingerprint' | 'eventId' | 'eventFingerprint'
        >
      >
    >();
  });

  it('does not structurally reinterpret v1 as v2 or v2 as v1', () => {
    expectTypeOf<
      Extends<EconomicReadVisibilitySummary, EconomicReadVisibilitySummaryV2>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Extends<EconomicReadVisibilitySummaryV2, EconomicReadVisibilitySummary>
    >().toEqualTypeOf<false>();
  });

  it('exports the identical declarations through the existing Core index', () => {
    expectTypeOf<RootV1>().toEqualTypeOf<EconomicReadVisibilitySummary>();
    expectTypeOf<RootV2>().toEqualTypeOf<EconomicReadVisibilitySummaryV2>();
    expectTypeOf<RootCause>().toEqualTypeOf<IndustryProductionResultCauseBinding>();
    expectTypeOf<RootDisclosure>().toEqualTypeOf<IndustryProductionResultDisclosure>();
  });
});
