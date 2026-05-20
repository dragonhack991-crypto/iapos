import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const abrirCajaSchema = z.object({
  cajaId: z.string(),
  montoInicial: z.number().min(0),
})

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sesionCaja = await prisma.sesionCaja.findFirst({
    where: { estado: 'ABIERTA', usuarioAperturaId: sesion.sub },
    include: {
      caja: {
        include: { sucursal: true },
      },
    },
    orderBy: { fechaApertura: 'desc' },
  })

  return NextResponse.json({ sesion: sesionCaja })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('abrir_caja')) {
    return NextResponse.json({ error: 'Sin permisos para abrir caja' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { cajaId, montoInicial } = abrirCajaSchema.parse(body)

    // Verify the caja exists and is active
    const caja = await prisma.caja.findUnique({ where: { id: cajaId } })
    if (!caja || !caja.activo) {
      return NextResponse.json({ error: 'Caja no encontrada o inactiva' }, { status: 404 })
    }

    // If the caja is assigned to a specific user, only that user may open it
    if (caja.usuarioAsignadoId && caja.usuarioAsignadoId !== sesion.sub) {
      return NextResponse.json(
        { error: 'Esta caja está asignada a otro usuario' },
        { status: 403 }
      )
    }

    // Block only if there is a currently OPEN session for this caja
    const sesionAbierta = await prisma.sesionCaja.findFirst({
      where: { cajaId, estado: 'ABIERTA' },
    })
    if (sesionAbierta) {
      return NextResponse.json({ error: 'Ya hay una sesión abierta para esta caja' }, { status: 409 })
    }

    const nuevaSesion = await prisma.sesionCaja.create({
      data: {
        cajaId,
        usuarioAperturaId: sesion.sub,
        montoInicial,
      },
      include: {
        caja: { include: { sucursal: true } },
      },
    })

    return NextResponse.json({ sesion: nuevaSesion }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

