import { obtenerSesion } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const sesion = await obtenerSesion()

  const [totalProductos, totalUsuarios, sesionCajaAbierta] = await Promise.all([
    prisma.producto.count({ where: { activo: true } }),
    prisma.usuario.count({ where: { activo: true } }),
    sesion
      ? prisma.sesionCaja.findFirst({ where: { estado: 'ABIERTA', usuarioAperturaId: sesion.sub } })
      : null,
  ])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {sesion?.nombre}
        </h1>
        <p className="text-gray-500 mt-1">Panel de control del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Productos activos"
          value={totalProductos.toString()}
          icon="📦"
          color="blue"
        />
        <StatCard
          title="Usuarios activos"
          value={totalUsuarios.toString()}
          icon="👥"
          color="green"
        />
        <StatCard
          title="Estado de caja"
          value={sesionCajaAbierta ? 'Abierta' : 'Cerrada'}
          icon="💰"
          color={sesionCajaAbierta ? 'green' : 'red'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction href="/caja" icon="💰" label="Ir a Caja" />
          <QuickAction href="/productos" icon="📦" label="Productos" />
          <QuickAction href="/inventario" icon="🗂️" label="Inventario" />
          <QuickAction href="/usuarios" icon="👥" label="Usuarios" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string
  value: string
  icon: string
  color: 'blue' | 'green' | 'red' | 'yellow'
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  }
  return (
    <div className={`${colors[color]} border rounded-xl p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <span className="text-4xl">{icon}</span>
      </div>
    </div>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition text-center"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </a>
  )
}
