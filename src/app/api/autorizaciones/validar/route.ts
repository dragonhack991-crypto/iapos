import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { obtenerSesion, obtenerPermisos } from '@/lib/auth'

const validarSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  accion: z.enum(['cancelar_venta', 'eliminar_item_carrito']),
  targetId: z.string().optional(),
  motivo: z.string().min(1, 'El motivo es requerido'),
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

  // Create a single-use, short-lived token (5 minutes)
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
