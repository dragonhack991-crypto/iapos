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
      usuario: { select: { nombre: true } },
      sesionCaja: {
        include: {
          caja: { include: { sucursal: true } },
        },
      },
      detalles: {
        include: {
          producto: { select: { nombre: true, codigoBarras: true } },
        },
      },
    },
  })

  if (!venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
  }

  const negocio = await prisma.configuracionSistema.findUnique({
    where: { clave: 'nombre_negocio' },
  })

  const ticket = {
    negocio: negocio?.valor ?? 'iaPOS',
    sucursal: venta.sesionCaja.caja.sucursal.nombre,
    caja: venta.sesionCaja.caja.nombre,
    cajero: venta.usuario.nombre,
    folio: venta.folio,
    fecha: venta.creadoEn,
    metodoPago: venta.metodoPago,
    estado: venta.estado,
    items: venta.detalles.map((d) => ({
      descripcion: d.producto.nombre,
      cantidad: parseFloat(d.cantidad.toString()),
      precioUnitario: parseFloat(d.precioUnitario.toString()),
      subtotal: parseFloat(d.subtotal.toString()),
      iva: parseFloat(d.ivaUnitario.toString()) * parseFloat(d.cantidad.toString()),
      ieps: parseFloat(d.iepsUnitario.toString()) * parseFloat(d.cantidad.toString()),
      total: parseFloat(d.total.toString()),
    })),
    subtotal: parseFloat(venta.subtotal.toString()),
    totalIva: parseFloat(venta.totalIva.toString()),
    totalIeps: parseFloat(venta.totalIeps.toString()),
    total: parseFloat(venta.total.toString()),
    pagoCon: venta.pagoCon ? parseFloat(venta.pagoCon.toString()) : null,
    cambio: venta.cambio ? parseFloat(venta.cambio.toString()) : null,
  }

  return NextResponse.json({ ticket })
}
