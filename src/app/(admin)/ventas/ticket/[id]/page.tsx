'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface VentaDetalle {
  id: string
  cantidad: string
  precioUnitario: string
  subtotal: string
  ivaUnitario: string
  iepsUnitario: string
  total: string
  producto: { id: string; nombre: string }
}

interface VentaTicket {
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
  usuario: { nombre: string } | null
  sesionCaja: { caja: { nombre: string; sucursal: { nombre: string } } } | null
  detalles: VentaDetalle[]
}

function toNum(v: string | null | undefined) {
  if (v == null) return 0
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

export default function TicketPage() {
  const params = useParams<{ id: string }>()
  const [venta, setVenta] = useState<VentaTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    fetch(`/api/ventas/${params.id}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => setVenta(d.venta))
      .catch(() => setError('No se pudo cargar el ticket'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando ticket...</div>
  if (error || !venta) return <div className="p-8 text-center text-red-600">{error ?? 'Ticket no encontrado'}</div>

  const fecha = new Date(venta.creadoEn)
  const nombreNegocio = venta.sesionCaja?.caja.sucursal.nombre ?? 'iaPOS'
  const nombreCaja = venta.sesionCaja?.caja.nombre ?? '—'

  return (
    <>
      {/* Print styles: enforce 58mm or 80mm width */}
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .ticket { width: 58mm; font-size: 9pt; margin: 0 auto; }
        }
        @media screen {
          .ticket { width: 320px; margin: 2rem auto; }
        }
      `}</style>

      {/* Print button — hidden on print */}
      <div className="no-print p-4 flex items-center gap-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
        >
          🖨️ Imprimir / PDF
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
        >
          ← Volver
        </button>
        <span className="text-sm text-gray-500">Ticket #{venta.folio}</span>
      </div>

      {/* Ticket content */}
      <div className="ticket font-mono text-xs bg-white p-4 border border-dashed border-gray-400">
        {/* Header */}
        <div className="text-center mb-3">
          <p className="font-bold text-base">{nombreNegocio}</p>
          <p className="text-gray-500">{nombreCaja}</p>
          <p className="text-gray-400 text-xs">{'─'.repeat(32)}</p>
        </div>

        {/* Folio + Date/Time */}
        <div className="mb-2 space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Folio:</span>
            <span className="font-bold">#{venta.folio}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha:</span>
            <span>{fecha.toLocaleDateString('es-MX')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Hora:</span>
            <span>{fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {venta.usuario && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cajero:</span>
              <span>{venta.usuario.nombre}</span>
            </div>
          )}
        </div>

        <p className="text-gray-400 text-center">{'─'.repeat(32)}</p>

        {/* Item lines */}
        <div className="my-2 space-y-1">
          <div className="flex text-gray-500 text-xs">
            <span className="flex-1">Producto</span>
            <span className="w-10 text-right">Cant</span>
            <span className="w-14 text-right">P.Unit</span>
            <span className="w-14 text-right">Total</span>
          </div>
          <p className="text-gray-400">{'─'.repeat(32)}</p>
          {venta.detalles.map((d) => {
            const cant = parseFloat(d.cantidad)
            const precio = toNum(d.precioUnitario)
            const total = toNum(d.total)
            return (
              <div key={d.id}>
                <p className="truncate font-medium">{d.producto.nombre}</p>
                <div className="flex">
                  <span className="flex-1" />
                  <span className="w-10 text-right">
                    {cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(3)}
                  </span>
                  <span className="w-14 text-right">${precio.toFixed(2)}</span>
                  <span className="w-14 text-right font-medium">${total.toFixed(2)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-gray-400 text-center">{'─'.repeat(32)}</p>

        {/* Totals */}
        <div className="my-2 space-y-0.5">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${toNum(venta.subtotal).toFixed(2)}</span>
          </div>
          {toNum(venta.totalIva) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>IVA (16%)</span>
              <span>${toNum(venta.totalIva).toFixed(2)}</span>
            </div>
          )}
          {toNum(venta.totalIeps) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>IEPS</span>
              <span>${toNum(venta.totalIeps).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 mt-1">
            <span>TOTAL</span>
            <span>${toNum(venta.total).toFixed(2)}</span>
          </div>
        </div>

        <p className="text-gray-400 text-center">{'─'.repeat(32)}</p>

        {/* Payment info */}
        <div className="my-2 space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Método:</span>
            <span>
              {{ EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' }[venta.metodoPago]}
            </span>
          </div>

          {venta.metodoPago === 'EFECTIVO' && venta.pagoCon && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>Recibido</span>
                <span>${toNum(venta.pagoCon).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Cambio</span>
                <span>${toNum(venta.cambio).toFixed(2)}</span>
              </div>
            </>
          )}

          {venta.metodoPago === 'TARJETA' && (
            <>
              {venta.ultimos4 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tarjeta</span>
                  <span>**** **** **** {venta.ultimos4}</span>
                </div>
              )}
              {venta.numeroOperacion && (
                <div className="flex justify-between text-gray-600">
                  <span>Operación</span>
                  <span>{venta.numeroOperacion}</span>
                </div>
              )}
            </>
          )}

          {venta.metodoPago === 'TRANSFERENCIA' && (
            <>
              {venta.banco && (
                <div className="flex justify-between text-gray-600">
                  <span>Banco</span>
                  <span>{venta.banco}</span>
                </div>
              )}
              {venta.referencia && (
                <div className="flex justify-between text-gray-600">
                  <span>Referencia</span>
                  <span>{venta.referencia}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-gray-400 text-center">{'─'.repeat(32)}</p>
        <div className="text-center text-gray-500 mt-2 space-y-0.5">
          <p>¡Gracias por su compra!</p>
          {venta.estado === 'CANCELADA' && (
            <p className="font-bold text-red-600">⚠ VENTA CANCELADA</p>
          )}
        </div>
      </div>
    </>
  )
}
