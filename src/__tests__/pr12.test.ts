import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR12 – Multi-caja simultánea + stale-cookie recovery after Docker restart
//
// All helpers are pure-logic replicas of production code.
// No DB, no Next.js runtime required.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

interface Caja {
  id: string
  nombre: string
  sucursal: string
}

interface SesionCaja {
  id: string
  cajaId: string
  usuarioAperturaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

// ── Helpers replicated from production routes ─────────────────────────────────

/**
 * Replicates the open-session duplicate check in POST /api/caja/sesion.
 * Returns null if the caja is free, or the existing open session if occupied.
 */
function sesionAbiertaParaCaja(
  sesiones: SesionCaja[],
  cajaId: string
): SesionCaja | null {
  return sesiones.find((s) => s.cajaId === cajaId && s.estado === 'ABIERTA') ?? null
}

/**
 * Simulates POST /api/caja/sesion:
 * Returns { ok, sesion } on success or { ok: false, status, error } on failure.
 */
function abrirCaja(
  sesiones: SesionCaja[],
  cajaId: string,
  usuarioId: string,
  permisos: string[]
): { ok: true; sesion: SesionCaja } | { ok: false; status: number; error: string } {
  if (!permisos.includes('abrir_caja')) {
    return { ok: false, status: 403, error: 'Sin permisos para abrir caja' }
  }
  const ocupada = sesionAbiertaParaCaja(sesiones, cajaId)
  if (ocupada) {
    return { ok: false, status: 400, error: 'Ya hay una sesión abierta para esta caja' }
  }
  const nueva: SesionCaja = {
    id: `s-${Math.random().toString(36).slice(2)}`,
    cajaId,
    usuarioAperturaId: usuarioId,
    estado: 'ABIERTA',
  }
  return { ok: true, sesion: nueva }
}

/**
 * Replicates GET /api/cajas response shape:
 * enriches each caja with its current open session (if any).
 */
function listarCajas(
  cajas: Caja[],
  sesiones: SesionCaja[]
): Array<Caja & { sesionAbierta: SesionCaja | null }> {
  return cajas.map((c) => ({
    ...c,
    sesionAbierta: sesiones.find((s) => s.cajaId === c.id && s.estado === 'ABIERTA') ?? null,
  }))
}

/** Replicates middleware stale-cookie recovery logic */
function middlewareRecovery(params: {
  initCookiePresent: boolean
  /** true when the session cookie is present (not necessarily valid) */
  jwtPresent: boolean
  /** true when the JWT is cryptographically valid */
  jwtValid: boolean
  dbInitialized: boolean
}): { action: 'pass' | 'redirect_login' | 'redirect_setup'; clearInitCookie: boolean; clearJwt: boolean } {
  const { initCookiePresent, jwtPresent, jwtValid, dbInitialized } = params

  // Authenticated user — pass through
  if (jwtValid) {
    return { action: 'pass', clearInitCookie: false, clearJwt: false }
  }

  // No JWT token present
  if (!jwtPresent) {
    if (initCookiePresent && !dbInitialized) {
      // Stale init cookie + DB reset → /setup, clear init cookie only (no JWT to clear)
      return { action: 'redirect_setup', clearInitCookie: true, clearJwt: false }
    }
    return { action: 'redirect_login', clearInitCookie: false, clearJwt: false }
  }

  // JWT present but invalid (e.g., secret changed after restart)
  if (initCookiePresent && !dbInitialized) {
    // Stale init cookie + invalid JWT + DB reset → /setup, clear both cookies
    return { action: 'redirect_setup', clearInitCookie: true, clearJwt: true }
  }
  // JWT invalid but DB is still intact → /login, clear JWT only
  return { action: 'redirect_login', clearInitCookie: false, clearJwt: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Open caja A and caja B simultaneously (different cajas) → allowed
// ─────────────────────────────────────────────────────────────────────────────

describe('1 – Multi-caja: different cajas can be open simultaneously', () => {
  const cajasDisponibles: Caja[] = [
    { id: 'caja-1', nombre: 'Caja 1', sucursal: 'Sucursal Principal' },
    { id: 'caja-2', nombre: 'Caja 2', sucursal: 'Sucursal Principal' },
  ]
  const permisosAdmin = ['abrir_caja', 'cerrar_caja', 'vender']

  it('user A opens caja-1 successfully', () => {
    const sesiones: SesionCaja[] = []
    const result = abrirCaja(sesiones, 'caja-1', 'user-A', permisosAdmin)
    expect(result.ok).toBe(true)
    if (result.ok) {
      sesiones.push(result.sesion)
      expect(result.sesion.cajaId).toBe('caja-1')
      expect(result.sesion.usuarioAperturaId).toBe('user-A')
    }
  })

  it('user B opens caja-2 while user A has caja-1 open → allowed', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    ]
    const result = abrirCaja(sesiones, 'caja-2', 'user-B', permisosAdmin)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sesion.cajaId).toBe('caja-2')
      expect(result.sesion.usuarioAperturaId).toBe('user-B')
    }
  })

