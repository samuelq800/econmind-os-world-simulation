/** Server-only immutable data proof issuer and cleanup surface. This does not
 * expose source/guard constructors, a consumer, admission or execution rights. */
export {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
  type BeneficialHousingRentSourceData,
} from '../persistence/postwar-beneficial-housing-rent-source.js';
export { hasPostwarBeneficialHousingRentSourceOwner } from '../persistence/postwar-beneficial-housing-rent-runtime.js';
