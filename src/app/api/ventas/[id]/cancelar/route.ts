import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const cancelarSchema = z.object({
  motivo: z.string().min(1, 'El motivo de cancelación es requerido'),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('vender') && !sesion.permisos.includes('ver_reportes')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof cancelarSchema>
  try {
    data = cancelarSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  const params = await context.params

  const venta = await prisma.venta.findUnique({
    where: { id: params.id },
    include: {
      detalles: true,
    },
  })

  if (!venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
  }

  if (venta.estado === 'CANCELADA') {
    return NextResponse.json(
      { error: 'La venta ya fue cancelada anteriormente' },
      { status: 409 }
    )
  }

  try {
    const ventaCancelada = await prisma.$transaction(async (tx) => {
      // Mark venta as cancelled with metadata
      const updated = await tx.venta.update({
        where: { id: params.id },
        data: {
          estado: 'CANCELADA',
          canceladoEn: new Date(),
          canceladoPorId: sesion.sub,
          motivoCancelacion: data.motivo,
        },
        include: {
          detalles: { include: { producto: { select: { id: true, nombre: true } } } },
          usuario: { select: { id: true, nombre: true } },
          canceladoPor: { select: { id: true, nombre: true } },
          sesionCaja: { include: { caja: { include: { sucursal: true } } } },
        },
      })

      // Reverse inventory for all sale lines
      for (const detalle of venta.detalles) {
        await tx.inventario.update({
          where: { productoId: detalle.productoId },
          data: {
            cantidad: {
              increment: detalle.cantidad,
            },
          },
        })

        // Audit trail entry for inventory reversal
        await tx.movimientoInventario.create({
          data: {
            productoId: detalle.productoId,
            tipo: 'ENTRADA',
            cantidad: detalle.cantidad,
            motivo: `Cancelación venta folio #${venta.folio} — ${data.motivo}`,
            usuarioId: sesion.sub,
            ventaId: venta.id,
          },
        })
      }

      return updated
    })

    return NextResponse.json({ venta: ventaCancelada })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Error interno al cancelar la venta' }, { status: 500 })
  }
}
