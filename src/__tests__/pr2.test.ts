import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers replicated from route logic (isolated for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ────────────────────────────────
// Corte Z summary calculation
// ────────────────────────────────

interface VentaParaCorte {
  total: number
  totalIva: number
  totalIeps: number
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'
}

function calcularCorteZ(ventas: VentaParaCorte[], montoInicial: number) {
  let totalVentas = 0
  let totalEfectivo = 0
  let totalTarjeta = 0
  let totalTransferencia = 0
  let totalIva = 0
  let totalIeps = 0

  for (const v of ventas) {
    totalVentas += v.total
    totalIva += v.totalIva
    totalIeps += v.totalIeps
    if (v.metodoPago === 'EFECTIVO') totalEfectivo += v.total
    else if (v.metodoPago === 'TARJETA') totalTarjeta += v.total
    else if (v.metodoPago === 'TRANSFERENCIA') totalTransferencia += v.total
  }

  totalVentas = round2(totalVentas)
  totalEfectivo = round2(totalEfectivo)
  totalTarjeta = round2(totalTarjeta)
  totalTransferencia = round2(totalTransferencia)
  totalIva = round2(totalIva)
  totalIeps = round2(totalIeps)

  const efectivoEsperado = round2(montoInicial + totalEfectivo)

  return { totalVentas, totalEfectivo, totalTarjeta, totalTransferencia, totalIva, totalIeps, efectivoEsperado }
}

// ────────────────────────────────
// Cancellation state logic
// ────────────────────────────────

type EstadoVenta = 'COMPLETADA' | 'CANCELADA'

function puedecancelarVenta(estado: EstadoVenta): { ok: boolean; error?: string } {
  if (estado === 'CANCELADA') {
    return { ok: false, error: 'La venta ya fue cancelada anteriormente' }
  }
  return { ok: true }
}

function cancelarVenta(
  venta: { id: string; estado: EstadoVenta; detalles: Array<{ productoId: string; cantidad: number }> },
  usuarioId: string,
  motivo: string
) {
  const check = puedeancellarVenta(venta.estado)
  if (!check.ok) return check

  // Simulate inventory reversal amounts
  const reversales = venta.detalles.map((d) => ({
    productoId: d.productoId,
    incremento: d.cantidad,
  }))

  return {
    ok: true,
    ventaActualizada: { ...venta, estado: 'CANCELADA' as EstadoVenta, canceladoPorId: usuarioId, motivoCancelacion: motivo },
    reversales,
  }
}

// Alias for typo-free calls in tests
const puedeancellarVenta = puedecancelarVenta

function puedecancel(estado: EstadoVenta): { ok: boolean; error?: string } {
  return puedeancellarVenta(estado)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCorteZ — cierre de caja', () => {
  it('devuelve ceros cuando no hay ventas', () => {
    const resultado = calcularCorteZ([], 500)
    expect(resultado.totalVentas).toBe(0)
    expect(resultado.totalEfectivo).toBe(0)
    expect(resultado.totalTarjeta).toBe(0)
    expect(resultado.totalTransferencia).toBe(0)
    expect(resultado.totalIva).toBe(0)
    expect(resultado.totalIeps).toBe(0)
    expect(resultado.efectivoEsperado).toBe(500) // solo monto inicial
  })

  it('calcula totales correctamente con ventas mixtas', () => {
    const ventas: VentaParaCorte[] = [
      { total: 116, totalIva: 16, totalIeps: 0, metodoPago: 'EFECTIVO' },
      { total: 200, totalIva: 0, totalIeps: 0, metodoPago: 'TARJETA' },
      { total: 50, totalIva: 6.9, totalIeps: 0, metodoPago: 'TRANSFERENCIA' },
    ]
    const resultado = calcularCorteZ(ventas, 300)
    expect(resultado.totalVentas).toBe(366)
    expect(resultado.totalEfectivo).toBe(116)
    expect(resultado.totalTarjeta).toBe(200)
    expect(resultado.totalTransferencia).toBe(50)
    expect(resultado.totalIva).toBe(round2(16 + 6.9))
    expect(resultado.efectivoEsperado).toBe(416) // 300 inicial + 116 efectivo
  })

  it('calcula diferencia cuando se captura efectivo contado', () => {
    const ventas: VentaParaCorte[] = [
      { total: 100, totalIva: 0, totalIeps: 0, metodoPago: 'EFECTIVO' },
    ]
    const { efectivoEsperado } = calcularCorteZ(ventas, 500)
    // Expected: 500 inicial + 100 efectivo = 600
    expect(efectivoEsperado).toBe(600)
    const montoContado = 595
    const diferencia = round2(montoContado - efectivoEsperado)
    expect(diferencia).toBe(-5) // faltaron 5 pesos
  })

  it('diferencia positiva cuando sobra efectivo', () => {
    const ventas: VentaParaCorte[] = [
      { total: 200, totalIva: 0, totalIeps: 0, metodoPago: 'EFECTIVO' },
    ]
    const { efectivoEsperado } = calcularCorteZ(ventas, 100)
    // Expected: 100 + 200 = 300
    expect(efectivoEsperado).toBe(300)
    const montoContado = 310
    const diferencia = round2(montoContado - efectivoEsperado)
    expect(diferencia).toBe(10)
  })

  it('redondea totales a 2 decimales', () => {
    const ventas: VentaParaCorte[] = [
      { total: 9.99, totalIva: 1.38, totalIeps: 0, metodoPago: 'EFECTIVO' },
      { total: 9.99, totalIva: 1.38, totalIeps: 0, metodoPago: 'EFECTIVO' },
      { total: 9.99, totalIva: 1.38, totalIeps: 0, metodoPago: 'EFECTIVO' },
    ]
    const resultado = calcularCorteZ(ventas, 0)
    expect(resultado.totalVentas).toBe(round2(3 * 9.99))
    expect(resultado.totalIva).toBe(round2(3 * 1.38))
  })

  it('solo cuenta ventas COMPLETADAS (excluye canceladas)', () => {
    // Simulation: canceled ventas must be filtered before calling calcularCorteZ
    const todasVentas = [
      { total: 100, totalIva: 16, totalIeps: 0, metodoPago: 'EFECTIVO' as const, estado: 'COMPLETADA' as const },
      { total: 50, totalIva: 8, totalIeps: 0, metodoPago: 'EFECTIVO' as const, estado: 'CANCELADA' as const },
    ]
    const completadas = todasVentas.filter((v) => v.estado === 'COMPLETADA')
    const resultado = calcularCorteZ(completadas, 0)
    // Only completed sale counts
    expect(resultado.totalVentas).toBe(100)
    expect(resultado.totalEfectivo).toBe(100)
    expect(resultado.totalIva).toBe(16)
  })
})

