import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const actualizarCajaSchema = z.object({
  nombre: z.string().min(1).optional(),
  activo: z.boolean().optional(),
  usuarioAsignadoId: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_cajas')) {
    return NextResponse.json({ error: 'Sin permisos para administrar cajas' }, { status: 403 })
  }

  const params = await context.params

  const caja = await prisma.caja.findUnique({ where: { id: params.id } })
  if (!caja) {
    return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof actualizarCajaSchema>
  try {
    data = actualizarCajaSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  // Validate assigned user if provided
  if (data.usuarioAsignadoId) {
    const usuario = await prisma.usuario.findUnique({ where: { id: data.usuarioAsignadoId } })
    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: 'Usuario asignado no encontrado o inactivo' }, { status: 404 })
    }

    // Enforce unique assignment: one active caja per user (excluding this caja itself)
    const cajaExistente = await prisma.caja.findFirst({
      where: {
        usuarioAsignadoId: data.usuarioAsignadoId,
        activo: true,
        NOT: { id: params.id },
      },
    })
    if (cajaExistente) {
      return NextResponse.json(
        { error: `El usuario ya tiene la caja "${cajaExistente.nombre}" asignada. Un usuario solo puede tener una caja.` },
        { status: 409 }
      )
    }
  }

  try {
    const cajaActualizada = await prisma.caja.update({
      where: { id: params.id },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.activo !== undefined ? { activo: data.activo } : {}),
        ...(data.usuarioAsignadoId !== undefined ? { usuarioAsignadoId: data.usuarioAsignadoId } : {}),
      },
      include: {
        sucursal: true,
        usuarioAsignado: { select: { id: true, nombre: true, email: true } },
      },
    })
    return NextResponse.json({ caja: cajaActualizada })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Error interno al actualizar caja' }, { status: 500 })
  }
}
