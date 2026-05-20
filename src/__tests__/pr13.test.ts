import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// PR13 – Mobile login regression fix + caja assignment enforcement
//
// Covers:
//  1. Middleware status probe uses 127.0.0.1:PORT (LAN IP must not be used)
//  2. Ownership check: assigned user can open their caja
//  3. Ownership check: non-owner cannot open a caja assigned to someone else
//  4. Cannot create a caja without a required user assignment
//  5. Cannot assign the same user to multiple cajas (unique assignment)
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Middleware status probe URL ────────────────────────────────────────────

/**
 * Replicates the status probe URL construction from src/middleware.ts.
 *
 * The probe MUST use http://127.0.0.1:PORT so that it always reaches the
 * local Next.js process from within Docker, regardless of whether the
 * inbound request came from localhost or a LAN IP (mobile device over LAN).
 *
 * Using `new URL('/api/system/status', request.url)` breaks for mobile
 * devices on LAN because `request.url` would be e.g. http://192.168.1.100:3000
 * and that LAN IP may not be routable from inside the Docker container.
 */
function buildStatusProbeUrl(port: string | undefined): string {
  const p = port || '3000'
  return `http://127.0.0.1:${p}/api/system/status`
}

describe('middleware – status probe URL (mobile LAN safety)', () => {
  it('always targets 127.0.0.1, not a LAN IP', () => {
    const url = buildStatusProbeUrl('3000')
    expect(url).toContain('127.0.0.1')
    expect(url).not.toMatch(/192\.168\./)
    expect(url).not.toMatch(/10\.0\./)
  })

  it('uses PORT env var when available', () => {
    const url = buildStatusProbeUrl('4000')
    expect(url).toBe('http://127.0.0.1:4000/api/system/status')
  })

  it('falls back to port 3000 when PORT is undefined', () => {
    const url = buildStatusProbeUrl(undefined)
    expect(url).toBe('http://127.0.0.1:3000/api/system/status')
  })

  it('never uses request.url as base (LAN IP would break Docker routing)', () => {
    const lanRequestUrl = 'http://192.168.1.100:3000/login'
    const probeFromLan = new URL('/api/system/status', lanRequestUrl).toString()
    const correctProbe = buildStatusProbeUrl('3000')
    // The two approaches give different URLs; the 127.0.0.1 one is correct
    expect(probeFromLan).not.toBe(correctProbe)
    expect(probeFromLan).toContain('192.168.1.100')
    expect(correctProbe).toContain('127.0.0.1')
  })
})

// ── 2 & 3. Caja ownership logic ────────────────────────────────────────────────

interface Caja {
  id: string
  nombre: string
  activo: boolean
  usuarioAsignadoId: string | null
}

interface SesionAbierta {
  cajaId: string
  estado: 'ABIERTA' | 'CERRADA'
}

/**
 * Mirrors the ownership + availability check in POST /api/caja/sesion.
 */
function validarAperturaCaja(
  caja: Caja,
  sesiones: SesionAbierta[],
  usuarioId: string
): { ok: boolean; status: number; error?: string } {
  if (!caja.activo) {
    return { ok: false, status: 404, error: 'Caja no encontrada o inactiva' }
  }
  if (caja.usuarioAsignadoId && caja.usuarioAsignadoId !== usuarioId) {
    return { ok: false, status: 403, error: 'Esta caja está asignada a otro usuario' }
  }
  const sesionAbierta = sesiones.find((s) => s.cajaId === caja.id && s.estado === 'ABIERTA')
  if (sesionAbierta) {
    return { ok: false, status: 409, error: 'Ya hay una sesión abierta para esta caja' }
  }
  return { ok: true, status: 200 }
}

