process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/iapos?schema=public'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const permisos = [
    { nombre: 'ver_dashboard', descripcion: 'Ver el panel principal' },
    { nombre: 'vender', descripcion: 'Realizar ventas' },
    { nombre: 'cancelar_venta', descripcion: 'Cancelar ventas' },
    { nombre: 'abrir_caja', descripcion: 'Abrir sesión de caja' },
    { nombre: 'cerrar_caja', descripcion: 'Cerrar sesión de caja' },
    { nombre: 'administrar_usuarios', descripcion: 'Gestionar usuarios del sistema' },
    { nombre: 'administrar_inventario', descripcion: 'Gestionar inventario' },
    { nombre: 'ver_reportes', descripcion: 'Ver reportes del sistema' },
    { nombre: 'administrar_productos', descripcion: 'Gestionar productos' },
    { nombre: 'administrar_configuracion', descripcion: 'Gestionar configuración del sistema' },
  ]

  for (const permiso of permisos) {
    await prisma.permiso.upsert({
      where: { nombre: permiso.nombre },
      update: {},
      create: permiso,
    })
  }

  const rolAdmin = await prisma.rol.upsert({
    where: { nombre: 'Administrador' },
    update: {},
    create: { nombre: 'Administrador', descripcion: 'Acceso total al sistema' },
  })

  const rolCajero = await prisma.rol.upsert({
    where: { nombre: 'Cajero' },
    update: {},
    create: { nombre: 'Cajero', descripcion: 'Operar caja y realizar ventas' },
  })

  const rolVendedor = await prisma.rol.upsert({
    where: { nombre: 'Vendedor' },
    update: {},
    create: { nombre: 'Vendedor', descripcion: 'Realizar ventas' },
  })

  const todosPermisos = await prisma.permiso.findMany()
  for (const permiso of todosPermisos) {
    await prisma.rolPermiso.upsert({
      where: { rolId_permisoId: { rolId: rolAdmin.id, permisoId: permiso.id } },
      update: {},
      create: { rolId: rolAdmin.id, permisoId: permiso.id },
    })
  }

  const permisosCajero = ['ver_dashboard', 'vender', 'cancelar_venta', 'abrir_caja', 'cerrar_caja']
  for (const nombrePermiso of permisosCajero) {
    const permiso = await prisma.permiso.findUnique({ where: { nombre: nombrePermiso } })
    if (permiso) {
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rolCajero.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rolCajero.id, permisoId: permiso.id },
      })
    }
  }

  const permisosVendedor = ['ver_dashboard', 'vender']
  for (const nombrePermiso of permisosVendedor) {
    const permiso = await prisma.permiso.findUnique({ where: { nombre: nombrePermiso } })
    if (permiso) {
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rolVendedor.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rolVendedor.id, permisoId: permiso.id },
      })
    }
  }

  const sucursal = await prisma.sucursal.upsert({
    where: { id: 'sucursal-principal' },
    update: {},
    create: { id: 'sucursal-principal', nombre: 'Sucursal Principal', activo: true },
  })

  await prisma.caja.upsert({
    where: { id: 'caja-1' },
    update: {},
    create: { id: 'caja-1', nombre: 'Caja 1', sucursalId: sucursal.id, activo: true },
  })

  await prisma.caja.upsert({
    where: { id: 'caja-2' },
    update: {},
    create: { id: 'caja-2', nombre: 'Caja 2', sucursalId: sucursal.id, activo: true },
  })

  console.log('Seed completado exitosamente')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
