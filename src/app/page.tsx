import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function Home() {
  const config = await prisma.configuracionSistema.findUnique({
    where: { clave: 'configurado' },
  })

  if (!config) {
    redirect('/setup')
  }

  const sesion = await obtenerSesion()
  if (!sesion) {
    redirect('/login')
  }

  redirect('/dashboard')
}
