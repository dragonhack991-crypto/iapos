import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const setupSchema = z.object({
  nombreNegocio: z.string().min(1),
  admin: z.object({
    nombre: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nombreNegocio, admin } = setupSchema.parse(body)

    const passwordHash = await bcrypt.hash(admin.password, 12)

    await prisma.$transaction(async (tx) => {
      // Verificación dentro de la transacción para evitar condición de carrera
      const yaConfigurado = await tx.configuracionSistema.findUnique({
        where: { clave: 'configurado' },
      })
      if (yaConfigurado) {
        throw new Error('YA_CONFIGURADO')
      }

      const usuarioExistente = await tx.usuario.findUnique({ where: { email: admin.email } })
      if (usuarioExistente) {
        throw new Error('EMAIL_DUPLICADO')
      }

      const permisos = [
        'ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja',
        'administrar_usuarios', 'administrar_inventario', 'ver_reportes',
        'administrar_productos', 'administrar_configuracion',
      ]
      for (const nombre of permisos) {
        await tx.permiso.upsert({
          where: { nombre },
          update: {},
          create: { nombre },
        })
      }

      const rolAdmin = await tx.rol.upsert({
        where: { nombre: 'Administrador' },
        update: {},
        create: { nombre: 'Administrador', descripcion: 'Acceso total' },
      })
      await tx.rol.upsert({ where: { nombre: 'Cajero' }, update: {}, create: { nombre: 'Cajero', descripcion: 'Operador de caja' } })
      await tx.rol.upsert({ where: { nombre: 'Vendedor' }, update: {}, create: { nombre: 'Vendedor', descripcion: 'Realizar ventas' } })

      const todosPermisos = await tx.permiso.findMany()
      for (const p of todosPermisos) {
        await tx.rolPermiso.upsert({
          where: { rolId_permisoId: { rolId: rolAdmin.id, permisoId: p.id } },
          update: {},
          create: { rolId: rolAdmin.id, permisoId: p.id },
        })
      }

      const usuario = await tx.usuario.create({
        data: { email: admin.email, nombre: admin.nombre, passwordHash },
      })

      await tx.usuarioRol.create({
        data: { usuarioId: usuario.id, rolId: rolAdmin.id },
      })

      const sucursal = await tx.sucursal.upsert({
        where: { id: 'sucursal-principal' },
        update: {},
        create: { id: 'sucursal-principal', nombre: 'Sucursal Principal' },
      })
      await tx.caja.upsert({
        where: { id: 'caja-1' },
        update: {},
        create: { id: 'caja-1', nombre: 'Caja 1', sucursalId: sucursal.id },
      })

      // Estas claves son únicas en BD; si otra petición concurrent llegó aquí
      // primero, el create lanzará P2002 que se captura abajo como YA_CONFIGURADO.
      await tx.configuracionSistema.create({
        data: { clave: 'configurado', valor: 'true' },
      })
      await tx.configuracionSistema.upsert({
        where: { clave: 'nombre_negocio' },
        update: { valor: nombreNegocio },
        create: { clave: 'nombre_negocio', valor: nombreNegocio },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'YA_CONFIGURADO') {
      return NextResponse.json({ error: 'El sistema ya está configurado' }, { status: 409 })
    }
    if (e instanceof Error && e.message === 'EMAIL_DUPLICADO') {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 400 })
    }
    // Conflicto de clave única en BD (carrera entre peticiones concurrentes)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'El sistema ya está configurado' }, { status: 409 })
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: e.errors }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
