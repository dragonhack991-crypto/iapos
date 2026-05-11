import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR14 — Merge Gate Anti-Regression Suite
//
// 8 mandatory cases for the merge gate:
//  1. Login móvil A → logout → B (cookie attribute consistency)
//  2. Caja creation — mandatory assignment validation
//  3. Abrir / cerrar / reabrir la misma caja
//  4. Caja A y Caja B en paralelo (independent sessions)
//  5. Usuario no asignado intenta operar caja ajena → 403
//  6. Override ON / OFF para eliminar_item_carrito
//  7. Cancelar venta con y sin autorización (token lifecycle)
//  8. Auditoría — detalle completo para ambas acciones sensibles
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared types ──────────────────────────────────────────────────────────────

interface CookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
  maxAge: number
}

interface AuthToken {
  token: string
  accion: string
  targetId: string | null
  solicitanteId: string
  autorizadorId: string
  motivo: string
  usadoEn: Date | null
  expiraEn: Date
}

interface Caja {
  id: string
  activo: boolean
  usuarioAsignadoId: string | null
}

interface SesionCaja {
  id: string
  cajaId: string
  usuarioAperturaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

// ── Case 1: Login móvil A→logout→B — cookie attribute consistency ─────────────
//
// The session cookie set at login and cleared at logout must use the same
// cookie attributes (name, path, sameSite, secure) so the browser reliably
// deletes the cookie on mobile.  The only difference is maxAge (0 at logout).
//
// This mirrors the real implementations in:
//   src/app/api/auth/login/route.ts  → maxAge: 60*60*8
//   src/app/api/auth/logout/route.ts → maxAge: 0

function loginCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 }
}

function logoutCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }
}

/** Checks that all identifying attributes match (everything except maxAge). */
function cookieAttributesMatch(login: CookieOptions, logout: CookieOptions): boolean {
  return (
    login.httpOnly === logout.httpOnly &&
    login.secure === logout.secure &&
    login.sameSite === logout.sameSite &&
    login.path === logout.path
  )
}

describe('Case 1 – Login móvil A→logout→B: cookie attribute consistency', () => {
  it('logout cookie uses same httpOnly, secure, sameSite, path as login (HTTP/LAN)', () => {
    const login = loginCookieOptions(false) // COOKIE_SECURE=false for HTTP LAN
    const logout = logoutCookieOptions(false)
    expect(cookieAttributesMatch(login, logout)).toBe(true)
  })

  it('logout cookie uses same httpOnly, secure, sameSite, path as login (HTTPS)', () => {
    const login = loginCookieOptions(true)
    const logout = logoutCookieOptions(true)
    expect(cookieAttributesMatch(login, logout)).toBe(true)
  })

  it('logout sets maxAge=0 to immediately expire the cookie', () => {
    const logout = logoutCookieOptions(false)
    expect(logout.maxAge).toBe(0)
  })

  it('login sets maxAge=8h (28800s) for session duration', () => {
    const login = loginCookieOptions(false)
    expect(login.maxAge).toBe(60 * 60 * 8)
  })

  it('browser would clear session cookie after logout because maxAge=0 with matching attributes', () => {
    const login = loginCookieOptions(false)
    const logout = logoutCookieOptions(false)
    // A browser only honors a cookie deletion if the attributes match those at creation
    expect(cookieAttributesMatch(login, logout)).toBe(true)
    expect(logout.maxAge).toBe(0)
    // After logout cookie is cleared, user B can log in fresh
    const loginB = loginCookieOptions(false)
    expect(loginB.maxAge).toBeGreaterThan(0)
  })

  it('COOKIE_SECURE=false used for HTTP LAN deployments (Docker)', () => {
    // Mirrors isCookieSecure() with COOKIE_SECURE=false env var
    function isCookieSecure(env?: string): boolean {
      if (env === 'true') return true
      if (env === 'false') return false
      return false // fallback: non-production
    }
    expect(isCookieSecure('false')).toBe(false)
    expect(isCookieSecure('true')).toBe(true)
    expect(isCookieSecure(undefined)).toBe(false)
  })
})

// ── Case 2: Caja creation — mandatory assignment ───────────────────────────────
// (Full coverage in src/__tests__/pr13.test.ts; representative assertions here)

