import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production')
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
)

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
    .sign(JWT_SECRET)
}

export async function verificarToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
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
