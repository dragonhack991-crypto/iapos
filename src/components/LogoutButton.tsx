'use client'

export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Hard redirect clears all React state and ensures the new (expired) cookie
    // is sent on the next request — critical on mobile browsers with BF-cache.
    window.location.replace('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left text-sm text-gray-600 hover:text-red-600 transition px-3 py-2 rounded-lg hover:bg-red-50"
    >
      🚪 Cerrar sesión
    </button>
  )
}
