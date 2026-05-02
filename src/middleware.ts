import { NextRequest, NextResponse } from 'next/server'
import { verificarToken, COOKIE_NAME } from './lib/auth'

const INITIALIZED_COOKIE = 'iapos_initialized'

// Routes accessible before setup (system not yet initialized)
const RUTAS_SETUP = ['/setup', '/api/setup']

// Routes that are always public once the system is initialized
const RUTAS_AUTH_PUBLICA = ['/login', '/api/auth/login', '/api/auth/logout']

// Static asset prefixes – always pass through
const RUTAS_ESTATICAS = ['/_next', '/favicon']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always let static assets through
  if (RUTAS_ESTATICAS.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  const isInitialized = !!request.cookies.get(INITIALIZED_COOKIE)?.value

  // NOTE: `iapos_initialized` is a UX routing guard only – it drives setup-page
  // redirects.  Actual authentication is enforced by JWT token validation below.
  // The /api/setup endpoint independently validates DB state against re-init,
  // so spoofing this cookie cannot grant admin access.

  // ── System NOT yet initialized ──────────────────────────────────────────────
  if (!isInitialized) {
    // Allow setup routes; redirect everything else to /setup
    if (RUTAS_SETUP.some(r => pathname.startsWith(r))) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  // ── System IS initialized ───────────────────────────────────────────────────

  // Block /setup (redirect to login or dashboard)
  if (RUTAS_SETUP.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Public auth routes – no token required
  if (RUTAS_AUTH_PUBLICA.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Validate auth token for all remaining (protected) routes
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const payload = await verificarToken(token)
  if (!payload) {
    // Clear the invalid/expired cookie and redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return response
  }

  // Authenticated – prevent browsers from caching protected responses
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