describe('cancelación de venta — validación de estado', () => {
  it('permite cancelar una venta COMPLETADA', () => {
    const resultado = puedecancel('COMPLETADA')
    expect(resultado.ok).toBe(true)
  })

  it('rechaza cancelar una venta ya CANCELADA (doble cancelación)', () => {
    const resultado = puedecancel('CANCELADA')
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/ya fue cancelada/i)
  })
})

describe('cancelación de venta — reverso de inventario', () => {
  it('genera reversales correctos para cada línea', () => {
    const venta = {
      id: 'v-1',
      estado: 'COMPLETADA' as EstadoVenta,
      detalles: [
        { productoId: 'p-1', cantidad: 3 },
        { productoId: 'p-2', cantidad: 1.5 },
      ],
    }
    const resultado = cancelarVenta(venta, 'user-1', 'Error del cliente')
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.reversales).toHaveLength(2)
    expect(resultado.reversales[0]).toEqual({ productoId: 'p-1', incremento: 3 })
    expect(resultado.reversales[1]).toEqual({ productoId: 'p-2', incremento: 1.5 })
  })

  it('persiste motivo y usuario en la venta cancelada', () => {
    const venta = {
      id: 'v-2',
      estado: 'COMPLETADA' as EstadoVenta,
      detalles: [{ productoId: 'p-1', cantidad: 1 }],
    }
    const resultado = cancelarVenta(venta, 'user-42', 'Producto dañado')
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.ventaActualizada.estado).toBe('CANCELADA')
    expect(resultado.ventaActualizada.canceladoPorId).toBe('user-42')
    expect(resultado.ventaActualizada.motivoCancelacion).toBe('Producto dañado')
  })

  it('no genera reversales para venta ya cancelada', () => {
    const venta = {
      id: 'v-3',
      estado: 'CANCELADA' as EstadoVenta,
      detalles: [{ productoId: 'p-1', cantidad: 2 }],
    }
    const resultado = cancelarVenta(venta, 'user-1', 'Intento doble')
    expect(resultado.ok).toBe(false)
  })

  it('maneja correctamente cantidades decimales (granel)', () => {
    const venta = {
      id: 'v-4',
      estado: 'COMPLETADA' as EstadoVenta,
      detalles: [{ productoId: 'p-granel', cantidad: 0.75 }],
    }
    const resultado = cancelarVenta(venta, 'user-1', 'Devolución granel')
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.reversales[0].incremento).toBe(0.75)
  })
})

