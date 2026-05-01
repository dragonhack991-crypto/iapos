import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/auth'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-indigo-600">iaPOS</h1>
          <p className="text-xs text-gray-500 mt-1">{sesion.nombre}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/dashboard" icon="📊">Dashboard</NavLink>
          <NavLink href="/caja" icon="💰">Caja</NavLink>
          <NavLink href="/productos" icon="📦">Productos</NavLink>
          <NavLink href="/inventario" icon="🗂️">Inventario</NavLink>
          {sesion.permisos.includes('administrar_usuarios') && (
            <NavLink href="/usuarios" icon="👥">Usuarios</NavLink>
          )}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
    >
      <span>{icon}</span>
      <span>{children}</span>
    </Link>
  )
}
