import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'

const cancelarSchema = z.object({
  motivo: z.string().min(1, 'El motivo de cancelación es requerido'),
  authToken: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

  // Check if the acting user has direct cancel permission
  const tienePermisoDirecto = sesion.permisos.includes('cancelar_venta')

  let autorizadorId: string | undefined
  let motivo = data.motivo

  if (!tienePermisoDirecto) {
    // Require a valid authorization token
    if (!data.authToken) {
      return NextResponse.json(
        { error: 'Se requiere autorización', codigo: 'REQUIERE_AUTORIZACION' },
        { status: 403 }
      )
    }

    const authToken = await prisma.autorizacionToken.findUnique({
      where: { token: data.authToken },
    })

    if (!authToken) {
      return NextResponse.json({ error: 'Token de autorización inválido' }, { status: 403 })
    }

    if (authToken.usadoEn) {
      return NextResponse.json({ error: 'El token de autorización ya fue utilizado' }, { status: 403 })
    }

    if (authToken.expiraEn < new Date()) {
      return NextResponse.json({ error: 'El token de autorización ha expirado' }, { status: 403 })
    }

    if (authToken.accion !== 'cancelar_venta') {
      return NextResponse.json({ error: 'Token no válido para esta acción' }, { status: 403 })
    }

    if (authToken.targetId && authToken.targetId !== params.id) {
      return NextResponse.json({ error: 'Token no válido para esta venta' }, { status: 403 })
    }

    if (authToken.solicitanteId !== sesion.sub) {
      return NextResponse.json({ error: 'Token no válido para este usuario' }, { status: 403 })
    }

    // Mark token as used immediately
    await prisma.autorizacionToken.update({
      where: { id: authToken.id },
      data: { usadoEn: new Date() },
    })

    autorizadorId = authToken.autorizadorId
    motivo = authToken.motivo
  }

  const venta = await prisma.venta.findUnique({
    where: { id: params.id },
    include: {
      detalles: true,
      sesionCaja: { include: { caja: true } },
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

  const sucursalId = venta.sesionCaja?.caja?.sucursalId
  const cajaId = venta.sesionCaja?.cajaId

  try {
    const ventaCancelada = await prisma.$transaction(async (tx) => {
      // Mark venta as cancelled with metadata
      const updated = await tx.venta.update({
        where: { id: params.id },
        data: {
          estado: 'CANCELADA',
          canceladoEn: new Date(),
          canceladoPorId: sesion.sub,
          motivoCancelacion: motivo,
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
            motivo: `Cancelación venta folio #${venta.folio} — ${motivo}`,
            usuarioId: sesion.sub,
            ventaId: venta.id,
          },
        })
      }

      // Authorization audit log
      await tx.auditoriaAccion.create({
        data: {
          accion: 'cancelar_venta',
          solicitanteId: sesion.sub,
          autorizadorId: autorizadorId ?? null,
          targetId: venta.id,
          motivo,
          sucursalId: sucursalId ?? null,
          cajaId: cajaId ?? null,
        },
      })

      return updated
    })

    return NextResponse.json({ venta: ventaCancelada })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Error interno al cancelar la venta' }, { status: 500 })
  }
}
