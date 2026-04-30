import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const cerrarCajaSchema = z.object({
  montoContado: z.number().min(0),
  observaciones: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('cerrar_caja')) {
    return NextResponse.json({ error: 'Sin permisos para cerrar caja' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { montoContado, observaciones } = cerrarCajaSchema.parse(body)

    const sesionCaja = await prisma.sesionCaja.findUnique({ where: { id: params.id } })
    if (!sesionCaja || sesionCaja.estado !== 'ABIERTA') {
      return NextResponse.json({ error: 'Sesión no encontrada o ya cerrada' }, { status: 404 })
    }

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

    return NextResponse.json({ sesion: sesionActualizada })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
