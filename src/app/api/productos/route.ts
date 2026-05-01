import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const productoSchema = z.object({
  nombre: z.string().min(1),
  codigoBarras: z.string().optional().nullable(),
  tipoVenta: z.enum(['PIEZA', 'CAJA', 'GRANEL']).default('PIEZA'),
  costoActual: z.number().min(0),
  margen: z.number().min(0),
  precioVenta: z.number().min(0),
  ivaAplica: z.boolean().default(true),
  iepsAplica: z.boolean().default(false),
  iepsPorcentaje: z.number().min(0).default(0),
})

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export async function GET() {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const productos = await prisma.producto.findMany({
    where: { activo: true },
    include: {
      inventario: {
        select: { cantidad: true },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  const normalizados = productos.map((p) => ({
    ...p,
    costoActual: toNumber(p.costoActual),
    margen: toNumber(p.margen),
    precioVenta: toNumber(p.precioVenta),
    iepsPorcentaje: toNumber(p.iepsPorcentaje),
    inventario: p.inventario
      ? { cantidad: toNumber(p.inventario.cantidad) }
      : { cantidad: 0 },
  }))

  return NextResponse.json({ productos: normalizados })
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!sesion.permisos.includes('administrar_productos')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = productoSchema.parse(body)

    const producto = await prisma.producto.create({
      data: {
        ...data,
        codigoBarras: data.codigoBarras || null,
        inventario: {
          create: { cantidad: 0 },
        },
      },
      include: {
        inventario: {
          select: { cantidad: true },
        },
      },
    })

    const productoNormalizado = {
      ...producto,
      costoActual: toNumber(producto.costoActual),
      margen: toNumber(producto.margen),
      precioVenta: toNumber(producto.precioVenta),
      iepsPorcentaje: toNumber(producto.iepsPorcentaje),
      inventario: producto.inventario
        ? { cantidad: toNumber(producto.inventario.cantidad) }
        : { cantidad: 0 },
    }

    return NextResponse.json({ producto: productoNormalizado }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}