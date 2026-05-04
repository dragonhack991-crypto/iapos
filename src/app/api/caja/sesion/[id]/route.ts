import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const cerrarCajaSchema = z.object({
  montoContado: z.number().min(0).optional(),
  observaciones: z.string().optional(),
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const params = await context.params

  const sesionCaja = await prisma.sesionCaja.findUnique({ where: { id: params.id } })
  if (!sesionCaja || sesionCaja.estado !== 'ABIERTA') {
    return NextResponse.json({ error: 'Sesión no encontrada o ya cerrada' }, { status: 404 })
  }

  if (sesionCaja.usuarioAperturaId !== sesion.sub) {
    return NextResponse.json({ error: 'La sesión de caja no pertenece al usuario actual' }, { status: 403 })
  }

  const ventas = await prisma.venta.findMany({
    where: { sesionCajaId: params.id, estado: 'COMPLETADA' },
    select: { total: true, metodoPago: true },
  })

  let totalEfectivo = 0
  let totalVentas = 0
  for (const v of ventas) {
    const t = parseFloat(v.total.toString())
    totalVentas += t
    if (v.metodoPago === 'EFECTIVO') totalEfectivo += t
  }

  const montoInicialNum = parseFloat(sesionCaja.montoInicial.toString())
  const efectivoEsperado = round2(montoInicialNum + totalEfectivo)

  return NextResponse.json({ efectivoEsperado, totalVentas: round2(totalVentas), numVentas: ventas.length })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('cerrar_caja')) {
    return NextResponse.json({ error: 'Sin permisos para cerrar caja' }, { status: 403 })
  }

  const params = await context.params

  try {
    const body = await request.json()
    const { montoContado, observaciones } = cerrarCajaSchema.parse(body)

    const sesionCaja = await prisma.sesionCaja.findUnique({ where: { id: params.id } })
    if (!sesionCaja || sesionCaja.estado !== 'ABIERTA') {
      return NextResponse.json({ error: 'Sesión no encontrada o ya cerrada' }, { status: 404 })
    }

    if (sesionCaja.usuarioAperturaId !== sesion.sub) {
      return NextResponse.json({ error: 'La sesión de caja no pertenece al usuario actual' }, { status: 403 })
    }

    // Compute corte Z summary totals from active (COMPLETADA) ventas in this session
    const ventas = await prisma.venta.findMany({
      where: { sesionCajaId: params.id, estado: 'COMPLETADA' },
      select: {
        total: true,
        totalIva: true,
        totalIeps: true,
        metodoPago: true,
      },
    })

    let totalVentas = 0
    let totalEfectivo = 0
    let totalTarjeta = 0
    let totalTransferencia = 0
    let totalIva = 0
    let totalIeps = 0

    for (const v of ventas) {
      const t = parseFloat(v.total.toString())
      totalVentas += t
      totalIva += parseFloat(v.totalIva.toString())
      totalIeps += parseFloat(v.totalIeps.toString())
      if (v.metodoPago === 'EFECTIVO') totalEfectivo += t
      else if (v.metodoPago === 'TARJETA') totalTarjeta += t
      else if (v.metodoPago === 'TRANSFERENCIA') totalTransferencia += t
    }

    totalVentas = round2(totalVentas)
    totalEfectivo = round2(totalEfectivo)
    totalTarjeta = round2(totalTarjeta)
    totalTransferencia = round2(totalTransferencia)
    totalIva = round2(totalIva)
    totalIeps = round2(totalIeps)

    const montoInicialNum = parseFloat(sesionCaja.montoInicial.toString())
    // Expected cash = initial amount + cash sales
    const efectivoEsperado = round2(montoInicialNum + totalEfectivo)
    const diferencia =
      montoContado !== undefined ? round2(montoContado - efectivoEsperado) : null

    const sesionActualizada = await prisma.sesionCaja.update({
      where: { id: params.id },
      data: {
        estado: 'CERRADA',
        fechaCierre: new Date(),
        montoContado: montoContado ?? null,
        diferencia,
        observaciones,
        totalVentas,
        totalEfectivo,
        totalTarjeta,
        totalTransferencia,
        totalIva,
        totalIeps,
      },
    })

    return NextResponse.json({
      sesion: sesionActualizada,
      resumen: {
        totalVentas,
        totalEfectivo,
        totalTarjeta,
        totalTransferencia,
        totalIva,
        totalIeps,
        efectivoEsperado,
        montoContado: montoContado ?? null,
        diferencia,
        numVentas: ventas.length,
      },
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