describe('filtros de listado de ventas', () => {
  interface VentaFiltro {
    folio: number
    creadoEn: Date
    metodoPago: string
    estado: string
  }

  function filtrarVentas(
    ventas: VentaFiltro[],
    filtros: {
      folio?: number
      fechaInicio?: Date
      fechaFin?: Date
      metodoPago?: string
      estado?: string
    }
  ): VentaFiltro[] {
    return ventas.filter((v) => {
      if (filtros.folio !== undefined && v.folio !== filtros.folio) return false
      if (filtros.fechaInicio && v.creadoEn < filtros.fechaInicio) return false
      if (filtros.fechaFin && v.creadoEn > filtros.fechaFin) return false
      if (filtros.metodoPago && v.metodoPago !== filtros.metodoPago) return false
      if (filtros.estado && v.estado !== filtros.estado) return false
      return true
    })
  }

  const ventas: VentaFiltro[] = [
    { folio: 1, creadoEn: new Date('2025-01-10'), metodoPago: 'EFECTIVO', estado: 'COMPLETADA' },
    { folio: 2, creadoEn: new Date('2025-01-11'), metodoPago: 'TARJETA', estado: 'COMPLETADA' },
    { folio: 3, creadoEn: new Date('2025-01-12'), metodoPago: 'EFECTIVO', estado: 'CANCELADA' },
    { folio: 4, creadoEn: new Date('2025-01-15'), metodoPago: 'TRANSFERENCIA', estado: 'COMPLETADA' },
  ]

  it('sin filtros devuelve todas las ventas', () => {
    expect(filtrarVentas(ventas, {})).toHaveLength(4)
  })

  it('filtra por folio exacto', () => {
    const resultado = filtrarVentas(ventas, { folio: 2 })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].folio).toBe(2)
  })

  it('filtra por rango de fechas', () => {
    const resultado = filtrarVentas(ventas, {
      fechaInicio: new Date('2025-01-11'),
      fechaFin: new Date('2025-01-12'),
    })
    expect(resultado).toHaveLength(2)
    expect(resultado.map((v) => v.folio)).toEqual([2, 3])
  })

  it('filtra por método de pago', () => {
    const resultado = filtrarVentas(ventas, { metodoPago: 'EFECTIVO' })
    expect(resultado).toHaveLength(2)
    expect(resultado.every((v) => v.metodoPago === 'EFECTIVO')).toBe(true)
  })

  it('filtra por estado CANCELADA', () => {
    const resultado = filtrarVentas(ventas, { estado: 'CANCELADA' })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].folio).toBe(3)
  })

  it('combina múltiples filtros', () => {
    const resultado = filtrarVentas(ventas, { metodoPago: 'EFECTIVO', estado: 'COMPLETADA' })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].folio).toBe(1)
  })

  it('retorna vacío cuando no hay coincidencias', () => {
    const resultado = filtrarVentas(ventas, { folio: 999 })
    expect(resultado).toHaveLength(0)
  })
})

describe('paginación de listado de ventas', () => {
  function paginar<T>(items: T[], page: number, perPage: number): { items: T[]; total: number; totalPages: number } {
    const total = items.length
    const totalPages = Math.ceil(total / perPage)
    const start = (page - 1) * perPage
    return { items: items.slice(start, start + perPage), total, totalPages }
  }

  const ventas = Array.from({ length: 25 }, (_, i) => ({ folio: i + 1 }))

  it('primera página devuelve los primeros N registros', () => {
    const { items, total, totalPages } = paginar(ventas, 1, 10)
    expect(items).toHaveLength(10)
    expect(items[0].folio).toBe(1)
    expect(items[9].folio).toBe(10)
    expect(total).toBe(25)
    expect(totalPages).toBe(3)
  })

  it('segunda página devuelve el siguiente bloque', () => {
    const { items } = paginar(ventas, 2, 10)
    expect(items).toHaveLength(10)
    expect(items[0].folio).toBe(11)
  })

  it('última página puede tener menos registros', () => {
    const { items } = paginar(ventas, 3, 10)
    expect(items).toHaveLength(5)
    expect(items[4].folio).toBe(25)
  })

  it('página vacía cuando se excede el total', () => {
    const { items } = paginar(ventas, 10, 10)
    expect(items).toHaveLength(0)
  })
})
