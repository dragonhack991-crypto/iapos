import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const ventaDetalleSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().positive(),
})

const ventaSchema = z.object({
  sesionCajaId: z.string().min(1),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
  detalles: z.array(ventaDetalleSchema).min(1, 'La venta debe tener al menos un producto'),
  pagoCon: z.number().positive().optional(),
})

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('vender') && !sesion.permisos.includes('ver_reportes')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const ventas = await prisma.venta.findMany({
    include: {
      usuario: { select: { id: true, nombre: true } },
      sesionCaja: { include: { caja: { include: { sucursal: true } } } },
      detalles: {
        include: { producto: { select: { id: true, nombre: true, codigoBarras: true } } },
      },
    },
    orderBy: { creadoEn: 'desc' },
  })

  return NextResponse.json({ ventas })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('vender')) {
    return NextResponse.json({ error: 'Sin permisos para realizar ventas' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof ventaSchema>
  try {
    data = ventaSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  const sesionCaja = await prisma.sesionCaja.findUnique({
    where: { id: data.sesionCajaId },
  })

  if (!sesionCaja || sesionCaja.estado !== 'ABIERTA') {
    return NextResponse.json(
      { error: 'No hay una sesión de caja abierta. Abre la caja antes de realizar ventas.' },
      { status: 409 }
    )
  }

  // Seguridad/regla negocio: evita usar sesión de caja de otro usuario
  if (sesionCaja.usuarioAperturaId !== sesion.sub) {
    return NextResponse.json(
      { error: 'La sesión de caja no pertenece al usuario actual' },
      { status: 403 }
    )
  }

  const productoIds = data.detalles.map((d) => d.productoId)
  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds }, activo: true },
    include: { inventario: true },
  })

  const productoMap = new Map(productos.map((p) => [p.id, p]))

  for (const detalle of data.detalles) {
    if (!productoMap.has(detalle.productoId)) {
      return NextResponse.json(
        { error: `Producto no encontrado o inactivo: ${detalle.productoId}` },
        { status: 422 }
      )
    }
  }

  for (const detalle of data.detalles) {
    const producto = productoMap.get(detalle.productoId)!
    const stockActual = toNumber(producto.inventario?.cantidad, 0)
    if (stockActual < detalle.cantidad) {
      return NextResponse.json(
        {
          error: `Stock insuficiente para "${producto.nombre}". Disponible: ${stockActual}, solicitado: ${detalle.cantidad}`,
          code: 'STOCK_INSUFICIENTE',
          productoId: detalle.productoId,
        },
        { status: 422 }
      )
    }
  }

  const IVA_RATE = 0.16
  let subtotalTotal = 0
  let totalIvaCalc = 0
  let totalIepsCalc = 0

  const detallesCalculados = data.detalles.map((detalle) => {
    const producto = productoMap.get(detalle.productoId)!
    const precioUnitario = toNumber(producto.precioVenta, 0)
    const subtotalLinea = precioUnitario * detalle.cantidad

    const iepsPct = toNumber(producto.iepsPorcentaje, 0) / 100
    const iepsUnitario = producto.iepsAplica ? precioUnitario * iepsPct : 0
    const baseIva = precioUnitario - (producto.iepsAplica ? precioUnitario * iepsPct : 0)
    const ivaUnitario = producto.ivaAplica ? baseIva * IVA_RATE : 0

    const iepsLinea = iepsUnitario * detalle.cantidad
    const ivaLinea = ivaUnitario * detalle.cantidad
    const totalLinea = subtotalLinea + ivaLinea + iepsLinea

    subtotalTotal += subtotalLinea
    totalIvaCalc += ivaLinea
    totalIepsCalc += iepsLinea

    return {
      productoId: detalle.productoId,
      cantidad: detalle.cantidad,
      precioUnitario,
      subtotal: round2(subtotalLinea),
      ivaUnitario: round2(ivaUnitario),
      iepsUnitario: round2(iepsUnitario),
      total: round2(totalLinea),
    }
  })

  const totalFinal = round2(subtotalTotal + totalIvaCalc + totalIepsCalc)

  if (data.metodoPago === 'EFECTIVO' && data.pagoCon !== undefined && data.pagoCon < totalFinal) {
    return NextResponse.json(
      { error: `Pago insuficiente. Total: $${totalFinal}, Pago con: $${data.pagoCon}` },
      { status: 422 }
    )
  }

  const cambio =
    data.metodoPago === 'EFECTIVO' && data.pagoCon !== undefined
      ? round2(data.pagoCon - totalFinal)
      : null

  try {
    const venta = await prisma.$transaction(async (tx) => {
      for (const detalle of data.detalles) {
        const inv = await tx.inventario.findUnique({
          where: { productoId: detalle.productoId },
        })
        const stockActual = toNumber(inv?.cantidad, 0)
        if (stockActual < detalle.cantidad) {
          const producto = productoMap.get(detalle.productoId)!
          throw new StockError(
            `Stock insuficiente para "${producto.nombre}". Disponible: ${stockActual}`,
            detalle.productoId
          )
        }
      }

      const nuevaVenta = await tx.venta.create({
        data: {
          sesionCajaId: data.sesionCajaId,
          usuarioId: sesion.sub,
          metodoPago: data.metodoPago,
          subtotal: round2(subtotalTotal),
          totalIva: round2(totalIvaCalc),
          totalIeps: round2(totalIepsCalc),
          total: totalFinal,
          pagoCon: data.pagoCon ?? null,
          cambio,
          detalles: {
            create: detallesCalculados,
          },
        },
        include: {
          detalles: { include: { producto: { select: { id: true, nombre: true } } } },
          sesionCaja: { include: { caja: { include: { sucursal: true } } } },
          usuario: { select: { id: true, nombre: true } },
        },
      })

      for (const detalle of data.detalles) {
        await tx.inventario.update({
          where: { productoId: detalle.productoId },
          data: {
            cantidad: {
              decrement: detalle.cantidad,
            },
          },
        })

        await tx.movimientoInventario.create({
          data: {
            productoId: detalle.productoId,
            tipo: 'SALIDA',
            cantidad: detalle.cantidad,
            motivo: `Venta folio #${nuevaVenta.folio}`,
            usuarioId: sesion.sub,
            ventaId: nuevaVenta.id,
          },
        })
      }

      return nuevaVenta
    })

    return NextResponse.json({ venta }, { status: 201 })
  } catch (e) {
    if (e instanceof StockError) {
      return NextResponse.json(
        { error: e.message, code: 'STOCK_INSUFICIENTE', productoId: e.productoId },
        { status: 422 }
      )
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno al procesar la venta' }, { status: 500 })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

class StockError extends Error {
  productoId: string
  constructor(message: string, productoId: string) {
    super(message)
    this.productoId = productoId
  }
}