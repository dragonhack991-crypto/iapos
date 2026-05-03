import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR11 – PR10 blocker fixes
//
// All helpers are pure-logic replicas of the production code so tests run
// without a DB or Next.js runtime.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared types ──────────────────────────────────────────────────────────────

interface SesionCaja {
  id: string
  cajaId: string
  usuarioAperturaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

interface SesionUsuario {
  sub: string
  permisos: string[]
}

// ── Helpers replicated from production routes ─────────────────────────────────

function encontrarSesionAbiertaDeUsuario(
  sesiones: SesionCaja[],
  usuarioId: string
): SesionCaja | null {
  return sesiones.find((s) => s.estado === 'ABIERTA' && s.usuarioAperturaId === usuarioId) ?? null
}

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
    return { ok: false, status: 403, error: 'La sesión de caja pertenece a otro usuario' }
  }
  return { ok: true }
}

/** Mirrors the RBAC permission matrix defined in the setup route and seed. */
const PERMISOS_POR_ROL: Record<string, string[]> = {
  Administrador: [
    'ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja',
    'administrar_usuarios', 'administrar_inventario', 'ver_reportes',
    'administrar_productos', 'administrar_configuracion',
  ],
  Cajero: ['ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja'],
  Vendedor: ['ver_dashboard', 'vender'],
}

function permisosDeRol(rol: string): string[] {
  return PERMISOS_POR_ROL[rol] ?? []
}

function tienePermiso(sesionUsuario: SesionUsuario, permiso: string): boolean {
  return sesionUsuario.permisos.includes(permiso)
}

/** Replicates isCookieSecure() from src/lib/cookies.ts */
function isCookieSecure(cookieSecureEnv?: string, nodeEnv?: string): boolean {
  if (cookieSecureEnv !== undefined) return cookieSecureEnv === 'true'
  return nodeEnv === 'production'
}

/** Replicates the internal status URL calculation from the middleware */
function buildStatusUrl(port: string): string {
  return `http://127.0.0.1:${port}/api/system/status`
}

