'use client'

import { useState, useEffect, useCallback } from 'react'

interface InventarioItem {
  id: string
  cantidad: string
  actualizadoEn: string
  producto: {
    id: string
    nombre: string
    codigoBarras: string | null
    tipoVenta: string
  }
}

export default function InventarioPage() {
  const [inventario, setInventario] = useState<InventarioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ajuste, setAjuste] = useState<{ productoId: string; tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' } | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const cargarInventario = useCallback(async () => {
    try {
      const res = await fetch('/api/inventario')
      if (res.ok) {
        const data = await res.json()
        setInventario(data.inventario)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarInventario()
  }, [cargarInventario])

  async function registrarMovimiento() {
    if (!ajuste || !cantidad || isNaN(parseFloat(cantidad))) {
      setError('Ingresa una cantidad válida')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productoId: ajuste.productoId,
          tipo: ajuste.tipo,
          cantidad: parseFloat(cantidad),
          motivo,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al registrar movimiento')
        return
      }
      setAjuste(null)
      setCantidad('')
      setMotivo('')
      await cargarInventario()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-gray-500 mt-1">Control de existencias</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {ajuste && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Registrar {ajuste.tipo === 'ENTRADA' ? 'Entrada' : ajuste.tipo === 'SALIDA' ? 'Salida' : 'Ajuste'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Descripción del movimiento"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={registrarMovimiento}
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-4 py-2 rounded-lg transition"
              >
                {submitting ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => { setAjuste(null); setCantidad(''); setMotivo('') }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Producto</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Código</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600">Existencia</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">Tipo</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventario.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    No hay registros de inventario
                  </td>
                </tr>
              ) : (
                inventario.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{item.producto.nombre}</td>
                    <td className="px-6 py-3 text-gray-500">{item.producto.codigoBarras || '-'}</td>
                    <td className="px-6 py-3 text-right font-semibold">
                      <span className={parseFloat(item.cantidad) <= 0 ? 'text-red-600' : 'text-gray-900'}>
                        {parseFloat(item.cantidad).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center text-gray-500">{item.producto.tipoVenta}</td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setAjuste({ productoId: item.producto.id, tipo: 'ENTRADA' })}
                          className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded transition"
                        >
                          +Entrada
                        </button>
                        <button
                          onClick={() => setAjuste({ productoId: item.producto.id, tipo: 'SALIDA' })}
                          className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition"
                        >
                          -Salida
                        </button>
                        <button
                          onClick={() => setAjuste({ productoId: item.producto.id, tipo: 'AJUSTE' })}
                          className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition"
                        >
                          Ajuste
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