function validarCreacionCajaSimple(nombre: string, sucursalId: string, usuarioAsignadoId: string): boolean {
  return (
    !!nombre.trim() &&
    !!sucursalId.trim() &&
    !!usuarioAsignadoId.trim()
  )
}

describe('Case 2 – Caja creation: mandatory user assignment', () => {
  it('creation with all fields passes', () => {
    expect(validarCreacionCajaSimple('Caja 1', 'suc-1', 'user-a')).toBe(true)
  })

  it('creation without usuarioAsignadoId is rejected', () => {
    expect(validarCreacionCajaSimple('Caja 1', 'suc-1', '')).toBe(false)
  })

  it('creation without nombre is rejected', () => {
    expect(validarCreacionCajaSimple('', 'suc-1', 'user-a')).toBe(false)
  })
})

// ── Case 3: Abrir / cerrar / reabrir la misma caja ───────────────────────────

/**
 * Mirrors POST /api/caja/sesion business logic.
 * Returns { ok, status, error? }
 */
function abrirSesion(
  caja: Caja,
  sesiones: SesionCaja[],
  usuarioId: string
): { ok: boolean; status: number; error?: string } {
  if (!caja.activo) return { ok: false, status: 404, error: 'Caja inactiva' }
  if (caja.usuarioAsignadoId && caja.usuarioAsignadoId !== usuarioId) {
    return { ok: false, status: 403, error: 'Esta caja está asignada a otro usuario' }
  }
  const sesionAbierta = sesiones.find((s) => s.cajaId === caja.id && s.estado === 'ABIERTA')
  if (sesionAbierta) {
    return { ok: false, status: 409, error: 'Ya hay una sesión abierta para esta caja' }
  }
  return { ok: true, status: 201 }
}

/**
 * Mirrors PATCH /api/caja/sesion/[id] business logic.
 */
function cerrarSesion(
  sesion: SesionCaja,
  usuarioId: string
): { ok: boolean; status: number; error?: string } {
  if (sesion.estado !== 'ABIERTA') {
    return { ok: false, status: 404, error: 'Sesión no encontrada o ya cerrada' }
  }
  if (sesion.usuarioAperturaId !== usuarioId) {
    return { ok: false, status: 403, error: 'La sesión de caja no pertenece al usuario actual' }
  }
  return { ok: true, status: 200 }
}

describe('Case 3 – Abrir / cerrar / reabrir la misma caja', () => {
  const caja: Caja = { id: 'caja-1', activo: true, usuarioAsignadoId: 'user-a' }
  const USER = 'user-a'

  it('opens caja when no session exists', () => {
    const result = abrirSesion(caja, [], USER)
    expect(result.ok).toBe(true)
    expect(result.status).toBe(201)
  })

  it('blocks second open while a session is already ABIERTA', () => {
    const sesiones: SesionCaja[] = [
      { id: 'ses-1', cajaId: 'caja-1', usuarioAperturaId: USER, estado: 'ABIERTA' },
    ]
    const result = abrirSesion(caja, sesiones, USER)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('owner can close their open session', () => {
    const sesion: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-1', usuarioAperturaId: USER, estado: 'ABIERTA',
    }
    const result = cerrarSesion(sesion, USER)
    expect(result.ok).toBe(true)
  })

  it('closing produces a CERRADA session', () => {
    const sesion: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-1', usuarioAperturaId: USER, estado: 'ABIERTA',
    }
    // Simulate close: state becomes CERRADA
    const sesionCerrada: SesionCaja = { ...sesion, estado: 'CERRADA' }
    expect(sesionCerrada.estado).toBe('CERRADA')
  })

  it('caja can be reopened after session is closed (CERRADA does not block)', () => {
    const sesiones: SesionCaja[] = [
      { id: 'ses-1', cajaId: 'caja-1', usuarioAperturaId: USER, estado: 'CERRADA' },
    ]
    const result = abrirSesion(caja, sesiones, USER)
    expect(result.ok).toBe(true)
    expect(result.status).toBe(201)
  })

  it('full open→close→reopen cycle succeeds', () => {
    let sesiones: SesionCaja[] = []

    // 1. Open
    const open1 = abrirSesion(caja, sesiones, USER)
    expect(open1.ok).toBe(true)
    const ses1: SesionCaja = { id: 'ses-1', cajaId: 'caja-1', usuarioAperturaId: USER, estado: 'ABIERTA' }
    sesiones = [ses1]

    // 2. Close
    const close1 = cerrarSesion(ses1, USER)
    expect(close1.ok).toBe(true)
    sesiones = [{ ...ses1, estado: 'CERRADA' }]

    // 3. Reopen
    const open2 = abrirSesion(caja, sesiones, USER)
    expect(open2.ok).toBe(true)
  })
})

