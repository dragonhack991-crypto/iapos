'use client'

import { useState, useEffect, useCallback } from 'react'

interface Sucursal {
  id: string
  nombre: string
}

interface UsuarioRef {
  id: string
  nombre: string
  email: string
}

interface SesionRef {
  id: string
  usuarioAperturaId: string
}

interface CajaInfo {
  id: string
  nombre: string
  activo: boolean
  sucursalId: string
  sucursal: Sucursal
  usuarioAsignado: UsuarioRef | null
  sesionAbierta: SesionRef | null
}

export default function AdminCajasPage() {
  const [cajas, setCajas] = useState<CajaInfo[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioRef[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Create form
  const [nuevaNombre, setNuevaNombre] = useState('')
  const [nuevaSucursalId, setNuevaSucursalId] = useState('')
  const [nuevaUsuarioId, setNuevaUsuarioId] = useState('')
  const [mostrarCrear, setMostrarCrear] = useState(false)

  const cargarDatos = useCallback(async () => {
    try {
      const [resCajas, resUsuarios] = await Promise.all([
        fetch('/api/caja/cajas'),
        fetch('/api/usuarios'),
      ])
      if (resCajas.ok) {
        const data = await resCajas.json()
        const cajasData: CajaInfo[] = data.cajas || []
        setCajas(cajasData)
        // Extract unique sucursales
        const sucursalesMap = new Map<string, Sucursal>()
        for (const c of cajasData) {
          if (c.sucursal) sucursalesMap.set(c.sucursal.id, c.sucursal)
        }
        setSucursales(Array.from(sucursalesMap.values()))
        if (cajasData.length > 0 && cajasData[0].sucursal) {
          setNuevaSucursalId(cajasData[0].sucursal.id)
        }
      }
      if (resUsuarios.ok) {
        const data = await resUsuarios.json()
        setUsuarios((data.usuarios || []).filter((u: UsuarioRef & { activo: boolean }) => u.activo))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  async function crearCaja() {
    if (!nuevaNombre.trim()) {
      setError('El nombre de la caja es requerido')
      return
    }
    if (!nuevaSucursalId) {
      setError('Selecciona una sucursal')
      return
    }
    if (!nuevaUsuarioId) {
      setError('Selecciona un usuario para asignar la caja')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/caja/cajas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevaNombre.trim(),
          sucursalId: nuevaSucursalId,
          usuarioAsignadoId: nuevaUsuarioId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al crear caja')
        return
      }
      setNuevaNombre('')
      setNuevaUsuarioId('')
      setMostrarCrear(false)
      await cargarDatos()
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActivo(caja: CajaInfo) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/caja/cajas/${caja.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !caja.activo }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al actualizar caja')
        return
      }
      await cargarDatos()
    } finally {
      setSubmitting(false)
    }
  }

  async function asignarUsuario(cajaId: string, usuarioId: string | null) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/caja/cajas/${cajaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioAsignadoId: usuarioId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al asignar usuario')
        return
      }
      await cargarDatos()
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Administración de cajas</h1>
          <p className="text-gray-500 text-sm">Crear, activar/desactivar y asignar cajas a usuarios</p>
        </div>
        <button
          onClick={() => setMostrarCrear((v) => !v)}
          className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
        >
          {mostrarCrear ? 'Cancelar' : '+ Nueva caja'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Create form */}
      {mostrarCrear && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Nueva caja</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                type="text"
                value={nuevaNombre}
                onChange={(e) => setNuevaNombre(e.target.value)}
                placeholder="Ej. Caja 2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
              <select
                value={nuevaSucursalId}
                onChange={(e) => setNuevaSucursalId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Selecciona —</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Asignar a usuario <span className="text-red-500">*</span>
              </label>
              <select
                value={nuevaUsuarioId}
                onChange={(e) => setNuevaUsuarioId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Selecciona un usuario —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={crearCaja}
              disabled={submitting}
              className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-lg"
            >
              {submitting ? 'Creando...' : 'Crear caja'}
            </button>
          </div>
        </div>
      )}

      {/* Cajas list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Caja</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Sucursal</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Sesión</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Asignada a</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cajas.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  No hay cajas configuradas
                </td>
              </tr>
            ) : (
              cajas.map((caja) => (
                <tr key={caja.id} className={`hover:bg-gray-50 ${!caja.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{caja.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{caja.sucursal.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      caja.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {caja.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {caja.sesionAbierta ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block animate-pulse" />
                        En uso
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Libre</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={caja.usuarioAsignado?.id ?? ''}
                      onChange={(e) => asignarUsuario(caja.id, e.target.value || null)}
                      disabled={submitting}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Sin asignación</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActivo(caja)}
                      disabled={submitting || !!caja.sesionAbierta}
                      title={caja.sesionAbierta ? 'No se puede desactivar una caja con sesión abierta' : ''}
                      className={`text-xs px-3 py-1 rounded-lg border ${
                        caja.activo
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      } disabled:opacity-40`}
                    >
                      {caja.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
