import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, SESSION_ACTIVITY_COOKIE, obtenerSesion } from '@/lib/auth'
import { getCookieDomain, isCookieSecure } from '@/lib/cookies'
import { prisma } from '@/lib/prisma'
import { LOGOUT_REASON, type LogoutReason } from '@/lib/session'

export async function POST(request: NextRequest) {
  let reason: LogoutReason = LOGOUT_REASON.MANUAL
  try {
    const body = (await request.json()) as { reason?: string }
    if (
      body.reason === LOGOUT_REASON.TIMEOUT ||
      body.reason === LOGOUT_REASON.EXPIRATION ||
      body.reason === LOGOUT_REASON.MANUAL
    ) {
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
            reason === LOGOUT_REASON.TIMEOUT
              ? 'logout_timeout'
              : reason === LOGOUT_REASON.EXPIRATION
                ? 'logout_expiracion'
                : 'logout_manual',
          solicitanteId: sesion.sub,
          motivo:
            reason === LOGOUT_REASON.TIMEOUT
              ? 'Cierre automático por inactividad'
              : reason === LOGOUT_REASON.EXPIRATION
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
