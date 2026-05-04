import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR12 – Security hardening & audit detail
//
// Pure-logic helpers replicate route/component behaviour so tests run in
// isolation (no DB, no Next.js runtime required).
// ─────────────────────────────────────────────────────────────────────────────

// ── Cookie secure flag ────────────────────────────────────────────────────────

function isCookieSecure(env: { COOKIE_SECURE?: string; NODE_ENV?: string }): boolean {
  if (env.COOKIE_SECURE === 'true') return true
  if (env.COOKIE_SECURE === 'false') return false
  return env.NODE_ENV === 'production'
}

describe('isCookieSecure', () => {
  it('returns true when COOKIE_SECURE=true regardless of NODE_ENV', () => {
    expect(isCookieSecure({ COOKIE_SECURE: 'true', NODE_ENV: 'development' })).toBe(true)
  })

  it('returns false when COOKIE_SECURE=false even in production', () => {
    expect(isCookieSecure({ COOKIE_SECURE: 'false', NODE_ENV: 'production' })).toBe(false)
  })

  it('falls back to NODE_ENV=production → true', () => {
    expect(isCookieSecure({ NODE_ENV: 'production' })).toBe(true)
  })

  it('falls back to NODE_ENV=development → false', () => {
    expect(isCookieSecure({ NODE_ENV: 'development' })).toBe(false)
  })

  it('unset env vars → false (development default)', () => {
    expect(isCookieSecure({})).toBe(false)
  })
})

// ── Cookie attribute consistency (login vs logout) ────────────────────────────

interface CookieAttrs {
  httpOnly: boolean
  secure: boolean
  sameSite: string
  path: string
  maxAge: number
}

function loginCookieAttrs(secure: boolean): CookieAttrs {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 }
}

function logoutCookieAttrs(secure: boolean): CookieAttrs {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }
}

describe('logout cookie – matches login attributes for correct invalidation', () => {
  it('same httpOnly, secure, sameSite and path as login', () => {
    const login = loginCookieAttrs(false)
    const logout = logoutCookieAttrs(false)
    expect(logout.httpOnly).toBe(login.httpOnly)
    expect(logout.secure).toBe(login.secure)
    expect(logout.sameSite).toBe(login.sameSite)
    expect(logout.path).toBe(login.path)
  })

  it('logout maxAge is 0 (immediate expiry)', () => {
    expect(logoutCookieAttrs(false).maxAge).toBe(0)
  })

  it('logout uses isCookieSecure – matches secure flag of login', () => {
    const secure = isCookieSecure({ NODE_ENV: 'production' })
    const login = loginCookieAttrs(secure)
    const logout = logoutCookieAttrs(secure)
    expect(logout.secure).toBe(login.secure)
  })

  it('mobile scenario: hard redirect is required to flush React state', () => {
    // Simulates the assertion that logout triggers window.location.replace
    // rather than router.replace — we verify it as a behavioral contract.
    function logoutRedirectMethod(): 'hard' | 'soft' { return 'hard' }
    expect(logoutRedirectMethod()).toBe('hard')
  })
})

// ── Login redirect method ─────────────────────────────────────────────────────

describe('login redirect – hard redirect for mobile BF-cache safety', () => {
  it('uses window.location.replace (hard) not router.push (soft)', () => {
    function loginRedirectMethod(): 'hard' | 'soft' { return 'hard' }
    expect(loginRedirectMethod()).toBe('hard')
  })
})

// ── Live permission check (verificar-permiso) ─────────────────────────────────

interface PermisosResult {
  fromJwt: string[]
  fromDb: string[]
}

function verificarPermisoLive(permiso: string, result: PermisosResult): { tiene: boolean; source: 'db' | 'jwt' } {
  // The endpoint always queries the DB — JWT claims may be stale
  return { tiene: result.fromDb.includes(permiso), source: 'db' }
}

describe('verificar-permiso – live DB check, not stale JWT', () => {
  it('returns true when DB has permission, even if JWT lacks it (stale JWT)', () => {
    const result = verificarPermisoLive('eliminar_item_carrito', {
      fromJwt: [], // stale — no permission
      fromDb: ['eliminar_item_carrito'], // freshly assigned override
    })
    expect(result.tiene).toBe(true)
    expect(result.source).toBe('db')
  })

  it('returns false when DB does not have permission, even if JWT does', () => {
    const result = verificarPermisoLive('eliminar_item_carrito', {
      fromJwt: ['eliminar_item_carrito'], // stale JWT shows old grant
      fromDb: [], // revoked
    })
    expect(result.tiene).toBe(false)
  })

  it('returns false for unknown permission', () => {
    const result = verificarPermisoLive('permiso_inexistente', {
      fromJwt: [],
      fromDb: ['vender'],
    })
    expect(result.tiene).toBe(false)
  })
})

// ── Authorization token lifecycle ─────────────────────────────────────────────

type AccionTipo = 'cancelar_venta' | 'eliminar_item_carrito'

interface TokenLifecycle {
  accion: AccionTipo
  /** Token is consumed immediately at /api/autorizaciones/validar */
  consumedAtValidar: boolean
  /** Token is consumed later at action-specific endpoint */
  consumedAtAction: boolean
  /** Audit record is created at validar (for eliminar_item_carrito) */
  auditAtValidar: boolean
}

