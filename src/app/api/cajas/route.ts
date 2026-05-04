import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

/**
 * GET /api/cajas
 *
 * Returns the list of active cash registers with their current open-session
 * status so the UI can display which cajas are free and which are occupied.
 *
 * Response shape:
 * {
 *   cajas: Array<{
 *     id: string
 *     nombre: string
 *     sucursal: string
 *     sesionAbierta: { id: string; usuarioAperturaId: string } | null
 *   }>
 * }
 */
export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cajas = await prisma.caja.findMany({
    where: { activo: true },
    include: {
      sucursal: { select: { nombre: true } },
      sesiones: {
        where: { estado: 'ABIERTA' },
        select: { id: true, usuarioAperturaId: true },
        take: 1,
      },
    },
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({
    cajas: cajas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      sucursal: c.sucursal.nombre,
      sesionAbierta: c.sesiones[0] ?? null,
    })),
  })
}
