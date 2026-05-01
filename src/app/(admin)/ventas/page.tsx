'use client'

import { useState, useEffect, useCallback } from 'react'

interface Producto {
  id: string
  nombre: string
  codigoBarras: string | null
  precioVenta: string
  tipoVenta: string
  ivaAplica: boolean
  iepsAplica: boolean
  iepsPorcentaje: string
  inventario?: { cantidad: string | number } | null
}

interface CarritoItem {
  producto: Producto
  cantidad: number
  precioUnitario: number
  subtotal: number
}

interface SesionCaja {
  id: string
  estado: string
  caja: { nombre: string; sucursal: { nombre: string } }
}

const IVA = 0.16

function getStock(producto: Producto): number {
  const raw = producto.inventario?.cantidad
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

function toNumber(value: string | number | null | undefined, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function calcularTotales(carrito: CarritoItem[]) {
  let subtotal = 0
  let totalIva = 0
  let totalIeps = 0

  for (const item of carrito) {
    const precio = toNumber(item.precioUnitario)
    const iepsPct = toNumber(item.producto.iepsPorcentaje) / 100
    const ieps = item.producto.iepsAplica ? precio * iepsPct * item.cantidad : 0
    const baseIva = item.producto.iepsAplica
      ? (precio - precio * iepsPct) * item.cantidad
      : precio * item.cantidad
    const iva = item.producto.ivaAplica ? baseIva * IVA : 0
    subtotal += precio * item.cantidad
    totalIva += iva
    totalIeps += ieps
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    totalIva: Math.round(totalIva * 100) / 100,
    totalIeps: Math.round(totalIeps * 100) / 100,
    total: Math.round((subtotal + totalIva + totalIeps) * 100) / 100,
  }
}

export default function VentasPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [sesionCaja, setSesionCaja] = useState<SesionCaja | null>(null)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO')
  const [pagoCon, setPagoCon] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ventaExitosa, setVentaExitosa] = useState<{ folio: number; cambio: number | null } | null>(null)

  const cargarDatos = useCallback(async () => {
    try {
      const [resProductos, resSesion] = await Promise.all([
        fetch('/api/productos'),
        fetch('/api/caja/sesion'),
      ])
      if (resProductos.ok) {
        const data = await resProductos.json()
        setProductos(data.productos || [])
      }
      if (resSesion.ok) {
        const data = await resSesion.json()
        setSesionCaja(data.sesion || null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  function agregarAlCarrito(producto: Producto) {
    const stock = getStock(producto)
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id)
      if (existente) {
        if (existente.cantidad >= stock) {
          setError(`Stock máximo disponible para "${producto.nombre}": ${stock}`)
          return prev
        }
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precioUnitario }
            : i
        )
      }
      if (stock < 1) {
        setError(`Sin stock disponible para "${producto.nombre}"`)
        return prev
      }
      const precioUnitario = toNumber(producto.precioVenta, 0)
      return [
        ...prev,
        { producto, cantidad: 1, precioUnitario, subtotal: precioUnitario },
      ]
    })
    setError(null)
  }

  function actualizarCantidad(productoId: string, nuevaCantidad: number) {
    if (nuevaCantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId))
      return
    }
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId
          ? { ...i, cantidad: nuevaCantidad, subtotal: nuevaCantidad * i.precioUnitario }
          : i
      )
    )
  }

  function limpiarCarrito() {
    setCarrito([])
    setPagoCon('')
    setError(null)
    setVentaExitosa(null)
  }

  const totales = calcularTotales(carrito)

  async function procesarVenta() {
    if (!sesionCaja) {
      setError('Debes abrir la caja antes de realizar ventas.')
      return
    }
    if (carrito.length === 0) {
      setError('El carrito está vacío.')
      return
    }
    if (metodoPago === 'EFECTIVO' && pagoCon && toNumber(pagoCon, 0) < totales.total) {
      setError(`El pago (${pagoCon}) es menor al total ($${totales.total.toFixed(2)})`)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sesionCajaId: sesionCaja.id,
          metodoPago,
          detalles: carrito.map((i) => ({
            productoId: i.producto.id,
            cantidad: i.cantidad,
          })),
          pagoCon: metodoPago === 'EFECTIVO' && pagoCon ? toNumber(pagoCon, 0) : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al procesar la venta')
        return
      }

      const cambio = data.venta.cambio ? toNumber(data.venta.cambio, 0) : null
      limpiarCarrito()
      setVentaExitosa({ folio: data.venta.folio, cambio })
      const resP = await fetch('/api/productos')
      if (resP.ok) {
        const dp = await resP.json()
        setProductos(dp.productos || [])
      }
    } finally {
      setSubmitting(false)
    }
  }

  const productosFiltrados = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigoBarras && p.codigoBarras.includes(busqueda))
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
          {sesionCaja ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              {sesionCaja.caja.nombre}
            </span>
          ) : (
            <span className="inline-flex items-center gap*
