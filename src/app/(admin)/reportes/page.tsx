'use client'

import { useState, useEffect, useCallback } from 'react'

interface Resumen {
  totalVentas: number
  totalIva: number
  totalIeps: number
  numVentas: number
}

interface VentaDia {
  dia: string
  numVentas: number
  total: number
}

interface TopProducto {
  productoId: string
  nombre: string
  cantidadTotal: number
  ventasTotal: number
  numLineas: number
}

interface VentaMetodo {
  metodoPago: string
  numVentas: number
  total: number
}

const METODO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

export default function ReportesPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [ventasPorDia, setVentasPorDia] = useState<VentaDia[]>([])
  const [topProductos, setTopProductos] = useState<TopProducto[]>([])
  const [ventasPorMetodo, setVentasPorMetodo] = useState<VentaMetodo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const cargarReporte = useCallback(async (fi: string, ff: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (fi) params.set('fechaInicio', fi)
      if (ff) params.set('fechaFin', ff)
      const res = await fetch(`/api/reportes?${params.toString()}`)
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Error al cargar reportes')
        return
      }
      const data = await res.json()
      setResumen(data.resumen)
      setVentasPorDia(data.ventasPorDia ?? [])
      setTopProductos(data.topProductos ?? [])
      setVentasPorMetodo(data.ventasPorMetodo ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarReporte('', '')
  }, [cargarReporte])

  function aplicarFiltros() {
    cargarReporte(fechaInicio, fechaFin)
  }

  function limpiarFiltros() {
    setFechaInicio('')
    setFechaFin('')
    cargarReporte('', '')
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reportes</h1>
        <p className="text-gray-500 text-sm">Resumen de ventas, productos y métodos de pago</p>
      </div>

      {/* Date filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={aplicarFiltros}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
          >
            {loading ? 'Cargando...' : 'Aplicar'}
          </button>
          <button
            onClick={limpiarFiltros}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
          >
            Ver todo
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Ventas realizadas</p>
            <p className="text-2xl font-bold text-gray-900">{resumen.numVentas}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total ventas</p>
            <p className="text-2xl font-bold text-indigo-700">${resumen.totalVentas.toFixed(2)}</p>
          </div>
          {resumen.totalIva > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">IVA total</p>
              <p className="text-2xl font-bold text-gray-900">${resumen.totalIva.toFixed(2)}</p>
            </div>
          )}
          {resumen.totalIeps > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">IEPS total</p>
              <p className="text-2xl font-bold text-gray-900">${resumen.totalIeps.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by payment method */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ventas por método de pago</h2>
          {ventasPorMetodo.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin datos en el período seleccionado</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Método</th>
                  <th className="text-right py-2 font-medium">Ventas</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ventasPorMetodo.map((m) => (
                  <tr key={m.metodoPago}>
                    <td className="py-2 text-gray-700">{METODO_LABELS[m.metodoPago] ?? m.metodoPago}</td>
                    <td className="py-2 text-right text-gray-600">{m.numVentas}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">${m.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Top 10 productos</h2>
          {topProductos.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin datos en el período seleccionado</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Producto</th>
                  <th className="text-right py-2 font-medium">Cant.</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topProductos.map((p, i) => (
                  <tr key={p.productoId}>
                    <td className="py-2 text-gray-700">
                      <span className="text-gray-400 mr-1.5">#{i + 1}</span>
                      {p.nombre}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {p.cantidadTotal % 1 === 0 ? p.cantidadTotal.toFixed(0) : p.cantidadTotal.toFixed(3)}
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900">${p.ventasTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sales by day */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Ventas por día</h2>
        {ventasPorDia.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin datos en el período seleccionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Fecha</th>
                  <th className="text-right py-2 font-medium">Núm. ventas</th>
                  <th className="text-right py-2 font-medium">Total del día</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ventasPorDia.map((d) => (
                  <tr key={d.dia}>
                    <td className="py-2 text-gray-700">
                      {new Date(d.dia + 'T12:00:00').toLocaleDateString('es-MX', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-2 text-right text-gray-600">{d.numVentas}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">${d.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
