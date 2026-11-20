/** Read-only selection from genuine Core read facts. This never claims that
 * a planning row grants authority or that water has already been delivered. */
import type { IndustryWaterPlanningBlockReason } from '@econmind/core/postwar-industry-utility-planning-contract';
export interface WaterPlanningScope {
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly sourceRef: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly serviceFacilityId: string;
  readonly serviceRunId: string;
}
export interface WaterPlanningWork {
  readonly workEventFingerprint: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly completedAtSimTime: string;
  readonly allocations: readonly {
    readonly count: string;
    readonly startsAtSimTime: string;
    readonly endsAtSimTime: string;
  }[];
}
export interface WaterPlanningPayment {
  readonly workEventFingerprint: string;
  readonly paymentEventFingerprint: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly paidAtSimTime: string;
  readonly worldVersionAfter: string;
}
export interface WaterPlanningPower {
  readonly eventFingerprint: string;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly purpose: string;
  readonly fromSimTime: string;
  readonly throughSimTime: string;
  readonly committedAtSimTime: string;
  readonly worldVersionAfter: string;
  readonly deliveredMWh: {
    readonly numerator: string;
    readonly denominator: string;
  };
  readonly usedMWh: {
    readonly numerator: string;
    readonly denominator: string;
  };
}
export function selectPostwarIndustryWaterPlanningInputs(
  input: Readonly<{
    scope: WaterPlanningScope;
    observedAtSimTime: string | null;
    headWorldVersion: string;
    registeredRights: readonly {
      readonly countryRef: string;
      readonly regionRef: string;
      readonly holderRef: string;
      readonly sourceRef: string;
      readonly validity: {
        readonly fromTicks: string;
        readonly untilTicks: string;
      } | null;
    }[];
    fromTicks: string | null;
    alreadyDelivered: boolean;
    works: readonly WaterPlanningWork[];
    payments: readonly WaterPlanningPayment[];
    paidWork: readonly string[];
    usedPaidEvents: readonly string[];
    power: readonly WaterPlanningPower[];
  }>,
):
  | Readonly<{
      status: 'BLOCKED';
      reasonCode: IndustryWaterPlanningBlockReason;
    }>
  | Readonly<{
      status: 'REFERENCES_AVAILABLE_NOT_AUTHORITY';
      fromTicks: string;
      workEventFingerprint: string;
      paymentEventFingerprint: string;
      powerEventFingerprints: readonly string[];
    }> {
  const blocked = (reasonCode: IndustryWaterPlanningBlockReason) =>
    Object.freeze({ status: 'BLOCKED' as const, reasonCode });
  if (input.observedAtSimTime === null)
    return blocked('REGISTERED_CLOCK_REQUIRED');
  const s = input.scope,
    now = BigInt(input.observedAtSimTime);
  if (input.alreadyDelivered) return blocked('WATER_ALREADY_DELIVERED');
  const rights = input.registeredRights.filter(
    (right) =>
      right.countryRef === s.countryId &&
      right.regionRef === s.locationId &&
      right.holderRef === s.operatorId &&
      right.sourceRef === s.sourceRef &&
      right.validity !== null,
  );
  if (rights.length !== 1 || input.fromTicks === null)
    return blocked('WATER_RIGHT_REQUIRED');
  const validity = rights[0]!.validity!;
  if (
    now >= BigInt(validity.untilTicks) ||
    now > BigInt(s.endsAtSimTime) ||
    now > 86400000n
  )
    return blocked('WATER_RUN_EXPIRED');
  const from = BigInt(input.fromTicks);
  if (
    now <= from ||
    now < BigInt(validity.fromTicks) ||
    from < BigInt(s.startsAtSimTime)
  )
    return blocked('WATER_INTERVAL_NOT_ELAPSED');
  const works = input.works.filter(
    (work) =>
      work.countryId === s.countryId &&
      work.locationId === s.locationId &&
      work.facilityId === s.serviceFacilityId &&
      work.operatorId === s.operatorId &&
      work.runId === s.serviceRunId &&
      BigInt(work.completedAtSimTime) <= now &&
      !input.usedPaidEvents.includes(work.workEventFingerprint),
  );
  if (!works.length) return blocked('WATER_SERVICE_WORK_REQUIRED');
  const covered = works.filter((work) => {
    const points = [
      from,
      ...work.allocations
        .flatMap((a) => [BigInt(a.startsAtSimTime), BigInt(a.endsAtSimTime)])
        .filter((t) => t > from && t < now),
    ];
    return points.every((t) =>
      work.allocations.some(
        (a) =>
          BigInt(a.count) > 0n &&
          BigInt(a.startsAtSimTime) <= t &&
          BigInt(a.endsAtSimTime) > t,
      ),
    );
  });
  if (!covered.length) return blocked('WATER_SERVICE_COVERAGE_REQUIRED');
  const paid = covered
    .flatMap((work) =>
      input.payments
        .filter(
          (payment) =>
            payment.workEventFingerprint === work.workEventFingerprint &&
            input.paidWork.includes(work.workEventFingerprint) &&
            !input.usedPaidEvents.includes(payment.paymentEventFingerprint) &&
            payment.countryId === s.countryId &&
            payment.facilityId === s.serviceFacilityId &&
            payment.operatorId === s.operatorId &&
            payment.runId === s.serviceRunId &&
            BigInt(payment.paidAtSimTime) <= now &&
            BigInt(payment.worldVersionAfter) <= BigInt(input.headWorldVersion),
        )
        .map((payment) => ({ work, payment })),
    )
    .sort((a, b) =>
      a.payment.paymentEventFingerprint.localeCompare(
        b.payment.paymentEventFingerprint,
      ),
    );
  if (!paid.length) return blocked('WATER_SERVICE_PAYMENT_REQUIRED');
  const powers = input.power
    .filter(
      (power) =>
        power.worldId === s.worldId &&
        power.seedFingerprint === s.seedFingerprint &&
        power.admissionRef === s.admissionRef &&
        power.countryId === s.countryId &&
        power.facilityId === s.facilityId &&
        power.operatorId === s.operatorId &&
        power.runId === s.runId &&
        power.purpose === 'PROCESS_WATER_PUMPING_SELF_USE' &&
        BigInt(power.fromSimTime) <= from &&
        BigInt(power.throughSimTime) >= now &&
        BigInt(power.committedAtSimTime) <= now &&
        BigInt(power.worldVersionAfter) <= BigInt(input.headWorldVersion) &&
        BigInt(power.deliveredMWh.numerator) *
          BigInt(power.usedMWh.denominator) >
          BigInt(power.usedMWh.numerator) *
            BigInt(power.deliveredMWh.denominator),
    )
    .sort((a, b) => a.eventFingerprint.localeCompare(b.eventFingerprint))
    .slice(0, 64);
  if (!powers.length) return blocked('POWER_DELIVERY_REQUIRED');
  return Object.freeze({
    status: 'REFERENCES_AVAILABLE_NOT_AUTHORITY' as const,
    fromTicks: input.fromTicks,
    workEventFingerprint: paid[0]!.work.workEventFingerprint,
    paymentEventFingerprint: paid[0]!.payment.paymentEventFingerprint,
    powerEventFingerprints: Object.freeze(
      powers.map((p) => p.eventFingerprint),
    ),
  });
}
