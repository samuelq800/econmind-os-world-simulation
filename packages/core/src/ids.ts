import { DOMAIN_ERROR_CODES, DomainError } from './errors.js';

declare const brand: unique symbol;
type BrandedId<Name extends string> = string & { readonly [brand]: Name };

export type WorldId = BrandedId<'WorldId'>;
export type CountryId = BrandedId<'CountryId'>;
export type OfficeId = BrandedId<'OfficeId'>;
export type ActorId = BrandedId<'ActorId'>;
export type AuthSubject = BrandedId<'AuthSubject'>;
export type TeamId = BrandedId<'TeamId'>;
export type CommodityId = BrandedId<'CommodityId'>;
export type TechnologyId = BrandedId<'TechnologyId'>;
export type ProjectId = BrandedId<'ProjectId'>;
export type EngineId = BrandedId<'EngineId'>;
export type ProductionSectorId = BrandedId<'ProductionSectorId'>;
export type InternationalActivityId = BrandedId<'InternationalActivityId'>;
export type ProposalId = BrandedId<'ProposalId'>;
export type ScheduledEventId = BrandedId<'ScheduledEventId'>;
export type SchedulerPriorityId = BrandedId<'SchedulerPriorityId'>;
export type SettlementStageId = BrandedId<'SettlementStageId'>;

const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function parseId<Name extends string>(name: Name, value: string) {
  if (!CANONICAL_ID.test(value)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.INVALID_ID,
      `${name} must be a canonical uppercase identifier`,
    );
  }
  return value as BrandedId<Name>;
}

export const worldId = (value: string) => parseId('WorldId', value);
export const countryId = (value: string) => parseId('CountryId', value);
export const officeId = (value: string) => parseId('OfficeId', value);
export const actorId = (value: string) => parseId('ActorId', value);
export const authSubject = (value: string): AuthSubject => {
  if (!CANONICAL_UUID.test(value)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.INVALID_ID,
      'AuthSubject must be a canonical UUID',
    );
  }
  return value.toLowerCase() as AuthSubject;
};
export const teamId = (value: string) => parseId('TeamId', value);
export const commodityId = (value: string) => parseId('CommodityId', value);
export const technologyId = (value: string) => parseId('TechnologyId', value);
export const projectId = (value: string) => parseId('ProjectId', value);
export const engineId = (value: string) => parseId('EngineId', value);
export const productionSectorId = (value: string) =>
  parseId('ProductionSectorId', value);
export const internationalActivityId = (value: string) =>
  parseId('InternationalActivityId', value);
export const proposalId = (value: string) => parseId('ProposalId', value);
export const scheduledEventId = (value: string) =>
  parseId('ScheduledEventId', value);
export const schedulerPriorityId = (value: string) =>
  parseId('SchedulerPriorityId', value);
export const settlementStageId = (value: string) =>
  parseId('SettlementStageId', value);