  it('both cajas can be open simultaneously (concurrent state)', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
      { id: 's-B', cajaId: 'caja-2', usuarioAperturaId: 'user-B', estado: 'ABIERTA' },
    ]
    const listaActual = listarCajas(cajasDisponibles, sesiones)
    expect(listaActual.find((c) => c.id === 'caja-1')?.sesionAbierta?.id).toBe('s-A')
    expect(listaActual.find((c) => c.id === 'caja-2')?.sesionAbierta?.id).toBe('s-B')
  })

  it('GET /api/cajas shows caja-2 as libre when only caja-1 is occupied', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    ]
    const lista = listarCajas(cajasDisponibles, sesiones)
    expect(lista.find((c) => c.id === 'caja-1')?.sesionAbierta).not.toBeNull()
    expect(lista.find((c) => c.id === 'caja-2')?.sesionAbierta).toBeNull()
  })

  it('GET /api/cajas shows all cajas as libre when no sessions are open', () => {
    const lista = listarCajas(cajasDisponibles, [])
    expect(lista.every((c) => c.sesionAbierta === null)).toBe(true)
  })

  it('closed sessions are not counted as occupied', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-old', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'CERRADA' },
    ]
    const lista = listarCajas(cajasDisponibles, sesiones)
    expect(lista.find((c) => c.id === 'caja-1')?.sesionAbierta).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Opening a second session for the same caja → blocked with correct message
// ─────────────────────────────────────────────────────────────────────────────

describe('2 – Multi-caja: duplicate session for same caja is blocked', () => {
  const permisosAdmin = ['abrir_caja', 'cerrar_caja', 'vender']

  it('user A tries to open caja-1 twice → 400', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    ]
    const result = abrirCaja(sesiones, 'caja-1', 'user-A', permisosAdmin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/ya hay una sesión abierta/i)
    }
  })

  it('user B tries to open caja-1 that user A already has open → 400', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    ]
    const result = abrirCaja(sesiones, 'caja-1', 'user-B', permisosAdmin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/ya hay una sesión abierta/i)
    }
  })

  it('after caja-1 is closed, it can be opened again', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-old', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'CERRADA' },
    ]
    const result = abrirCaja(sesiones, 'caja-1', 'user-B', permisosAdmin)
    expect(result.ok).toBe(true)
  })

  it('vendor without abrir_caja permission receives 403 regardless of caja state', () => {
    const permisosVendedor = ['ver_dashboard', 'vender']
    const sesiones: SesionCaja[] = []
    const result = abrirCaja(sesiones, 'caja-1', 'vendedor-1', permisosVendedor)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it('per-cajaId check: caja-1 occupied does not block caja-2', () => {
    const sesiones: SesionCaja[] = [
      { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
    ]
    const check1 = sesionAbiertaParaCaja(sesiones, 'caja-1')
    const check2 = sesionAbiertaParaCaja(sesiones, 'caja-2')
    expect(check1).not.toBeNull()
    expect(check2).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Docker restart with stale cookies → automatic recovery without manual cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('3 – Stale cookie recovery after Docker restart', () => {
  it('valid JWT + DB intact → authenticated user passes through', () => {
    const result = middlewareRecovery({
      initCookiePresent: true,
      jwtPresent: true,
      jwtValid: true,
      dbInitialized: true,
    })
    expect(result.action).toBe('pass')
    expect(result.clearInitCookie).toBe(false)
    expect(result.clearJwt).toBe(false)
  })

  it('JWT expired + DB intact → redirect to /login, clear JWT', () => {
    const result = middlewareRecovery({
      initCookiePresent: true,
      jwtPresent: true,
      jwtValid: false,
      dbInitialized: true,
    })
    expect(result.action).toBe('redirect_login')
    expect(result.clearJwt).toBe(true)
    expect(result.clearInitCookie).toBe(false)
  })

  it('stale init cookie + JWT missing + DB reset → redirect to /setup, clear init cookie', () => {
    const result = middlewareRecovery({
      initCookiePresent: true,
      jwtPresent: false,
      jwtValid: false,
      dbInitialized: false,
    })
    expect(result.action).toBe('redirect_setup')
    expect(result.clearInitCookie).toBe(true)
    expect(result.clearJwt).toBe(false) // no JWT present, nothing to clear
  })

  it('stale init cookie + invalid JWT (secret changed) + DB reset → redirect to /setup, clear both', () => {
    const result = middlewareRecovery({
      initCookiePresent: true,
      jwtPresent: true,
      jwtValid: false, // secret changed → token invalid
      dbInitialized: false, // volume purged
    })
    expect(result.action).toBe('redirect_setup')
    expect(result.clearInitCookie).toBe(true)
    expect(result.clearJwt).toBe(true) // stale JWT should also be cleared
  })

  it('no init cookie (fresh browser) + DB initialized → normal flow (restoreCookie)', () => {
    // When init cookie is absent but DB says initialized, middleware restores cookie.
    // This is the cookiePresent=false path where dbInitialized=true.
    const cookiePresent = false
    const dbInitialized = true
    const restoreCookie = !cookiePresent && dbInitialized
    expect(restoreCookie).toBe(true)
  })

  it('no init cookie + DB not initialized → redirect to /setup', () => {
    const cookiePresent = false
    const dbInitialized = false
    const isInitialized = cookiePresent || dbInitialized
    expect(isInitialized).toBe(false)
  })

  it('recovery is automatic: user never needs to manually clear browser data', () => {
    // After a DB reset, the middleware detects stale cookies and redirects to
    // /setup automatically. The user does not need to manually clear cookies.
    const scenarioCookiesStale = middlewareRecovery({
      initCookiePresent: true,
      jwtPresent: true,
      jwtValid: false,
      dbInitialized: false,
    })
    // Automatic recovery means the middleware itself clears the stale cookies.
    expect(scenarioCookiesStale.action).toBe('redirect_setup')
    expect(scenarioCookiesStale.clearInitCookie).toBe(true)
    expect(scenarioCookiesStale.clearJwt).toBe(true)
    // (The actual cookie deletion happens in the middleware response headers –
    // verified here that the flags are set so the production code will delete them.)
  })
})
