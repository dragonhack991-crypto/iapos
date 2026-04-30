import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesionDesdeRequest } from '@/lib/auth'

const abrirCajaSchema = z.object({
  cajaId: z.string(),
  montoInicial: z.number().min(0),
})

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesionDesdeRequest(request)
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const puedeVerCaja = sesion.permisos.some(p => ['abrir_caja', 'cerrar_caja'].includes(p))
  if (!puedeVerCaja) {
    return NextResponse.json({ error: 'Sin permisos para ver sesión de caja' }, { status: 403 })
  }

  const sesionCaja = await prisma.sesionCaja.findFirst({
    where: { estado: 'ABIERTA' },
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
  const sesion = await obtenerSesionDesdeRequest(request)
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('abrir_caja')) {
    return NextResponse.json({ error: 'Sin permisos para abrir caja' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { cajaId, montoInicial } = abrirCajaSchema.parse(body)

    const sesionAbierta = await prisma.sesionCaja.findFirst({
      where: { cajaId, estado: 'ABIERTA' },
    })
    if (sesionAbierta) {
      return NextResponse.json({ error: 'Ya hay una sesión abierta para esta caja' }, { status: 400 })
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