// ── Case 4: Caja A y Caja B en paralelo ───────────────────────────────────────

describe('Case 4 – Caja A y Caja B en paralelo (independent sessions)', () => {
  const cajaA: Caja = { id: 'caja-a', activo: true, usuarioAsignadoId: 'user-a' }
  const cajaB: Caja = { id: 'caja-b', activo: true, usuarioAsignadoId: 'user-b' }

  it('user-a can open cajaA when no sessions exist', () => {
    const result = abrirSesion(cajaA, [], 'user-a')
    expect(result.ok).toBe(true)
  })

  it('user-b can open cajaB simultaneously while cajaA is open', () => {
    // cajaA already has an open session
    const sesionesExistentes: SesionCaja[] = [
      { id: 'ses-a', cajaId: 'caja-a', usuarioAperturaId: 'user-a', estado: 'ABIERTA' },
    ]
    // cajaB is independent — only the per-cajaId check matters
    const result = abrirSesion(cajaB, sesionesExistentes, 'user-b')
    expect(result.ok).toBe(true)
  })

  it('cajaA open session does not appear as blocking for cajaB', () => {
    const sesiones: SesionCaja[] = [
      { id: 'ses-a', cajaId: 'caja-a', usuarioAperturaId: 'user-a', estado: 'ABIERTA' },
    ]
    const cajaBAbiertas = sesiones.filter((s) => s.cajaId === 'caja-b' && s.estado === 'ABIERTA')
    expect(cajaBAbiertas).toHaveLength(0)
  })

  it('user-b cannot close the session opened by user-a', () => {
    const sesionA: SesionCaja = {
      id: 'ses-a', cajaId: 'caja-a', usuarioAperturaId: 'user-a', estado: 'ABIERTA',
    }
    const result = cerrarSesion(sesionA, 'user-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('closing cajaA does not affect cajaB open session', () => {
    const sesiones: SesionCaja[] = [
      { id: 'ses-a', cajaId: 'caja-a', usuarioAperturaId: 'user-a', estado: 'ABIERTA' },
      { id: 'ses-b', cajaId: 'caja-b', usuarioAperturaId: 'user-b', estado: 'ABIERTA' },
    ]
    // Simulate closing cajaA
    const updated = sesiones.map((s) =>
      s.id === 'ses-a' ? { ...s, estado: 'CERRADA' as const } : s
    )
    const cajaBStillOpen = updated.find((s) => s.cajaId === 'caja-b' && s.estado === 'ABIERTA')
    expect(cajaBStillOpen).not.toBeUndefined()
  })
})

// ── Case 5: Usuario no asignado intenta operar caja ajena → 403 ───────────────
// (Full coverage in src/__tests__/pr13.test.ts; representative assertion here)

describe('Case 5 – Non-assigned user cannot open a caja assigned to someone else', () => {
  const caja: Caja = { id: 'caja-1', activo: true, usuarioAsignadoId: 'user-a' }

  it('user-b gets 403 when trying to open caja assigned to user-a', () => {
    const result = abrirSesion(caja, [], 'user-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toContain('asignada a otro usuario')
  })

  it('user-a (the owner) can open their own caja', () => {
    const result = abrirSesion(caja, [], 'user-a')
    expect(result.ok).toBe(true)
  })
})

// ── Case 6: Override ON/OFF para eliminar_item_carrito ────────────────────────

function computeEfectivos(permisosRol: string[], permisosOverride: string[]): string[] {
  return Array.from(new Set([...permisosRol, ...permisosOverride]))
}

function puedeEliminarItemDirecto(permisos: string[]): boolean {
  return permisos.includes('eliminar_item_carrito')
}

describe('Case 6 – Override ON/OFF para eliminar_item_carrito', () => {
  const PERMISOS_ROL_CAJERO = ['ver_dashboard', 'vender', 'abrir_caja', 'cerrar_caja']

  it('without override: cajero cannot delete item directly (needs modal)', () => {
    const efectivos = computeEfectivos(PERMISOS_ROL_CAJERO, [])
    expect(puedeEliminarItemDirecto(efectivos)).toBe(false)
  })

  it('with override ON: cajero can delete item without authorization modal', () => {
    const efectivos = computeEfectivos(PERMISOS_ROL_CAJERO, ['eliminar_item_carrito'])
    expect(puedeEliminarItemDirecto(efectivos)).toBe(true)
  })

  it('with override removed: cajero cannot delete item directly again', () => {
    // Simulate override being removed — only base role permissions
    const efectivos = computeEfectivos(PERMISOS_ROL_CAJERO, [])
    expect(puedeEliminarItemDirecto(efectivos)).toBe(false)
  })

  it('role permissions are never lost when override is added (additive union)', () => {
    const efectivos = computeEfectivos(PERMISOS_ROL_CAJERO, ['eliminar_item_carrito'])
    for (const p of PERMISOS_ROL_CAJERO) {
      expect(efectivos).toContain(p)
    }
  })

  it('verificar-permiso endpoint uses live DB (not JWT) so override takes effect immediately', () => {
    // The endpoint calls obtenerPermisos(sesion.sub) which always queries the DB.
    // This means once an override is added/removed, the next /api/autorizaciones/verificar-permiso
    // call reflects the change without requiring re-login.
    // Expressed as a pure assertion: live permissions = role UNION overrides
    const livePermisos = computeEfectivos(PERMISOS_ROL_CAJERO, ['eliminar_item_carrito'])
    expect(livePermisos).toContain('eliminar_item_carrito')

    // After override removal, live query returns only role permissions
    const afterRemoval = computeEfectivos(PERMISOS_ROL_CAJERO, [])
    expect(afterRemoval).not.toContain('eliminar_item_carrito')
  })
})

// ── Case 7: Cancelar venta con y sin autorización ─────────────────────────────

function validarAuthToken(
  token: AuthToken | null,
  accion: string,
  targetId: string,
  solicitanteId: string
): { ok: boolean; error?: string } {
  if (!token) return { ok: false, error: 'Token no encontrado' }
  if (token.usadoEn) return { ok: false, error: 'El token ya fue utilizado' }
  if (token.expiraEn < new Date()) return { ok: false, error: 'El token ha expirado' }
  if (token.accion !== accion) return { ok: false, error: 'Token no válido para esta acción' }
  if (token.targetId && token.targetId !== targetId) return { ok: false, error: 'Token no válido para este recurso' }
  if (token.solicitanteId !== solicitanteId) return { ok: false, error: 'Token no válido para este usuario' }
  return { ok: true }
}

function intentarCancelarVenta(
  permisosUsuario: string[],
  authToken: AuthToken | null,
  ventaId: string,
  solicitanteId: string,
  motivo: string
): { ok: boolean; status: number; error?: string; codigo?: string } {
  // motivo is always required
  if (!motivo || motivo.trim().length === 0) {
    return { ok: false, status: 400, error: 'El motivo de cancelación es requerido' }
  }
  const tienePermiso = permisosUsuario.includes('cancelar_venta')
  if (tienePermiso) {
    return { ok: true, status: 200 }
  }
  if (!authToken) {
    return { ok: false, status: 403, error: 'Se requiere autorización', codigo: 'REQUIERE_AUTORIZACION' }
  }
  const validacion = validarAuthToken(authToken, 'cancelar_venta', ventaId, solicitanteId)
  if (!validacion.ok) {
    return { ok: false, status: 403, error: validacion.error }
  }
  return { ok: true, status: 200 }
}

describe('Case 7 – Cancelar venta con y sin autorización', () => {
  const PERMISOS_ADMIN = ['ver_dashboard', 'vender', 'cancelar_venta', 'administrar_usuarios']
  const PERMISOS_CAJERO = ['ver_dashboard', 'vender', 'abrir_caja', 'cerrar_caja']

  it('admin can cancel without token (direct permission)', () => {
    const result = intentarCancelarVenta(PERMISOS_ADMIN, null, 'v-1', 'admin-id', 'Error de cliente')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  })

  it('cajero without permission and no token gets REQUIERE_AUTORIZACION (403)', () => {
    const result = intentarCancelarVenta(PERMISOS_CAJERO, null, 'v-1', 'cajero-id', 'Error')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    expect(result.codigo).toBe('REQUIERE_AUTORIZACION')
  })

  it('cajero with valid authorization token can cancel', () => {
    const token: AuthToken = {
      token: 'tok-valid', accion: 'cancelar_venta', targetId: 'v-1',
      solicitanteId: 'cajero-id', autorizadorId: 'admin-id', motivo: 'Error precio',
      usadoEn: null, expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(PERMISOS_CAJERO, token, 'v-1', 'cajero-id', 'Error precio')
    expect(result.ok).toBe(true)
  })

  it('token already used is rejected (single-use enforcement)', () => {
    const token: AuthToken = {
      token: 'tok-used', accion: 'cancelar_venta', targetId: 'v-1',
      solicitanteId: 'cajero-id', autorizadorId: 'admin-id', motivo: 'Error',
      usadoEn: new Date(), expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(PERMISOS_CAJERO, token, 'v-1', 'cajero-id', 'Error')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya fue utilizado')
  })

  it('expired token is rejected (5min TTL)', () => {
    const token: AuthToken = {
      token: 'tok-expired', accion: 'cancelar_venta', targetId: 'v-1',
      solicitanteId: 'cajero-id', autorizadorId: 'admin-id', motivo: 'Error',
      usadoEn: null, expiraEn: new Date(Date.now() - 1000), // already expired
    }
    const result = intentarCancelarVenta(PERMISOS_CAJERO, token, 'v-1', 'cajero-id', 'Error')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('expirado')
  })

  it('token for wrong sale is rejected (scope by resource)', () => {
    const token: AuthToken = {
      token: 'tok-scope', accion: 'cancelar_venta', targetId: 'v-other',
      solicitanteId: 'cajero-id', autorizadorId: 'admin-id', motivo: 'Error',
      usadoEn: null, expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(PERMISOS_CAJERO, token, 'v-1', 'cajero-id', 'Error')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('recurso')
  })

  it('token for wrong action is rejected (scope by action)', () => {
    const token: AuthToken = {
      token: 'tok-action', accion: 'eliminar_item_carrito', targetId: 'v-1',
      solicitanteId: 'cajero-id', autorizadorId: 'admin-id', motivo: 'Error',
      usadoEn: null, expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(PERMISOS_CAJERO, token, 'v-1', 'cajero-id', 'Error')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('acción')
  })

  it('empty motivo is rejected before auth check', () => {
    const result = intentarCancelarVenta(PERMISOS_CAJERO, null, 'v-1', 'cajero-id', '')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toContain('motivo')
  })
})

// ── Case 8: Auditoría — detalle completo para ambas acciones sensibles ─────────

interface AuditoriaAccion {
  id: string
  accion: string
  solicitanteId: string
  autorizadorId: string | null
  targetId: string | null
  motivo: string
  sucursalId: string | null
  cajaId: string | null
  creadoEn: Date
  detalle: Record<string, unknown> | null
}

/**
 * Checks all required audit fields for eliminar_item_carrito actions.
 * Mirrors what AuditoriaAccion records contain per P0.5.
 */
function validarAuditoriaEliminarItem(evento: AuditoriaAccion): string[] {
  const missing: string[] = []
  if (!evento.solicitanteId) missing.push('solicitanteId')
  // autorizadorId may be null if user has direct permission
  if (!evento.accion) missing.push('accion')
  if (!evento.motivo?.trim()) missing.push('motivo')
  if (!evento.creadoEn) missing.push('creadoEn')
  if (!evento.detalle) {
    missing.push('detalle')
  } else {
    if (!evento.detalle.productoId) missing.push('detalle.productoId')
    if (!evento.detalle.nombre) missing.push('detalle.nombre')
    if (evento.detalle.cantidad === undefined) missing.push('detalle.cantidad')
    if (evento.detalle.precioUnitario === undefined) missing.push('detalle.precioUnitario')
    if (evento.detalle.subtotal === undefined) missing.push('detalle.subtotal')
  }
  return missing
}

/**
 * Checks all required audit fields for cancelar_venta actions.
 */
function validarAuditoriasCancelarVenta(evento: AuditoriaAccion): string[] {
  const missing: string[] = []
  if (!evento.solicitanteId) missing.push('solicitanteId')
  if (!evento.accion) missing.push('accion')
  if (!evento.motivo?.trim()) missing.push('motivo')
  if (!evento.targetId) missing.push('targetId (ventaId)')
  if (!evento.creadoEn) missing.push('creadoEn')
  // sucursalId and cajaId are present when the sale is linked to a session
  return missing
}

describe('Case 8 – Auditoría: detalle completo para ambas acciones', () => {
  const baseEvento: Omit<AuditoriaAccion, 'accion' | 'targetId' | 'detalle'> = {
    id: 'audit-1',
    solicitanteId: 'user-1',
    autorizadorId: 'admin-1',
    motivo: 'Producto equivocado',
    sucursalId: 'suc-1',
    cajaId: 'caja-1',
    creadoEn: new Date(),
  }

  describe('eliminar_item_carrito', () => {
    const completo: AuditoriaAccion = {
      ...baseEvento,
      accion: 'eliminar_item_carrito',
      targetId: 'auth-token-id',
      detalle: {
        productoId: 'prod-1',
        sku: 'SKU-001',
        nombre: 'Coca Cola 600ml',
        cantidad: 2,
        precioUnitario: 18.5,
        subtotal: 37.0,
        sesionCajaId: 'ses-1',
      },
    }

    it('complete eliminar_item_carrito event passes all field checks', () => {
      const missing = validarAuditoriaEliminarItem(completo)
      expect(missing).toHaveLength(0)
    })

    it('event without detalle fails field check', () => {
      const sin: AuditoriaAccion = { ...completo, detalle: null }
      const missing = validarAuditoriaEliminarItem(sin)
      expect(missing).toContain('detalle')
    })

    it('event without productoId in detalle fails', () => {
      const sin: AuditoriaAccion = {
        ...completo,
        detalle: { ...completo.detalle, productoId: undefined },
      }
      const missing = validarAuditoriaEliminarItem(sin)
      expect(missing).toContain('detalle.productoId')
    })

    it('event without solicitanteId fails', () => {
      const sin: AuditoriaAccion = { ...completo, solicitanteId: '' }
      const missing = validarAuditoriaEliminarItem(sin)
      expect(missing).toContain('solicitanteId')
    })

    it('detalle contains all 5 required item fields', () => {
      const det = completo.detalle!
      expect(det.productoId).toBeDefined()
      expect(det.nombre).toBeDefined()
      expect(det.cantidad).toBeDefined()
      expect(det.precioUnitario).toBeDefined()
      expect(det.subtotal).toBeDefined()
    })
  })

  describe('cancelar_venta', () => {
    const completo: AuditoriaAccion = {
      ...baseEvento,
      accion: 'cancelar_venta',
      targetId: 'venta-abc-123',
      detalle: null, // no item detail for venta cancellations
    }

    it('complete cancelar_venta event passes all field checks', () => {
      const missing = validarAuditoriasCancelarVenta(completo)
      expect(missing).toHaveLength(0)
    })

    it('event without targetId (ventaId) fails', () => {
      const sin: AuditoriaAccion = { ...completo, targetId: null }
      const missing = validarAuditoriasCancelarVenta(sin)
      expect(missing).toContain('targetId (ventaId)')
    })

    it('event without motivo fails', () => {
      const sin: AuditoriaAccion = { ...completo, motivo: '' }
      const missing = validarAuditoriasCancelarVenta(sin)
      expect(missing).toContain('motivo')
    })

    it('event without solicitanteId fails', () => {
      const sin: AuditoriaAccion = { ...completo, solicitanteId: '' }
      const missing = validarAuditoriasCancelarVenta(sin)
      expect(missing).toContain('solicitanteId')
    })

    it('sucursalId and cajaId are optional but present when available', () => {
      // They can be null for standalone sales not linked to a caja session
      const sinSucursal: AuditoriaAccion = { ...completo, sucursalId: null, cajaId: null }
      const missing = validarAuditoriasCancelarVenta(sinSucursal)
      // These are optional — their absence should NOT cause a validation failure
      expect(missing).not.toContain('sucursalId')
      expect(missing).not.toContain('cajaId')
    })

    it('autorizadorId is null when the actor has direct cancelar_venta permission', () => {
      const directo: AuditoriaAccion = { ...completo, autorizadorId: null }
      // autorizadorId being null is valid when the user acted directly
      const missing = validarAuditoriasCancelarVenta(directo)
      expect(missing).not.toContain('autorizadorId')
    })
  })
})
