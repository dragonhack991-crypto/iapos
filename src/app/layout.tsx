import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'iaPOS - Sistema Punto de Venta',
  description: 'Sistema de punto de venta moderno',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es-MX">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
