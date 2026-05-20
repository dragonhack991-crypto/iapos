import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/lib/auth'

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({
    id: sesion.sub,
    email: sesion.email,
    nombre: sesion.nombre,
    permisos: sesion.permisos,
  })
}
