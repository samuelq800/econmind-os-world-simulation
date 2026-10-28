/** Pure replay of every country's actual protected prefix. This is derived
 * data, never source admission/currentness or an authorization issuer. */
import {
  SOCIAL_POSITION_OFFER_CREATED_EVENT,
  canonicalSerialize,
  type SocialPositionOfferLifecycleState,
  type SocialEmploymentServiceState,
  type AuthoritativeEvent,
} from '@econmind/core';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import type { ValidatedCanonicalLineageData } from './validated-canonical-lineage.js';
import { replayPostwarSharedOfficePrefix } from './postwar-shared-office-prefix.js';
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_LINEAGE:${reason}`);
}
export interface SocialOfferCommittedOrigin {
  readonly positionId: string;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly pointer: '/offer';
  readonly fromSimTime: string;
  readonly fromHead: Readonly<{ worldVersion: string; eventSequence: string }>;
}
export interface SocialEmploymentLifecycleCheckpoint {
  readonly eventId: string;
  readonly countryId: string;
  readonly beforeEmployment: SocialEmploymentServiceState;
  readonly afterEmployment: SocialEmploymentServiceState;
}
export function replayPostwarSocialEmploymentLineage(input: {
  readonly document: PostwarSocialEmploymentStateDocument;
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
}) {
  const shared = replayPostwarSharedOfficePrefix(input);
  return Object.freeze({
    classification: 'FULL_PREFIX_REPLAY_DATA_NOT_AUTHORITY' as const,
    countries: shared.social.countries,
    checkpoints: shared.social.checkpoints,
    budgetEncumbrances: shared.budget.encumbrances,
    sharedPrefixFingerprint: shared.prefixFingerprint,
  });
}
/** Only the actual lineage Event can supply this offer original. Full lifecycle
 * replay is performed independently above; this check never accepts a DTO flag. */
export function assertSocialPositionOfferEventOriginal(input: {
  readonly lineage: Readonly<ValidatedCanonicalLineageData>;
  readonly eventId: string;
  readonly payloadHash: string;
  readonly pointer: string;
  readonly value: unknown;
  readonly countryId: string;
}): Readonly<AuthoritativeEvent> {
  const matches = input.lineage.transitions
    .flatMap((entry) =>
      entry.transition.events.map((event) => ({
        event,
        command: entry.command,
      })),
    )
    .filter(({ event }) => event.eventId === input.eventId);
  if (matches.length !== 1)
    invalid('committed event original absent or ambiguous');
  const { event, command } = matches[0]!;
  if (
    event.eventType !== SOCIAL_POSITION_OFFER_CREATED_EVENT ||
    event.correctsEventId !== null ||
    command.countryId !== input.countryId ||
    event.payloadHash !== input.payloadHash ||
    input.pointer !== '/offer'
  )
    invalid('unsupported event source binding');
  const payload: unknown = JSON.parse(event.canonicalPayload);
  if (
    canonicalSerialize((payload as { offer: unknown }).offer) !==
    canonicalSerialize(input.value)
  )
    invalid('offer differs from actual committed event payload');
  return event;
}
export type PostwarSocialCountryLifecycle = Readonly<{
  countryId: string;
  lifecycle: SocialPositionOfferLifecycleState;
  offerOrigins: readonly SocialOfferCommittedOrigin[];
}>;
