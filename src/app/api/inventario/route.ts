import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const movimientoSchema = z.object({
  productoId: z.string(),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
  cantidad: z.number().positive(),
  motivo: z.string().optional(),
})

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const inventario = await prisma.inventario.findMany({
    include: {
      producto: {
        select: { id: true, nombre: true, codigoBarras: true, tipoVenta: true },
      },
    },
    orderBy: { producto: { nombre: 'asc' } },
  })

  return NextResponse.json({ inventario })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_inventario')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { productoId, tipo, cantidad, motivo } = movimientoSchema.parse(body)

    await prisma.$transaction(async (tx) => {
      await tx.movimientoInventario.create({
        data: {
          productoId,
          tipo,
          cantidad,
          motivo,
          usuarioId: sesion.sub,
        },
      })

      const inventario = await tx.inventario.findUnique({ where: { productoId } })
      if (inventario) {
        const cantidadActual = parseFloat(inventario.cantidad.toString())
        let nuevaCantidad: number
        if (tipo === 'ENTRADA') {
          nuevaCantidad = cantidadActual + cantidad
        } else if (tipo === 'SALIDA') {
          nuevaCantidad = Math.max(0, cantidadActual - cantidad)
        } else {
          nuevaCantidad = cantidad
        }
        await tx.inventario.update({
          where: { productoId },
          data: { cantidad: nuevaCantidad },
        })
      } else {
        await tx.inventario.create({
          data: { productoId, cantidad },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
