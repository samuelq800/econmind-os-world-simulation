import { Pool } from 'pg';

import { readOfficialEdgeDatabaseConfig } from './lib/official-edge-database-config.js';
import { createOfficialEdgeFetchHandler } from './lib/official-edge-fetch-adapter.js';
import { createRoleScopedOfficialCountryReader } from './lib/official-country-role-reader.js';
import { readOfficialPublicCorsOrigins } from './lib/official-public-cors.js';

// Initialization is fail-closed. No Supabase admin, service-role or anon key
// participates in this reader, and no connection opens until a source request.
const environment = Deno.env.toObject();
const database = readOfficialEdgeDatabaseConfig(environment);
if (!database) throw new Error('OFFICIAL_EDGE_DATABASE_CONFIGURATION_INVALID');
const allowedOrigins = readOfficialPublicCorsOrigins(environment, 'production');
if (allowedOrigins === undefined)
  throw new Error('OFFICIAL_EDGE_PUBLIC_ORIGINS_REQUIRED');

// One connection per warm isolate. A shared transaction pooler keeps SET LOCAL
// ROLE and the source SELECT on one backend for the read-only transaction.
const pool = new Pool({
  connectionString: database.connectionString,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 3_000,
  idleTimeoutMillis: 10_000,
  query_timeout: 5_500,
  application_name: 'econmind-world-v2-official-edge-read',
});
const reader = createRoleScopedOfficialCountryReader(pool, {
  statementTimeoutMillis: 5_000,
});
const handle = createOfficialEdgeFetchHandler({ reader, allowedOrigins });

export default { fetch: handle };