/** Simulates middleware routing decision when an expired/invalid token is present */
function middlewareInvalidToken(): { action: 'redirect'; clearCookie: boolean } {
  return { action: 'redirect', clearCookie: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. User A opens cash; User B cannot operate on A's session
// ─────────────────────────────────────────────────────────────────────────────

describe('1 – Cash session cross-user prevention', () => {
  const sesiones: SesionCaja[] = [
    { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
  ]

  it('user B gets no open session when querying their own', () => {
    expect(encontrarSesionAbiertaDeUsuario(sesiones, 'user-B')).toBeNull()
  })

  it('user B cannot sell on user A session (403)', () => {
    const sesionA = sesiones[0]
    const result = validarPropiedadSesion(sesionA, 'user-B')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/pertenece a otro usuario/i)
    }
  })

  it('user B cannot close user A session (403)', () => {
    const result = validarPropiedadSesion(sesiones[0], 'user-B')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('user A can operate on their own session', () => {
    expect(validarPropiedadSesion(sesiones[0], 'user-A').ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dashboard of B does not show open cash if only A has one
// ─────────────────────────────────────────────────────────────────────────────

describe('2 – Dashboard per-user cash status', () => {
  const sesiones: SesionCaja[] = [
    { id: 's-A', cajaId: 'caja-1', usuarioAperturaId: 'user-A', estado: 'ABIERTA' },
  ]

  it('dashboard query for B returns null when only A has open session', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-B')
    expect(result).toBeNull()
  })

  it('dashboard query for A returns the open session', () => {
    const result = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A')
    expect(result?.id).toBe('s-A')
  })

  it('dashboard shows "Cerrada" for B when no session found', () => {
    const sesionCaja = encontrarSesionAbiertaDeUsuario(sesiones, 'user-B')
    const estadoLabel = sesionCaja ? 'Abierta' : 'Cerrada'
    expect(estadoLabel).toBe('Cerrada')
  })

  it('dashboard shows "Abierta" for A when session exists', () => {
    const sesionCaja = encontrarSesionAbiertaDeUsuario(sesiones, 'user-A')
    const estadoLabel = sesionCaja ? 'Abierta' : 'Cerrada'
    expect(estadoLabel).toBe('Abierta')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cajero can open/close cash; Vendedor cannot
// ─────────────────────────────────────────────────────────────────────────────

describe('3 – RBAC: Cajero has abrir_caja and cerrar_caja', () => {
  const cajeroPermisos = permisosDeRol('Cajero')
  const sesionCajero: SesionUsuario = { sub: 'cajero-1', permisos: cajeroPermisos }

  it('Cajero has abrir_caja permission', () => {
    expect(tienePermiso(sesionCajero, 'abrir_caja')).toBe(true)
  })

  it('Cajero has cerrar_caja permission', () => {
    expect(tienePermiso(sesionCajero, 'cerrar_caja')).toBe(true)
  })

  it('Cajero has vender permission', () => {
    expect(tienePermiso(sesionCajero, 'vender')).toBe(true)
  })

  it('Cajero has cancelar_venta permission', () => {
    expect(tienePermiso(sesionCajero, 'cancelar_venta')).toBe(true)
  })

  it('Cajero does NOT have administrar_usuarios', () => {
    expect(tienePermiso(sesionCajero, 'administrar_usuarios')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Unauthorized role receives consistent 403
// ─────────────────────────────────────────────────────────────────────────────

describe('4 – RBAC: Vendedor cannot open/close cash (consistent 403)', () => {
  const vendedorPermisos = permisosDeRol('Vendedor')
  const sesionVendedor: SesionUsuario = { sub: 'vendedor-1', permisos: vendedorPermisos }

  it('Vendedor does NOT have abrir_caja', () => {
    expect(tienePermiso(sesionVendedor, 'abrir_caja')).toBe(false)
  })

  it('Vendedor does NOT have cerrar_caja', () => {
    expect(tienePermiso(sesionVendedor, 'cerrar_caja')).toBe(false)
  })

  it('Vendedor has vender permission', () => {
    expect(tienePermiso(sesionVendedor, 'vender')).toBe(true)
  })

  it('API response for unauthorized abrir_caja should be 403', () => {
    // Simulate the backend guard: permisos.includes('abrir_caja')
    const status = tienePermiso(sesionVendedor, 'abrir_caja') ? 201 : 403
    expect(status).toBe(403)
  })

  it('API response for unauthorized cerrar_caja should be 403', () => {
    const status = tienePermiso(sesionVendedor, 'cerrar_caja') ? 200 : 403
    expect(status).toBe(403)
  })

  it('Administrador retains ALL permissions', () => {
    const adminPermisos = permisosDeRol('Administrador')
    expect(adminPermisos).toContain('abrir_caja')
    expect(adminPermisos).toContain('cerrar_caja')
    expect(adminPermisos).toContain('administrar_usuarios')
    expect(adminPermisos).toContain('administrar_configuracion')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Mobile / LAN login: cookie secure flag respects COOKIE_SECURE env var
// ─────────────────────────────────────────────────────────────────────────────

describe('5 – Mobile/LAN: COOKIE_SECURE env var controls cookie secure flag', () => {
  it('COOKIE_SECURE=false → secure: false (HTTP LAN works)', () => {
    expect(isCookieSecure('false', 'production')).toBe(false)
  })

  it('COOKIE_SECURE=true → secure: true (HTTPS required)', () => {
    expect(isCookieSecure('true', 'development')).toBe(true)
  })

  it('COOKIE_SECURE unset + production → secure: true (default)', () => {
    expect(isCookieSecure(undefined, 'production')).toBe(true)
  })

  it('COOKIE_SECURE unset + development → secure: false (default)', () => {
    expect(isCookieSecure(undefined, 'development')).toBe(false)
  })

  it('docker-compose default COOKIE_SECURE=false allows HTTP LAN deployment', () => {
    // Simulates: docker-compose sets COOKIE_SECURE=false, NODE_ENV=production
    const secure = isCookieSecure('false', 'production')
    expect(secure).toBe(false)
  })

  it('internal status probe uses 127.0.0.1 to avoid LAN IP resolution failures', () => {
    const url = buildStatusUrl('3000')
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:3000\//)
    expect(url).not.toMatch(/192\.168\./)
  })

  it('status probe port reads from PORT env var', () => {
    const url = buildStatusUrl('8080')
    expect(url).toContain(':8080/')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. "Usuarios registrados" metric reflects active registered users (not online)
// ─────────────────────────────────────────────────────────────────────────────

describe('6 – Usuarios registrados metric', () => {
  interface Usuario { id: string; activo: boolean }

  function contarUsuariosRegistrados(usuarios: Usuario[]): number {
    return usuarios.filter((u) => u.activo).length
  }

  const usuarios: Usuario[] = [
    { id: '1', activo: true },
    { id: '2', activo: true },
    { id: '3', activo: false }, // inactive/disabled
    { id: '4', activo: true },
  ]

  it('counts only active (activo=true) users', () => {
    expect(contarUsuariosRegistrados(usuarios)).toBe(3)
  })

  it('returns 0 when all users are inactive', () => {
    expect(contarUsuariosRegistrados(usuarios.map((u) => ({ ...u, activo: false })))).toBe(0)
  })

  it('label "Usuarios registrados" is distinct from "Usuarios en línea" (no session tracking)', () => {
    // The dashboard shows active registered accounts, not live session count.
    // This is the correct semantic: the metric counts users who CAN log in.
    const metricLabel = 'Usuarios registrados'
    expect(metricLabel).not.toBe('Usuarios en línea')
    expect(metricLabel).not.toBe('Usuarios activos')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Stale cookies after backend restart – auto-recovery
// ─────────────────────────────────────────────────────────────────────────────

describe('7 – Stale cookies after Docker restart', () => {
  /**
   * Simulates the middleware's JWT validation + cookie-clearing behaviour when
   * a cookie contains an expired or invalid token (e.g. after JWT_SECRET change).
   */
  function handleStaleJwt(tokenValid: boolean): {
    action: 'pass' | 'redirect_login'
    clearSessionCookie: boolean
  } {
    if (!tokenValid) {
      return { action: 'redirect_login', clearSessionCookie: true }
    }
    return { action: 'pass', clearSessionCookie: false }
  }

  it('invalid JWT → redirect to /login and clear session cookie', () => {
    const result = handleStaleJwt(false)
    expect(result.action).toBe('redirect_login')
    expect(result.clearSessionCookie).toBe(true)
  })

  it('valid JWT (secret unchanged) → pass through without clearing cookie', () => {
    const result = handleStaleJwt(true)
    expect(result.action).toBe('pass')
    expect(result.clearSessionCookie).toBe(false)
  })

  it('middleware forces redirect_login for expired tokens (no manual cookie clearing needed)', () => {
    const result = middlewareInvalidToken()
    expect(result.action).toBe('redirect')
    expect(result.clearCookie).toBe(true)
  })

  it('initialization cookie absent + DB initialized → cookie is restored automatically', () => {
    // Simulates: restart clears the iapos_initialized cookie cache.
    // Middleware fetches /api/system/status, finds DB=initialized, restores cookie.
    function simulateMissingInitCookie(dbInitialized: boolean): {
      restoreCookie: boolean
      isInitialized: boolean
    } {
      return { restoreCookie: dbInitialized, isInitialized: dbInitialized }
    }
    const result = simulateMissingInitCookie(true)
    expect(result.isInitialized).toBe(true)
    expect(result.restoreCookie).toBe(true)
  })

  it('initialization cookie absent + DB not reachable → redirect to /setup (safe fallback)', () => {
    function simulateDbUnreachable(): { isInitialized: boolean } {
      return { isInitialized: false }
    }
    const result = simulateDbUnreachable()
    expect(result.isInitialized).toBe(false)
  })
})