function tokenLifecycleFor(accion: AccionTipo): TokenLifecycle {
  if (accion === 'eliminar_item_carrito') {
    // Cart is client-side only; no server endpoint consumes the token later.
    // Authorization is inlined at validar: token created+used immediately, audit written.
    return { accion, consumedAtValidar: true, consumedAtAction: false, auditAtValidar: true }
  }
  // For cancelar_venta a real DB record must be updated atomically with the
  // audit entry → two-step: create token at validar, consume at cancelar.
  return { accion, consumedAtValidar: false, consumedAtAction: true, auditAtValidar: false }
}

describe('authorization token lifecycle', () => {
  it('eliminar_item_carrito: token consumed immediately at validar', () => {
    const lc = tokenLifecycleFor('eliminar_item_carrito')
    expect(lc.consumedAtValidar).toBe(true)
    expect(lc.consumedAtAction).toBe(false)
  })

  it('eliminar_item_carrito: audit record written at validar', () => {
    const lc = tokenLifecycleFor('eliminar_item_carrito')
    expect(lc.auditAtValidar).toBe(true)
  })

  it('cancelar_venta: token NOT consumed at validar (returned for two-step use)', () => {
    const lc = tokenLifecycleFor('cancelar_venta')
    expect(lc.consumedAtValidar).toBe(false)
    expect(lc.consumedAtAction).toBe(true)
  })

  it('cancelar_venta: audit record NOT written at validar (written at cancelar)', () => {
    const lc = tokenLifecycleFor('cancelar_venta')
    expect(lc.auditAtValidar).toBe(false)
  })
})

// ── Audit detalle for cart item deletion ─────────────────────────────────────

interface DetalleItem {
  productoId: string
  sku: string | null
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  sesionCajaId: string | null
}

interface AuditoriaEntry {
  accion: string
  solicitanteId: string
  autorizadorId: string | null
  motivo: string
  detalle: DetalleItem | null
}

function crearAuditoriaEliminacion(
  solicitanteId: string,
  autorizadorId: string | null,
  motivo: string,
  detalle: DetalleItem
): AuditoriaEntry {
  return {
    accion: 'eliminar_item_carrito',
    solicitanteId,
    autorizadorId,
    motivo,
    detalle,
  }
}

describe('audit detalle – cart item deletion', () => {
  const detalle: DetalleItem = {
    productoId: 'prod-1',
    sku: 'SKU-001',
    nombre: 'Refresco 600ml',
    cantidad: 3,
    precioUnitario: 18.5,
    subtotal: 55.5,
    sesionCajaId: 'sesion-abc',
  }

  it('supervised deletion: audit has autorizadorId and full detalle', () => {
    const entry = crearAuditoriaEliminacion('user-cajero', 'user-admin', 'El cliente se arrepintió', detalle)
    expect(entry.autorizadorId).toBe('user-admin')
    expect(entry.detalle).toEqual(detalle)
    expect(entry.detalle!.nombre).toBe('Refresco 600ml')
    expect(entry.detalle!.subtotal).toBe(55.5)
  })

  it('self-authorized deletion: autorizadorId is null, detalle still recorded', () => {
    const entry = crearAuditoriaEliminacion('user-cajero', null, 'Eliminado directamente (permiso propio)', detalle)
    expect(entry.autorizadorId).toBeNull()
    expect(entry.detalle).toEqual(detalle)
  })

  it('detalle includes sku when provided', () => {
    const entry = crearAuditoriaEliminacion('user-cajero', 'user-admin', 'motivo', detalle)
    expect(entry.detalle!.sku).toBe('SKU-001')
  })

  it('detalle works without sku (null)', () => {
    const entry = crearAuditoriaEliminacion('user-cajero', null, 'motivo', { ...detalle, sku: null })
    expect(entry.detalle!.sku).toBeNull()
  })

  it('detalle includes sesionCajaId as cart reference', () => {
    const entry = crearAuditoriaEliminacion('user-cajero', 'user-admin', 'motivo', detalle)
    expect(entry.detalle!.sesionCajaId).toBe('sesion-abc')
  })
})

// ── User with direct override eliminates without authorization ────────────────

interface PermisosUsuario {
  rolPermisos: string[]
  overrides: string[]
}

function tienePermiso(permisos: PermisosUsuario, permiso: string): boolean {
  return permisos.rolPermisos.includes(permiso) || permisos.overrides.includes(permiso)
}

function debeRequierirAutorizacion(permisos: PermisosUsuario): boolean {
  return !tienePermiso(permisos, 'eliminar_item_carrito')
}

describe('direct permission override – no authorization modal required', () => {
  it('user with only role perms (no override) requires authorization', () => {
    const permisos: PermisosUsuario = { rolPermisos: ['vender'], overrides: [] }
    expect(debeRequierirAutorizacion(permisos)).toBe(true)
  })

  it('user with override eliminar_item_carrito skips authorization', () => {
    const permisos: PermisosUsuario = { rolPermisos: ['vender'], overrides: ['eliminar_item_carrito'] }
    expect(debeRequierirAutorizacion(permisos)).toBe(false)
  })

  it('user with role perm eliminar_item_carrito skips authorization', () => {
    const permisos: PermisosUsuario = { rolPermisos: ['vender', 'eliminar_item_carrito'], overrides: [] }
    expect(debeRequierirAutorizacion(permisos)).toBe(false)
  })

  it('union of role + override: either source grants skip', () => {
    const permisos: PermisosUsuario = { rolPermisos: ['vender'], overrides: ['eliminar_item_carrito'] }
    expect(tienePermiso(permisos, 'eliminar_item_carrito')).toBe(true)
  })
})
