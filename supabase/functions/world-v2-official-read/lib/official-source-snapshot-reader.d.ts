import { type OfficialCountrySqlReader } from './official-country-baseline.js';
export declare const OFFICIAL_SOURCE_BUCKET = "world-v2-official-source-v1";
export declare const OFFICIAL_SOURCE_PUBLIC_BASE = "https://vimksjrhaxdpnkvgsavz.supabase.co/storage/v1/object/public/world-v2-official-source-v1/88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315";
type SnapshotFetch = (url: string, init: RequestInit) => Promise<Response>;
/** Server-only adapter for an exact selected-source copy, not a database or
 * live World projection. The old fixed-query interface is reused solely to
 * retain existing DTO/hash/decimal validation; no SQL is executed here. */
export declare function createOfficialSourceSnapshotReader(fetchSource?: SnapshotFetch): OfficialCountrySqlReader;
export {};
