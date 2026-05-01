import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const usuarioSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  rolNombre: z.string().default('Cajero'),
})

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_usuarios')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      email: true,
      nombre: true,
      activo: true,
      creadoEn: true,
      roles: {
        include: { rol: { select: { nombre: true } } },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({ usuarios })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_usuarios')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { nombre, email, password, rolNombre } = usuarioSchema.parse(body)

    const existente = await prisma.usuario.findUnique({ where: { email } })
    if (existente) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 400 })
    }

    const rol = await prisma.rol.findUnique({ where: { nombre: rolNombre } })
    if (!rol) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        roles: { create: { rolId: rol.id } },
      },
      select: { id: true, nombre: true, email: true, activo: true, creadoEn: true },
    })

    return NextResponse.json({ usuario }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
