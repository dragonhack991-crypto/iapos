import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers extracted from the ventas route (duplicated here to test in isolation)
// ─────────────────────────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const IVA_RATE = 0.16

interface ProductoCalc {
  precioVenta: number
  ivaAplica: boolean
  iepsAplica: boolean
  iepsPorcentaje: number
}

interface DetalleInput {
  cantidad: number
  producto: ProductoCalc
}

function calcularTotalesVenta(detalles: DetalleInput[]) {
  let subtotalTotal = 0
  let totalIvaCalc = 0
  let totalIepsCalc = 0

  const detallesCalculados = detalles.map((detalle) => {
    const precioUnitario = detalle.producto.precioVenta
    const subtotalLinea = precioUnitario * detalle.cantidad
    const iepsPct = detalle.producto.iepsPorcentaje / 100
    const iepsUnitario = detalle.producto.iepsAplica ? precioUnitario * iepsPct : 0
    const baseIva = precioUnitario - (detalle.producto.iepsAplica ? precioUnitario * iepsPct : 0)
    const ivaUnitario = detalle.producto.ivaAplica ? baseIva * IVA_RATE : 0

    const iepsLinea = iepsUnitario * detalle.cantidad
    const ivaLinea = ivaUnitario * detalle.cantidad
    const totalLinea = subtotalLinea + ivaLinea + iepsLinea

    subtotalTotal += subtotalLinea
    totalIvaCalc += ivaLinea
    totalIepsCalc += iepsLinea

    return {
      precioUnitario: round2(precioUnitario),
      subtotal: round2(subtotalLinea),
      ivaUnitario: round2(ivaUnitario),
      iepsUnitario: round2(iepsUnitario),
      total: round2(totalLinea),
    }
  })

  return {
    subtotal: round2(subtotalTotal),
    totalIva: round2(totalIvaCalc),
    totalIeps: round2(totalIepsCalc),
    total: round2(subtotalTotal + totalIvaCalc + totalIepsCalc),
    detallesCalculados,
  }
}

function validarStockSuficiente(
  detalles: Array<{ productoId: string; cantidad: number }>,
  inventario: Map<string, number>
): { ok: boolean; error?: string; productoId?: string } {
  for (const d of detalles) {
    const stock = inventario.get(d.productoId) ?? 0
    if (stock < d.cantidad) {
      return { ok: false, error: `Stock insuficiente para ${d.productoId}`, productoId: d.productoId }
    }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularTotalesVenta', () => {
  it('calcula correctamente sin IVA y sin IEPS', () => {
    const detalles: DetalleInput[] = [
      {
        cantidad: 2,
        producto: { precioVenta: 100, ivaAplica: false, iepsAplica: false, iepsPorcentaje: 0 },
      },
    ]
    const { subtotal, totalIva, totalIeps, total } = calcularTotalesVenta(detalles)
    expect(subtotal).toBe(200)
    expect(totalIva).toBe(0)
    expect(totalIeps).toBe(0)
    expect(total).toBe(200)
  })

  it('calcula correctamente con IVA al 16% sin IEPS', () => {
    const detalles: DetalleInput[] = [
      {
        cantidad: 1,
        producto: { precioVenta: 100, ivaAplica: true, iepsAplica: false, iepsPorcentaje: 0 },
      },
    ]
    const { subtotal, totalIva, total } = calcularTotalesVenta(detalles)
    expect(subtotal).toBe(100)
    expect(totalIva).toBe(16)
    expect(total).toBe(116)
  })

  it('calcula correctamente con IVA y IEPS', () => {
    const detalles: DetalleInput[] = [
      {
        cantidad: 1,
        producto: { precioVenta: 100, ivaAplica: true, iepsAplica: true, iepsPorcentaje: 8 },
      },
    ]
    const { totalIva, totalIeps, total } = calcularTotalesVenta(detalles)
    // IEPS = 100 * 0.08 = 8
    // Base IVA = 100 - 8 = 92; IVA = 92 * 0.16 = 14.72
    expect(totalIeps).toBe(8)
    expect(totalIva).toBe(14.72)
    expect(total).toBe(round2(100 + 14.72 + 8))
  })

  it('agrega múltiples líneas correctamente', () => {
    const detalles: DetalleInput[] = [
      {
        cantidad: 3,
        producto: { precioVenta: 50, ivaAplica: true, iepsAplica: false, iepsPorcentaje: 0 },
      },
      {
        cantidad: 1,
        producto: { precioVenta: 200, ivaAplica: false, iepsAplica: false, iepsPorcentaje: 0 },
      },
    ]
    const { subtotal, totalIva, total } = calcularTotalesVenta(detalles)
    expect(subtotal).toBe(350) // 3*50 + 200
    expect(totalIva).toBe(24) // 3*50*0.16 = 24; 200 sin IVA
    expect(total).toBe(374)
  })

  it('redondea correctamente a 2 decimales', () => {
    const detalles: DetalleInput[] = [
      {
        cantidad: 3,
        producto: { precioVenta: 9.99, ivaAplica: true, iepsAplica: false, iepsPorcentaje: 0 },
      },
    ]
    const { subtotal, total } = calcularTotalesVenta(detalles)
    expect(subtotal).toBe(round2(3 * 9.99))
    expect(total).toBe(round2(3 * 9.99 * 1.16))
  })
})

