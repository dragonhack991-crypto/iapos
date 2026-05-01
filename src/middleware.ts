import { NextRequest, NextResponse } from 'next/server'
import { verificarToken } from './lib/auth'

const RUTAS_PUBLICAS = ['/login', '/setup', '/api/auth/login', '/api/setup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (RUTAS_PUBLICAS.some(ruta => pathname.startsWith(ruta))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('iapos_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const payload = await verificarToken(token)
  if (!payload) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('iapos_session')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
