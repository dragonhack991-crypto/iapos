'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'

interface Producto {
  id: string
  nombre: string
  codigoBarras: string | null
  tipoVenta: string
  costoActual: string
  margen: string
  precioVenta: string
  ivaAplica: boolean
  activo: boolean
}

interface ProductoForm {
  nombre: string
  codigoBarras: string
  tipoVenta: 'PIEZA' | 'CAJA' | 'GRANEL'
  costoActual: number
  margen: number
  precioVenta: number
  ivaAplica: boolean
  iepsAplica: boolean
  iepsPorcentaje: number
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ProductoForm>({
    defaultValues: {
      tipoVenta: 'PIEZA',
      ivaAplica: true,
      iepsAplica: false,
      iepsPorcentaje: 0,
      margen: 30,
    },
  })

  const costo = watch('costoActual')
  const margen = watch('margen')

  useEffect(() => {
    if (costo && margen) {
      const precio = parseFloat(String(costo)) * (1 + parseFloat(String(margen)) / 100)
      setValue('precioVenta', Math.round(precio * 100) / 100)
    }
  }, [costo, margen, setValue])

  const cargarProductos = useCallback(async () => {
    try {
      const res = await fetch('/api/productos')
      if (res.ok) {
        const data = await res.json()
        setProductos(data.productos)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarProductos()
  }, [cargarProductos])

  async function onSubmit(data: ProductoForm) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Error al crear producto')
        return
      }
      reset()
      setShowForm(false)
      await cargarProductos()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500 mt-1">Catálogo de productos</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition"
        >
          {showForm ? '✕ Cancelar' : '+ Nuevo producto'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Nuevo producto</h2>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                {...register('nombre', { required: 'Requerido' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Nombre del producto"
              />
              {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras</label>
              <input
                type="text"
                {...register('codigoBarras')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de venta</label>
              <select
                {...register('tipoVenta')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="PIEZA">Pieza</option>
                <option value="CAJA">Caja</option>
                <option value="GRANEL">Granel</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register('costoActual', { required: 'Requerido', min: 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0.00"
              />
              {errors.costoActual && <p className="mt-1 text-sm text-red-600">{errors.costoActual.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Margen (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register('margen', { required: 'Requerido', min: 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio de venta (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register('precioVenta', { required: 'Requerido', min: 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0.00"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" {...register('ivaAplica')} className="w-4 h-4 text-indigo-600" />
                Aplica IVA (16%)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" {...register('iepsAplica')} className="w-4 h-4 text-indigo-600" />
                Aplica IEPS
              </label>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-6 py-2 rounded-lg transition"
              >
                {submitting ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Código</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Tipo</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600">Costo</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600">Precio</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">IVA</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No hay productos registrados
                  </td>
                </tr>
              ) : (
                productos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-6 py-3 text-gray-500">{p.codigoBarras || '-'}</td>
                    <td className="px-6 py-3 text-gray-500">{p.tipoVenta}</td>
                    <td className="px-6 py-3 text-right text-gray-700">
                      ${parseFloat(p.costoActual).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      ${parseFloat(p.precioVenta).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {p.ivaAplica ? '✅' : '—'}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
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
