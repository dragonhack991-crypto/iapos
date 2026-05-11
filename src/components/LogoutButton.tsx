'use client'

export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual' }),
    })
    // Hard redirect clears all React state and ensures the new (expired) cookie
    // is sent on the next request — critical on mobile browsers with BF-cache.
    window.location.replace('/login')
  }

  async function handleLock() {
    await fetch('/api/auth/lock', { method: 'POST' })
    window.location.replace('/login?locked=1')
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleLock}
        className="w-full text-left text-sm text-gray-600 hover:text-amber-700 transition px-3 py-2 rounded-lg hover:bg-amber-50"
      >
        🔒 Bloquear pantalla
      </button>
      <button
        onClick={handleLogout}
        className="w-full text-left text-sm text-gray-600 hover:text-red-600 transition px-3 py-2 rounded-lg hover:bg-red-50"
      >
        🚪 Cerrar sesión
      </button>
    </div>
  )
}
