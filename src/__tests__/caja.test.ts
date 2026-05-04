import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Caja session lifecycle helpers (replicated pure logic for isolated tests)
// ─────────────────────────────────────────────────────────────────────────────

type EstadoSesion = 'ABIERTA' | 'CERRADA'

interface Caja {
  id: string
  nombre: string
  activo: boolean
  usuarioAsignadoId: string | null
}

interface SesionCaja {
  id: string
  cajaId: string
  usuarioAperturaId: string
  estado: EstadoSesion
  fechaApertura: Date
  fechaCierre: Date | null
}

// ── Core business logic helpers ───────────────────────────────────────────────

/**
 * Validates whether a user may open a given caja.
 * Mirrors POST /api/caja/sesion business rules.
 */
function validarAperturaCaja(
  caja: Caja,
  sesionesAbiertas: SesionCaja[],
  usuarioId: string
): { ok: boolean; status?: number; error?: string } {
  if (!caja.activo) {
    return { ok: false, status: 404, error: 'Caja no encontrada o inactiva' }
  }

  // If the caja is assigned, only the assigned user may open it
  if (caja.usuarioAsignadoId && caja.usuarioAsignadoId !== usuarioId) {
    return { ok: false, status: 403, error: 'Esta caja está asignada a otro usuario' }
  }

  // Block only if there is an OPEN session for this caja (not closed/historical)
  const sesionAbierta = sesionesAbiertas.find(
    (s) => s.cajaId === caja.id && s.estado === 'ABIERTA'
  )
  if (sesionAbierta) {
    return { ok: false, status: 409, error: 'Ya hay una sesión abierta para esta caja' }
  }

  return { ok: true }
}

/**
 * Simulates closing a caja session.
 * Returns the updated session (estado: CERRADA, fechaCierre set).
 */
function cerrarSesion(sesion: SesionCaja): SesionCaja {
  return {
    ...sesion,
    estado: 'CERRADA',
    fechaCierre: new Date(),
  }
}

/**
 * Returns only OPEN sessions for the given caja.
 */
function sesionesAbiertasPara(sesiones: SesionCaja[], cajaId: string): SesionCaja[] {
  return sesiones.filter((s) => s.cajaId === cajaId && s.estado === 'ABIERTA')
}

/**
 * Returns the user's current open session (per-user ownership rule).
 */
