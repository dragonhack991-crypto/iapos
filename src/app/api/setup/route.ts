import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const setupSchema = z.object({
  nombreNegocio: z
    .string()
    .trim()
    .min(2, 'El nombre del negocio debe tener al menos 2 caracteres'),
  admin: z.object({
    nombre: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
})

export async function POST(request: NextRequest) {
  try {
    const existente = await prisma.configuracionSistema.findUnique({
      where: { clave: 'configurado' },
    })
    if (existente) {
      return NextResponse.json({ error: 'El sistema ya está configurado' }, { status: 409 })
    }

    const body = await request.json()
    const { nombreNegocio, admin } = setupSchema.parse(body)

    const usuarioExistente = await prisma.usuario.findUnique({ where: { email: admin.email } })
    if (usuarioExistente) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(admin.password, 12)

    await prisma.$transaction(async (tx) => {
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
      const rolCajero = await tx.rol.upsert({ where: { nombre: 'Cajero' }, update: {}, create: { nombre: 'Cajero', descripcion: 'Operador de caja' } })
      const rolVendedor = await tx.rol.upsert({ where: { nombre: 'Vendedor' }, update: {}, create: { nombre: 'Vendedor', descripcion: 'Realizar ventas' } })

      const todosPermisos = await tx.permiso.findMany()
      for (const p of todosPermisos) {
        await tx.rolPermiso.upsert({
          where: { rolId_permisoId: { rolId: rolAdmin.id, permisoId: p.id } },
          update: {},
          create: { rolId: rolAdmin.id, permisoId: p.id },
        })
      }

      // Assign specific permissions for Cajero and Vendedor roles
      const permisosCajero = ['ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja']
      for (const nombrePermiso of permisosCajero) {
        const p = todosPermisos.find((x) => x.nombre === nombrePermiso)
        if (p) {
          await tx.rolPermiso.upsert({
            where: { rolId_permisoId: { rolId: rolCajero.id, permisoId: p.id } },
            update: {},
            create: { rolId: rolCajero.id, permisoId: p.id },
          })
        }
      }

      const permisosVendedor = ['ver_dashboard', 'vender']
      for (const nombrePermiso of permisosVendedor) {
        const p = todosPermisos.find((x) => x.nombre === nombrePermiso)
        if (p) {
          await tx.rolPermiso.upsert({
            where: { rolId_permisoId: { rolId: rolVendedor.id, permisoId: p.id } },
            update: {},
            create: { rolId: rolVendedor.id, permisoId: p.id },
          })
        }
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

      await tx.configuracionSistema.create({
        data: { clave: 'configurado', valor: 'true' },
      })
      await tx.configuracionSistema.create({
        data: { clave: 'nombre_negocio', valor: nombreNegocio },
      })
    })

    const response = NextResponse.json({ ok: true })
    // Signal to middleware that the system has been initialized.
    // This is a routing convenience flag – actual security is enforced by the
    // JWT session token and the DB guard above.
    response.cookies.set('iapos_initialized', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
    return response
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: e.errors[0]?.message ?? 'Datos inválidos',
          detalles: process.env.NODE_ENV === 'development' ? e.errors : undefined,
        },
        { status: 422 }
      )
    }
    console.error(e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
