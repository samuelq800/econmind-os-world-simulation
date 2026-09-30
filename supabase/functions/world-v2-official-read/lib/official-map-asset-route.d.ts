import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const OFFICIAL_MAP_ASSET_LIST_PATH = "/v1/world-data/map-assets";
/** Metadata only. E/D own static publication and its URL binding; no binary
 * file, repository path selector, database blob or World-state claim here. */
export declare function createOfficialMapAssetRoute(): (request: IncomingMessage, response: ServerResponse) => void;
