import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers replicated from route logic (isolated for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ────────────────────────────────
// Payment method validation helpers
// ────────────────────────────────

type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'

interface PagoEfectivo {
  metodoPago: 'EFECTIVO'
  pagoCon: number
}
interface PagoTarjeta {
  metodoPago: 'TARJETA'
  ultimos4: string
  numeroOperacion: string
}
interface PagoTransferencia {
  metodoPago: 'TRANSFERENCIA'
  banco: string
  referencia: string
}

type DatosPago = PagoEfectivo | PagoTarjeta | PagoTransferencia

function validarDatosPago(
  pago: DatosPago,
  totalVenta: number
): { ok: boolean; error?: string } {
  if (pago.metodoPago === 'EFECTIVO') {
    if (pago.pagoCon <= 0) return { ok: false, error: 'El monto recibido debe ser mayor a cero' }
    if (pago.pagoCon < totalVenta) {
      return { ok: false, error: `Pago insuficiente. Total: $${totalVenta}, Pago con: $${pago.pagoCon}` }
    }
    return { ok: true }
  }
  if (pago.metodoPago === 'TARJETA') {
    if (!/^\d{4}$/.test(pago.ultimos4)) {
      return { ok: false, error: 'Ingresa exactamente los últimos 4 dígitos de la tarjeta' }
    }
    if (!pago.numeroOperacion.trim()) {
      return { ok: false, error: 'El número de operación es obligatorio' }
    }
    return { ok: true }
  }
  if (pago.metodoPago === 'TRANSFERENCIA') {
    if (!pago.banco.trim()) return { ok: false, error: 'El banco es obligatorio' }
    if (!pago.referencia.trim()) return { ok: false, error: 'La referencia o clave de rastreo es obligatoria' }
    return { ok: true }
  }
  return { ok: false, error: 'Método de pago inválido' }
}

function calcularCambio(pagoCon: number, total: number): number {
  return round2(pagoCon - total)
}

// ────────────────────────────────
// Corte Z live difference
// ────────────────────────────────

function calcularDiferenciaVivo(
  efectivoEsperado: number,
  montoContado: number
): { diferencia: number; tipo: 'sobrante' | 'faltante' | 'exacto' } {
  const diferencia = round2(montoContado - efectivoEsperado)
  return {
    diferencia,
    tipo: diferencia > 0 ? 'sobrante' : diferencia < 0 ? 'faltante' : 'exacto',
  }
}

// ────────────────────────────────
// Payment metadata extraction
// ────────────────────────────────

function extraerMetadataPago(pago: DatosPago) {
  if (pago.metodoPago === 'EFECTIVO') {
    return { pagoCon: pago.pagoCon, banco: null, referencia: null, ultimos4: null, numeroOperacion: null }
  }
  if (pago.metodoPago === 'TARJETA') {
    return { pagoCon: null, banco: null, referencia: null, ultimos4: pago.ultimos4, numeroOperacion: pago.numeroOperacion }
  }
  return { pagoCon: null, banco: pago.banco, referencia: pago.referencia, ultimos4: null, numeroOperacion: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — PR3 payment validations
// ─────────────────────────────────────────────────────────────────────────────

describe('validarDatosPago — EFECTIVO', () => {
  it('acepta cuando el pago es mayor al total', () => {
    const res = validarDatosPago({ metodoPago: 'EFECTIVO', pagoCon: 200 }, 116)
    expect(res.ok).toBe(true)
  })

  it('acepta cuando el pago es exactamente igual al total', () => {
    const res = validarDatosPago({ metodoPago: 'EFECTIVO', pagoCon: 116 }, 116)
    expect(res.ok).toBe(true)
  })

  it('rechaza cuando el pago es menor al total', () => {
    const res = validarDatosPago({ metodoPago: 'EFECTIVO', pagoCon: 100 }, 116)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/insuficiente/i)
  })

  it('rechaza cuando pagoCon es cero', () => {
    const res = validarDatosPago({ metodoPago: 'EFECTIVO', pagoCon: 0 }, 116)
    expect(res.ok).toBe(false)
  })

  it('rechaza cuando pagoCon es negativo', () => {
    const res = validarDatosPago({ metodoPago: 'EFECTIVO', pagoCon: -50 }, 116)
    expect(res.ok).toBe(false)
  })
})

describe('calcularCambio — EFECTIVO', () => {
  it('calcula cambio correcto', () => {
    expect(calcularCambio(200, 116)).toBe(84)
  })

  it('cambio cero cuando el pago es exacto', () => {
    expect(calcularCambio(116, 116)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    expect(calcularCambio(100, 33.33)).toBe(round2(100 - 33.33))
  })
})

describe('validarDatosPago — TARJETA', () => {
  it('acepta con 4 dígitos y número de operación', () => {
    const res = validarDatosPago({ metodoPago: 'TARJETA', ultimos4: '1234', numeroOperacion: 'OP-999' }, 500)
    expect(res.ok).toBe(true)
  })

  it('rechaza con menos de 4 dígitos', () => {
    const res = validarDatosPago({ metodoPago: 'TARJETA', ultimos4: '123', numeroOperacion: 'OP-999' }, 500)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/4 dígitos/i)
  })

  it('rechaza con más de 4 dígitos', () => {
    const res = validarDatosPago({ metodoPago: 'TARJETA', ultimos4: '12345', numeroOperacion: 'OP-999' }, 500)
    expect(res.ok).toBe(false)
  })

  it('rechaza con letras en ultimos4', () => {
    const res = validarDatosPago({ metodoPago: 'TARJETA', ultimos4: 'ABCD', numeroOperacion: 'OP-999' }, 500)
    expect(res.ok).toBe(false)
  })

  it('rechaza sin número de operación', () => {
    const res = validarDatosPago({ metodoPago: 'TARJETA', ultimos4: '1234', numeroOperacion: '   ' }, 500)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/operación/i)
  })
})

describe('validarDatosPago — TRANSFERENCIA', () => {
  it('acepta con banco y referencia', () => {
    const res = validarDatosPago({ metodoPago: 'TRANSFERENCIA', banco: 'BBVA', referencia: 'REF-12345' }, 300)
    expect(res.ok).toBe(true)
  })

  it('rechaza sin banco', () => {
    const res = validarDatosPago({ metodoPago: 'TRANSFERENCIA', banco: '', referencia: 'REF-12345' }, 300)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/banco/i)
  })

  it('rechaza sin referencia', () => {
    const res = validarDatosPago({ metodoPago: 'TRANSFERENCIA', banco: 'HSBC', referencia: '   ' }, 300)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/referencia/i)
  })

  it('rechaza con solo espacios en banco', () => {
    const res = validarDatosPago({ metodoPago: 'TRANSFERENCIA', banco: '   ', referencia: 'REF-001' }, 300)
    expect(res.ok).toBe(false)
  })
})

