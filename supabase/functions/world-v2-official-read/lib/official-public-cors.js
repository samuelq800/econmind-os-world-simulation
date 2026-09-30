const MAX_ORIGINS = 8;
const MAX_CONFIGURATION_LENGTH = 1_024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** A missing setting adds no cross-origin capability. Values must be exact,
 * canonical origins; paths, wildcards, credentials and opaque origins fail. */
export function readOfficialPublicCorsOrigins(environment, environmentName) {
    const raw = environment.WORLD_API_OFFICIAL_PUBLIC_ORIGINS;
    if (raw === undefined)
        return undefined;
    if (raw.length === 0 || raw.length > MAX_CONFIGURATION_LENGTH)
        throw new Error('WORLD_API_OFFICIAL_PUBLIC_ORIGINS is invalid');
    const origins = raw.split(',');
    if (origins.length > MAX_ORIGINS || new Set(origins).size !== origins.length)
        throw new Error('WORLD_API_OFFICIAL_PUBLIC_ORIGINS is invalid');
    for (const origin of origins) {
        let url;
        try {
            url = new URL(origin);
        }
        catch {
            throw new Error('WORLD_API_OFFICIAL_PUBLIC_ORIGINS is invalid');
        }
        const localHttp = (environmentName === 'local' || environmentName === 'ci') &&
            url.protocol === 'http:' &&
            LOCAL_HOSTS.has(url.hostname);
        if (origin !== url.origin ||
            url.username !== '' ||
            url.password !== '' ||
            url.pathname !== '/' ||
            url.search !== '' ||
            url.hash !== '' ||
            (url.protocol !== 'https:' && !localHttp))
            throw new Error('WORLD_API_OFFICIAL_PUBLIC_ORIGINS is invalid');
    }
    return Object.freeze(origins);
}
/** Only called after the runtime has selected an enabled public official
 * source route. It never applies to identity, Command, health or private APIs. */
export function handleOfficialPublicCors(request, response, allowedOrigins) {
    if (allowedOrigins === undefined)
        return false;
    const preflight = request.method === 'OPTIONS';
    response.setHeader('vary', preflight
        ? 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
        : 'Origin');
    const origin = request.headers.origin;
    if (!preflight) {
        if ((request.method === 'GET' || request.method === 'HEAD') &&
            typeof origin === 'string' &&
            allowedOrigins.includes(origin))
            response.setHeader('access-control-allow-origin', origin);
        return false;
    }
    const requestedMethod = request.headers['access-control-request-method'];
    if (origin === undefined || requestedMethod === undefined)
        return false;
    const requestedHeaders = request.headers['access-control-request-headers'];
    const allowedHeaders = requestedHeaders === undefined ||
        (typeof requestedHeaders === 'string' &&
            requestedHeaders.toLowerCase().trim() === 'accept');
    if (typeof origin !== 'string' ||
        !allowedOrigins.includes(origin) ||
        (requestedMethod !== 'GET' && requestedMethod !== 'HEAD') ||
        !allowedHeaders) {
        response.writeHead(403, {
            'cache-control': 'no-store',
            'content-length': '0',
        });
        response.end();
        return true;
    }
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'GET, HEAD');
    if (requestedHeaders !== undefined)
        response.setHeader('access-control-allow-headers', 'Accept');
    response.writeHead(204, {
        'cache-control': 'no-store',
        'content-length': '0',
    });
    response.end();
    return true;
}
