import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obtenerSesion, obtenerPermisos } from '@/lib/auth'

const bodySchema = z.object({
  productoId: z.string(),
  sku: z.string().optional().nullable(),
  nombre: z.string(),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  sesionCajaId: z.string().optional().nullable(),
  motivo: z.string().default('Eliminado directamente (permiso propio)'),
})

/**
 * Records an audit entry when a user with the direct `eliminar_item_carrito`
 * permission removes an item from the cart without requiring supervisor
 * authorization. The authorizer is null (self-authorized action).
 */
export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Live permission check — JWT claims may be stale
  const permisosVivos = await obtenerPermisos(sesion.sub)
  if (!permisosVivos.includes('eliminar_item_carrito')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof bodySchema>
  try {
    data = bodySchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  const { motivo, ...detalleItem } = data

  await prisma.auditoriaAccion.create({
    data: {
      accion: 'eliminar_item_carrito',
      solicitanteId: sesion.sub,
      autorizadorId: null,
      targetId: null,
      motivo,
      detalle: detalleItem as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ ok: true })
}
