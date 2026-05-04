'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'

interface Usuario {
  id: string
  nombre: string
  email: string
  activo: boolean
  creadoEn: string
  roles: { rol: { nombre: string } }[]
}

interface UsuarioForm {
  nombre: string
  email: string
  password: string
  rolNombre: string
}

interface PermisosModal {
  usuario: Usuario
  overrides: string[]
  todosPermisos: { nombre: string; descripcion: string | null }[]
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [permisosModal, setPermisosModal] = useState<PermisosModal | null>(null)
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<Set<string>>(new Set())
  const [savingPermisos, setSavingPermisos] = useState(false)
  const [permisosError, setPermisosError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UsuarioForm>({
    defaultValues: { rolNombre: 'Cajero' },
  })

  const cargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios')
      if (res.ok) {
        const data = await res.json()
        setUsuarios(data.usuarios)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarUsuarios()
  }, [cargarUsuarios])

  async function onSubmit(data: UsuarioForm) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Error al crear usuario')
        return
      }
      reset()
      setShowForm(false)
      await cargarUsuarios()
    } finally {
      setSubmitting(false)
    }
  }

  async function abrirPermisosModal(usuario: Usuario) {
    const res = await fetch(`/api/usuarios/${usuario.id}/permisos`)
    if (!res.ok) return
    const data = await res.json()
    setPermisosModal({ usuario, overrides: data.overrides, todosPermisos: data.todosPermisos })
    setPermisosSeleccionados(new Set(data.overrides))
    setPermisosError(null)
  }

  function togglePermiso(nombre: string) {
    setPermisosSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(nombre)) {
        next.delete(nombre)
      } else {
        next.add(nombre)
      }
      return next
    })
  }

  async function guardarPermisos() {
    if (!permisosModal) return
    setSavingPermisos(true)
    setPermisosError(null)
    try {
      const res = await fetch(`/api/usuarios/${permisosModal.usuario.id}/permisos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permisoNombres: Array.from(permisosSeleccionados) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPermisosError(data.error || 'Error al guardar permisos')
        return
      }
      setPermisosModal(null)
    } finally {
      setSavingPermisos(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 mt-1">Gestión de usuarios del sistema</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition"
        >
          {showForm ? '✕ Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Nuevo usuario</h2>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                {...register('nombre', { required: 'Requerido' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
              <input
                type="email"
                {...register('email', { required: 'Requerido' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                {...register('password', { required: 'Requerido', minLength: { value: 8, message: 'Mínimo 8 caracteres' } })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                {...register('rolNombre')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="Administrador">Administrador</option>
                <option value="Cajero">Cajero</option>
                <option value="Vendedor">Vendedor</option>
              </select>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-6 py-2 rounded-lg transition"
              >
                {submitting ? 'Guardando...' : 'Guardar usuario'}
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
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Correo</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Roles</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">Estado</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Creado</th>
                <th className="text-center px-6 py-3 font-semibold text-gray-600">Permisos extra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{u.nombre}</td>
                    <td className="px-6 py-3 text-gray-500">{u.email}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {u.roles.map((r) => r.rol.nombre).join(', ')}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(u.creadoEn).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        onClick={() => abrirPermisosModal(u)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Permission overrides modal */}
      {permisosModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Permisos extra — {permisosModal.usuario.nombre}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Selecciona permisos adicionales más allá de los que asigna su rol. Estos se suman (no reemplazan) los permisos del rol.
              </p>
            </div>
            <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
              {permisosError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {permisosError}
                </div>
              )}
              {permisosModal.todosPermisos.map((p) => (
                <label key={p.nombre} className="flex items-start gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2">
                  <input
                    type="checkbox"
                    checked={permisosSeleccionados.has(p.nombre)}
                    onChange={() => togglePermiso(p.nombre)}
                    className="mt-0.5 w-4 h-4 text-indigo-600 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                    {p.descripcion && <p className="text-xs text-gray-500">{p.descripcion}</p>}
                  </div>
                </label>
              ))}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setPermisosModal(null)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarPermisos}
                disabled={savingPermisos}
                className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition"
              >
                {savingPermisos ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
