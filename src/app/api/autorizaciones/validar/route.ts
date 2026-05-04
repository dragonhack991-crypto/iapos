import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obtenerSesion, obtenerPermisos } from '@/lib/auth'

const itemDetalleSchema = z.object({
  productoId: z.string(),
  sku: z.string().optional().nullable(),
  nombre: z.string(),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  sesionCajaId: z.string().optional().nullable(),
})

const validarSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  accion: z.enum(['cancelar_venta', 'eliminar_item_carrito']),
  targetId: z.string().optional(),
  motivo: z.string().min(1, 'El motivo es requerido'),
  // Optional item detail — required when accion === 'eliminar_item_carrito'
  detalleItem: itemDetalleSchema.optional(),
})

// Maps each sensitive action to the permission required to authorize it
const PERMISOS_AUTORIZAR: Record<string, string> = {
  cancelar_venta: 'autorizar_cancelacion_venta',
  eliminar_item_carrito: 'autorizar_eliminacion_carrito',
}

export async function POST(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  let data: z.infer<typeof validarSchema>
  try {
    data = validarSchema.parse(body)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    throw e
  }

  // Find and validate the authorizer's credentials
  const autorizador = await prisma.usuario.findUnique({ where: { email: data.email } })
  if (!autorizador || !autorizador.activo) {
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
  }

  const passwordValida = await bcrypt.compare(data.password, autorizador.passwordHash)
  if (!passwordValida) {
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
  }

  // Verify the authorizer has the required permission
  const permisoRequerido = PERMISOS_AUTORIZAR[data.accion]
  if (!permisoRequerido) {
    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  }

  const permisosAutorizador = await obtenerPermisos(autorizador.id)
  if (!permisosAutorizador.includes(permisoRequerido)) {
    return NextResponse.json(
      { error: 'El autorizador no tiene permisos para esta acción' },
      { status: 403 }
    )
  }

  // ── eliminar_item_carrito — inline authorization ───────────────────────────
  //
  // The cart is client-side only; there is no server-side "consume token"
  // endpoint for this action. We therefore consume the authorization
  // immediately here: create a single-use token (for audit completeness),
  // mark it used, and write the AuditoriaAccion — all in one transaction.
  //
  // cancelar_venta keeps the traditional two-step flow (create token →
  // submit to /api/ventas/[id]/cancelar) because a persisted resource
  // (the sale) must be updated atomically with the audit entry.
  if (data.accion === 'eliminar_item_carrito') {
    const expiraEn = new Date(Date.now() + 5 * 60 * 1000)
    const usadoEn = new Date()

    await prisma.$transaction(async (tx) => {
      // Create and immediately mark the token as used
      const authToken = await tx.autorizacionToken.create({
        data: {
          accion: data.accion,
          targetId: data.targetId,
          solicitanteId: sesion.sub,
          autorizadorId: autorizador.id,
          motivo: data.motivo,
          expiraEn,
          usadoEn,
        },
      })

      // Write audit entry with item detail
      await tx.auditoriaAccion.create({
        data: {
          accion: 'eliminar_item_carrito',
          solicitanteId: sesion.sub,
          autorizadorId: autorizador.id,
          targetId: authToken.id,
          motivo: data.motivo,
          detalle: data.detalleItem ? (data.detalleItem as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      })
    })

    return NextResponse.json({
      ok: true,
      autorizador: { nombre: autorizador.nombre },
    })
  }

  // ── cancelar_venta — classic two-step: create token, consume at cancelar ──
  const expiraEn = new Date(Date.now() + 5 * 60 * 1000)
  const authToken = await prisma.autorizacionToken.create({
    data: {
      accion: data.accion,
      targetId: data.targetId,
      solicitanteId: sesion.sub,
      autorizadorId: autorizador.id,
      motivo: data.motivo,
      expiraEn,
    },
  })

  return NextResponse.json({
    token: authToken.token,
    expiraEn: authToken.expiraEn,
    autorizador: { nombre: autorizador.nombre },
  })
}
