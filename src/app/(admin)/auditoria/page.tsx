'use client'

import { useState, useEffect, useCallback } from 'react'

interface UsuarioRef {
  id: string
  nombre: string
  email: string
}

interface AuditoriaEvento {
  id: string
  accion: string
  targetId: string | null
  motivo: string
  sucursalId: string | null
  cajaId: string | null
  detalle: {
    productoId?: string
    sku?: string | null
    nombre?: string
    cantidad?: number
    precioUnitario?: number
    subtotal?: number
    sesionCajaId?: string | null
  } | null
  creadoEn: string
  solicitante: UsuarioRef
  autorizador: UsuarioRef | null
}

interface Pagination {
  total: number
  page: number
  perPage: number
  totalPages: number
}

const ACCION_LABELS: Record<string, string> = {
  cancelar_venta: 'Cancelar venta',
  eliminar_item_carrito: 'Eliminar ítem carrito',
}

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState<AuditoriaEvento[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, perPage: 20, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [accion, setAccion] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [page, setPage] = useState(1)

  const cargarEventos = useCallback(async (currentPage = 1) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('perPage', '20')
      if (fechaInicio) params.set('fechaInicio', fechaInicio)
      if (fechaFin) params.set('fechaFin', fechaFin)
      if (accion) params.set('accion', accion)
      if (sucursalId) params.set('sucursalId', sucursalId)

      const res = await fetch(`/api/auditoria?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al cargar auditoría')
        return
      }
      const data = await res.json()
      setEventos(data.eventos || [])
      if (data.pagination) setPagination(data.pagination)
    } finally {
      setLoading(false)
    }
  }, [fechaInicio, fechaFin, accion, sucursalId])

  useEffect(() => {
    cargarEventos(page)
  }, [cargarEventos, page])

  function aplicarFiltros() {
    setPage(1)
    cargarEventos(1)
  }

  function limpiarFiltros() {
    setFechaInicio('')
    setFechaFin('')
    setAccion('')
    setSucursalId('')
    setPage(1)
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Auditoría de acciones</h1>
        <p className="text-gray-500 text-sm">
          Registro de cancelaciones de venta y eliminaciones de ítems de carrito que requirieron autorización.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de acción</label>
            <select
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todas</option>
              <option value="cancelar_venta">Cancelar venta</option>
              <option value="eliminar_item_carrito">Eliminar ítem carrito</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ID Sucursal</label>
            <input
              type="text"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              placeholder="Filtrar por sucursal"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={aplicarFiltros}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            Aplicar filtros
          </button>
          <button
            onClick={limpiarFiltros}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg"
          >
            Limpiar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 py-8 text-center">Cargando...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {pagination.total} evento{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha/hora</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Acción</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Solicitante</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Autorizador</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Motivo</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Detalle ítem</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Referencia</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Sucursal / Caja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {eventos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">
                        No hay eventos de auditoría registrados
                      </td>
                    </tr>
                  ) : (
                    eventos.map((ev) => (
                      <tr key={ev.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(ev.creadoEn).toLocaleString('es-MX', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            ev.accion === 'cancelar_venta'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {ACCION_LABELS[ev.accion] ?? ev.accion}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{ev.solicitante.nombre}</p>
                          <p className="text-xs text-gray-500">{ev.solicitante.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          {ev.autorizador ? (
                            <>
                              <p className="font-medium text-gray-900">{ev.autorizador.nombre}</p>
                              <p className="text-xs text-gray-500">{ev.autorizador.email}</p>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Propio (sin escalación)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs">
                          <p className="truncate" title={ev.motivo}>{ev.motivo}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 min-w-[140px]">
                          {ev.detalle && ev.detalle.nombre ? (
                            <div className="space-y-0.5">
                              <p className="font-medium text-gray-800 truncate" title={ev.detalle.nombre}>
                                {ev.detalle.nombre}
                              </p>
                              {ev.detalle.sku && (
                                <p className="text-gray-400 font-mono">SKU: {ev.detalle.sku}</p>
                              )}
                              <p>
                                {ev.detalle.cantidad} × ${typeof ev.detalle.precioUnitario === 'number' ? ev.detalle.precioUnitario.toFixed(2) : ev.detalle.precioUnitario}
                                {' = '}
                                <span className="font-semibold">${typeof ev.detalle.subtotal === 'number' ? ev.detalle.subtotal.toFixed(2) : ev.detalle.subtotal}</span>
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                          {ev.targetId ? (
                            <span title={ev.targetId}>{ev.targetId.slice(0, 8)}…</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {ev.sucursalId ? (
                            <div>
                              <span className="font-medium">S:</span>{' '}
                              <span title={ev.sucursalId}>{ev.sucursalId.slice(0, 8)}…</span>
                              {ev.cajaId && (
                                <>
                                  {' / '}
                                  <span className="font-medium">C:</span>{' '}
                                  <span title={ev.cajaId}>{ev.cajaId.slice(0, 8)}…</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Página {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
