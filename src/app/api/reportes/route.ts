import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('ver_reportes') && !sesion.permisos.includes('administrar_usuarios')) {
    return NextResponse.json({ error: 'Sin permisos para ver reportes' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const fechaInicio = searchParams.get('fechaInicio')
  const fechaFin = searchParams.get('fechaFin')

  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (fechaInicio) dateFilter.gte = new Date(fechaInicio)
  if (fechaFin) {
    const end = new Date(fechaFin)
    end.setHours(23, 59, 59, 999)
    dateFilter.lte = end
  }

  const whereCompleted = {
    estado: 'COMPLETADA' as const,
    ...(fechaInicio || fechaFin ? { creadoEn: dateFilter } : {}),
  }

  // Fetch all completed sales (lightweight fields)
  const ventas = await prisma.venta.findMany({
    where: whereCompleted,
    select: {
      creadoEn: true,
      metodoPago: true,
      total: true,
      totalIva: true,
      totalIeps: true,
    },
    orderBy: { creadoEn: 'desc' },
  })

  // 1. Group by day
  const byDayMap = new Map<string, { numVentas: number; total: number }>()
  for (const v of ventas) {
    const dia = v.creadoEn.toISOString().slice(0, 10)
    const existing = byDayMap.get(dia)
    const t = round2(parseFloat(v.total.toString()))
    if (existing) {
      existing.numVentas += 1
      existing.total = round2(existing.total + t)
    } else {
      byDayMap.set(dia, { numVentas: 1, total: t })
    }
  }
  const ventasPorDia = Array.from(byDayMap.entries())
    .map(([dia, val]) => ({ dia, ...val }))
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .slice(0, 90)

  // 2. By payment method
  const byMetodoMap = new Map<string, { numVentas: number; total: number }>()
  for (const v of ventas) {
    const m = v.metodoPago
    const t = round2(parseFloat(v.total.toString()))
    const existing = byMetodoMap.get(m)
    if (existing) {
      existing.numVentas += 1
      existing.total = round2(existing.total + t)
    } else {
      byMetodoMap.set(m, { numVentas: 1, total: t })
    }
  }
  const ventasPorMetodo = Array.from(byMetodoMap.entries()).map(([metodoPago, val]) => ({
    metodoPago,
    ...val,
  }))

  // 3. Top products
  const topProductosRaw = await prisma.ventaDetalle.groupBy({
    by: ['productoId'],
    where: { venta: whereCompleted },
    _sum: { cantidad: true, total: true },
    _count: { id: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 10,
  })

  const productoIds = topProductosRaw.map((t) => t.productoId)
  const productos = productoIds.length
    ? await prisma.producto.findMany({
        where: { id: { in: productoIds } },
        select: { id: true, nombre: true },
      })
    : []
  const productoMap = new Map(productos.map((p) => [p.id, p]))

  const topProductos = topProductosRaw.map((t) => ({
    productoId: t.productoId,
    nombre: productoMap.get(t.productoId)?.nombre ?? '—',
    cantidadTotal: round2(parseFloat(t._sum.cantidad?.toString() ?? '0')),
    ventasTotal: round2(parseFloat(t._sum.total?.toString() ?? '0')),
    numLineas: t._count.id,
  }))

  // 4. Overall summary
  let totalVentas = 0
  let totalIva = 0
  let totalIeps = 0
  for (const v of ventas) {
    totalVentas = round2(totalVentas + parseFloat(v.total.toString()))
    totalIva = round2(totalIva + parseFloat(v.totalIva.toString()))
    totalIeps = round2(totalIeps + parseFloat(v.totalIeps.toString()))
  }

  return NextResponse.json({
    resumen: { totalVentas, totalIva, totalIeps, numVentas: ventas.length },
    ventasPorDia,
    topProductos,
    ventasPorMetodo,
  })
}
