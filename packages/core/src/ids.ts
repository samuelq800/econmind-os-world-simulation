import { DOMAIN_ERROR_CODES, DomainError } from './errors.js';

declare const brand: unique symbol;
type BrandedId<Name extends string> = string & { readonly [brand]: Name };

export type WorldId = BrandedId<'WorldId'>;
export type CountryId = BrandedId<'CountryId'>;
export type OfficeId = BrandedId<'OfficeId'>;
export type ActorId = BrandedId<'ActorId'>;
export type UserId = BrandedId<'UserId'>;
export type TeamId = BrandedId<'TeamId'>;
export type CommodityId = BrandedId<'CommodityId'>;
export type TechnologyId = BrandedId<'TechnologyId'>;
export type ProjectId = BrandedId<'ProjectId'>;
export type EngineId = BrandedId<'EngineId'>;
export type ProductionSectorId = BrandedId<'ProductionSectorId'>;
export type InternationalActivityId = BrandedId<'InternationalActivityId'>;
export type ProposalId = BrandedId<'ProposalId'>;

const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;

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
export const userId = (value: string) => parseId('UserId', value);
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
