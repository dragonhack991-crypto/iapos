import { NextRequest, NextResponse } from 'next/server'
import { obtenerSesion } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const permiso = searchParams.get('permiso')
  if (!permiso) {
    return NextResponse.json({ error: 'Parámetro permiso requerido' }, { status: 400 })
  }

  return NextResponse.json({ tiene: sesion.permisos.includes(permiso) })
}
