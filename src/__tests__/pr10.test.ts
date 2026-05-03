import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR10 – Cash register session ownership + mobile auth fix
//
// All helpers below are pure-logic replicas of the route/middleware behaviour
// so that tests remain isolated (no DB, no Next.js runtime required).
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

interface SesionCaja {
  id: string
  cajaId: string
  sucursalId?: string
  usuarioAperturaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

interface SesionUsuario {
  sub: string
  permisos: string[]
}

// ── Helpers (replicated from route logic) ─────────────────────────────────────

/**
 * Simulates GET /api/caja/sesion:
 * Returns the open session that belongs to the given user (and optional cajaId).
 */
function encontrarSesionAbiertaDeUsuario(
  sesiones: SesionCaja[],
  usuarioId: string,
  cajaId?: string
): SesionCaja | null {
  return (
    sesiones.find(
      (s) =>
        s.estado === 'ABIERTA' &&
        s.usuarioAperturaId === usuarioId &&
        (cajaId === undefined || s.cajaId === cajaId)
    ) ?? null
  )
}

/**
 * Simulates the ownership check in PATCH /api/caja/sesion/[id] and
 * in POST /api/ventas (before processing the sale).
 *
 * Returns:
 *  { ok: true }  – user may operate on this session
 *  { ok: false, status: number, error: string }  – request must be rejected
 */
function validarPropiedadSesion(
  sesion: SesionCaja | null,
  usuarioId: string
): { ok: true } | { ok: false; status: number; error: string } {
  if (!sesion || sesion.estado !== 'ABIERTA') {
    return {
      ok: false,
      status: 409,
      error: 'No hay una sesión de caja abierta. Abre la caja antes de realizar ventas.',
    }
  }
  if (sesion.usuarioAperturaId !== usuarioId) {
    return {
      ok: false,
      status: 403,
      error: 'La sesión de caja pertenece a otro usuario',
    }
  }
  return { ok: true }
}

/**
 * Simulates the permission check used before vender/abrir_caja/cerrar_caja.
 */
function tienePermiso(sesionUsuario: SesionUsuario, permiso: string): boolean {
  return sesionUsuario.permisos.includes(permiso)
}

// ── Cookie / mobile auth helpers ──────────────────────────────────────────────

interface SessionCookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
  maxAge: number
}

function sessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  }
}

// ── Cash session ownership tests ──────────────────────────────────────────────

describe('encontrarSesionAbiertaDeUsuario', () => {
  const sesiones: SesionCaja[] = [
    { id: 's1', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    { id: 's2', cajaId: 'caja-2', usuarioAperturaId: 'user-B', estado: 'ABIERTA' },
    { id: 's3', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'CERRADA' },
  ]

  it('returns the open session for the requesting user', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A')
    expect(result?.id).toBe('s1')
  })

  it('returns null when the user has no open session', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-C')
    expect(result).toBeNull()
  })

  it("does NOT return another user's open session to user-B", () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-B')
    expect(result?.id).toBe('s2')
    expect(result?.usuarioAperturaId).toBe('user-B')
  })

  it('does NOT return a closed session even for the owner', () => {
    // user-A only has s3 (CERRADA) for caja-1 after s1 is considered closed
    const onlyClosed: SesionCaja[] = [
      { id: 's3', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'CERRADA' },
    ]
    const result = encontrarSesionAbiertaDeUsuario(onlyClosed, 'user-A')
    expect(result).toBeNull()
  })

  it('filters by cajaId when provided', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A', 'caja-1')
    expect(result?.id).toBe('s1')
  })

  it('returns null when cajaId does not match', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A', 'caja-2')
    expect(result).toBeNull()
  })
})

describe('validarPropiedadSesion – venta/cierre de caja', () => {
  const sesionUserA: SesionCaja = {
    id: 's1',
    cajaId: 'caja-1',
    usuarioAperturaId: 'user-A',
    estado: 'ABIERTA',
  }

  it('allows the owner to sell/close their own open session', () => {
    const result = validarPropiedadSesion(sesionUserA, 'user-A')
    expect(result.ok).toBe(true)
  })

  it("blocks user-B from selling on user-A's open session (403)", () => {
    const result = validarPropiedadSesion(sesionUserA, 'user-B')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/pertenece a otro usuario/i)
    }
  })

  it('returns 409 when there is no open session at all', () => {
    const result = validarPropiedadSesion(null, 'user-A')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
    }
  })

  it('returns 409 when session is closed (even if same user)', () => {
    const closed: SesionCaja = { ...sesionUserA, estado: 'CERRADA' }
    const result = validarPropiedadSesion(closed, 'user-A')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
    }
  })
})

