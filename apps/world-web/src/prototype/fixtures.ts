import {
  PREPARATION_ONLY_MARKER,
  type PrototypeWorldBriefProjection,
} from './contracts.js';

const metrics: PrototypeWorldBriefProjection['metrics'] = [
  {
    id: 'inflation',
    label: 'Inflation',
    canonicalValue: '0.064',
    displayValue: '6.4',
    unit: '%',
    changeLabel: '+0.8 pp',
    changeDirection: 'UP',
    status: 'STRESSED',
    accessibleSummary:
      'Inflation is 6.4 percent, up 0.8 percentage points in the current projection.',
  },
  {
    id: 'unemployment',
    label: 'Unemployment',
    canonicalValue: '0.071',
    displayValue: '7.1',
    unit: '%',
    changeLabel: '+0.3 pp',
    changeDirection: 'UP',
    status: 'WATCH',
    accessibleSummary:
      'Unemployment is 7.1 percent, up 0.3 percentage points in the current projection.',
  },
  {
    id: 'treasury-cash',
    label: 'Free treasury cash',
    canonicalValue: '1840000000',
    displayValue: '1.84',
    unit: 'bn GCU',
    changeLabel: '-0.22 bn',
    changeDirection: 'DOWN',
    status: 'WATCH',
    accessibleSummary:
      'Free treasury cash is 1.84 billion GCU, down 0.22 billion in the current projection.',
  },
  {
    id: 'available-grain',
    label: 'Available grain',
    canonicalValue: '128000',
    displayValue: '128',
    unit: 'k tonnes',
    changeLabel: '-18k',
    changeDirection: 'DOWN',
    status: 'STRESSED',
    accessibleSummary:
      'Available grain is 128 thousand tonnes, down 18 thousand tonnes in the current projection.',
  },
];

const events: PrototypeWorldBriefProjection['events'] = [
  {
    eventId: 'EVENT-PROTOTYPE-001',
    eventType: 'INVENTORY_RESERVED',
    title: 'Grain reserve moved out of available stock',
    summary:
      'A recorded reservation reduced the quantity available for new domestic or export commitments.',
    occurredAtLabel: 'Today · 14:20 simulation time',
    simTime: '51768000000',
    worldVersion: '1842',
    priority: 'HIGH',
    evidence: [
      {
        label: 'Recorded fact',
        detail: '18,000 tonnes moved from AVAILABLE to RESERVED.',
        kind: 'RECORDED_FACT',
      },
      {
        label: 'Derived attribution',
        detail:
          'The projection places food-security exposure ahead of lower-severity briefing items.',
        kind: 'DERIVED_ATTRIBUTION',
      },
      {
        label: 'Uncertain consequence',
        detail:
          'Price and household effects require later settlement evidence; no causal outcome is claimed.',
        kind: 'UNCERTAIN',
      },
    ],
    affectedMetricIds: ['available-grain', 'inflation'],
    ownerOfficeId: 'TRADE',
  },
  {
    eventId: 'EVENT-PROTOTYPE-002',
    eventType: 'TREASURY_COMMITMENT_RECORDED',
    title: 'Near-term payment commitment entered the treasury queue',
    summary:
      'Committed cash increased while the payment remains pending its scheduled settlement.',
    occurredAtLabel: 'Yesterday · 18:05 simulation time',
    simTime: '51696000000',
    worldVersion: '1841',
    priority: 'MEDIUM',
    evidence: [
      {
        label: 'Recorded fact',
        detail: 'A 220 million GCU obligation entered the payment schedule.',
        kind: 'RECORDED_FACT',
      },
      {
        label: 'Derived attribution',
        detail:
          'Free cash is shown after committed payments and the minimum buffer.',
        kind: 'DERIVED_ATTRIBUTION',
      },
    ],
    affectedMetricIds: ['treasury-cash'],
    ownerOfficeId: 'FINANCE',
  },
  {
    eventId: 'EVENT-PROTOTYPE-003',
    eventType: 'LABOUR_REPORT_PUBLISHED',
    title: 'Labour report shows a softer employment position',
    summary:
      'The latest authorized report records a higher unemployment share than the previous projection.',
    occurredAtLabel: '2 simulation days ago',
    simTime: '51552000000',
    worldVersion: '1838',
    priority: 'LOW',
    evidence: [
      {
        label: 'Recorded fact',
        detail: 'The authorized report records unemployment at 7.1 percent.',
        kind: 'RECORDED_FACT',
      },
      {
        label: 'Uncertain consequence',
        detail:
          'The prototype does not attribute this movement to a policy or shock.',
        kind: 'UNCERTAIN',
      },
    ],
    affectedMetricIds: ['unemployment'],
    ownerOfficeId: 'SOCIAL',
  },
];

export const READY_PROJECTION: PrototypeWorldBriefProjection = {
  marker: PREPARATION_ONLY_MARKER,
  schemaVersion: 'prototype-world-brief-v1',
  worldId: 'WORLD-PROTOTYPE-ONLY',
  worldLabel: 'Season 1 preparation surface',
  countryId: 'COUNTRY-NORTHSTAR',
  countryLabel: 'Northstar Republic',
  classification: 'OFFICE_PRIVATE',
  authorizationVersion: 'AUTH-PREVIEW-17',
  freshness: 'CURRENT',
  watermark: {
    worldVersion: '1842',
    eventSequence: '9021',
    simTime: '51768000000',
  },
  simulationDateLabel: '18 March 2032 · 14:20',
  seasonDayLabel: 'Season day 78',
  worldStatus: 'RUNNING',
  viewer: {
    actingOfficeId: 'TRADE',
    offices: [
      {
        officeId: 'TRADE',
        shortLabel: 'Trade',
        fullLabel: 'Minister of Trade & Foreign Affairs',
      },
      {
        officeId: 'FINANCE',
        shortLabel: 'Finance',
        fullLabel: 'Minister of Finance & Economy',
      },
    ],
  },
  metrics,
  events,
  routes: [
    {
      id: 'ROUTE-PROTOTYPE-TRADE',
      officeId: 'TRADE',
      label: 'Review the reservation in Trade',
      availability: 'AVAILABLE',
      reason: 'The mock projection assigns this event to the Trade Office.',
    },
    {
      id: 'ROUTE-PROTOTYPE-FINANCE',
      officeId: 'FINANCE',
      label: 'Inspect the treasury commitment',
      availability: 'APPROVAL_REQUIRED',
      reason:
        'A real implementation must receive approval state from the authorized query API.',
    },
  ],
  recentReceipt: {
    schemaVersion: 'command-receipt-v2',
    commandId: 'COMMAND-PROTOTYPE-001',
    outcome: 'COMMITTED',
    reasonCode: null,
    worldVersionBefore: '1840',
    worldVersionAfter: '1841',
    simTime: '51696000000',
    eventIds: ['EVENT-PROTOTYPE-002'],
    recordedAtLabel: 'Recorded yesterday · 18:05 simulation time',
  },
};

export const STALE_PROJECTION: PrototypeWorldBriefProjection = {
  ...READY_PROJECTION,
  freshness: 'LAGGING',
  watermark: {
    worldVersion: '1838',
    eventSequence: '9014',
    simTime: '51552000000',
  },
};

export const EMPTY_PROJECTION: PrototypeWorldBriefProjection = {
  ...READY_PROJECTION,
  metrics: [],
  events: [],
  routes: [],
  recentReceipt: null,
};
