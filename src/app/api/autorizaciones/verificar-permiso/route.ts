import { NextRequest, NextResponse } from 'next/server'
import { obtenerSesion, obtenerPermisos } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const permiso = searchParams.get('permiso')
  if (!permiso) {
    return NextResponse.json({ error: 'Parámetro permiso requerido' }, { status: 400 })
  }

  // Always query the DB for live permissions — never rely on potentially stale JWT claims.
  // This ensures that permission overrides assigned after login take effect immediately.
  const permisosVivos = await obtenerPermisos(sesion.sub)
  return NextResponse.json({ tiene: permisosVivos.includes(permiso) })
}
