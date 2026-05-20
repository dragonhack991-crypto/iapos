'use client'

import { useState } from 'react'

export type AccionAutorizacion = 'cancelar_venta' | 'eliminar_item_carrito'

interface DetalleItem {
  productoId: string
  sku?: string | null
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  sesionCajaId?: string | null
}

interface AutorizacionModalProps {
  accion: AccionAutorizacion
  targetId?: string
  /** Item detail passed to the server for eliminar_item_carrito audit records */
  detalleItem?: DetalleItem
  /** Called after successful authorization.
   *  For cancelar_venta: receives the single-use token and motivo.
   *  For eliminar_item_carrito: the authorization is consumed server-side; receives no token. */
  onSuccess: (token: string, motivo: string) => void
  onCancel: () => void
}

const ACCION_LABELS: Record<AccionAutorizacion, string> = {
  cancelar_venta: 'Cancelar venta',
  eliminar_item_carrito: 'Eliminar producto del carrito',
}

export default function AutorizacionModal({
  accion,
  targetId,
  detalleItem,
  onSuccess,
  onCancel,
}: AutorizacionModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo.trim()) {
      setError('El motivo es requerido')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/autorizaciones/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          accion,
          targetId,
          motivo: motivo.trim(),
          detalleItem: detalleItem ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al validar autorización')
        return
      }
      // For eliminar_item_carrito the server consumed the authorization inline;
      // no token is returned. Pass empty string so callers don't need to branch.
      onSuccess(data.token ?? '', motivo.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Se requiere autorización</h2>
          <p className="text-sm text-gray-500 mt-1">
            Para <span className="font-medium">{ACCION_LABELS[accion]}</span>, ingresa las
            credenciales de un usuario con permisos de autorización.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo del autorizador <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="correo@ejemplo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Describe el motivo de la autorización..."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !email || !password || !motivo.trim()}
              className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition"
            >
              {loading ? 'Validando...' : 'Autorizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
