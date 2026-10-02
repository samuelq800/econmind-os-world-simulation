import type { IncomingMessage, ServerResponse } from 'node:http';
import { type OfficialCountrySqlReader } from './official-country-baseline.js';
export declare const OFFICIAL_DATASET_LIST_PATH = "/v1/world-data/datasets";
/** No arbitrary artifact path, JSON pointer, SQL, World identity or mutable
 * runtime projection is accepted from HTTP. */
export declare function createOfficialDatasetRoute(reader: OfficialCountrySqlReader): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
