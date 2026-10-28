/** Server-only bounded historical source adapter. No writer or browser port. */
export {
  createPostwarPhysicalOpeningHeadReader,
  POSTWAR_PHYSICAL_OPENING_DATASETS,
  POSTWAR_PHYSICAL_OPENING_PAGE_QUERY,
  type PostwarPhysicalOpeningRequest,
  type PostwarPhysicalOpeningHeadPage,
} from '../persistence/postwar-physical-opening-head-read.js';
