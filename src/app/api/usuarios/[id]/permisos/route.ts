import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const updatePermisosSchema = z.object({
  permisoNombres: z.array(z.string()),
})

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_usuarios')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await context.params

  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nombre: true, email: true },
  })
  if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const overrides = await prisma.usuarioPermiso.findMany({
    where: { usuarioId: id },
    include: { permiso: true },
  })

  const todosPermisos = await prisma.permiso.findMany({ orderBy: { nombre: 'asc' } })

  return NextResponse.json({
    usuario,
    overrides: overrides.map((o) => o.permiso.nombre),
    todosPermisos: todosPermisos.map((p) => ({ nombre: p.nombre, descripcion: p.descripcion })),
  })
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_usuarios')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await context.params

  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof updatePermisosSchema>
  try {
    data = updatePermisosSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  // Resolve permission IDs
  const permisos = await prisma.permiso.findMany({
    where: { nombre: { in: data.permisoNombres } },
  })

  const encontrados = new Set(permisos.map((p) => p.nombre))
  const noEncontrados = data.permisoNombres.filter((n) => !encontrados.has(n))
  if (noEncontrados.length > 0) {
    return NextResponse.json(
      { error: 'Permisos no encontrados', permisos: noEncontrados },
      { status: 400 }
    )
  }

  // Replace all user overrides (delete existing, create new ones)
  await prisma.$transaction([
    prisma.usuarioPermiso.deleteMany({ where: { usuarioId: id } }),
    ...permisos.map((p) =>
      prisma.usuarioPermiso.create({
        data: { usuarioId: id, permisoId: p.id },
      })
    ),
  ])

  return NextResponse.json({ ok: true, overrides: data.permisoNombres })
}