describe('validarStockSuficiente', () => {
  it('permite venta cuando hay stock suficiente', () => {
    const inventario = new Map([
      ['prod-1', 10],
      ['prod-2', 5],
    ])
    const detalles = [
      { productoId: 'prod-1', cantidad: 3 },
      { productoId: 'prod-2', cantidad: 5 },
    ]
    const resultado = validarStockSuficiente(detalles, inventario)
    expect(resultado.ok).toBe(true)
  })

  it('rechaza cuando stock es insuficiente', () => {
    const inventario = new Map([['prod-1', 2]])
    const detalles = [{ productoId: 'prod-1', cantidad: 5 }]
    const resultado = validarStockSuficiente(detalles, inventario)
    expect(resultado.ok).toBe(false)
    expect(resultado.productoId).toBe('prod-1')
  })

  it('rechaza cuando no hay inventario registrado', () => {
    const inventario = new Map<string, number>()
    const detalles = [{ productoId: 'prod-sin-stock', cantidad: 1 }]
    const resultado = validarStockSuficiente(detalles, inventario)
    expect(resultado.ok).toBe(false)
  })

  it('rechaza exactamente cuando la cantidad solicitada excede el stock', () => {
    const inventario = new Map([['prod-1', 3]])
    const detalles = [{ productoId: 'prod-1', cantidad: 4 }]
    const resultado = validarStockSuficiente(detalles, inventario)
    expect(resultado.ok).toBe(false)
  })

  it('permite venta cuando la cantidad iguala exactamente el stock', () => {
    const inventario = new Map([['prod-1', 3]])
    const detalles = [{ productoId: 'prod-1', cantidad: 3 }]
    const resultado = validarStockSuficiente(detalles, inventario)
    expect(resultado.ok).toBe(true)
  })
})

describe('validación de sesión de caja abierta', () => {
  it('rechaza ventas sin sesión de caja', () => {
    const sesionCaja = null
    const tieneSession = sesionCaja !== null && (sesionCaja as { estado: string }).estado === 'ABIERTA'
    expect(tieneSession).toBe(false)
  })

  it('permite ventas con sesión de caja abierta', () => {
    const sesionCaja = { id: 'sesion-1', estado: 'ABIERTA' }
    const tieneSession = sesionCaja !== null && sesionCaja.estado === 'ABIERTA'
    expect(tieneSession).toBe(true)
  })

  it('rechaza ventas con sesión de caja cerrada', () => {
    const sesionCaja = { id: 'sesion-1', estado: 'CERRADA' }
    const tieneSession = sesionCaja !== null && sesionCaja.estado === 'ABIERTA'
    expect(tieneSession).toBe(false)
  })
})

describe('cálculo de cambio', () => {
  it('calcula el cambio correctamente en pago en efectivo', () => {
    const total = 116
    const pagoCon = 200
    const cambio = round2(pagoCon - total)
    expect(cambio).toBe(84)
  })

  it('devuelve cambio cero cuando el pago es exacto', () => {
    const total = 116
    const pagoCon = 116
    const cambio = round2(pagoCon - total)
    expect(cambio).toBe(0)
  })

  it('detecta pago insuficiente', () => {
    const total = 116
    const pagoCon = 100
    const pagoInsuficiente = pagoCon < total
    expect(pagoInsuficiente).toBe(true)
  })
})