describe('caja ownership – assigned user can open their caja', () => {
  const caja: Caja = { id: 'c1', nombre: 'Caja 1', activo: true, usuarioAsignadoId: 'user-a' }

  it('owner can open their assigned caja (no open session)', () => {
    const result = validarAperturaCaja(caja, [], 'user-a')
    expect(result.ok).toBe(true)
  })

  it('owner cannot open if a session is already open', () => {
    const result = validarAperturaCaja(caja, [{ cajaId: 'c1', estado: 'ABIERTA' }], 'user-a')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('owner can open after a previous session was closed', () => {
    const result = validarAperturaCaja(caja, [{ cajaId: 'c1', estado: 'CERRADA' }], 'user-a')
    expect(result.ok).toBe(true)
  })
})

describe('caja ownership – non-owner cannot open caja assigned to someone else', () => {
  const caja: Caja = { id: 'c1', nombre: 'Caja 1', activo: true, usuarioAsignadoId: 'user-a' }

  it('non-owner is rejected with 403', () => {
    const result = validarAperturaCaja(caja, [], 'user-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toContain('asignada a otro usuario')
  })

  it('unassigned caja can be opened by anyone', () => {
    const unassigned: Caja = { ...caja, usuarioAsignadoId: null }
    const result = validarAperturaCaja(unassigned, [], 'user-b')
    expect(result.ok).toBe(true)
  })
})

// ── 4. Mandatory user assignment on caja creation ─────────────────────────────

/**
 * Mirrors the Zod schema validation in POST /api/caja/cajas.
 */
function validarCreacionCaja(data: {
  nombre: string
  sucursalId: string
  usuarioAsignadoId: string
}): { ok: boolean; errors?: string[] } {
  const errors: string[] = []
  if (!data.nombre || data.nombre.trim().length === 0) errors.push('El nombre es requerido')
  if (!data.sucursalId || data.sucursalId.trim().length === 0) errors.push('La sucursal es requerida')
  // Mandatory: must be a non-empty string
  if (!data.usuarioAsignadoId || data.usuarioAsignadoId.trim().length === 0) {
    errors.push('El usuario asignado es requerido')
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

describe('caja creation – user assignment is mandatory', () => {
  it('valid creation with all required fields passes', () => {
    const result = validarCreacionCaja({
      nombre: 'Caja 1',
      sucursalId: 'suc-1',
      usuarioAsignadoId: 'user-a',
    })
    expect(result.ok).toBe(true)
  })

  it('fails when usuarioAsignadoId is empty string', () => {
    const result = validarCreacionCaja({ nombre: 'Caja 1', sucursalId: 'suc-1', usuarioAsignadoId: '' })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('El usuario asignado es requerido')
  })

  it('fails when usuarioAsignadoId is whitespace only', () => {
    const result = validarCreacionCaja({ nombre: 'Caja 1', sucursalId: 'suc-1', usuarioAsignadoId: '   ' })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('El usuario asignado es requerido')
  })

  it('fails when nombre is missing', () => {
    const result = validarCreacionCaja({ nombre: '', sucursalId: 'suc-1', usuarioAsignadoId: 'user-a' })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('El nombre es requerido')
  })
})

// ── 5. Unique assignment: one user → one caja ─────────────────────────────────

interface CajaConUsuario {
  id: string
  nombre: string
  activo: boolean
  usuarioAsignadoId: string | null
}

/**
 * Mirrors the uniqueness check in POST /api/caja/cajas and
 * PATCH /api/caja/cajas/[id].
 *
 * Returns the conflicting caja if found, null otherwise.
 */
function verificarAsignacionUnica(
  cajas: CajaConUsuario[],
  usuarioId: string,
  cajaExcluidaId?: string
): CajaConUsuario | null {
  return (
    cajas.find(
      (c) =>
        c.activo &&
        c.usuarioAsignadoId === usuarioId &&
        c.id !== cajaExcluidaId
    ) ?? null
  )
}

describe('unique assignment – one user cannot be assigned to multiple cajas', () => {
  const cajas: CajaConUsuario[] = [
    { id: 'c1', nombre: 'Caja 1', activo: true, usuarioAsignadoId: 'user-a' },
    { id: 'c2', nombre: 'Caja 2', activo: true, usuarioAsignadoId: 'user-b' },
    { id: 'c3', nombre: 'Caja 3', activo: false, usuarioAsignadoId: 'user-a' }, // inactive
  ]

  it('detects conflict when user already has an active caja', () => {
    const conflicto = verificarAsignacionUnica(cajas, 'user-a')
    expect(conflicto).not.toBeNull()
    expect(conflicto!.nombre).toBe('Caja 1')
  })

  it('no conflict when user has no active caja', () => {
    const conflicto = verificarAsignacionUnica(cajas, 'user-c')
    expect(conflicto).toBeNull()
  })

  it('inactive caja does not count as a conflict', () => {
    // user-a has c1 (active) and c3 (inactive). Only c1 matters.
    const conflicto = verificarAsignacionUnica(cajas, 'user-a')
    expect(conflicto!.id).toBe('c1') // active one
  })

  it('excludes self-caja when reassigning (PATCH scenario)', () => {
    // Reassigning user-a to caja c1 (same caja) — not a conflict with itself
    const conflicto = verificarAsignacionUnica(cajas, 'user-a', 'c1')
    expect(conflicto).toBeNull()
  })

  it('still detects conflict when trying to assign user to a different caja', () => {
    // user-a already has c1. Cannot also be assigned to c4.
    const conflicto = verificarAsignacionUnica(cajas, 'user-a', 'c4') // c4 doesn't exist but checks c1
    expect(conflicto).not.toBeNull()
    expect(conflicto!.id).toBe('c1')
  })

  it('each user has at most one active caja in a well-configured set', () => {
    const well: CajaConUsuario[] = [
      { id: 'c1', nombre: 'Caja 1', activo: true, usuarioAsignadoId: 'user-a' },
      { id: 'c2', nombre: 'Caja 2', activo: true, usuarioAsignadoId: 'user-b' },
    ]
    expect(verificarAsignacionUnica(well, 'user-a', 'c1')).toBeNull()
    expect(verificarAsignacionUnica(well, 'user-b', 'c2')).toBeNull()
  })
})

// ── misCajas filter (API response shape) ──────────────────────────────────────

interface CajaAPIResult {
  id: string
  nombre: string
  activo: boolean
  usuarioAsignadoId: string | null
}

/**
 * Mirrors the `?misCajas=true` filter in GET /api/caja/cajas.
 */
function filtrarMisCajas(cajas: CajaAPIResult[], usuarioId: string): CajaAPIResult[] {
  return cajas.filter(
    (c) => c.activo && (c.usuarioAsignadoId === usuarioId || c.usuarioAsignadoId === null)
  )
}

describe('GET /api/caja/cajas – ?misCajas=true filter', () => {
  const cajas: CajaAPIResult[] = [
    { id: 'c1', nombre: 'Caja 1', activo: true, usuarioAsignadoId: 'user-a' },
    { id: 'c2', nombre: 'Caja 2', activo: true, usuarioAsignadoId: 'user-b' },
    { id: 'c3', nombre: 'Caja 3', activo: true, usuarioAsignadoId: null },
    { id: 'c4', nombre: 'Caja 4', activo: false, usuarioAsignadoId: 'user-a' },
  ]

  it('returns only the user own caja and unassigned cajas', () => {
    const result = filtrarMisCajas(cajas, 'user-a')
    expect(result.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('does not include cajas assigned to other users', () => {
    const result = filtrarMisCajas(cajas, 'user-a')
    expect(result.some((c) => c.usuarioAsignadoId === 'user-b')).toBe(false)
  })

  it('does not include inactive cajas', () => {
    const result = filtrarMisCajas(cajas, 'user-a')
    expect(result.every((c) => c.activo)).toBe(true)
  })

  it('user with no assigned caja only sees unassigned cajas', () => {
    const result = filtrarMisCajas(cajas, 'user-c')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c3')
  })
})
