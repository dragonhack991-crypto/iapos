import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers replicated from auth logic for isolated testing
// ─────────────────────────────────────────────────────────────────────────────

function computeEfectivos(
  permisosRol: string[],
  permisosOverride: string[]
): string[] {
  return Array.from(new Set([...permisosRol, ...permisosOverride]))
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization token helpers (replicated from backend logic for isolation)
// ─────────────────────────────────────────────────────────────────────────────

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

function tienePermisoCancelarVenta(permisos: string[]): boolean {
  return permisos.includes('cancelar_venta')
}

function tienePermisoEliminarItem(permisos: string[]): boolean {
  return permisos.includes('eliminar_item_carrito')
}

function puedeAutorizarCancelacion(permisos: string[]): boolean {
  return permisos.includes('autorizar_cancelacion_venta')
}

function puedeAutorizarEliminacion(permisos: string[]): boolean {
  return permisos.includes('autorizar_eliminacion_carrito')
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('permisos efectivos con overrides de usuario', () => {
  it('incluye permisos del rol cuando no hay overrides', () => {
    const efectivos = computeEfectivos(['ver_dashboard', 'vender'], [])
    expect(efectivos).toContain('ver_dashboard')
    expect(efectivos).toContain('vender')
  })

  it('incluye overrides adicionales sumados a los del rol', () => {
    const efectivos = computeEfectivos(
      ['ver_dashboard', 'vender'],
      ['cancelar_venta', 'autorizar_cancelacion_venta']
    )
    expect(efectivos).toContain('cancelar_venta')
    expect(efectivos).toContain('autorizar_cancelacion_venta')
    expect(efectivos).toContain('ver_dashboard')
    expect(efectivos).toContain('vender')
  })

  it('no duplica permisos que ya están en el rol', () => {
    const efectivos = computeEfectivos(['ver_dashboard', 'cancelar_venta'], ['cancelar_venta'])
    const count = efectivos.filter((p) => p === 'cancelar_venta').length
    expect(count).toBe(1)
  })

  it('puede tener overrides sin permisos de rol (usuario sin rol)', () => {
    const efectivos = computeEfectivos([], ['autorizar_eliminacion_carrito'])
    expect(efectivos).toContain('autorizar_eliminacion_carrito')
    expect(efectivos).toHaveLength(1)
  })
})

describe('regla de permiso cancelar_venta', () => {
  it('Admin (con cancelar_venta) puede cancelar directamente', () => {
    const permisos = ['ver_dashboard', 'vender', 'cancelar_venta', 'administrar_usuarios']
    expect(tienePermisoCancelarVenta(permisos)).toBe(true)
  })

  it('Cajero sin override NO puede cancelar directamente', () => {
    const permisos = ['ver_dashboard', 'vender', 'abrir_caja', 'cerrar_caja']
    expect(tienePermisoCancelarVenta(permisos)).toBe(false)
  })

  it('Cajero con override cancelar_venta sí puede cancelar directamente', () => {
    const permisos = computeEfectivos(
      ['ver_dashboard', 'vender'],
      ['cancelar_venta']
    )
    expect(tienePermisoCancelarVenta(permisos)).toBe(true)
  })
})

describe('regla de permiso eliminar_item_carrito', () => {
  it('usuario con eliminar_item_carrito puede eliminar directamente', () => {
    const permisos = ['ver_dashboard', 'vender', 'eliminar_item_carrito']
    expect(tienePermisoEliminarItem(permisos)).toBe(true)
  })

  it('usuario sin eliminar_item_carrito requiere autorización', () => {
    const permisos = ['ver_dashboard', 'vender']
    expect(tienePermisoEliminarItem(permisos)).toBe(false)
  })
})

describe('validación de autorización para cancelar_venta', () => {
  it('autorizador con autorizar_cancelacion_venta puede autorizar', () => {
    const permisosAutorizador = ['ver_dashboard', 'autorizar_cancelacion_venta']
    expect(puedeAutorizarCancelacion(permisosAutorizador)).toBe(true)
  })

  it('autorizador sin autorizar_cancelacion_venta no puede autorizar', () => {
    const permisosAutorizador = ['ver_dashboard', 'vender']
    expect(puedeAutorizarCancelacion(permisosAutorizador)).toBe(false)
  })

  it('admin tiene autorizar_cancelacion_venta por sus permisos de rol', () => {
    const permisosAdmin = [
      'ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja',
      'administrar_usuarios', 'administrar_inventario', 'ver_reportes',
      'administrar_productos', 'administrar_configuracion',
      'eliminar_item_carrito', 'autorizar_eliminacion_carrito', 'autorizar_cancelacion_venta',
    ]
    expect(puedeAutorizarCancelacion(permisosAdmin)).toBe(true)
  })
})

describe('validación de autorización para eliminar_item_carrito', () => {
  it('autorizador con autorizar_eliminacion_carrito puede autorizar', () => {
    const permisos = ['ver_dashboard', 'autorizar_eliminacion_carrito']
    expect(puedeAutorizarEliminacion(permisos)).toBe(true)
  })

  it('autorizador sin autorizar_eliminacion_carrito no puede autorizar', () => {
    const permisos = ['ver_dashboard', 'vender']
    expect(puedeAutorizarEliminacion(permisos)).toBe(false)
  })

  it('cajero con override autorizar_eliminacion_carrito puede autorizar', () => {
    const permisos = computeEfectivos(
      ['ver_dashboard', 'vender'],
      ['autorizar_eliminacion_carrito']
    )
    expect(puedeAutorizarEliminacion(permisos)).toBe(true)
  })
})

describe('token de autorización — validación', () => {
  const now = new Date()
  const futuro = new Date(now.getTime() + 5 * 60 * 1000)
  const pasado = new Date(now.getTime() - 1000)

  function makeToken(overrides: Partial<AuthToken> = {}): AuthToken {
    return {
      token: 'tok-abc',
      accion: 'cancelar_venta',
      targetId: 'venta-1',
      solicitanteId: 'user-1',
      autorizadorId: 'admin-1',
      motivo: 'Prueba',
      usadoEn: null,
      expiraEn: futuro,
      ...overrides,
    }
  }

  it('token válido pasa la validación', () => {
    const token = makeToken()
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(true)
  })

  it('token null devuelve error', () => {
    const result = validarAuthToken(null, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
  })

  it('token ya usado es rechazado', () => {
    const token = makeToken({ usadoEn: new Date() })
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya fue utilizado')
  })

  it('token expirado es rechazado', () => {
    const token = makeToken({ expiraEn: pasado })
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('expirado')
  })

  it('token con acción incorrecta es rechazado', () => {
    const token = makeToken({ accion: 'eliminar_item_carrito' })
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('acción')
  })

  it('token con targetId diferente es rechazado', () => {
    const token = makeToken({ targetId: 'venta-2' })
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('recurso')
  })

  it('token de otro solicitante es rechazado', () => {
    const token = makeToken({ solicitanteId: 'user-otro' })
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('usuario')
  })

  it('token sin targetId aplica a cualquier target (comodín)', () => {
    const token = makeToken({ targetId: null })
    const result = validarAuthToken(token, 'cancelar_venta', 'cualquier-venta', 'user-1')
    expect(result.ok).toBe(true)
  })
})

describe('flujo completo: cancelar venta con/sin autorización', () => {
  function intentarCancelarVenta(
    permisosUsuario: string[],
    authToken: AuthToken | null,
    ventaId: string,
    solicitanteId: string
  ): { ok: boolean; error?: string; codigo?: string } {
    const tienePermiso = tienePermisoCancelarVenta(permisosUsuario)
    if (tienePermiso) {
      return { ok: true }
    }
    if (!authToken) {
      return { ok: false, error: 'Se requiere autorización', codigo: 'REQUIERE_AUTORIZACION' }
    }
    const validacion = validarAuthToken(authToken, 'cancelar_venta', ventaId, solicitanteId)
    if (!validacion.ok) {
      return { ok: false, error: validacion.error }
    }
    return { ok: true }
  }

  it('admin puede cancelar sin token', () => {
    const permisos = ['cancelar_venta', 'administrar_usuarios']
    const result = intentarCancelarVenta(permisos, null, 'v-1', 'admin-id')
    expect(result.ok).toBe(true)
  })

  it('cajero sin permiso y sin token recibe REQUIERE_AUTORIZACION', () => {
    const permisos = ['ver_dashboard', 'vender']
    const result = intentarCancelarVenta(permisos, null, 'v-1', 'cajero-id')
    expect(result.ok).toBe(false)
    expect(result.codigo).toBe('REQUIERE_AUTORIZACION')
  })

  it('cajero con token válido puede cancelar', () => {
    const permisos = ['ver_dashboard', 'vender']
    const token: AuthToken = {
      token: 'tok-x',
      accion: 'cancelar_venta',
      targetId: 'v-1',
      solicitanteId: 'cajero-id',
      autorizadorId: 'admin-id',
      motivo: 'Error de precio',
      usadoEn: null,
      expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(permisos, token, 'v-1', 'cajero-id')
    expect(result.ok).toBe(true)
  })

  it('cajero no puede usar token de otro solicitante', () => {
    const permisos = ['ver_dashboard', 'vender']
    const token: AuthToken = {
      token: 'tok-x',
      accion: 'cancelar_venta',
      targetId: 'v-1',
      solicitanteId: 'otro-cajero',
      autorizadorId: 'admin-id',
      motivo: 'Motivo',
      usadoEn: null,
      expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(permisos, token, 'v-1', 'cajero-id')
    expect(result.ok).toBe(false)
  })

  it('token usado no se puede reutilizar (single-use)', () => {
    const permisos = ['ver_dashboard', 'vender']
    const token: AuthToken = {
      token: 'tok-x',
      accion: 'cancelar_venta',
      targetId: 'v-1',
      solicitanteId: 'cajero-id',
      autorizadorId: 'admin-id',
      motivo: 'Motivo',
      usadoEn: new Date(), // already used
      expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarCancelarVenta(permisos, token, 'v-1', 'cajero-id')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya fue utilizado')
  })
})

describe('flujo completo: eliminar item carrito con/sin autorización', () => {
  function intentarEliminarItem(
    permisosUsuario: string[],
    authToken: AuthToken | null,
    productoId: string,
    solicitanteId: string
  ): { ok: boolean; error?: string; codigo?: string } {
    const tienePermiso = tienePermisoEliminarItem(permisosUsuario)
    if (tienePermiso) {
      return { ok: true }
    }
    if (!authToken) {
      return { ok: false, error: 'Se requiere autorización', codigo: 'REQUIERE_AUTORIZACION' }
    }
    const validacion = validarAuthToken(authToken, 'eliminar_item_carrito', productoId, solicitanteId)
    if (!validacion.ok) {
      return { ok: false, error: validacion.error }
    }
    return { ok: true }
  }

  it('usuario con eliminar_item_carrito puede eliminar sin token', () => {
    const permisos = ['ver_dashboard', 'vender', 'eliminar_item_carrito']
    const result = intentarEliminarItem(permisos, null, 'prod-1', 'user-1')
    expect(result.ok).toBe(true)
  })

  it('usuario sin permiso recibe REQUIERE_AUTORIZACION', () => {
    const permisos = ['ver_dashboard', 'vender']
    const result = intentarEliminarItem(permisos, null, 'prod-1', 'user-1')
    expect(result.ok).toBe(false)
    expect(result.codigo).toBe('REQUIERE_AUTORIZACION')
  })

  it('usuario con override eliminar_item_carrito puede eliminar sin token', () => {
    const permisos = computeEfectivos(['ver_dashboard', 'vender'], ['eliminar_item_carrito'])
    const result = intentarEliminarItem(permisos, null, 'prod-1', 'user-1')
    expect(result.ok).toBe(true)
  })

  it('usuario con token válido puede eliminar', () => {
    const permisos = ['ver_dashboard', 'vender']
    const token: AuthToken = {
      token: 'tok-y',
      accion: 'eliminar_item_carrito',
      targetId: 'prod-1',
      solicitanteId: 'user-1',
      autorizadorId: 'admin-id',
      motivo: 'Producto equivocado',
      usadoEn: null,
      expiraEn: new Date(Date.now() + 300_000),
    }
    const result = intentarEliminarItem(permisos, token, 'prod-1', 'user-1')
    expect(result.ok).toBe(true)
  })
})

describe('nuevos permisos incluidos en la lista de permisos del sistema', () => {
  const PERMISOS_SISTEMA = [
    'ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja',
    'administrar_usuarios', 'administrar_inventario', 'ver_reportes',
    'administrar_productos', 'administrar_configuracion',
    'eliminar_item_carrito', 'autorizar_eliminacion_carrito', 'autorizar_cancelacion_venta',
  ]

  it('incluye eliminar_item_carrito', () => {
    expect(PERMISOS_SISTEMA).toContain('eliminar_item_carrito')
  })

  it('incluye autorizar_eliminacion_carrito', () => {
    expect(PERMISOS_SISTEMA).toContain('autorizar_eliminacion_carrito')
  })

  it('incluye autorizar_cancelacion_venta', () => {
    expect(PERMISOS_SISTEMA).toContain('autorizar_cancelacion_venta')
  })

  it('cancelar_venta ya existía', () => {
    expect(PERMISOS_SISTEMA).toContain('cancelar_venta')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR10 no-regression: caja session ownership
// ─────────────────────────────────────────────────────────────────────────────

interface SesionCaja {
  id: string
  cajaId: string
  usuarioAperturaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

function obtenerSesionDelUsuario(
  sesiones: SesionCaja[],
  usuarioId: string
): SesionCaja | null {
  return sesiones.find((s) => s.estado === 'ABIERTA' && s.usuarioAperturaId === usuarioId) ?? null
}

function verificarPropiedadSesion(
  sesion: SesionCaja,
  usuarioId: string
): { ok: boolean; status?: number; error?: string } {
  if (sesion.usuarioAperturaId !== usuarioId) {
    return { ok: false, status: 403, error: 'La sesión de caja no pertenece al usuario actual' }
  }
  return { ok: true }
}

function verificarPropiedadSesionVenta(
  sesionCajaId: string,
  sesiones: SesionCaja[],
  usuarioId: string
): { ok: boolean; status?: number; error?: string } {
  const sesion = sesiones.find((s) => s.id === sesionCajaId)
  if (!sesion || sesion.estado !== 'ABIERTA') {
    return { ok: false, status: 409, error: 'No hay una sesión de caja abierta' }
  }
  if (sesion.usuarioAperturaId !== usuarioId) {
    return { ok: false, status: 403, error: 'La sesión de caja no pertenece al usuario actual' }
  }
  return { ok: true }
}

describe('PR10 no-regression: propiedad de sesión de caja', () => {
  const sesiones: SesionCaja[] = [
    { id: 'ses-a', cajaId: 'caja-1', usuarioAperturaId: 'usuario-a', estado: 'ABIERTA' },
    { id: 'ses-b', cajaId: 'caja-2', usuarioAperturaId: 'usuario-b', estado: 'ABIERTA' },
  ]

  describe('GET /api/caja/sesion (obtener sesión activa del usuario)', () => {
    it('usuario-a obtiene su propia sesión', () => {
      const sesion = obtenerSesionDelUsuario(sesiones, 'usuario-a')
      expect(sesion).not.toBeNull()
      expect(sesion?.id).toBe('ses-a')
      expect(sesion?.usuarioAperturaId).toBe('usuario-a')
    })

    it('usuario-b obtiene su propia sesión', () => {
      const sesion = obtenerSesionDelUsuario(sesiones, 'usuario-b')
      expect(sesion).not.toBeNull()
      expect(sesion?.id).toBe('ses-b')
      expect(sesion?.usuarioAperturaId).toBe('usuario-b')
    })

    it('usuario sin sesión abierta obtiene null', () => {
      const sesion = obtenerSesionDelUsuario(sesiones, 'usuario-c')
      expect(sesion).toBeNull()
    })

    it('usuario-a NO ve la sesión de usuario-b', () => {
      const sesion = obtenerSesionDelUsuario(sesiones, 'usuario-a')
      expect(sesion?.id).not.toBe('ses-b')
    })
  })

  describe('GET/PATCH /api/caja/sesion/[id] (operaciones sobre sesión específica)', () => {
    it('usuario-a puede operar sobre su propia sesión', () => {
      const result = verificarPropiedadSesion(sesiones[0], 'usuario-a')
      expect(result.ok).toBe(true)
    })

    it('usuario-b recibe 403 al intentar operar sobre la sesión de usuario-a', () => {
      const result = verificarPropiedadSesion(sesiones[0], 'usuario-b')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.error).toContain('no pertenece')
    })

    it('usuario-a recibe 403 al intentar cerrar la caja de usuario-b', () => {
      const result = verificarPropiedadSesion(sesiones[1], 'usuario-a')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
    })
  })

  describe('POST /api/ventas (vender usando sesión de caja)', () => {
    it('usuario-a puede vender con su propia sesión de caja', () => {
      const result = verificarPropiedadSesionVenta('ses-a', sesiones, 'usuario-a')
      expect(result.ok).toBe(true)
    })

    it('usuario-b recibe 403 si intenta vender con la sesión de caja de usuario-a', () => {
      const result = verificarPropiedadSesionVenta('ses-a', sesiones, 'usuario-b')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
    })

    it('usuario-a recibe 403 si intenta vender con la sesión de caja de usuario-b', () => {
      const result = verificarPropiedadSesionVenta('ses-b', sesiones, 'usuario-a')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
    })

    it('falla con 409 si la sesión no está abierta', () => {
      const sesionesConCerrada: SesionCaja[] = [
        { id: 'ses-c', cajaId: 'caja-3', usuarioAperturaId: 'usuario-a', estado: 'CERRADA' },
      ]
      const result = verificarPropiedadSesionVenta('ses-c', sesionesConCerrada, 'usuario-a')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(409)
    })

    it('falla con 409 si sesión no existe', () => {
      const result = verificarPropiedadSesionVenta('ses-inexistente', sesiones, 'usuario-a')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(409)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría: registro de acciones sensibles
// ─────────────────────────────────────────────────────────────────────────────

interface AuditoriaEvento {
  accion: string
  solicitanteId: string
  autorizadorId: string | null
  targetId: string | null
  motivo: string
  sucursalId: string | null
  cajaId: string | null
}

function construirEventoAuditoria(params: {
  accion: string
  solicitanteId: string
  autorizadorId?: string
  targetId?: string
  motivo: string
  sucursalId?: string
  cajaId?: string
}): AuditoriaEvento {
  return {
    accion: params.accion,
    solicitanteId: params.solicitanteId,
    autorizadorId: params.autorizadorId ?? null,
    targetId: params.targetId ?? null,
    motivo: params.motivo,
    sucursalId: params.sucursalId ?? null,
    cajaId: params.cajaId ?? null,
  }
}

describe('registro de auditoría en acciones sensibles', () => {
  it('cancela venta sin escalación: autorizadorId es null, solicitante es el actor', () => {
    const ev = construirEventoAuditoria({
      accion: 'cancelar_venta',
      solicitanteId: 'admin-id',
      targetId: 'venta-1',
      motivo: 'Solicitud cliente',
      sucursalId: 'suc-1',
      cajaId: 'caja-1',
    })
    expect(ev.accion).toBe('cancelar_venta')
    expect(ev.solicitanteId).toBe('admin-id')
    expect(ev.autorizadorId).toBeNull()
    expect(ev.targetId).toBe('venta-1')
    expect(ev.sucursalId).toBe('suc-1')
    expect(ev.cajaId).toBe('caja-1')
  })

  it('cancela venta con escalación: autorizadorId referencia al autorizador', () => {
    const ev = construirEventoAuditoria({
      accion: 'cancelar_venta',
      solicitanteId: 'cajero-id',
      autorizadorId: 'admin-id',
      targetId: 'venta-2',
      motivo: 'Duplicado',
      sucursalId: 'suc-1',
    })
    expect(ev.solicitanteId).toBe('cajero-id')
    expect(ev.autorizadorId).toBe('admin-id')
    expect(ev.sucursalId).toBe('suc-1')
    expect(ev.cajaId).toBeNull()
  })

  it('elimina ítem carrito con escalación: campos requeridos presentes', () => {
    const ev = construirEventoAuditoria({
      accion: 'eliminar_item_carrito',
      solicitanteId: 'cajero-id',
      autorizadorId: 'admin-id',
      targetId: 'prod-abc',
      motivo: 'Producto equivocado',
    })
    expect(ev.accion).toBe('eliminar_item_carrito')
    expect(ev.autorizadorId).toBe('admin-id')
    expect(ev.targetId).toBe('prod-abc')
  })

  it('evento sin contexto de sucursal: sucursalId y cajaId son null', () => {
    const ev = construirEventoAuditoria({
      accion: 'cancelar_venta',
      solicitanteId: 'admin-id',
      targetId: 'venta-3',
      motivo: 'Error',
    })
    expect(ev.sucursalId).toBeNull()
    expect(ev.cajaId).toBeNull()
  })

  it('todos los campos del evento cumplen el esquema requerido', () => {
    const ev = construirEventoAuditoria({
      accion: 'cancelar_venta',
      solicitanteId: 'user-1',
      autorizadorId: 'user-2',
      targetId: 'v-1',
      motivo: 'Prueba',
      sucursalId: 's-1',
      cajaId: 'c-1',
    })
    expect(typeof ev.accion).toBe('string')
    expect(typeof ev.solicitanteId).toBe('string')
    expect(typeof ev.motivo).toBe('string')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Token scope: acción A no sirve para acción B
// ─────────────────────────────────────────────────────────────────────────────

describe('token scope: un token emitido para acción A no es válido para acción B', () => {
  const futuro = new Date(Date.now() + 300_000)

  it('token de cancelar_venta rechazado en eliminar_item_carrito', () => {
    const token: AuthToken = {
      token: 'tok-scope',
      accion: 'cancelar_venta',
      targetId: null,
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: null,
      expiraEn: futuro,
    }
    const result = validarAuthToken(token, 'eliminar_item_carrito', 'prod-1', 'u-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('acción')
  })

  it('token de eliminar_item_carrito rechazado en cancelar_venta', () => {
    const token: AuthToken = {
      token: 'tok-scope-2',
      accion: 'eliminar_item_carrito',
      targetId: null,
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: null,
      expiraEn: futuro,
    }
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-1', 'u-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('acción')
  })

  it('token con targetId específico rechazado para target diferente', () => {
    const token: AuthToken = {
      token: 'tok-scope-3',
      accion: 'cancelar_venta',
      targetId: 'venta-especifica',
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: null,
      expiraEn: futuro,
    }
    // Same action, different target
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-diferente', 'u-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('recurso')
  })

  it('token con targetId específico aceptado para el target correcto', () => {
    const token: AuthToken = {
      token: 'tok-scope-4',
      accion: 'cancelar_venta',
      targetId: 'venta-especifica',
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: null,
      expiraEn: futuro,
    }
    const result = validarAuthToken(token, 'cancelar_venta', 'venta-especifica', 'u-1')
    expect(result.ok).toBe(true)
  })
})

describe('token TTL: ventana de tiempo', () => {
  it('token emitido ahora con TTL 5 min está vigente', () => {
    const expiraEn = new Date(Date.now() + 5 * 60 * 1000)
    expect(expiraEn > new Date()).toBe(true)
  })

  it('TTL calculado correctamente como 5 minutos desde emisión', () => {
    const ahora = Date.now()
    const expiraEn = new Date(ahora + 5 * 60 * 1000)
    const diffMs = expiraEn.getTime() - ahora
    expect(diffMs).toBe(300_000)
  })

  it('token con TTL vencido hace 1 segundo es rechazado', () => {
    const token: AuthToken = {
      token: 'tok-ttl',
      accion: 'cancelar_venta',
      targetId: null,
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: null,
      expiraEn: new Date(Date.now() - 1000),
    }
    const result = validarAuthToken(token, 'cancelar_venta', 'v-1', 'u-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('expirado')
  })

  it('después de usar el token, usadoEn queda registrado', () => {
    // Simula lo que hace el backend: marca usadoEn = new Date() al consumir
    const ahora = new Date()
    const token: AuthToken = {
      token: 'tok-mark',
      accion: 'cancelar_venta',
      targetId: null,
      solicitanteId: 'u-1',
      autorizadorId: 'admin',
      motivo: 'X',
      usadoEn: ahora,
      expiraEn: new Date(ahora.getTime() + 300_000),
    }
    // Segundo intento con el mismo token (ya marcado como usado)
    const result = validarAuthToken(token, 'cancelar_venta', 'v-1', 'u-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ya fue utilizado')
  })
})
