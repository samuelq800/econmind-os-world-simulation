import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DAY_ONE_STORAGE_SELF_USE_POLICY,
  bookDayOneStorageSelfUse,
  createDayOneStorageSelfUseLedger,
  readDayOneStorageSelfUseLedger,
  settleDayOneStorageSelfUse,
  type DayOneStorageOpening,
  type DayOneStorageRequest,
  type DayOneStorageSelfUseLedger,
} from '../../packages/core/src/engine-kernels/postwar-day-one-storage-self-use.js';
import { transitionEnergyStorage } from '../../packages/core/src/engine-kernels/resources-energy-production.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const opening = (
  extra: Partial<DayOneStorageOpening> = {},
): DayOneStorageOpening => ({
  scenarioRef: 'TEST_ONLY_NEW_DAY_ONE_SCENARIO',
  worldId: 'WORLD_TEST_ONLY_STORAGE',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
  countryId: 'COUNTRY_02',
  operatorId: 'OP_02',
  storageOwnerId: 'OP_02',
  gridOwnerId: 'OP_02',
  storageId: 'STORAGE_02',
  gridId: 'GRID_02',
  sourceRef: 'TEST_ONLY_ACTUAL_SOURCE_BOUNDARY_NOT_CUSTODY',
  sourceRawSha256: 'b'.repeat(64),
  originalEnergyCapacityMWh: '100',
  originalOpeningSocMWh: '90',
  originalStorageDischargeMW: '30',
  originalGridMW: '20',
  originalLossFraction: '0.1',
  originalEfficiency: '0.9',
  protectedReservations: [],
  ...extra,
});
const request = (
  extra: Partial<DayOneStorageRequest> = {},
): DayOneStorageRequest => ({
  bookingRef: 'BOOKING_A',
  runRef: 'RUN_A',
  worldId: 'WORLD_TEST_ONLY_STORAGE',
  countryId: 'COUNTRY_02',
  operatorId: 'OP_02',
  storageId: 'STORAGE_02',
  gridId: 'GRID_02',
  purpose: 'INDUSTRY_SELF_USE',
  fromSimTime: '0',
  throughSimTime: '3600000',
  outputMWh: '18',
  ...extra,
});
function book(
  ledger: DayOneStorageSelfUseLedger,
  r = request(),
  operationRef = 'BOOK_A',
  at = '0',
) {
  return bookDayOneStorageSelfUse({
    ledger,
    operationRef,
    observedSimTime: at,
    request: r,
  });
}
const rational = (numerator: string, denominator = '1') => ({
  numerator,
  denominator,
});
describe('adopted finite first-day same-OP storage simulation DATA', () => {
  it('retains exact user adoption bytes and discloses original unknown semantics, not delivery or engineering calibration', async () => {
    const raw = await readFile(
      new URL(
        '../../config/postwar-genesis/day-one-storage-self-use-adoption.v1.json',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sha(raw)).toBe(DAY_ONE_STORAGE_SELF_USE_POLICY.adoptionRawSha256);
    const policyRaw = await readFile(
      new URL(
        '../../config/postwar-genesis/day-one-storage-self-use.v1.json',
        import.meta.url,
      ),
      'utf8',
    );
    const adoption = JSON.parse(raw),
      policy = JSON.parse(policyRaw);
    expect(sha(policyRaw)).toBe(
      DAY_ONE_STORAGE_SELF_USE_POLICY.policyRawSha256,
    );
    expect(adoption.answer).toBe('采用上述有限模拟方案');
    expect(adoption.source.transportSignatureClaimed).toBe(false);
    expect(adoption.scope.rewriteExistingWorld).toBe(false);
    expect(policy.oneWayDischargeEfficiency).toBe('0.9');
    expect(policy.adoption.rawSha256).toBe(sha(raw));
    expect(policy.sourceEfficiencyMeaning).toBe('UNKNOWN_IN_ORIGINAL');
    expect(policy.charging).toBe('FORBIDDEN');
  });

  it('books without delivering, then conserves SOC, conversion loss, route loss and delivered energy after the actual interval', () => {
    const source = opening(),
      rawBefore = JSON.stringify(source);
    const h0 = createDayOneStorageSelfUseLedger(source, sha),
      booked = book(h0);
    expect(booked.outcome).toBe('BOOKED_NOT_DELIVERED');
    expect(
      readDayOneStorageSelfUseLedger(booked.ledger).settlements,
    ).toHaveLength(0);
    expect(
      readDayOneStorageSelfUseLedger(booked.ledger).remainingSocMWh,
    ).toEqual(rational('90'));
    expect(() =>
      settleDayOneStorageSelfUse({
        ledger: booked.ledger,
        operationRef: 'SETTLE_A',
        bookingRef: 'BOOKING_A',
        observedSimTime: '3599999',
      }),
    ).toThrow('ACTUAL_INTERVAL_NOT_ELAPSED');
    const paid = settleDayOneStorageSelfUse({
      ledger: booked.ledger,
      operationRef: 'SETTLE_A',
      bookingRef: 'BOOKING_A',
      observedSimTime: '3600000',
    });
    expect(paid.settlement).toMatchObject({
      storedEnergyWithdrawalMWh: rational('20'),
      outputMWh: rational('18'),
      deliveredMWh: rational('81', '5'),
      storageConversionLossMWh: rational('2'),
      routeLossMWh: rational('9', '5'),
    });
    expect(readDayOneStorageSelfUseLedger(paid.ledger).remainingSocMWh).toEqual(
      rational('70'),
    );
    expect(JSON.stringify(source)).toBe(rawBefore);
    // Same existing kernel's exact terminating case; the new ledger additionally
    // protects all run bookings, time, route losses and recurrent rationals.
    const old = transitionEnergyStorage({
      stateOfCharge: { amount: '90', unit: 'MWh' },
      energyCapacity: { amount: '100', unit: 'MWh' },
      requestedChargeFromGrid: { amount: '0', unit: 'MWh' },
      requestedDischargeToGrid: { amount: '18', unit: 'MWh' },
      chargeEfficiency: { amount: '1', unit: 'ratio' },
      dischargeEfficiency: { amount: '0.9', unit: 'ratio' },
    });
    expect(old.nextStateOfCharge).toEqual({ amount: '70', unit: 'MWh' });
  });

  it('retains recurring stored-energy fractions exactly and is deterministic across equivalent initializations', () => {
    const run = () => {
      const x = book(
        createDayOneStorageSelfUseLedger(opening(), sha),
        request({ outputMWh: '1' }),
      );
      return settleDayOneStorageSelfUse({
        ledger: x.ledger,
        operationRef: 'SETTLE_A',
        bookingRef: 'BOOKING_A',
        observedSimTime: '3600000',
      });
    };
    const a = run(),
      b = run();
    expect(a.settlement.storedEnergyWithdrawalMWh).toEqual(rational('10', '9'));
    expect(a.settlement.storageConversionLossMWh).toEqual(rational('1', '9'));
    expect(readDayOneStorageSelfUseLedger(a.ledger).remainingSocMWh).toEqual(
      rational('800', '9'),
    );
    expect(readDayOneStorageSelfUseLedger(a.ledger)).toEqual(
      readDayOneStorageSelfUseLedger(b.ledger),
    );
  });

  it('can book an exact pumping-energy demand through route loss without inventing a rounding quantum', () => {
    const h0 = createDayOneStorageSelfUseLedger(opening(), sha);
    expect(() =>
      book(h0, request({ outputMWh: rational('20', '18') })),
    ).toThrow('REDUCED_ENERGY_FRACTION_REQUIRED');
    const b = book(
      h0,
      request({
        purpose: 'PROCESS_WATER_PUMPING_SELF_USE',
        outputMWh: rational('10', '9'),
      }),
    );
    const x = settleDayOneStorageSelfUse({
      ledger: b.ledger,
      operationRef: 'SETTLE_A',
      bookingRef: 'BOOKING_A',
      observedSimTime: '3600000',
    });
    expect(x.settlement.deliveredMWh).toEqual(rational('1'));
    expect(x.settlement.storedEnergyWithdrawalMWh).toEqual(
      rational('100', '81'),
    );
    expect(x.settlement.routeLossMWh).toEqual(rational('1', '9'));
  });

  it('keeps existing/public reservation energy and overlapping power intact and fails without consuming the old ledger', () => {
    const h0 = createDayOneStorageSelfUseLedger(
      opening({
        protectedReservations: [
          {
            reservationRef: 'PUBLIC_OLD',
            kind: 'PUBLIC_PRIORITY',
            fromSimTime: '0',
            throughSimTime: '3600000',
            storedEnergyMWh: '10',
            outputMWh: '5',
            sourceRef: 'ACTUAL_OLD_PUBLIC_RESERVATION',
            sourceRawSha256: 'c'.repeat(64),
          },
        ],
      }),
      sha,
    );
    expect(() => book(h0, request({ outputMWh: '16' }))).toThrow(
      'SHARED_STORAGE_OR_GRID_POWER_ALREADY_BOOKED',
    );
    const b = book(h0, request({ outputMWh: '15' }));
    expect(
      readDayOneStorageSelfUseLedger(b.ledger).protectedStoredEnergyMWh,
    ).toEqual(rational('10'));
    const pending = readDayOneStorageSelfUseLedger(
      b.ledger,
    ).pendingStoredEnergyMWh;
    expect(pending).toEqual(rational('50', '3'));
    const limited = createDayOneStorageSelfUseLedger(
      opening({
        originalOpeningSocMWh: '10',
        protectedReservations: [
          {
            reservationRef: 'EXISTING_FULL',
            kind: 'EXISTING_RESERVATION',
            fromSimTime: '0',
            throughSimTime: '3600000',
            storedEnergyMWh: '10',
            outputMWh: '1',
            sourceRef: 'OLD_SOURCE',
            sourceRawSha256: 'c'.repeat(64),
          },
        ],
      }),
      sha,
    );
    expect(() => book(limited, request({ outputMWh: '0.1' }))).toThrow(
      'SOC_PROTECTED_OR_ALREADY_BOOKED',
    );
  });

  it('shares one SOC and storage/grid power budget across overlapping industrial runs and process-water pumping', () => {
    const a = book(
      createDayOneStorageSelfUseLedger(opening(), sha),
      request({ outputMWh: '12' }),
    );
    expect(() =>
      book(
        a.ledger,
        request({
          bookingRef: 'BOOKING_B',
          runRef: 'RUN_B',
          outputMWh: '9',
          purpose: 'PROCESS_WATER_PUMPING_SELF_USE',
        }),
        'BOOK_B',
      ),
    ).toThrow('SHARED_STORAGE_OR_GRID_POWER_ALREADY_BOOKED');
    const b = book(
      a.ledger,
      request({
        bookingRef: 'BOOKING_B',
        runRef: 'RUN_B',
        outputMWh: '8',
        purpose: 'PROCESS_WATER_PUMPING_SELF_USE',
      }),
      'BOOK_B',
    );
    const x = settleDayOneStorageSelfUse({
      ledger: b.ledger,
      operationRef: 'SETTLE_A',
      bookingRef: 'BOOKING_A',
      observedSimTime: '3600000',
    });
    const y = settleDayOneStorageSelfUse({
      ledger: x.ledger,
      operationRef: 'SETTLE_B',
      bookingRef: 'BOOKING_B',
      observedSimTime: '3600000',
    });
    expect(readDayOneStorageSelfUseLedger(y.ledger).remainingSocMWh).toEqual(
      rational('610', '9'),
    );
    const lowSOC = book(
      createDayOneStorageSelfUseLedger(
        opening({ originalOpeningSocMWh: '20' }),
        sha,
      ),
      request(),
    );
    expect(() =>
      book(
        lowSOC.ledger,
        request({
          bookingRef: 'BOOKING_B',
          runRef: 'RUN_B',
          fromSimTime: '3600000',
          throughSimTime: '7200000',
          outputMWh: '0.1',
        }),
        'BOOK_B',
      ),
    ).toThrow('SOC_PROTECTED_OR_ALREADY_BOOKED');
  });

  it('handles exact duplicate recovery, refuses conflicting repeats, stale handles and the same run-purpose booked twice', () => {
    const h0 = createDayOneStorageSelfUseLedger(opening(), sha),
      a = book(h0);
    expect(() => readDayOneStorageSelfUseLedger(h0)).toThrow(
      'GENUINE_LIVE_PURE_LEDGER_REQUIRED',
    );
    const duplicate = book(a.ledger);
    expect(duplicate.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.ledger).toBe(a.ledger);
    expect(() => book(a.ledger, request({ outputMWh: '17' }))).toThrow(
      'IDEMPOTENCY_KEY_CONFLICT',
    );
    expect(() =>
      book(a.ledger, request({ bookingRef: 'BOOKING_B' }), 'BOOK_B'),
    ).toThrow('RUN_PURPOSE_ALREADY_BOOKED');
    const x = settleDayOneStorageSelfUse({
      ledger: a.ledger,
      operationRef: 'SETTLE_A',
      bookingRef: 'BOOKING_A',
      observedSimTime: '3600000',
    });
    const again = settleDayOneStorageSelfUse({
      ledger: x.ledger,
      operationRef: 'SETTLE_A',
      bookingRef: 'BOOKING_A',
      observedSimTime: '3600000',
    });
    expect(again.outcome).toBe('EXACT_DUPLICATE');
    expect(
      readDayOneStorageSelfUseLedger(again.ledger).settlements,
    ).toHaveLength(1);
    expect(() =>
      settleDayOneStorageSelfUse({
        ledger: x.ledger,
        operationRef: 'SETTLE_B',
        bookingRef: 'BOOKING_A',
        observedSimTime: '3600000',
      }),
    ).toThrow('EXACT_PENDING_BOOKING_REQUIRED');
    expect(() =>
      readDayOneStorageSelfUseLedger({} as DayOneStorageSelfUseLedger),
    ).toThrow('GENUINE_LIVE_PURE_LEDGER_REQUIRED');
  });

  it('uses half-open real intervals rather than a per-run reset or whole-day power sum', () => {
    const a = book(
      createDayOneStorageSelfUseLedger(opening(), sha),
      request({ outputMWh: '12' }),
    );
    expect(() =>
      book(
        a.ledger,
        request({
          bookingRef: 'BOOKING_B',
          runRef: 'RUN_B',
          fromSimTime: '1800000',
          throughSimTime: '5400000',
          outputMWh: '9',
        }),
        'BOOK_B',
      ),
    ).toThrow('SHARED_STORAGE_OR_GRID_POWER_ALREADY_BOOKED');
    const b = book(
      a.ledger,
      request({
        bookingRef: 'BOOKING_B',
        runRef: 'RUN_B',
        fromSimTime: '3600000',
        throughSimTime: '7200000',
        outputMWh: '20',
      }),
      'BOOK_B',
    );
    expect(readDayOneStorageSelfUseLedger(b.ledger).bookings).toHaveLength(2);
    const lowPower = createDayOneStorageSelfUseLedger(
      opening({ originalStorageDischargeMW: '10' }),
      sha,
    );
    expect(() => book(lowPower)).toThrow(
      'SHARED_STORAGE_OR_GRID_POWER_ALREADY_BOOKED',
    );
  });

  it('rejects backdating, future delivery, day-two use, wrong owner/country and charging/sales purposes without new defaults', () => {
    const h0 = createDayOneStorageSelfUseLedger(opening(), sha);
    expect(() => book(h0, request({ countryId: 'COUNTRY_01' }))).toThrow(
      'EXACT_SAME_OP_LOCAL_SOURCE_SCOPE_REQUIRED',
    );
    expect(() => book(h0, request({ operatorId: 'GOV_02' }))).toThrow(
      'EXACT_SAME_OP_LOCAL_SOURCE_SCOPE_REQUIRED',
    );
    expect(() =>
      book(
        h0,
        request({ purpose: 'CHARGE' as DayOneStorageRequest['purpose'] }),
      ),
    ).toThrow('EXPLICIT_SELF_USE_FUTURE_BOOKING_REQUIRED');
    const chargingPayload = { ...request(), chargeMWh: '1' };
    expect(() => book(h0, chargingPayload)).toThrow(
      'EXACT_CLOSED_SCHEMA_REQUIRED',
    );
    expect(() => book(h0, request({ throughSimTime: '86400001' }))).toThrow(
      'ACTUAL_FIRST_DAY_INTERVAL_REQUIRED',
    );
    const a = book(h0),
      settled = settleDayOneStorageSelfUse({
        ledger: a.ledger,
        operationRef: 'SETTLE_A',
        bookingRef: 'BOOKING_A',
        observedSimTime: '3600000',
      });
    expect(() =>
      book(
        settled.ledger,
        request({ runRef: 'RUN_B', bookingRef: 'BOOKING_B' }),
        'BOOK_B',
        '0',
      ),
    ).toThrow('MONOTONIC_FIRST_DAY_OBSERVATION_REQUIRED');
    expect(() =>
      book(
        settled.ledger,
        request({
          runRef: 'RUN_B',
          bookingRef: 'BOOKING_B',
          fromSimTime: '0',
          throughSimTime: '7200000',
        }),
        'BOOK_B',
        '3600000',
      ),
    ).toThrow('EXPLICIT_SELF_USE_FUTURE_BOOKING_REQUIRED');
    expect(() =>
      createDayOneStorageSelfUseLedger(opening({ gridOwnerId: 'GOV_02' }), sha),
    ).toThrow('SAME_OP_TITLE_REQUIRED');
    expect(() =>
      createDayOneStorageSelfUseLedger(
        opening({ originalOpeningSocMWh: '101' }),
        sha,
      ),
    ).toThrow('FINITE_SOURCE_ENERGY_OR_ROUTE_REQUIRED');
  });
});
