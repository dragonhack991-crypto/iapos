'use client'

import { useState, useEffect, useCallback } from 'react'

interface SesionCaja {
  id: string
  cajaId: string
  fechaApertura: string
  montoInicial: string
  estado: string
  caja: { nombre: string; sucursal: { nombre: string } }
}

export default function CajaPage() {
  const [sesion, setSesion] = useState<SesionCaja | null>(null)
  const [loading, setLoading] = useState(true)
  const [montoInicial, setMontoInicial] = useState('')
  const [montoContado, setMontoContado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const cargarSesion = useCallback(async () => {
    try {
      const res = await fetch('/api/caja/sesion')
      if (res.ok) {
        const data = await res.json()
        setSesion(data.sesion)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarSesion()
  }, [cargarSesion])

  async function abrirCaja() {
    if (!montoInicial || isNaN(parseFloat(montoInicial))) {
      setError('Ingresa un monto inicial válido')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/caja/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cajaId: 'caja-1', montoInicial: parseFloat(montoInicial) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al abrir caja')
        return
      }
      setSesion(data.sesion)
      setMontoInicial('')
    } finally {
      setSubmitting(false)
    }
  }

  async function cerrarCaja() {
    if (!montoContado || isNaN(parseFloat(montoContado))) {
      setError('Ingresa el monto contado')
      return
    }
    if (!sesion) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/caja/sesion/${sesion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montoContado: parseFloat(montoContado),
          observaciones,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al cerrar caja')
        return
      }
      setSesion(null)
      setMontoContado('')
      setObservaciones('')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Caja</h1>
      <p className="text-gray-500 mb-8">Gestión de apertura y cierre de caja</p>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!sesion ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Abrir caja</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto inicial (MXN)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                placeholder="0.00"
              />
            </div>
            <button
              onClick={abrirCaja}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {submitting ? 'Abriendo...' : '✅ Abrir caja'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="font-semibold text-green-800">Caja abierta</span>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Apertura</dt>
                <dd className="font-medium">
                  {new Date(sesion.fechaApertura).toLocaleString('es-MX')}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Monto inicial</dt>
                <dd className="font-medium">
                  ${parseFloat(sesion.montoInicial).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Cerrar caja</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto contado (MXN)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoContado}
                  onChange={(e) => setMontoContado(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  rows={3}
                  placeholder="Notas del cierre..."
                />
              </div>
              <button
                onClick={cerrarCaja}
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-lg transition"
              >
                {submitting ? 'Cerrando...' : '🔒 Cerrar caja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
