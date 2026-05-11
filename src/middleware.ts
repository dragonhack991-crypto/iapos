import { NextRequest, NextResponse } from 'next/server'
import {
  verificarToken,
  COOKIE_NAME,
  LOCK_COOKIE,
  SESSION_ACTIVITY_COOKIE,
  getSessionIdleTimeoutMinutes,
  getSessionTtlSeconds,
} from './lib/auth'
import { getCookieDomain, isCookieSecure } from './lib/cookies'

const INITIALIZED_COOKIE = 'iapos_initialized'

// Internal status probe – must be in the always-pass list to prevent the
// middleware from calling itself in an infinite loop when it fetches this route.
const RUTA_STATUS = '/api/system/status'

// Routes accessible before setup (system not yet initialized)
const RUTAS_SETUP = ['/setup', '/api/setup']

// Routes that are always public once the system is initialized
const RUTAS_AUTH_PUBLICA = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/lock']

// Static asset prefixes – always pass through
const RUTAS_ESTATICAS = ['/_next', '/favicon']

/**
 * Attach the iapos_initialized cookie to any outgoing response so that
 * subsequent requests take the fast cookie path and skip the DB probe.
 */
function attachInitCookie(response: NextResponse, request: NextRequest): void {
  const cookieDomain = getCookieDomain()
  response.cookies.set(INITIALIZED_COOKIE, '1', {
    httpOnly: true,
    secure: isCookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    domain: cookieDomain,
  })
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always let static assets and the internal status probe through first.
  // The status probe must be excluded BEFORE the initialization check to
  // avoid an infinite fetch → middleware → fetch loop.
  if (
    RUTAS_ESTATICAS.some(r => pathname.startsWith(r)) ||
    pathname.startsWith(RUTA_STATUS)
  ) {
    return NextResponse.next()
  }

  // ── Resolve isInitialized: cookie (fast-path) → DB fallback ──────────────
  //
  // The `iapos_initialized` cookie is a routing performance optimisation only.
  // When the cookie is absent (e.g. cookies cleared, new browser), we fall
  // back to an internal DB query so the middleware never incorrectly treats
  // an already-configured system as uninitialised.
  //
  // Actual security is enforced by JWT token validation below; the /api/setup
  // endpoint independently guards against re-initialisation via DB check.
  const cookiePresent = !!request.cookies.get(INITIALIZED_COOKIE)?.value
  let isInitialized = cookiePresent
  let restoreCookie = false // true when DB confirmed initialized but cookie was absent

  if (!cookiePresent) {
    try {
      // Always probe via 127.0.0.1:PORT (the local process) instead of the
      // inbound request URL (which may be a LAN IP unreachable from inside
      // the Docker container).
      const port = process.env.PORT || '3000'
      const statusUrl = `http://127.0.0.1:${port}${RUTA_STATUS}`
      const res = await fetch(statusUrl, { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as { initialized: boolean }
        isInitialized = data.initialized
        if (data.initialized) restoreCookie = true
      }
    } catch (err) {
      // Status probe failed (e.g. cold start, DB unreachable).
      // Keep isInitialized = false so /setup remains accessible.
      console.error('[middleware] Status probe failed:', err)
    }
  }

  // ── System NOT yet initialized ────────────────────────────────────────────
  if (!isInitialized) {
    if (RUTAS_SETUP.some(r => pathname.startsWith(r))) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  // ── System IS initialized ─────────────────────────────────────────────────

  // Block /setup; redirect to login
  if (RUTAS_SETUP.some(r => pathname.startsWith(r))) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    if (restoreCookie) attachInitCookie(response, request)
    return response
  }

  // Public auth routes – no token required
  if (RUTAS_AUTH_PUBLICA.some(r => pathname.startsWith(r))) {
    const response = NextResponse.next()
    if (restoreCookie) attachInitCookie(response, request)
    return response
  }

  // Validate auth token for all remaining (protected) routes
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    if (restoreCookie) attachInitCookie(response, request)
    return response
  }

  const payload = await verificarToken(token)
  if (!payload) {
    // Clear the invalid/expired cookie and redirect to login
    const cookieDomain = getCookieDomain()
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: isCookieSecure(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      domain: cookieDomain,
    })
    response.cookies.set(SESSION_ACTIVITY_COOKIE, '', {
      httpOnly: true,
      secure: isCookieSecure(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      domain: cookieDomain,
    })
    response.cookies.set(LOCK_COOKIE, '', {
      httpOnly: true,
      secure: isCookieSecure(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      domain: cookieDomain,
    })
    return response
  }

  const cookieDomain = getCookieDomain()
  const secure = isCookieSecure(request)
  const sessionMaxAge = getSessionTtlSeconds()
  const idleTimeoutMs = getSessionIdleTimeoutMinutes() * 60 * 1000
  const now = Date.now()

  const locked = request.cookies.get(LOCK_COOKIE)?.value === '1'
  if (locked) {
    const response = NextResponse.redirect(new URL('/login?locked=1', request.url))
    response.cookies.set(LOCK_COOKIE, '1', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMaxAge,
      domain: cookieDomain,
    })
    return response
  }

  const lastActivityRaw = request.cookies.get(SESSION_ACTIVITY_COOKIE)?.value
  const lastActivity = lastActivityRaw ? Number.parseInt(lastActivityRaw, 10) : NaN
  const isTimedOut = Number.isFinite(lastActivity) && now - lastActivity > idleTimeoutMs
  if (isTimedOut) {
    const response = NextResponse.redirect(new URL('/login?reason=timeout', request.url))
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      domain: cookieDomain,
    })
    response.cookies.set(SESSION_ACTIVITY_COOKIE, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      domain: cookieDomain,
    })
    return response
  }

  // Authenticated – prevent browsers from caching protected responses
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set(SESSION_ACTIVITY_COOKIE, String(now), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAge,
    domain: cookieDomain,
  })
  if (restoreCookie) attachInitCookie(response, request)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
