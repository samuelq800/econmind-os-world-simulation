import type { IncomingMessage, ServerResponse } from 'node:http';
/** A missing setting adds no cross-origin capability. Values must be exact,
 * canonical origins; paths, wildcards, credentials and opaque origins fail. */
export declare function readOfficialPublicCorsOrigins(environment: Readonly<Record<string, string | undefined>>, environmentName: string): readonly string[] | undefined;
/** Only called after the runtime has selected an enabled public official
 * source route. It never applies to identity, Command, health or private APIs. */
export declare function handleOfficialPublicCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[] | undefined): boolean;
