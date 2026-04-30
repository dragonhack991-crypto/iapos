import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesionDesdeRequest } from '@/lib/auth'

const cerrarCajaSchema = z.object({
  montoContado: z.number().min(0),
  observaciones: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesionDesdeRequest(request)
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

    // Sprint 1: diferencia calculada contra el monto inicial de apertura.
    // No contempla movimientos registrados durante la sesión.
    // En sprints posteriores se calculará contra el saldo esperado
    // (monto inicial + ingresos - egresos de la sesión).
    const diferencia = montoContado - parseFloat(sesionCaja.montoInicial.toString())

    const sesionActualizada = await prisma.sesionCaja.update({
      where: { id: params.id },
      data: {
        estado: 'CERRADA',
        fechaCierre: new Date(),
        montoContado,
        diferencia,
        observaciones,
      },
    })

    return NextResponse.json({
      sesion: sesionActualizada,
      // Aviso: diferencia calculada solo contra monto inicial (Sprint 1)
      nota: 'Diferencia calculada respecto al monto inicial de apertura. No incluye movimientos de sesión.',
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
