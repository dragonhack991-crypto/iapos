import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import SetupForm from './SetupForm'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  // Server-side guard: if the system is already initialized, block access.
  // This prevents a deadlock when the `iapos_initialized` cookie is absent
  // (e.g. cookies cleared, new browser) on an already-configured system.
  try {
    const config = await prisma.configuracionSistema.findUnique({
      where: { clave: 'configurado' },
    })
    if (config) {
      redirect('/login')
    }
  } catch (err) {
    // DB unreachable – let the form render; the API endpoint will guard.
    console.error('[setup] DB initialization check failed:', err)
  }

  return <SetupForm />
}