describe('extraerMetadataPago — persistencia por método', () => {
  it('extrae campos de efectivo correctamente', () => {
    const m = extraerMetadataPago({ metodoPago: 'EFECTIVO', pagoCon: 200 })
    expect(m.pagoCon).toBe(200)
    expect(m.ultimos4).toBeNull()
    expect(m.banco).toBeNull()
  })

  it('extrae campos de tarjeta correctamente', () => {
    const m = extraerMetadataPago({ metodoPago: 'TARJETA', ultimos4: '5678', numeroOperacion: 'AUTH-001' })
    expect(m.ultimos4).toBe('5678')
    expect(m.numeroOperacion).toBe('AUTH-001')
    expect(m.pagoCon).toBeNull()
    expect(m.banco).toBeNull()
  })

  it('extrae campos de transferencia correctamente', () => {
    const m = extraerMetadataPago({ metodoPago: 'TRANSFERENCIA', banco: 'Santander', referencia: 'SPEI-XYZ' })
    expect(m.banco).toBe('Santander')
    expect(m.referencia).toBe('SPEI-XYZ')
    expect(m.pagoCon).toBeNull()
    expect(m.ultimos4).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Corte Z live difference
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularDiferenciaVivo — corte Z', () => {
  it('muestra sobrante cuando el contado es mayor al esperado', () => {
    const { diferencia, tipo } = calcularDiferenciaVivo(600, 610)
    expect(diferencia).toBe(10)
    expect(tipo).toBe('sobrante')
  })

  it('muestra faltante cuando el contado es menor al esperado', () => {
    const { diferencia, tipo } = calcularDiferenciaVivo(600, 595)
    expect(diferencia).toBe(-5)
    expect(tipo).toBe('faltante')
  })

  it('muestra exacto cuando el contado es igual al esperado', () => {
    const { diferencia, tipo } = calcularDiferenciaVivo(500, 500)
    expect(diferencia).toBe(0)
    expect(tipo).toBe('exacto')
  })

  it('redondea la diferencia a 2 decimales', () => {
    const { diferencia } = calcularDiferenciaVivo(100, 100.124)
    expect(diferencia).toBe(0.12)
  })

  it('diferencia negativa grande (faltante importante)', () => {
    const { diferencia, tipo } = calcularDiferenciaVivo(1500, 1000)
    expect(diferencia).toBe(-500)
    expect(tipo).toBe('faltante')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Report calculations
// ─────────────────────────────────────────────────────────────────────────────

describe('agrupación de ventas por método de pago', () => {
  interface VentaReport {
    metodoPago: MetodoPago
    total: number
  }

  function agruparPorMetodo(ventas: VentaReport[]) {
    const mapa = new Map<MetodoPago, { numVentas: number; total: number }>()
    for (const v of ventas) {
      const existing = mapa.get(v.metodoPago)
      if (existing) {
        existing.numVentas += 1
        existing.total = round2(existing.total + v.total)
      } else {
        mapa.set(v.metodoPago, { numVentas: 1, total: v.total })
      }
    }
    return Array.from(mapa.entries()).map(([metodoPago, val]) => ({ metodoPago, ...val }))
  }

  it('agrupa correctamente ventas mixtas', () => {
    const ventas: VentaReport[] = [
      { metodoPago: 'EFECTIVO', total: 100 },
      { metodoPago: 'EFECTIVO', total: 200 },
      { metodoPago: 'TARJETA', total: 150 },
      { metodoPago: 'TRANSFERENCIA', total: 300 },
    ]
    const resultado = agruparPorMetodo(ventas)
    const ef = resultado.find((r) => r.metodoPago === 'EFECTIVO')
    const tar = resultado.find((r) => r.metodoPago === 'TARJETA')
    const tra = resultado.find((r) => r.metodoPago === 'TRANSFERENCIA')
    expect(ef?.numVentas).toBe(2)
    expect(ef?.total).toBe(300)
    expect(tar?.numVentas).toBe(1)
    expect(tar?.total).toBe(150)
    expect(tra?.total).toBe(300)
  })

  it('retorna vacío con lista sin ventas', () => {
    expect(agruparPorMetodo([])).toHaveLength(0)
  })
})

describe('agrupación de ventas por día', () => {
  interface VentaDiaReport {
    creadoEn: Date
    total: number
  }

  function agruparPorDia(ventas: VentaDiaReport[]) {
    const mapa = new Map<string, { numVentas: number; total: number }>()
    for (const v of ventas) {
      const dia = v.creadoEn.toISOString().slice(0, 10)
      const existing = mapa.get(dia)
      const t = round2(v.total)
      if (existing) {
        existing.numVentas += 1
        existing.total = round2(existing.total + t)
      } else {
        mapa.set(dia, { numVentas: 1, total: t })
      }
    }
    return Array.from(mapa.entries())
      .map(([dia, val]) => ({ dia, ...val }))
      .sort((a, b) => b.dia.localeCompare(a.dia))
  }

  it('agrupa ventas del mismo día', () => {
    const ventas: VentaDiaReport[] = [
      { creadoEn: new Date('2025-05-01T10:00:00Z'), total: 100 },
      { creadoEn: new Date('2025-05-01T15:00:00Z'), total: 200 },
      { creadoEn: new Date('2025-05-02T09:00:00Z'), total: 50 },
    ]
    const resultado = agruparPorDia(ventas)
    expect(resultado).toHaveLength(2)
    const day1 = resultado.find((r) => r.dia === '2025-05-01')
    expect(day1?.numVentas).toBe(2)
    expect(day1?.total).toBe(300)
  })

  it('ordena por fecha descendente', () => {
    const ventas: VentaDiaReport[] = [
      { creadoEn: new Date('2025-04-30T10:00:00Z'), total: 100 },
      { creadoEn: new Date('2025-05-01T10:00:00Z'), total: 200 },
    ]
    const resultado = agruparPorDia(ventas)
    expect(resultado[0].dia).toBe('2025-05-01')
    expect(resultado[1].dia).toBe('2025-04-30')
  })
})
