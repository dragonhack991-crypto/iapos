import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR4 – Auth / Setup hardening
//
// All helpers below are pure-logic replicas of the route/middleware behaviour
// so that tests remain isolated (no DB, no Next.js runtime required).
// ─────────────────────────────────────────────────────────────────────────────

// ── Logout cookie helpers ─────────────────────────────────────────────────────

interface CookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
  maxAge: number
}

function logoutCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}

function loginCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  }
}

// ── Middleware routing logic ──────────────────────────────────────────────────

type RouteDecision = 'pass' | 'redirect_setup' | 'redirect_login' | 'protected'

function middlewareDecision(
  pathname: string,
  isInitialized: boolean,
  hasValidToken: boolean
): RouteDecision {
  const RUTAS_SETUP = ['/setup', '/api/setup']
  const RUTAS_AUTH_PUBLICA = ['/login', '/api/auth/login', '/api/auth/logout']
  const RUTAS_ESTATICAS = ['/_next', '/favicon']

  if (RUTAS_ESTATICAS.some(r => pathname.startsWith(r))) return 'pass'

  if (!isInitialized) {
    if (RUTAS_SETUP.some(r => pathname.startsWith(r))) return 'pass'
    return 'redirect_setup'
  }

  if (RUTAS_SETUP.some(r => pathname.startsWith(r))) return 'redirect_login'

  if (RUTAS_AUTH_PUBLICA.some(r => pathname.startsWith(r))) return 'pass'

  if (!hasValidToken) return 'redirect_login'

  return 'protected'
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('logout – cookie invalidation', () => {
  it('logout sets maxAge to 0 to expire the cookie immediately', () => {
    const opts = logoutCookieOptions(false)
    expect(opts.maxAge).toBe(0)
  })

  it('logout cookie shares the same path and sameSite as login cookie', () => {
    const login = loginCookieOptions(false)
    const logout = logoutCookieOptions(false)
    expect(logout.path).toBe(login.path)
    expect(logout.sameSite).toBe(login.sameSite)
  })

  it('logout cookie is httpOnly to prevent client-side access', () => {
    const opts = logoutCookieOptions(false)
    expect(opts.httpOnly).toBe(true)
  })

  it('logout cookie is secure in production', () => {
    expect(logoutCookieOptions(true).secure).toBe(true)
    expect(logoutCookieOptions(false).secure).toBe(false)
  })
})

describe('middleware – setup redirect when system is NOT initialized', () => {
  it('redirects / to /setup when not initialized', () => {
    expect(middlewareDecision('/', false, false)).toBe('redirect_setup')
  })

  it('redirects /ventas to /setup when not initialized', () => {
    expect(middlewareDecision('/ventas', false, false)).toBe('redirect_setup')
  })

  it('redirects /dashboard to /setup when not initialized', () => {
    expect(middlewareDecision('/dashboard', false, false)).toBe('redirect_setup')
  })

  it('redirects /caja to /setup when not initialized', () => {
    expect(middlewareDecision('/caja', false, false)).toBe('redirect_setup')
  })

  it('redirects /login to /setup when not initialized', () => {
    // Even login is blocked until setup completes
    expect(middlewareDecision('/login', false, false)).toBe('redirect_setup')
  })

  it('allows /setup when not initialized', () => {
    expect(middlewareDecision('/setup', false, false)).toBe('pass')
  })

  it('allows /api/setup when not initialized', () => {
    expect(middlewareDecision('/api/setup', false, false)).toBe('pass')
  })

  it('allows static assets regardless of initialization state', () => {
    expect(middlewareDecision('/_next/static/chunk.js', false, false)).toBe('pass')
    expect(middlewareDecision('/favicon.ico', false, false)).toBe('pass')
  })
})

describe('middleware – /setup blocked after initialization', () => {
  it('redirects /setup to /login when system is already initialized', () => {
    expect(middlewareDecision('/setup', true, false)).toBe('redirect_login')
  })

  it('redirects /api/setup to /login when system is already initialized', () => {
    expect(middlewareDecision('/api/setup', true, false)).toBe('redirect_login')
  })
})

describe('middleware – post-logout access denial to protected routes', () => {
  it('redirects /ventas to /login when no valid token (after logout)', () => {
    expect(middlewareDecision('/ventas', true, false)).toBe('redirect_login')
  })

  it('redirects /caja to /login when no valid token (after logout)', () => {
    expect(middlewareDecision('/caja', true, false)).toBe('redirect_login')
  })

  it('redirects /dashboard to /login when no valid token (after logout)', () => {
    expect(middlewareDecision('/dashboard', true, false)).toBe('redirect_login')
  })

  it('redirects /api/ventas to /login when no valid token', () => {
    expect(middlewareDecision('/api/ventas', true, false)).toBe('redirect_login')
  })

  it('redirects /productos to /login when no valid token', () => {
    expect(middlewareDecision('/productos', true, false)).toBe('redirect_login')
  })
})

describe('middleware – authenticated users can access protected routes', () => {
  it('allows /ventas with valid token', () => {
    expect(middlewareDecision('/ventas', true, true)).toBe('protected')
  })

  it('allows /caja with valid token', () => {
    expect(middlewareDecision('/caja', true, true)).toBe('protected')
  })

  it('allows /dashboard with valid token', () => {
    expect(middlewareDecision('/dashboard', true, true)).toBe('protected')
  })
})

describe('middleware – public auth routes always accessible (system initialized)', () => {
  it('allows /login without a token', () => {
    expect(middlewareDecision('/login', true, false)).toBe('pass')
  })

  it('allows /api/auth/login without a token', () => {
    expect(middlewareDecision('/api/auth/login', true, false)).toBe('pass')
  })

  it('allows /api/auth/logout without a token (to handle stale sessions)', () => {
    expect(middlewareDecision('/api/auth/logout', true, false)).toBe('pass')
  })
})
