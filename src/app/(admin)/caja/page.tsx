'use client'

import { useState, useEffect, useCallback } from 'react'

interface CajaInfo {
  id: string
  nombre: string
  sucursal: { nombre: string }
  usuarioAsignado: { id: string; nombre: string } | null
  sesionAbierta: { id: string; usuarioAperturaId: string } | null
}

interface SesionCaja {
  id: string
  cajaId: string
  fechaApertura: string
  montoInicial: string
  estado: string
  caja: { nombre: string; sucursal: { nombre: string } }
}

interface ResumenCorteZ {
  totalVentas: number
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
  totalIva: number
  totalIeps: number
  efectivoEsperado: number
  montoContado: number | null
  diferencia: number | null
  numVentas: number
}

export default function CajaPage() {
  const [cajas, setCajas] = useState<CajaInfo[]>([])
  const [cajaSeleccionada, setCajaSeleccionada] = useState<string>('')
  const [sesion, setSesion] = useState<SesionCaja | null>(null)
  const [loading, setLoading] = useState(true)
  const [montoInicial, setMontoInicial] = useState('')
  const [montoContado, setMontoContado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [corteZ, setCorteZ] = useState<ResumenCorteZ | null>(null)
  const [efectivoEsperado, setEfectivoEsperado] = useState<number | null>(null)

  const cargarDatos = useCallback(async () => {
    try {
      const [resCajas, resSesion] = await Promise.all([
        fetch('/api/caja/cajas'),
        fetch('/api/caja/sesion'),
      ])
      if (resCajas.ok) {
        const data = await resCajas.json()
        setCajas(data.cajas || [])
        const primera = (data.cajas as CajaInfo[]).find((c) => !c.sesionAbierta)
        if (primera) setCajaSeleccionada(primera.id)
      }
      if (resSesion.ok) {
        const data = await resSesion.json()
        setSesion(data.sesion || null)
        // Load efectivoEsperado preview if session is open
        if (data.sesion) {
          const preview = await fetch(`/api/caja/sesion/${data.sesion.id}`)
          if (preview.ok) {
            const pd = await preview.json()
            setEfectivoEsperado(pd.efectivoEsperado ?? null)
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  async function abrirCaja() {
    if (!cajaSeleccionada) {
      setError('Selecciona una caja para abrir')
      return
    }
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
        body: JSON.stringify({ cajaId: cajaSeleccionada, montoInicial: parseFloat(montoInicial) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al abrir caja')
        return
      }
      setSesion(data.sesion)
      setCorteZ(null)
      setMontoInicial('')
      setEfectivoEsperado(parseFloat(montoInicial))
      // Refresh caja list to update sesionAbierta status
      const resCajas = await fetch('/api/caja/cajas')
      if (resCajas.ok) {
        const dc = await resCajas.json()
        setCajas(dc.cajas || [])
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function cerrarCaja() {
    if (!sesion) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { observaciones }
      if (montoContado && !isNaN(parseFloat(montoContado))) {
        body.montoContado = parseFloat(montoContado)
      }
      const res = await fetch(`/api/caja/sesion/${sesion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al cerrar caja')
        return
      }
      setSesion(null)
      setMontoContado('')
      setObservaciones('')
      setEfectivoEsperado(null)
      if (data.resumen) setCorteZ(data.resumen)
      // Refresh caja list so freed caja becomes selectable again
      const resCajas = await fetch('/api/caja/cajas')
      if (resCajas.ok) {
        const dc = await resCajas.json()
        setCajas(dc.cajas || [])
        const primera = (dc.cajas as CajaInfo[]).find((c) => !c.sesionAbierta)
        if (primera) setCajaSeleccionada(primera.id)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Compute live diferencia for corte Z UI
  const montoContadoNum = montoContado && !isNaN(parseFloat(montoContado)) ? parseFloat(montoContado) : null
  const diferenciaVivo =
    efectivoEsperado !== null && montoContadoNum !== null
      ? Math.round((montoContadoNum - efectivoEsperado) * 100) / 100
      : null

  // Cajas libres (without an open session, so user can open one)
  const cajasLibres = cajas.filter((c) => !c.sesionAbierta)

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

      {/* Corte Z summary after close */}
      {!sesion && corteZ && (
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-blue-800 mb-4">🧾 Corte Z — Resumen de sesión</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2 flex justify-between font-semibold text-gray-800 border-b border-blue-200 pb-2">
              <dt>Ventas completadas</dt>
              <dd>{corteZ.numVentas}</dd>
            </div>
            <div className="flex justify-between col-span-2">
              <dt className="text-gray-600">Total ventas</dt>
              <dd className="font-semibold">${corteZ.totalVentas.toFixed(2)}</dd>
            </div>
            {corteZ.totalEfectivo > 0 && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">Efectivo</dt>
                <dd>${corteZ.totalEfectivo.toFixed(2)}</dd>
              </div>
            )}
            {corteZ.totalTarjeta > 0 && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">Tarjeta</dt>
                <dd>${corteZ.totalTarjeta.toFixed(2)}</dd>
              </div>
            )}
            {corteZ.totalTransferencia > 0 && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">Transferencia</dt>
                <dd>${corteZ.totalTransferencia.toFixed(2)}</dd>
              </div>
            )}
            {corteZ.totalIva > 0 && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">IVA total</dt>
                <dd>${corteZ.totalIva.toFixed(2)}</dd>
              </div>
            )}
            {corteZ.totalIeps > 0 && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">IEPS total</dt>
                <dd>${corteZ.totalIeps.toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between col-span-2 border-t border-blue-200 pt-2">
              <dt className="text-gray-600">Efectivo esperado</dt>
              <dd>${corteZ.efectivoEsperado.toFixed(2)}</dd>
            </div>
            {corteZ.montoContado !== null && (
              <div className="flex justify-between col-span-2">
                <dt className="text-gray-600">Contado</dt>
                <dd>${corteZ.montoContado.toFixed(2)}</dd>
              </div>
            )}
            {corteZ.diferencia !== null && (
              <div className={`flex justify-between col-span-2 font-semibold ${corteZ.diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                <dt>Diferencia</dt>
                <dd>{corteZ.diferencia >= 0 ? '+' : ''}{corteZ.diferencia.toFixed(2)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {!sesion ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Abrir caja</h2>

          {cajasLibres.length === 0 && cajas.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4">
              No hay cajas disponibles. Todas tienen sesiones abiertas por otros usuarios.
            </div>
          )}

          <div className="space-y-4">
            {cajas.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caja
                </label>
                <select
                  value={cajaSeleccionada}
                  onChange={(e) => setCajaSeleccionada(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                >
                  <option value="">— Selecciona una caja —</option>
                  {cajas.map((c) => (
                    <option key={c.id} value={c.id} disabled={!!c.sesionAbierta}>
                      {c.nombre}
                      {c.sucursal ? ` — ${c.sucursal.nombre}` : ''}
                      {c.sesionAbierta ? ' (en uso)' : ''}
                      {c.usuarioAsignado ? ` [asignada a ${c.usuarioAsignado.nombre}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              disabled={submitting || cajasLibres.length === 0}
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
              <span className="font-semibold text-green-800">
                Caja abierta — {sesion.caja.nombre}
              </span>
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
                  Efectivo contado (MXN) <span className="text-gray-400 font-normal">— opcional</span>
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

              {/* Live corte Z difference panel */}
              {efectivoEsperado !== null && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-2">
                  <div className="flex justify-between text-gray-600">
                    <span>Efectivo esperado</span>
                    <span className="font-medium">${efectivoEsperado.toFixed(2)}</span>
                  </div>
                  {montoContadoNum !== null && (
                    <>
                      <div className="flex justify-between text-gray-600">
                        <span>Efectivo contado</span>
                        <span className="font-medium">${montoContadoNum.toFixed(2)}</span>
                      </div>
                      <div className={`flex justify-between font-bold border-t border-gray-200 pt-2 ${
                          diferenciaVivo === null
                            ? ''
                            : diferenciaVivo >= 0
                            ? 'text-green-700'
                            : 'text-red-700'
                        }`}>
                        <span>Diferencia</span>
                        <span>
                          {diferenciaVivo !== null
                            ? `${diferenciaVivo >= 0 ? '+' : ''}$${diferenciaVivo.toFixed(2)} (${diferenciaVivo >= 0 ? 'sobrante' : 'faltante'})`
                            : '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

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
