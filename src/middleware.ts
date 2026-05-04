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

/**
 * Probe the internal /api/system/status route to determine whether the system
 * is truly initialized in the DB.  Always resolves via 127.0.0.1 so Docker
 * containers don't need to reach themselves via their LAN IP.
 *
 * Returns true on network failure (fail-open) to avoid incorrectly sending
 * a valid, authenticated user to /setup during a transient DB hiccup.
 */
async function probeSystemInitialized(port: string): Promise<boolean> {
  try {
    const statusUrl = new URL(RUTA_STATUS, `http://127.0.0.1:${port}`)
    const res = await fetch(statusUrl, { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as { initialized: boolean }
      return data.initialized
    }
  } catch (err) {
    console.error('[middleware] Status probe failed:', err)
  }
  // Fail-open: if we cannot reach the probe, assume still initialized so we
  // don't accidentally wipe a valid session during a transient cold-start.
  return true
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

  const port = process.env.PORT || new URL(request.url).port || '3000'

  // ── Resolve isInitialized: cookie (fast-path) → DB fallback ──────────────
  //
  // The `iapos_initialized` cookie is a routing performance optimisation only.
  // When the cookie is absent (e.g. cookies cleared, new browser), we fall
  // back to an internal DB query so the middleware never incorrectly treats
  // an already-configured system as uninitialised.
  //
  // We always fetch via 127.0.0.1:PORT so the request resolves locally within
  // the container, regardless of the external hostname or LAN IP the client
  // used to reach the server.
  //
  // Actual security is enforced by JWT token validation below; the /api/setup
  // endpoint independently guards against re-initialisation via DB check.
  const cookiePresent = !!request.cookies.get(INITIALIZED_COOKIE)?.value
  let isInitialized = cookiePresent
  let restoreCookie = false // true when DB confirmed initialized but cookie was absent

  if (!cookiePresent) {
    const dbInit = await probeSystemInitialized(port)
    isInitialized = dbInit
    if (dbInit) restoreCookie = true
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
    // ── Stale init-cookie recovery ────────────────────────────────────────
    // The init cookie was present (trusted above), but the user has no JWT.
    // Re-verify the DB to catch the case where the DB was reset (volume
    // purged) after Docker restart: if the system is no longer initialized,
    // clear the stale init cookie and redirect to /setup so the user can
    // configure the system again without manual cookie clearing.
    if (cookiePresent) {
      const stillInitialized = await probeSystemInitialized(port)
      if (!stillInitialized) {
        console.info('[middleware] Stale iapos_initialized cookie detected – redirecting to /setup')
        const response = NextResponse.redirect(new URL('/setup', request.url))
        response.cookies.set(INITIALIZED_COOKIE, '', {
          httpOnly: true,
          secure: isCookieSecure(),
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        })
        return response
      }
    }
    const response = NextResponse.redirect(new URL('/login', request.url))
    if (restoreCookie) attachInitCookie(response)
    return response
  }

  const payload = await verificarToken(token)
  if (!payload) {
    // ── Stale init-cookie recovery (invalid JWT path) ─────────────────────
    // JWT is cryptographically invalid (e.g. secret changed after restart).
    // If the init cookie was trusted (cookie path, not DB), re-verify DB.
    // If the system is no longer initialized, clear both stale cookies and
    // redirect to /setup.
    if (cookiePresent) {
      const stillInitialized = await probeSystemInitialized(port)
      if (!stillInitialized) {
        console.info('[middleware] Stale cookies detected after restart – redirecting to /setup')
        const response = NextResponse.redirect(new URL('/setup', request.url))
        response.cookies.set(INITIALIZED_COOKIE, '', {
          httpOnly: true,
          secure: isCookieSecure(),
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        })
        response.cookies.set(COOKIE_NAME, '', {
          httpOnly: true,
          secure: isCookieSecure(),
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        })
        return response
      }
    }
    // Clear the invalid/expired JWT cookie and redirect to login
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
