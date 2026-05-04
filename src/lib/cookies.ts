/**
 * Returns whether cookies should be set with the Secure flag.
 *
 * Priority:
 *  1. COOKIE_SECURE env var explicitly set to "true" → true
 *  2. COOKIE_SECURE env var explicitly set to "false" → false
 *  3. Falls back to NODE_ENV === 'production'
 *
 * docker-compose sets COOKIE_SECURE=false for HTTP LAN deployments.
 */
export function isCookieSecure(): boolean {
  const env = process.env.COOKIE_SECURE
  if (env === 'true') return true
  if (env === 'false') return false
  return process.env.NODE_ENV === 'production'
}
