import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const params = await context.params

  const venta = await prisma.venta.findUnique({
    where: { id: params.id },
    include: {
      usuario: { select: { id: true, nombre: true, email: true } },
      sesionCaja: {
        include: {
          caja: { include: { sucursal: true } },
        },
      },
      detalles: {
        include: {
          producto: {
            select: {
              id: true,
              nombre: true,
              codigoBarras: true,
              tipoVenta: true,
              ivaAplica: true,
              iepsAplica: true,
            },
          },
        },
      },
    },
  })

  if (!venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ venta })
}
