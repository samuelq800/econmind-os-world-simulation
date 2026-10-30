/** Server-only bounded page/header reads. Offline source hydration and
 * projection publication are excluded from this API entrypoint. */
export {
  createPostwarOfficeProjectionStore,
  PostwarOfficeProjectionStoreError,
  POSTWAR_PROJECTION_DATASETS,
  type PostwarProjectionOffice,
  type PostwarOfficeProjectionScope,
  type PostwarOfficeProjectionSource,
  type PostwarOfficeProjectionSeatHeader,
  type PostwarOfficeProjectionPage,
} from '../persistence/postwar-office-projection-store.js';
export type { SqlExecutor } from '../persistence/sql-database.js';

export {
  createPostwarSocialMixedCurrentProjectionStore,
  type PostwarSocialMixedCurrentSource,
  type PostwarSocialMixedCurrentPage,
} from '../persistence/postwar-social-mixed-current-projection.js';
