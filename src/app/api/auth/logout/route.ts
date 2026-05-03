import { NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  // Expire the cookie immediately with the same attributes used at login
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
