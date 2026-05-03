/**
 * Returns whether session/auth cookies should be marked as `Secure`.
 *
 * By default this mirrors NODE_ENV (true in production, false otherwise).
 * Set the COOKIE_SECURE env var explicitly to override:
 *   COOKIE_SECURE=false  → allow HTTP deployments (LAN, Docker without TLS)
 *   COOKIE_SECURE=true   → always require HTTPS regardless of NODE_ENV
 */
export function isCookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE
  if (override !== undefined) {
    return override === 'true'
  }
  return process.env.NODE_ENV === 'production'
}
