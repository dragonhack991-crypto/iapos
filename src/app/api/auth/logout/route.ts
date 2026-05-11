import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, SESSION_ACTIVITY_COOKIE, obtenerSesion } from '@/lib/auth'
import { getCookieDomain, isCookieSecure } from '@/lib/cookies'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  let reason: 'manual' | 'timeout' | 'expiration' = 'manual'
  try {
    const body = (await request.json()) as { reason?: string }
    if (body.reason === 'timeout' || body.reason === 'expiration' || body.reason === 'manual') {
      reason = body.reason
    }
  } catch {
    // Ignore missing/invalid JSON and keep default reason.
  }

  const sesion = await obtenerSesion()
  const response = NextResponse.json({ ok: true })
  const secure = isCookieSecure(request)
  const cookieDomain = getCookieDomain()

  if (sesion) {
    try {
      await prisma.auditoriaAccion.create({
        data: {
          accion:
            reason === 'timeout'
              ? 'logout_timeout'
              : reason === 'expiration'
                ? 'logout_expiracion'
                : 'logout_manual',
          solicitanteId: sesion.sub,
          motivo:
            reason === 'timeout'
              ? 'Cierre automático por inactividad'
              : reason === 'expiration'
                ? 'Sesión expirada'
                : 'Cierre de sesión manual',
        },
      })
    } catch (error) {
      console.error('[logout] no se pudo registrar auditoría:', error)
    }
  }

  // Expire the session cookie immediately with the exact same attributes used at login
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    domain: cookieDomain,
  })
  response.cookies.set(SESSION_ACTIVITY_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    domain: cookieDomain,
  })
  return response
}
