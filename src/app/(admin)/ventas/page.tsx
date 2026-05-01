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
  inventario?: { cantidad: string }
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

function calcularTotales(carrito: CarritoItem[]) {
  let subtotal = 0
  let totalIva = 0
  let totalIeps = 0

  for (const item of carrito) {
    const precio = item.precioUnitario
    const iepsPct = parseFloat(item.producto.iepsPorcentaje) / 100
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
    const stock = parseFloat(producto.inventario?.cantidad ?? '0')
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
      const precioUnitario = parseFloat(producto.precioVenta)
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
    if (metodoPago === 'EFECTIVO' && pagoCon && parseFloat(pagoCon) < totales.total) {
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
          pagoCon: metodoPago === 'EFECTIVO' && pagoCon ? parseFloat(pagoCon) : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al procesar la venta')
        return
      }

      const cambio = data.venta.cambio ? parseFloat(data.venta.cambio) : null
      setVentaExitosa({ folio: data.venta.folio, cambio })
      limpiarCarrito()
      setVentaExitosa({ folio: data.venta.folio, cambio })
      // Refresh products (stock updated)
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
      {/* Product grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
          {sesionCaja ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              {sesionCaja.caja.nombre}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              ⚠️ Caja cerrada — abre la caja para vender
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {ventaExitosa && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
            ✅ <strong>Venta #{ventaExitosa.folio}</strong> registrada correctamente.
            {ventaExitosa.cambio !== null && (
              <> Cambio: <strong>${ventaExitosa.cambio.toFixed(2)}</strong></>
            )}
          </div>
        )}

        <input
          type="text"
          placeholder="Buscar producto por nombre o código de barras..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full mb-4 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {productosFiltrados.map((producto) => {
            const stock = parseFloat(producto.inventario?.cantidad ?? '0')
            const sinStock = stock <= 0
            return (
              <button
                key={producto.id}
                onClick={() => !sinStock && agregarAlCarrito(producto)}
                disabled={sinStock}
                className={`text-left p-3 rounded-xl border transition ${
                  sinStock
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 bg-white hover:border-indigo-400 hover:shadow-sm cursor-pointer'
                }`}
              >
                <p className="font-medium text-gray-900 text-sm truncate">{producto.nombre}</p>
                <p className="text-indigo-600 font-bold text-base mt-1">
                  ${parseFloat(producto.precioVenta).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Stock: {stock % 1 === 0 ? stock.toFixed(0) : stock.toFixed(3)}
                </p>
              </button>
            )
          })}
          {productosFiltrados.length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-8">
              No se encontraron productos
            </p>
          )}
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Carrito</h2>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {carrito.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              Selecciona productos del catálogo
            </p>
          ) : (
            carrito.map((item) => (
              <div key={item.producto.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.producto.nombre}</p>
                  <p className="text-xs text-gray-500">
                    ${item.precioUnitario.toFixed(2)} c/u
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.cantidad}</span>
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-semibold text-gray-900 w-16 text-right">
                  ${item.subtotal.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>

        {carrito.length > 0 && (
          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${totales.subtotal.toFixed(2)}</span>
              </div>
              {totales.totalIva > 0 && (
                <div className="flex justify-between">
                  <span>IVA (16%)</span>
                  <span>${totales.totalIva.toFixed(2)}</span>
                </div>
              )}
              {totales.totalIeps > 0 && (
                <div className="flex justify-between">
                  <span>IEPS</span>
                  <span>${totales.totalIeps.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
                <span>Total</span>
                <span>${totales.total.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>

            {metodoPago === 'EFECTIVO' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pago con (MXN)</label>
                <input
                  type="number"
                  min={totales.total}
                  step="0.01"
                  value={pagoCon}
                  onChange={(e) => setPagoCon(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={totales.total.toFixed(2)}
                />
                {pagoCon && parseFloat(pagoCon) >= totales.total && (
                  <p className="text-xs text-green-600 mt-1">
                    Cambio: ${(parseFloat(pagoCon) - totales.total).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={limpiarCarrito}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar
              </button>
              <button
                onClick={procesarVenta}
                disabled={submitting || !sesionCaja}
                className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition"
              >
                {submitting ? 'Procesando...' : 'Cobrar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
