import { NextRequest, NextResponse } from 'next/server'
import { LOCK_COOKIE, getSessionTtlSeconds, obtenerSesion } from '@/lib/auth'
import { getCookieDomain, isCookieSecure } from '@/lib/cookies'

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const response = NextResponse.json({ ok: true })
  const secure = isCookieSecure(request)
  const cookieDomain = getCookieDomain()
  response.cookies.set(LOCK_COOKIE, '1', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionTtlSeconds(),
    domain: cookieDomain,
  })
  return response
}
