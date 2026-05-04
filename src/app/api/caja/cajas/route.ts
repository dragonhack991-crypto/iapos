import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const crearCajaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  sucursalId: z.string().min(1, 'La sucursal es requerida'),
  usuarioAsignadoId: z.string().optional().nullable(),
})

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cajas = await prisma.caja.findMany({
    where: { activo: true },
    include: {
      sucursal: true,
      usuarioAsignado: { select: { id: true, nombre: true, email: true } },
      sesiones: {
        where: { estado: 'ABIERTA' },
        select: { id: true, usuarioAperturaId: true, fechaApertura: true },
        take: 1,
      },
    },
    orderBy: { nombre: 'asc' },
  })

  const cajasConEstado = cajas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    sucursalId: c.sucursalId,
    activo: c.activo,
    usuarioAsignado: c.usuarioAsignado,
    sesionAbierta: c.sesiones.length > 0 ? c.sesiones[0] : null,
    sucursal: c.sucursal,
  }))

  return NextResponse.json({ cajas: cajasConEstado })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_cajas')) {
    return NextResponse.json({ error: 'Sin permisos para administrar cajas' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof crearCajaSchema>
  try {
    data = crearCajaSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  const sucursal = await prisma.sucursal.findUnique({ where: { id: data.sucursalId } })
  if (!sucursal) {
    return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })
  }

  if (data.usuarioAsignadoId) {
    const usuario = await prisma.usuario.findUnique({ where: { id: data.usuarioAsignadoId } })
    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: 'Usuario asignado no encontrado o inactivo' }, { status: 404 })
    }
  }

  try {
    const caja = await prisma.caja.create({
      data: {
        nombre: data.nombre,
        sucursalId: data.sucursalId,
        usuarioAsignadoId: data.usuarioAsignadoId ?? null,
      },
      include: {
        sucursal: true,
        usuarioAsignado: { select: { id: true, nombre: true, email: true } },
      },
    })
    return NextResponse.json({ caja }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Error interno al crear caja' }, { status: 500 })
  }
}

