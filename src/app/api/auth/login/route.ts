import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { crearToken, obtenerPermisos, COOKIE_NAME } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, usuario.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const permisos = await obtenerPermisos(usuario.id)
    const token = await crearToken({
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      permisos,
    })

    const response = NextResponse.json({ ok: true, nombre: usuario.nombre })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })
    return response
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
