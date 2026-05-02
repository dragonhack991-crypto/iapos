'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'

interface SetupForm {
  nombreNegocio: string
  adminNombre: string
  adminEmail: string
  adminPassword: string
  adminPasswordConfirm: string
}

export default function SetupForm() {
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetupForm>()

  const password = watch('adminPassword')

  async function onSubmit(data: SetupForm) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreNegocio: data.nombreNegocio,
          admin: {
            nombre: data.adminNombre,
            email: data.adminEmail,
            password: data.adminPassword,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Error en la configuración')
        return
      }
      // replace() prevents going back to /setup via the back button
      router.replace('/login')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-emerald-600">iaPOS</h1>
            <p className="text-gray-500 mt-1">Configuración inicial del sistema</p>
            <div className="flex justify-center mt-4 gap-2">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    s <= step ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-gray-800">Información del negocio</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del negocio
                  </label>
                  <input
                    type="text"
                    {...register('nombreNegocio', { required: 'El nombre es requerido' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                    placeholder="Mi Negocio S.A."
                  />
                  {errors.nombreNegocio && (
                    <p className="mt-1 text-sm text-red-600">{errors.nombreNegocio.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg transition"
                >
                  Siguiente
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-gray-800">Cuenta de administrador</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    {...register('adminNombre', { required: 'El nombre es requerido' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                    placeholder="Juan Pérez"
                  />
                  {errors.adminNombre && (
                    <p className="mt-1 text-sm text-red-600">{errors.adminNombre.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    {...register('adminEmail', {
                      required: 'El correo es requerido',
                      pattern: { value: /\S+@\S+\.\S+/, message: 'Correo inválido' },
                    })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                    placeholder="admin@negocio.com"
                  />
                  {errors.adminEmail && (
                    <p className="mt-1 text-sm text-red-600">{errors.adminEmail.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    {...register('adminPassword', {
                      required: 'La contraseña es requerida',
                      minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                    })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                    placeholder="••••••••"
                  />
                  {errors.adminPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.adminPassword.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    {...register('adminPasswordConfirm', {
                      required: 'Confirma la contraseña',
                      validate: (val) => val === password || 'Las contraseñas no coinciden',
                    })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                    placeholder="••••••••"
                  />
                  {errors.adminPasswordConfirm && (
                    <p className="mt-1 text-sm text-red-600">{errors.adminPasswordConfirm.message}</p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-2.5 px-4 rounded-lg transition"
                  >
                    {loading ? 'Configurando...' : 'Finalizar'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
