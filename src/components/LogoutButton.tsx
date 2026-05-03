'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
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