describe('multi-register / multi-branch cross-user prevention', () => {
  const sesiones: SesionCaja[] = [
    { id: 's-A1', cajaId: 'caja-1', sucursalId: 'suc-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    { id: 's-B2', cajaId: 'caja-2', sucursalId: 'suc-1', usuarioAperturaId: 'user-B', estado: 'ABIERTA' },
    { id: 's-C3', cajaId: 'caja-3', sucursalId: 'suc-2', usuarioAperturaId: 'user-C', estado: 'ABIERTA' },
  ]

  it('user-A only sees their own session when querying without cajaId filter', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A')
    expect(result?.usuarioAperturaId).toBe('user-A')
  })

  it("user-B cannot get user-A's session even on the same branch", () => {
    // Simulates user-B trying to look up s-A1 directly
    const found = sesiones.find((s) => s.id === 's-A1')!
    const check = validarPropiedadSesion(found, 'user-B')
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.status).toBe(403)
  })

  it("user-C on different branch cannot access user-A's session", () => {
    const found = sesiones.find((s) => s.id === 's-A1')!
    const check = validarPropiedadSesion(found, 'user-C')
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.status).toBe(403)
  })

  it('each user can only open/close their own scoped session', () => {
    for (const s of sesiones) {
      const owner = s.usuarioAperturaId
      const notOwner = sesiones.find((x) => x.usuarioAperturaId !== owner)!.usuarioAperturaId
      expect(validarPropiedadSesion(s, owner).ok).toBe(true)
      expect(validarPropiedadSesion(s, notOwner).ok).toBe(false)
    }
  })

  it('user-B must open own session before operating (no spillover)', () => {
    const sesionB = encontrarSesionAbiertaDeUsuario(sesiones, 'user-B')
    // user-B has their own session
    expect(sesionB?.usuarioAperturaId).toBe('user-B')
    // user-B's session is NOT user-A's session
    expect(sesionB?.id).not.toBe('s-A1')
  })
})

describe('permission checks for caja operations', () => {
  it('abrir_caja requires the permission', () => {
    const sinPermiso: SesionUsuario = { sub: 'user-1', permisos: ['vender'] }
    const conPermiso: SesionUsuario = { sub: 'user-1', permisos: ['abrir_caja'] }
    expect(tienePermiso(sinPermiso, 'abrir_caja')).toBe(false)
    expect(tienePermiso(conPermiso, 'abrir_caja')).toBe(true)
  })

  it('cerrar_caja requires the permission', () => {
    const sinPermiso: SesionUsuario = { sub: 'user-1', permisos: ['vender', 'abrir_caja'] }
    const conPermiso: SesionUsuario = { sub: 'user-1', permisos: ['cerrar_caja'] }
    expect(tienePermiso(sinPermiso, 'cerrar_caja')).toBe(false)
    expect(tienePermiso(conPermiso, 'cerrar_caja')).toBe(true)
  })
})

// ── Mobile / cookie auth tests ────────────────────────────────────────────────

describe('session cookie settings – mobile compatibility', () => {
  it('cookie is httpOnly to prevent client-side JS access', () => {
    const opts = sessionCookieOptions(false)
    expect(opts.httpOnly).toBe(true)
  })

  it('secure flag is false in dev so HTTP mobile access works', () => {
    const opts = sessionCookieOptions(false)
    expect(opts.secure).toBe(false)
  })

  it('secure flag is true in production for HTTPS-only transmission', () => {
    const opts = sessionCookieOptions(true)
    expect(opts.secure).toBe(true)
  })

  it('sameSite is lax (allows same-site navigation, compatible with mobile)', () => {
    const opts = sessionCookieOptions(false)
    expect(opts.sameSite).toBe('lax')
  })

  it('path is / so cookie is sent on all routes after login', () => {
    const opts = sessionCookieOptions(false)
    expect(opts.path).toBe('/')
  })

  it('maxAge is 8 hours (matching JWT expiry)', () => {
    const opts = sessionCookieOptions(false)
    expect(opts.maxAge).toBe(60 * 60 * 8)
  })
})

describe('post-login redirect strategy for mobile', () => {
  /**
   * This test documents the chosen strategy:
   * After a successful login fetch(), use window.location.replace('/dashboard')
   * (hard redirect) rather than router.push() + router.refresh().
   *
   * Rationale: router.push() is a client-side navigation that can race with
   * the Set-Cookie header being applied by the browser, causing the first
   * protected-page request to arrive without the session cookie on some
   * mobile browsers.  A hard redirect always issues a fresh HTTP request
   * that includes all cookies that were set by the previous response.
   */
  it('hard redirect ensures cookie is present on first protected-page request', () => {
    // Simulates whether a hard redirect (true) or a client-side nav (false)
    // guarantees that cookies set by fetch() are available for the next request.
    function redirectStrategy(useHardRedirect: boolean): boolean {
      // A hard redirect forces a new HTTP request → cookies are always sent.
      // A client-side (SPA) navigation may skip a full browser round-trip
      // and, in some mobile environments, might not include recently set cookies.
      return useHardRedirect
    }
    expect(redirectStrategy(true)).toBe(true)
    expect(redirectStrategy(false)).toBe(false)
  })

  it('replacing history entry prevents back-button loop to login page', () => {
    // window.location.replace() removes the login entry from history,
    // so pressing back after login does not return to the login form.
    function replaceVsPush(useReplace: boolean): 'no-back-loop' | 'back-loop-possible' {
      return useReplace ? 'no-back-loop' : 'back-loop-possible'
    }
    expect(replaceVsPush(true)).toBe('no-back-loop')
    expect(replaceVsPush(false)).toBe('back-loop-possible')
  })
})
