import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { crearToken, obtenerPermisos, COOKIE_NAME } from '@/lib/auth'
import { isCookieSecure } from '@/lib/cookies'

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
    const secure = isCookieSecure()
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })
    // Re-establish the initialization flag so the middleware can confirm the
    // system is set up even after browser cookies have been cleared.
    response.cookies.set('iapos_initialized', '1', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
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
