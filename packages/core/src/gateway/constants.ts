/**
 * Single HTTP path segment for the native Topic Hub integration ingress (POST).
 * Full URL path is `/${NATIVE_INTEGRATION_SEGMENT}` unless the host mounts the app under a reverse-proxy prefix (then include that in `serverUrl` / webhook URLs only — not a Nest global prefix).
 */
export const NATIVE_INTEGRATION_SEGMENT = 'topic-hub';
