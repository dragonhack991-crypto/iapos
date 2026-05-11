type RequestLike = {
  headers: {
    get(name: string): string | null
  }
  nextUrl?: {
    protocol: string
  }
  url?: string
}

/**
 * Resolve the client-facing protocol from request metadata.
 * Honors proxy forwarding headers before falling back to request URL.
 * Returns null when protocol cannot be derived from request data; callers
 * should then apply their own fallback policy (env/default).
 */
export function getRequestProtocol(request?: RequestLike): 'http' | 'https' | null {
  if (!request) return null

  const forwardedProtoRaw =
    request.headers.get('x-forwarded-proto') ??
    request.headers.get('x-forwarded-protocol')

  if (forwardedProtoRaw) {
    const forwardedProto = forwardedProtoRaw.split(',')[0]?.trim().toLowerCase()
    if (forwardedProto === 'https') return 'https'
    if (forwardedProto === 'http') return 'http'
  }

  const protocolFromNextUrl = request.nextUrl?.protocol?.replace(':', '').toLowerCase()
  if (protocolFromNextUrl === 'https') return 'https'
  if (protocolFromNextUrl === 'http') return 'http'

  if (request.url) {
    try {
      const protocolFromUrl = new URL(request.url).protocol.replace(':', '').toLowerCase()
      if (protocolFromUrl === 'https') return 'https'
      if (protocolFromUrl === 'http') return 'http'
    } catch {
      // Ignore malformed URL and continue with env fallback
    }
  }

  return null
}

/**
 * Returns whether cookies should be set with the Secure flag.
 *
 * Priority:
 *  1. Real request protocol (supports X-Forwarded-Proto)
 *  2. COOKIE_SECURE env var explicitly set to true/false
 *  3. NODE_ENV === 'production'
 */
export function isCookieSecure(request?: RequestLike): boolean {
  const protocol = getRequestProtocol(request)
  if (protocol === 'https') return true
  if (protocol === 'http') return false

  const env = process.env.COOKIE_SECURE
  if (env === 'true') return true
  if (env === 'false') return false
  return process.env.NODE_ENV === 'production'
}

export function getCookieDomain(): string | undefined {
  const domain = process.env.COOKIE_DOMAIN?.trim()
  return domain ? domain : undefined
}
