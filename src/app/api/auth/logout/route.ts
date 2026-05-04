import { NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { isCookieSecure } from '@/lib/cookies'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  const secure = isCookieSecure()
  // Expire the session cookie immediately with the exact same attributes used at login
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
