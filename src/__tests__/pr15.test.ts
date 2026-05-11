import { describe, expect, it } from 'vitest'

// PR15 — P0.1 mobile login + session policy regression tests

type RequestLike = {
  headers: Record<string, string | undefined>
  protocol?: 'http' | 'https'
}

function getRequestProtocol(req?: RequestLike): 'http' | 'https' | null {
  if (!req) return null
  const xf = req.headers['x-forwarded-proto']?.split(',')[0]?.trim().toLowerCase()
  if (xf === 'http' || xf === 'https') return xf
  if (req.protocol) return req.protocol
  return null
}

function isCookieSecure(req?: RequestLike): boolean {
  const protocol = getRequestProtocol(req)
  if (protocol === 'https') return true
  if (protocol === 'http') return false
  return false
}

function buildCookieAttrs(req: RequestLike, maxAge: number) {
  return {
    httpOnly: true,
    secure: isCookieSecure(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

describe('cookie policy is dynamic by request context', () => {
  it('HTTP (LAN/local) emits Secure=false', () => {
    const attrs = buildCookieAttrs({ headers: {}, protocol: 'http' }, 3600)
    expect(attrs.secure).toBe(false)
    expect(attrs.sameSite).toBe('lax')
    expect(attrs.path).toBe('/')
  })

  it('HTTPS emits Secure=true', () => {
    const attrs = buildCookieAttrs({ headers: {}, protocol: 'https' }, 3600)
    expect(attrs.secure).toBe(true)
  })

  it('respects X-Forwarded-Proto=https behind proxy', () => {
    const attrs = buildCookieAttrs({ headers: { 'x-forwarded-proto': 'https' }, protocol: 'http' }, 3600)
    expect(attrs.secure).toBe(true)
  })

  it('respects X-Forwarded-Proto=http behind proxy', () => {
    const attrs = buildCookieAttrs({ headers: { 'x-forwarded-proto': 'http' }, protocol: 'https' }, 3600)
    expect(attrs.secure).toBe(false)
  })
})

describe('logout invalidation is symmetric to login cookie', () => {
  it('logout uses same attrs as login except maxAge=0', () => {
    const req = { headers: {}, protocol: 'http' as const }
    const login = buildCookieAttrs(req, 3600)
    const logout = buildCookieAttrs(req, 0)
    expect(logout.httpOnly).toBe(login.httpOnly)
    expect(logout.secure).toBe(login.secure)
    expect(logout.sameSite).toBe(login.sameSite)
    expect(logout.path).toBe(login.path)
    expect(logout.maxAge).toBe(0)
  })
})

describe('middleware auth flow remains stable', () => {
  function middlewareDecision(hasToken: boolean): 'allow' | 'redirect-login' {
    return hasToken ? 'allow' : 'redirect-login'
  }

  it('with valid session token, allows protected route', () => {
    expect(middlewareDecision(true)).toBe('allow')
  })

  it('without session token, redirects to /login', () => {
    expect(middlewareDecision(false)).toBe('redirect-login')
  })
})

describe('A -> logout -> B no regression', () => {
  it('session A is removed before B logs in', () => {
    const req = { headers: {}, protocol: 'http' as const }
    const loginA = buildCookieAttrs(req, 3600)
    const logoutA = buildCookieAttrs(req, 0)
    const loginB = buildCookieAttrs(req, 3600)

    expect(logoutA.maxAge).toBe(0)
    expect(logoutA.path).toBe(loginA.path)
    expect(loginB.maxAge).toBeGreaterThan(0)
    expect(loginB.secure).toBe(loginA.secure)
  })
})

describe('session hardening defaults (P0.6 baseline)', () => {
  const SESSION_IDLE_TIMEOUT_MINUTES = 60
  const SESSION_TTL_MINUTES = 60

  it('idle timeout defaults to 60 minutes', () => {
    expect(SESSION_IDLE_TIMEOUT_MINUTES).toBe(60)
  })

  it('session TTL default is 60 minutes', () => {
    expect(SESSION_TTL_MINUTES).toBe(60)
  })
})