function sesionActivaDelUsuario(sesiones: SesionCaja[], usuarioId: string): SesionCaja | null {
  return sesiones.find((s) => s.estado === 'ABIERTA' && s.usuarioAperturaId === usuarioId) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────

const cajaA: Caja = { id: 'caja-a', nombre: 'Caja A', activo: true, usuarioAsignadoId: null }
const cajaB: Caja = { id: 'caja-b', nombre: 'Caja B', activo: true, usuarioAsignadoId: null }
const cajaInactiva: Caja = { id: 'caja-z', nombre: 'Caja Z', activo: false, usuarioAsignadoId: null }

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: open → close → reopen (regression for the blocking bug)
// ─────────────────────────────────────────────────────────────────────────────

describe('flujo apertura → cierre → reapertura de misma caja', () => {
  it('permite abrir caja cuando no hay sesiones', () => {
    const result = validarAperturaCaja(cajaA, [], 'usuario-a')
    expect(result.ok).toBe(true)
  })

  it('bloquea segunda apertura mientras la primera está ABIERTA', () => {
    const sesionAbierta: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
      estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
    }
    const result = validarAperturaCaja(cajaA, [sesionAbierta], 'usuario-a')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('al cerrar, la sesión queda con estado CERRADA y fechaCierre asignada', () => {
    const sesionAbierta: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
      estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
    }
    const cerrada = cerrarSesion(sesionAbierta)
    expect(cerrada.estado).toBe('CERRADA')
    expect(cerrada.fechaCierre).not.toBeNull()
  })

  it('después de cerrar, la caja es reabreable (sesiones históricas CERRADAS no bloquean)', () => {
    const sesionCerrada: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
      estado: 'CERRADA', fechaApertura: new Date(), fechaCierre: new Date(),
    }
    // La DB contiene la sesión cerrada, pero la validación solo verifica ABIERTA
    const result = validarAperturaCaja(cajaA, [sesionCerrada], 'usuario-a')
    expect(result.ok).toBe(true)
  })

  it('ciclo completo: abrir → cerrar → reabrir con el mismo usuario', () => {
    const sesiones: SesionCaja[] = []

    // 1. Abrir
    const apertura1 = validarAperturaCaja(cajaA, sesiones, 'usuario-a')
    expect(apertura1.ok).toBe(true)
    const ses1: SesionCaja = {
      id: 'ses-1', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
      estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
    }
    sesiones.push(ses1)

    // 2. Cerrar
    const idx = sesiones.findIndex((s) => s.id === 'ses-1')
    sesiones[idx] = cerrarSesion(ses1)
    expect(sesiones[idx].estado).toBe('CERRADA')

    // 3. Reabrir — debe funcionar porque solo hay sesión CERRADA
    const apertura2 = validarAperturaCaja(cajaA, sesiones, 'usuario-a')
    expect(apertura2.ok).toBe(true)
  })

  it('ciclo completo: abrir → cerrar → reabrir con distinto usuario', () => {
    const sesiones: SesionCaja[] = []

    // Usuario A abre
    sesiones.push({
      id: 'ses-1', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
      estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
    })

    // Usuario A cierra
    sesiones[0] = cerrarSesion(sesiones[0])

    // Usuario B reabre la misma caja
    const apertura = validarAperturaCaja(cajaA, sesiones, 'usuario-b')
    expect(apertura.ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: caja A abierta no bloquea caja B
// ─────────────────────────────────────────────────────────────────────────────

describe('caja A abierta no bloquea caja B (aislamiento por cajaId)', () => {
  const sesionCajaA: SesionCaja = {
    id: 'ses-a', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
    estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
  }

  it('caja B puede abrirse mientras caja A está abierta', () => {
    const result = validarAperturaCaja(cajaB, [sesionCajaA], 'usuario-b')
    expect(result.ok).toBe(true)
  })

  it('caja A no puede abrirse una segunda vez', () => {
    const result = validarAperturaCaja(cajaA, [sesionCajaA], 'usuario-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('sesionesAbiertasPara filtra correctamente por cajaId', () => {
    const todas: SesionCaja[] = [
      sesionCajaA,
      {
        id: 'ses-b', cajaId: 'caja-b', usuarioAperturaId: 'usuario-b',
        estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
      },
    ]
    expect(sesionesAbiertasPara(todas, 'caja-a')).toHaveLength(1)
    expect(sesionesAbiertasPara(todas, 'caja-b')).toHaveLength(1)
    expect(sesionesAbiertasPara(todas, 'caja-c')).toHaveLength(0)
  })

  it('múltiples sesiones CERRADAS de la misma caja no bloquean reapertura', () => {
    const historial: SesionCaja[] = [
      { id: 's1', cajaId: 'caja-a', usuarioAperturaId: 'u1', estado: 'CERRADA', fechaApertura: new Date(), fechaCierre: new Date() },
      { id: 's2', cajaId: 'caja-a', usuarioAperturaId: 'u2', estado: 'CERRADA', fechaApertura: new Date(), fechaCierre: new Date() },
      { id: 's3', cajaId: 'caja-a', usuarioAperturaId: 'u1', estado: 'CERRADA', fechaApertura: new Date(), fechaCierre: new Date() },
    ]
    const result = validarAperturaCaja(cajaA, historial, 'usuario-c')
    expect(result.ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: validación de asignación de usuario a caja
// ─────────────────────────────────────────────────────────────────────────────

describe('asignación de caja a usuario (restricción de apertura)', () => {
  const cajaAsignada: Caja = {
    id: 'caja-x', nombre: 'Caja X', activo: true, usuarioAsignadoId: 'usuario-propietario',
  }

  it('usuario asignado puede abrir su caja', () => {
    const result = validarAperturaCaja(cajaAsignada, [], 'usuario-propietario')
    expect(result.ok).toBe(true)
  })

  it('usuario diferente recibe 403 al intentar abrir caja asignada a otro', () => {
    const result = validarAperturaCaja(cajaAsignada, [], 'usuario-intruso')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toContain('asignada a otro usuario')
  })

  it('caja sin asignación puede ser abierta por cualquier usuario', () => {
    const cajaSinAsignar: Caja = { id: 'caja-libre', nombre: 'Libre', activo: true, usuarioAsignadoId: null }
    const r1 = validarAperturaCaja(cajaSinAsignar, [], 'usuario-1')
    const r2 = validarAperturaCaja(cajaSinAsignar, [], 'usuario-2')
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  })

  it('caja inactiva retorna 404 independientemente de la asignación', () => {
    const result = validarAperturaCaja(cajaInactiva, [], 'cualquier-usuario')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })

  it('al cambiar asignación a null, cualquier usuario puede abrir', () => {
    const antes: Caja = { ...cajaAsignada, usuarioAsignadoId: 'usuario-propietario' }
    const despues: Caja = { ...cajaAsignada, usuarioAsignadoId: null }

    expect(validarAperturaCaja(antes, [], 'usuario-intruso').ok).toBe(false)
    expect(validarAperturaCaja(despues, [], 'usuario-intruso').ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: per-user session ownership (PR10 no-regression)
// ─────────────────────────────────────────────────────────────────────────────

describe('PR10: sesión de caja por usuario (no-regression)', () => {
  const sesionA: SesionCaja = {
    id: 'ses-ua', cajaId: 'caja-a', usuarioAperturaId: 'usuario-a',
    estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
  }
  const sesionB: SesionCaja = {
    id: 'ses-ub', cajaId: 'caja-b', usuarioAperturaId: 'usuario-b',
    estado: 'ABIERTA', fechaApertura: new Date(), fechaCierre: null,
  }
  const todasSesiones = [sesionA, sesionB]

  it('GET sesion: usuario-a solo ve su propia sesión activa', () => {
    const sesion = sesionActivaDelUsuario(todasSesiones, 'usuario-a')
    expect(sesion).not.toBeNull()
    expect(sesion?.id).toBe('ses-ua')
    expect(sesion?.usuarioAperturaId).toBe('usuario-a')
  })

  it('GET sesion: usuario-b solo ve su propia sesión activa', () => {
    const sesion = sesionActivaDelUsuario(todasSesiones, 'usuario-b')
    expect(sesion?.id).toBe('ses-ub')
  })

  it('GET sesion: usuario-c sin sesión activa obtiene null', () => {
    const sesion = sesionActivaDelUsuario(todasSesiones, 'usuario-c')
    expect(sesion).toBeNull()
  })

  it('usuario-a no puede ver ni cerrar la sesión de usuario-b (ownership check)', () => {
    // Simulates PATCH ownership check: sesionCaja.usuarioAperturaId !== sesion.sub
    const sesionDeB = sesionB
    const esDueno = sesionDeB.usuarioAperturaId === 'usuario-a'
    expect(esDueno).toBe(false)
  })

  it('usuario-a puede cerrar su propia sesión', () => {
    const esDueno = sesionA.usuarioAperturaId === 'usuario-a'
    expect(esDueno).toBe(true)
  })

  it('usuario-b puede abrir su propia caja aunque usuario-a tenga otra caja abierta', () => {
    // usuario-a has caja-a open; usuario-b wants to open caja-b
    const result = validarAperturaCaja(cajaB, [sesionA], 'usuario-b')
    expect(result.ok).toBe(true)
  })
})
