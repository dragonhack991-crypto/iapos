import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cajas = await prisma.caja.findMany({
    where: { activo: true },
    include: { sucursal: true },
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({ cajas })
}
