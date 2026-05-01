import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Home() {
  try {
    const config = await prisma.configuracionSistema.findUnique({
      where: { clave: 'configurado' },
    })

    if (!config) {
      redirect('/setup')
    }
  } catch {
    redirect('/setup')
  }

  const sesion = await obtenerSesion()
  if (!sesion) {
    redirect('/login')
  }

  redirect('/dashboard')
}
