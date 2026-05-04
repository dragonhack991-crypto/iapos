'use client'

import { useState, useEffect, useCallback } from 'react'
import AutorizacionModal from '@/components/AutorizacionModal'

interface VentaDetalle {
  id: string
  productoId: string
  cantidad: string
  precioUnitario: string
  subtotal: string
  ivaUnitario: string
  iepsUnitario: string
  total: string
  producto: { id: string; nombre: string; codigoBarras: string | null }
}

interface Venta {
  id: string
  folio: number
  creadoEn: string
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'
  subtotal: string
  totalIva: string
  totalIeps: string
  total: string
  pagoCon: string | null
  cambio: string | null
  banco: string | null
  referencia: string | null
  ultimos4: string | null
  numeroOperacion: string | null
  estado: 'COMPLETADA' | 'CANCELADA'
  canceladoEn: string | null
  motivoCancelacion: string | null
  usuario: { id: string; nombre: string } | null
  canceladoPor: { id: string; nombre: string } | null
  sesionCaja: { caja: { nombre: string; sucursal: { nombre: string } } } | null
  detalles: VentaDetalle[]
}

interface Pagination {
  total: number
  page: number
  perPage: number
  totalPages: number
}

const METODO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

function toNum(v: string | null | undefined) {
  if (v == null) return 0
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

export default function VentasHistorialPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, perPage: 20, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [folio, setFolio] = useState('')
  const [metodoPago, setMetodoPago] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)

  // Detail modal
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null)

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<Venta | null>(null)
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Authorization escalation
  const [authPendiente, setAuthPendiente] = useState<{ ventaId: string; motivo: string } | null>(null)

  const cargarVentas = useCallback(async (currentPage = 1) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('perPage', '20')
      if (fechaInicio) params.set('fechaInicio', fechaInicio)
      if (fechaFin) params.set('fechaFin', fechaFin)
      if (folio) params.set('folio', folio)
      if (metodoPago) params.set('metodoPago', metodoPago)
      if (estado) params.set('estado', estado)

      const res = await fetch(`/api/ventas?${params.toString()}`)
      if (!res.ok) {
        setError('Error al cargar las ventas')
        return
      }
      const data = await res.json()
      setVentas(data.ventas || [])
      if (data.pagination) setPagination(data.pagination)
    } finally {
      setLoading(false)
    }
  }, [fechaInicio, fechaFin, folio, metodoPago, estado])

  useEffect(() => {
    cargarVentas(page)
  }, [cargarVentas, page])

  function aplicarFiltros() {
    setPage(1)
    cargarVentas(1)
  }

  function limpiarFiltros() {
    setFechaInicio('')
    setFechaFin('')
    setFolio('')
    setMetodoPago('')
    setEstado('')
    setPage(1)
  }

  async function cancelarVenta(authToken?: string, motivoOverride?: string) {
    if (!cancelModal) return
    const motivo = motivoOverride ?? motivoCancelacion
    if (!motivo.trim()) {
      setCancelError('El motivo de cancelación es requerido')
      return
    }
    setCancelando(true)
    setCancelError(null)
    try {
      const body: Record<string, string> = { motivo: motivo.trim() }
      if (authToken) body.authToken = authToken

      const res = await fetch(`/api/ventas/${cancelModal.id}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.codigo === 'REQUIERE_AUTORIZACION') {
          // Escalate to authorization modal
          setAuthPendiente({ ventaId: cancelModal.id, motivo: motivo.trim() })
          return
        }
        setCancelError(data.error || 'Error al cancelar la venta')
        return
      }
      // Update venta in list
      setVentas((prev) =>
        prev.map((v) =>
          v.id === cancelModal.id
            ? { ...v, estado: 'CANCELADA', canceladoEn: data.venta.canceladoEn, motivoCancelacion: data.venta.motivoCancelacion, canceladoPor: data.venta.canceladoPor }
            : v
        )
      )
      setCancelModal(null)
      setMotivoCancelacion('')
      setAuthPendiente(null)
    } finally {
      setCancelando(false)
    }
  }

  async function onAuthSuccess(token: string, motivo: string) {
    setAuthPendiente(null)
    await cancelarVenta(token, motivo)
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Historial de ventas</h1>
        <p className="text-gray-500 text-sm">Consulta, filtra y gestiona las ventas realizadas</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Folio</label>
            <input
              type="number"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="Ej: 42"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="COMPLETADA">Activa</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={aplicarFiltros}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            Buscar
          </button>
          <button
            onClick={limpiarFiltros}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
          >
            Limpiar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : ventas.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No se encontraron ventas con los filtros aplicados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Folio</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha/Hora</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Método pago</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cajero</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.map((venta) => (
                  <tr key={venta.id} className={`hover:bg-gray-50 transition ${venta.estado === 'CANCELADA' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-700">#{venta.folio}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(venta.creadoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">${toNum(venta.total).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{METODO_LABELS[venta.metodoPago] ?? venta.metodoPago}</td>
                    <td className="px-4 py-3">
                      {venta.estado === 'COMPLETADA' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Cancelada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{venta.usuario?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setVentaDetalle(venta)}
                          className="px-3 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
                        >
                          Ver
                        </button>
                        <a
                          href={`/ventas/ticket/${venta.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition"
                        >
                          🖨️ Ticket
                        </a>
                        {venta.estado === 'COMPLETADA' && (
                          <button
                            onClick={() => { setCancelModal(venta); setCancelError(null); setMotivoCancelacion('') }}
                            className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Mostrando {((pagination.page - 1) * pagination.perPage) + 1}–{Math.min(pagination.page * pagination.perPage, pagination.total)} de {pagination.total} ventas
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              ←
            </button>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - pagination.page) <= 2)
              .map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 border rounded-lg ${p === pagination.page ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {ventaDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Venta #{ventaDetalle.folio}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(ventaDetalle.creadoEn).toLocaleString('es-MX')} · {METODO_LABELS[ventaDetalle.metodoPago]}
                  {ventaDetalle.usuario && ` · ${ventaDetalle.usuario.nombre}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/ventas/ticket/${ventaDetalle.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
                >
                  🖨️ Ticket
                </a>
                <button
                  onClick={() => setVentaDetalle(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Status badge */}
              <div className="mb-4">
                {ventaDetalle.estado === 'COMPLETADA' ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    ✅ Activa
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                    ❌ Cancelada
                  </span>
                )}
              </div>

              {/* Cancellation info */}
              {ventaDetalle.estado === 'CANCELADA' && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-red-800 mb-1">Información de cancelación</p>
                  {ventaDetalle.canceladoEn && (
                    <p className="text-red-700">Fecha: {new Date(ventaDetalle.canceladoEn).toLocaleString('es-MX')}</p>
                  )}
                  {ventaDetalle.canceladoPor && (
                    <p className="text-red-700">Por: {ventaDetalle.canceladoPor.nombre}</p>
                  )}
                  {ventaDetalle.motivoCancelacion && (
                    <p className="text-red-700">Motivo: {ventaDetalle.motivoCancelacion}</p>
                  )}
                </div>
              )}

              {/* Line items */}
              <h3 className="font-semibold text-gray-800 mb-3">Artículos</h3>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium">Precio</th>
                      <th className="text-right px-3 py-2 font-medium">IVA</th>
                      <th className="text-right px-3 py-2 font-medium">IEPS</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventaDetalle.detalles.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">{d.producto.nombre}</td>
                        <td className="px-3 py-2 text-right">{parseFloat(d.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                        <td className="px-3 py-2 text-right">${toNum(d.precioUnitario).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">${(toNum(d.ivaUnitario) * parseFloat(d.cantidad)).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">${(toNum(d.iepsUnitario) * parseFloat(d.cantidad)).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">${toNum(d.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>${toNum(ventaDetalle.subtotal).toFixed(2)}</span>
                </div>
                {toNum(ventaDetalle.totalIva) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>IVA (16%)</span>
                    <span>${toNum(ventaDetalle.totalIva).toFixed(2)}</span>
                  </div>
                )}
                {toNum(ventaDetalle.totalIeps) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>IEPS</span>
                    <span>${toNum(ventaDetalle.totalIeps).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200 text-base">
                  <span>Total</span>
                  <span>${toNum(ventaDetalle.total).toFixed(2)}</span>
                </div>
                {ventaDetalle.metodoPago === 'EFECTIVO' && ventaDetalle.pagoCon && (
                  <>
                    <div className="flex justify-between text-gray-500 text-xs">
                      <span>Pago con</span>
                      <span>${toNum(ventaDetalle.pagoCon).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-xs">
                      <span>Cambio</span>
                      <span>${toNum(ventaDetalle.cambio).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {ventaDetalle.metodoPago === 'TARJETA' && (
                  <>
                    {ventaDetalle.ultimos4 && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Tarjeta</span>
                        <span>**** {ventaDetalle.ultimos4}</span>
                      </div>
                    )}
                    {ventaDetalle.numeroOperacion && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Núm. operación</span>
                        <span>{ventaDetalle.numeroOperacion}</span>
                      </div>
                    )}
                  </>
                )}
                {ventaDetalle.metodoPago === 'TRANSFERENCIA' && (
                  <>
                    {ventaDetalle.banco && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Banco</span>
                        <span>{ventaDetalle.banco}</span>
                      </div>
                    )}
                    {ventaDetalle.referencia && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Referencia</span>
                        <span>{ventaDetalle.referencia}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Cancelar venta #{cancelModal.folio}</h2>
              <p className="text-sm text-gray-500 mt-1">Esta acción revertirá el inventario automáticamente</p>
            </div>
            <div className="p-6 space-y-4">
              {cancelError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {cancelError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo de cancelación <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={motivoCancelacion}
                  onChange={(e) => setMotivoCancelacion(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Describe el motivo de la cancelación..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setCancelModal(null); setMotivoCancelacion(''); setCancelError(null) }}
                  className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  onClick={() => cancelarVenta()}
                  disabled={cancelando || !motivoCancelacion.trim()}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition"
                >
                  {cancelando ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Authorization escalation modal */}
      {authPendiente && cancelModal && (
        <AutorizacionModal
          accion="cancelar_venta"
          targetId={authPendiente.ventaId}
          onSuccess={onAuthSuccess}
          onCancel={() => { setAuthPendiente(null); setCancelError('Autorización cancelada') }}
        />
      )}
    </div>
  )
}
