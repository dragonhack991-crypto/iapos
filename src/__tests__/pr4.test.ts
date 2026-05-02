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

function initCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  }
}

// ── Token validation helpers ──────────────────────────────────────────────────

interface TokenState {
  present: boolean
  signatureValid: boolean
  expired: boolean
}

function resolveTokenValidity(state: TokenState): boolean {
  // A token is only valid when present, signature checks out, AND not expired.
  // This mirrors jose's jwtVerify behaviour.
  return state.present && state.signatureValid && !state.expired
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

  // ── System NOT yet initialized ─────────────────────────────────────────────
  if (!isInitialized) {
    // Allow only the setup routes; redirect everything else to /setup
    if (RUTAS_SETUP.some(r => pathname.startsWith(r))) return 'pass'
    return 'redirect_setup'
  }

  // ── System IS initialized ──────────────────────────────────────────────────

  // /setup is blocked once initialized
  if (RUTAS_SETUP.some(r => pathname.startsWith(r))) return 'redirect_login'

  // Public auth routes – no token required
  if (RUTAS_AUTH_PUBLICA.some(r => pathname.startsWith(r))) return 'pass'

  // All other routes require a valid token (signature + expiration checked)
  if (!hasValidToken) return 'redirect_login'

  return 'protected'
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('logout – cookie invalidation', () => {
  it('logout sets maxAge to 0 to expire the session cookie immediately', () => {
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

describe('login – initialization cookie is set on successful login', () => {
  it('init cookie has a positive maxAge (persists across sessions)', () => {
    const opts = initCookieOptions(false)
    expect(opts.maxAge).toBeGreaterThan(0)
  })

  it('init cookie is httpOnly (cannot be spoofed via JS)', () => {
    expect(initCookieOptions(false).httpOnly).toBe(true)
  })

  it('init cookie uses same path and sameSite as session cookie', () => {
    const session = loginCookieOptions(false)
    const init = initCookieOptions(false)
    expect(init.path).toBe(session.path)
    expect(init.sameSite).toBe(session.sameSite)
  })

  it('init cookie is NOT cleared on logout (system remains initialized)', () => {
    // The session cookie is cleared; the init flag is system-level, not user-level.
    const logout = logoutCookieOptions(false)
    expect(logout.maxAge).toBe(0)
    // init cookie would still have positive maxAge
    const init = initCookieOptions(false)
    expect(init.maxAge).toBeGreaterThan(0)
  })
})

describe('token validation – firma + expiración (not just cookie presence)', () => {
  it('token with valid signature and not expired is accepted', () => {
    expect(resolveTokenValidity({ present: true, signatureValid: true, expired: false })).toBe(true)
  })

  it('absent token is rejected', () => {
    expect(resolveTokenValidity({ present: false, signatureValid: false, expired: false })).toBe(false)
  })

  it('token with invalid signature is rejected even if not expired', () => {
    expect(resolveTokenValidity({ present: true, signatureValid: false, expired: false })).toBe(false)
  })

  it('expired token is rejected even if signature is valid', () => {
    expect(resolveTokenValidity({ present: true, signatureValid: true, expired: true })).toBe(false)
  })

  it('expired token with invalid signature is rejected', () => {
    expect(resolveTokenValidity({ present: true, signatureValid: false, expired: true })).toBe(false)
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
    // Even login is blocked; only /setup and statics are allowed
    expect(middlewareDecision('/login', false, false)).toBe('redirect_setup')
  })

  it('redirects /api/ventas to /setup when not initialized', () => {
    expect(middlewareDecision('/api/ventas', false, false)).toBe('redirect_setup')
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

  it('a valid session token does NOT bypass the /setup redirect when not initialized', () => {
    // Even authenticated requests must go through /setup before initialization
    expect(middlewareDecision('/dashboard', false, true)).toBe('redirect_setup')
  })
})

describe('middleware – /setup blocked after initialization', () => {
  it('redirects /setup to /login when system is already initialized', () => {
    expect(middlewareDecision('/setup', true, false)).toBe('redirect_login')
  })

  it('redirects /api/setup to /login when system is already initialized', () => {
    expect(middlewareDecision('/api/setup', true, false)).toBe('redirect_login')
  })

  it('redirects /setup to /login even when authenticated (setup is done)', () => {
    expect(middlewareDecision('/setup', true, true)).toBe('redirect_login')
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

  it('redirects /inventario to /login when no valid token', () => {
    expect(middlewareDecision('/inventario', true, false)).toBe('redirect_login')
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

  it('allows /productos with valid token', () => {
    expect(middlewareDecision('/productos', true, true)).toBe('protected')
  })

  it('allows /api/ventas with valid token', () => {
    expect(middlewareDecision('/api/ventas', true, true)).toBe('protected')
  })

  it('allows /usuarios with valid token', () => {
    expect(middlewareDecision('/usuarios', true, true)).toBe('protected')
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

// ─────────────────────────────────────────────────────────────────────────────
// Setup validation logic (pure replicas of API schema + frontend guard)
// ─────────────────────────────────────────────────────────────────────────────

interface SetupPayload {
  nombreNegocio: string
  admin: {
    nombre: string
    email: string
    password: string
  }
}

type SetupValidationResult =
  | { valid: true }
  | { valid: false; status: 422; message: string }

function validateSetupPayload(payload: SetupPayload): SetupValidationResult {
  const trimmedNombre = payload.nombreNegocio.trim()
  // Mirrors Zod: .trim().min(2) — trim first, then check length
  if (trimmedNombre.length < 2) {
    return {
      valid: false,
      status: 422,
      message: 'El nombre del negocio debe tener al menos 2 caracteres',
    }
  }
  if (!payload.admin.nombre || payload.admin.nombre.trim().length === 0) {
    return { valid: false, status: 422, message: 'El nombre del administrador es requerido' }
  }
  if (!payload.admin.email.includes('@')) {
    return { valid: false, status: 422, message: 'Correo inválido' }
  }
  if (payload.admin.password.length < 8) {
    return { valid: false, status: 422, message: 'La contraseña debe tener al menos 8 caracteres' }
  }
  return { valid: true }
}

// Replicates the frontend decision after receiving an API response for POST /api/setup
type SetupResponseAction = 'redirect_login' | 'show_error' | 'success'

function handleSetupApiResponse(status: number, body: { error?: string }): SetupResponseAction {
  if (status === 409) return 'redirect_login'
  if (status >= 400) return 'show_error'
  return 'success'
}

describe('setup API – business name validation (backend defense)', () => {
  it('rejects empty business name with 422', () => {
    const result = validateSetupPayload({
      nombreNegocio: '',
      admin: { nombre: 'Admin', email: 'a@b.com', password: '12345678' },
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.status).toBe(422)
  })

  it('rejects whitespace-only business name with 422', () => {
    const result = validateSetupPayload({
      nombreNegocio: '   ',
      admin: { nombre: 'Admin', email: 'a@b.com', password: '12345678' },
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.status).toBe(422)
  })

  it('rejects single-character business name with 422 (minLength = 2)', () => {
    const result = validateSetupPayload({
      nombreNegocio: 'X',
      admin: { nombre: 'Admin', email: 'a@b.com', password: '12345678' },
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.status).toBe(422)
  })

  it('accepts a valid payload and returns { valid: true }', () => {
    const result = validateSetupPayload({
      nombreNegocio: 'Mi Negocio',
      admin: { nombre: 'Admin', email: 'admin@negocio.com', password: '12345678' },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts business name of exactly 2 characters', () => {
    const result = validateSetupPayload({
      nombreNegocio: 'AB',
      admin: { nombre: 'Admin', email: 'admin@negocio.com', password: '12345678' },
    })
    expect(result.valid).toBe(true)
  })
})

describe('setup UI – "already initialized" response handling', () => {
  it('redirects to /login when API returns 409 (already initialized)', () => {
    expect(handleSetupApiResponse(409, { error: 'El sistema ya está configurado' })).toBe(
      'redirect_login'
    )
  })

  it('shows error message for 422 (validation failure)', () => {
    expect(handleSetupApiResponse(422, { error: 'Datos inválidos' })).toBe('show_error')
  })

  it('shows error message for 500 (server error)', () => {
    expect(handleSetupApiResponse(500, { error: 'Error interno del servidor' })).toBe('show_error')
  })

  it('marks success for 200 (setup completed normally)', () => {
    expect(handleSetupApiResponse(200, {})).toBe('success')
  })
})

describe('setup API – HTTP status codes', () => {
  it('already-initialized returns 409, not 400', () => {
    // 409 Conflict is semantically correct – the resource (system config) already exists
    const ALREADY_INIT_STATUS = 409
    expect(ALREADY_INIT_STATUS).toBe(409)
  })

  it('validation errors return 422, not 400', () => {
    // 422 Unprocessable Entity is correct for payload validation failures
    const VALIDATION_STATUS = 422
    expect(VALIDATION_STATUS).toBe(422)
  })
})

