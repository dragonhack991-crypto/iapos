import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { prisma } from './prisma'

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET debe estar definido y tener al menos 32 caracteres en producción')
    }
    // Solo en desarrollo: clave de respaldo ergonómica
    return new TextEncoder().encode('dev-secret-change-in-production-32ch')
  }
  return new TextEncoder().encode(secret)
}

const COOKIE_NAME = 'iapos_session'

export interface JWTPayload {
  sub: string
  email: string
  nombre: string
  permisos: string[]
}

export async function crearToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getJWTSecret())
}

export async function verificarToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJWTSecret())
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function obtenerSesion(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verificarToken(token)
}

/**
 * Lee la sesión JWT directamente desde las cookies del objeto `request`.
 * Usar en Route Handlers de la API para evitar comportamiento inconsistente
 * de `cookies()` de next/headers en esos contextos.
 */
export async function obtenerSesionDesdeRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verificarToken(token)
}

export async function obtenerPermisos(usuarioId: string): Promise<string[]> {
  const roles = await prisma.usuarioRol.findMany({
    where: { usuarioId },
    include: {
      rol: {
        include: {
          permisos: {
            include: { permiso: true },
          },
        },
      },
    },
  })

  const permisos = new Set<string>()
  for (const ur of roles) {
    for (const rp of ur.rol.permisos) {
      permisos.add(rp.permiso.nombre)
    }
  }
  return Array.from(permisos)
}

export { COOKIE_NAME }
