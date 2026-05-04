import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { obtenerSesion } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion()
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Only admins/users with administrar_usuarios can view audit log
  if (
    !sesion.permisos.includes('administrar_usuarios') &&
    !sesion.permisos.includes('ver_reportes')
  ) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') ?? '20', 10)))
  const fechaInicio = searchParams.get('fechaInicio')
  const fechaFin = searchParams.get('fechaFin')
  const accion = searchParams.get('accion')
  const solicitanteId = searchParams.get('solicitanteId')
  const sucursalId = searchParams.get('sucursalId')

  const where: Prisma.AuditoriaAccionWhereInput = {}

  if (fechaInicio || fechaFin) {
    where.creadoEn = {}
    if (fechaInicio) where.creadoEn.gte = new Date(fechaInicio)
    if (fechaFin) {
      const end = new Date(fechaFin)
      end.setHours(23, 59, 59, 999)
      where.creadoEn.lte = end
    }
  }

  if (accion && ['cancelar_venta', 'eliminar_item_carrito'].includes(accion)) {
    where.accion = accion
  }

  if (solicitanteId) {
    where.solicitanteId = solicitanteId
  }

  if (sucursalId) {
    where.sucursalId = sucursalId
  }

  const [total, eventos] = await Promise.all([
    prisma.auditoriaAccion.count({ where }),
    prisma.auditoriaAccion.findMany({
      where,
      include: {
        solicitante: { select: { id: true, nombre: true, email: true } },
        autorizador: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: { creadoEn: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ])

  return NextResponse.json({
    eventos,
    pagination: {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    },
  })
}
