/** Server-only request-scoped reads. No browser entry, World/Clock startup,
 * command admission, signer or generic runtime-ready callback. */
export {
  createPostwarSocialRuntimeConsumer,
  type PostwarSocialRuntimeConsumer,
  type PostwarSocialRuntimeCountryRead,
} from '../persistence/postwar-social-runtime-consumer.js';
export type { SqlExecutor } from '../persistence/sql-database.js';

export { PostwarOperatingRuntimeSourceError } from '../persistence/postwar-operating-runtime-source.js';
