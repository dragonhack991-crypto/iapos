import { NextRequest, NextResponse } from 'next/server'
import { verificarToken, COOKIE_NAME } from './lib/auth'
import { isCookieSecure } from './lib/cookies'

const INITIALIZED_COOKIE = 'iapos_initialized'

// Internal status probe – must be in the always-pass list to prevent the
// middleware from calling itself in an infinite loop when it fetches this route.
const RUTA_STATUS = '/api/system/status'

// Routes accessible before setup (system not yet initialized)
const RUTAS_SETUP = ['/setup', '/api/setup']

// Routes that are always public once the system is initialized
const RUTAS_AUTH_PUBLICA = ['/login', '/api/auth/login', '/api/auth/logout']

// Static asset prefixes – always pass through
const RUTAS_ESTATICAS = ['/_next', '/favicon']

/**
 * Attach the iapos_initialized cookie to any outgoing response so that
 * subsequent requests take the fast cookie path and skip the DB probe.
 */
function attachInitCookie(response: NextResponse): void {
  response.cookies.set(INITIALIZED_COOKIE, '1', {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
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
      const statusUrl = new URL(RUTA_STATUS, request.url)
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
    if (restoreCookie) attachInitCookie(response)
    return response
  }

  // Public auth routes – no token required
  if (RUTAS_AUTH_PUBLICA.some(r => pathname.startsWith(r))) {
    const response = NextResponse.next()
    if (restoreCookie) attachInitCookie(response)
    return response
  }

  // Validate auth token for all remaining (protected) routes
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    if (restoreCookie) attachInitCookie(response)
    return response
  }

  const payload = await verificarToken(token)
  if (!payload) {
    // Clear the invalid/expired cookie and redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return response
  }

  // Authenticated – prevent browsers from caching protected responses
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'no-store')
  if (restoreCookie) attachInitCookie(response)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
