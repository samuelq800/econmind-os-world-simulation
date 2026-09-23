export const PREPARATION_ONLY_MARKER = 'PREPARATION_ONLY_NOT_RUNTIME' as const;

export type PrototypeProjectionClassification =
  'PUBLIC' | 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY' | 'ADMIN';

export type PrototypeMetricStatus =
  'NORMAL' | 'WATCH' | 'STRESSED' | 'CRITICAL';

export interface PrototypeProjectionWatermark {
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly simTime: string;
}

export interface PrototypeOfficeOption {
  readonly officeId: string;
  readonly shortLabel: string;
  readonly fullLabel: string;
}

export interface PrototypeBriefMetric {
  readonly id: string;
  readonly label: string;
  readonly canonicalValue: string;
  readonly displayValue: string;
  readonly unit: string;
  readonly changeLabel: string | null;
  readonly changeDirection: 'UP' | 'DOWN' | 'FLAT';
  readonly status: PrototypeMetricStatus;
  readonly accessibleSummary: string;
}

export interface PrototypeEventEvidence {
  readonly label: string;
  readonly detail: string;
  readonly kind: 'RECORDED_FACT' | 'DERIVED_ATTRIBUTION' | 'UNCERTAIN';
}

export interface PrototypeBriefEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly title: string;
  readonly summary: string;
  readonly occurredAtLabel: string;
  readonly simTime: string;
  readonly worldVersion: string;
  readonly priority: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly evidence: readonly PrototypeEventEvidence[];
  readonly affectedMetricIds: readonly string[];
  readonly ownerOfficeId: string;
}

export interface PrototypeResolvedRoute {
  readonly id: string;
  readonly officeId: string;
  readonly label: string;
  readonly availability: 'AVAILABLE' | 'APPROVAL_REQUIRED' | 'BLOCKED';
  readonly reason: string;
}

export interface PrototypeFinalReceipt {
  readonly schemaVersion: 'command-receipt-v2';
  readonly commandId: string;
  readonly outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  readonly reasonCode: string | null;
  readonly worldVersionBefore: string | null;
  readonly worldVersionAfter: string | null;
  readonly simTime: string;
  readonly eventIds: readonly string[];
  readonly recordedAtLabel: string;
}

export interface PrototypeWorldBriefProjection {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly schemaVersion: 'prototype-world-brief-v1';
  readonly worldId: string;
  readonly worldLabel: string;
  readonly countryId: string;
  readonly countryLabel: string;
  readonly classification: PrototypeProjectionClassification;
  readonly authorizationVersion: string | null;
  readonly freshness: 'CURRENT' | 'LAGGING';
  readonly watermark: PrototypeProjectionWatermark;
  readonly simulationDateLabel: string;
  readonly seasonDayLabel: string;
  readonly worldStatus: 'PREOPEN' | 'RUNNING' | 'PAUSED' | 'ENDED';
  readonly viewer: {
    readonly actingOfficeId: string;
    readonly offices: readonly PrototypeOfficeOption[];
  };
  readonly metrics: readonly PrototypeBriefMetric[];
  readonly events: readonly PrototypeBriefEvent[];
  readonly routes: readonly PrototypeResolvedRoute[];
  readonly recentReceipt: PrototypeFinalReceipt | null;
}
