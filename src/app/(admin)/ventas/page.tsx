'use client'

import { useState, useEffect, useCallback } from 'react'
import AutorizacionModal from '@/components/AutorizacionModal'

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

interface GranelModal {
  producto: Producto
  cantidadStr: string
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function formatStock(stock: number): string {
  return stock % 1 === 0 ? stock.toFixed(0) : stock.toFixed(3)
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
  // Tarjeta fields
  const [ultimos4, setUltimos4] = useState('')
  const [numeroOperacion, setNumeroOperacion] = useState('')
  // Transferencia fields
  const [banco, setBanco] = useState('')
  const [referencia, setReferencia] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ventaExitosa, setVentaExitosa] = useState<{ id: string; folio: number; cambio: number | null } | null>(null)
  const [granelModal, setGranelModal] = useState<GranelModal | null>(null)

  // Authorization escalation for cart item removal
  const [authEliminar, setAuthEliminar] = useState<{ productoId: string } | null>(null)

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
    if (stock <= 0) {
      setError(`Sin stock disponible para "${producto.nombre}"`)
      return
    }
    if (producto.tipoVenta === 'GRANEL') {
      const existente = carrito.find((i) => i.producto.id === producto.id)
      setGranelModal({ producto, cantidadStr: existente ? existente.cantidad.toString() : '' })
      setError(null)
      return
    }
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id)
      if (existente) {
        if (existente.cantidad >= stock) {
          setError(`Stock máximo disponible para "${producto.nombre}": ${formatStock(stock)}`)
          return prev
        }
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1, subtotal: round2((i.cantidad + 1) * i.precioUnitario) }
            : i
        )
      }
      const precioUnitario = toNumber(producto.precioVenta, 0)
      return [
        ...prev,
        { producto, cantidad: 1, precioUnitario, subtotal: precioUnitario },
      ]
    })
    setError(null)
  }

  function confirmarGranel() {
    if (!granelModal) return
    const { producto, cantidadStr } = granelModal
    const cantidad = parseFloat(cantidadStr)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError('Ingresa una cantidad válida mayor a cero')
      return
    }
    const stock = getStock(producto)
    if (cantidad > stock) {
      setError(`Stock máximo disponible para "${producto.nombre}": ${formatStock(stock)}`)
      return
    }
    const precioUnitario = toNumber(producto.precioVenta, 0)
    setCarrito((prev) => {
      const existe = prev.some((i) => i.producto.id === producto.id)
      if (existe) {
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad, subtotal: round2(cantidad * i.precioUnitario) }
            : i
        )
      }
      return [...prev, { producto, cantidad, precioUnitario, subtotal: round2(cantidad * precioUnitario) }]
    })
    setGranelModal(null)
    setError(null)
  }

  function actualizarCantidad(productoId: string, nuevaCantidad: number) {
    if (nuevaCantidad <= 0) {
      // Removing an item requires the eliminar_item_carrito action to be authorized
      // We send a test request to check if the user has direct permission
      fetch('/api/autorizaciones/verificar-permiso?permiso=eliminar_item_carrito')
        .then(async (res) => {
          const data = await res.json()
          if (data.tiene) {
            setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId))
            setError(null)
          } else {
            setAuthEliminar({ productoId })
          }
        })
        .catch(() => {
          // Fallback: show auth modal on any error
          setAuthEliminar({ productoId })
        })
      return
    }
    const item = carrito.find((i) => i.producto.id === productoId)
    if (item) {
      const stock = getStock(item.producto)
      if (nuevaCantidad > stock) {
        setError(`Stock máximo disponible para "${item.producto.nombre}": ${formatStock(stock)}`)
        return
      }
    }
    setError(null)
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId
          ? { ...i, cantidad: nuevaCantidad, subtotal: round2(nuevaCantidad * i.precioUnitario) }
          : i
      )
    )
  }

  function eliminarItemConAuth(productoId: string) {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId))
    setError(null)
    setAuthEliminar(null)
  }

  function limpiarCarrito() {
    setCarrito([])
    setPagoCon('')
    setUltimos4('')
    setNumeroOperacion('')
    setBanco('')
    setReferencia('')
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

    // Client-side validation per payment method
    if (metodoPago === 'EFECTIVO') {
      const montoNum = toNumber(pagoCon, 0)
      if (!pagoCon || montoNum <= 0) {
        setError('Ingresa el monto recibido del cliente.')
        return
      }
      if (montoNum < totales.total) {
        setError(`El pago ($${montoNum.toFixed(2)}) es menor al total ($${totales.total.toFixed(2)})`)
        return
      }
    } else if (metodoPago === 'TARJETA') {
      if (!/^\d{4}$/.test(ultimos4)) {
        setError('Ingresa exactamente los últimos 4 dígitos de la tarjeta.')
        return
      }
      if (!numeroOperacion.trim()) {
        setError('Ingresa el número de operación del voucher.')
        return
      }
    } else if (metodoPago === 'TRANSFERENCIA') {
      if (!banco.trim()) {
        setError('Ingresa el banco de la transferencia.')
        return
      }
      if (!referencia.trim()) {
        setError('Ingresa la referencia o clave de rastreo.')
        return
      }
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        sesionCajaId: sesionCaja.id,
        metodoPago,
        detalles: carrito.map((i) => ({
          productoId: i.producto.id,
          cantidad: i.cantidad,
        })),
      }

      if (metodoPago === 'EFECTIVO') {
        payload.pagoCon = toNumber(pagoCon, 0)
      } else if (metodoPago === 'TARJETA') {
        payload.ultimos4 = ultimos4
        payload.numeroOperacion = numeroOperacion.trim()
      } else if (metodoPago === 'TRANSFERENCIA') {
        payload.banco = banco.trim()
        payload.referencia = referencia.trim()
      }

      const res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al procesar la venta')
        return
      }

      const cambio = data.venta.cambio ? toNumber(data.venta.cambio, 0) : null
      limpiarCarrito()
      setVentaExitosa({ id: data.venta.id, folio: data.venta.folio, cambio })
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
    <>
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
            {' '}
            <a
              href={`/ventas/ticket/${ventaExitosa.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium ml-1"
            >
              🖨️ Ver ticket
            </a>
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
            const stock = getStock(producto)
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
                  ${toNumber(producto.precioVenta, 0).toFixed(2)}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-gray-400">
                    Stock: {formatStock(stock)}
                  </p>
                  {producto.tipoVenta === 'GRANEL' && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                      granel
                    </span>
                  )}
                </div>
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
                  {item.producto.tipoVenta === 'GRANEL' ? (
                    <>
                      <button
                        onClick={() => actualizarCantidad(item.producto.id, 0)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-red-100 text-gray-500 text-xs flex items-center justify-center"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                      <button
                        onClick={() => setGranelModal({ producto: item.producto, cantidadStr: item.cantidad.toString() })}
                        className="min-w-[3rem] px-1.5 h-6 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-medium"
                        title="Editar cantidad"
                      >
                        {formatStock(item.cantidad)}
                      </button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
                onChange={(e) => {
                  setMetodoPago(e.target.value as typeof metodoPago)
                  setPagoCon('')
                  setUltimos4('')
                  setNumeroOperacion('')
                  setBanco('')
                  setReferencia('')
                  setError(null)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>

            {metodoPago === 'EFECTIVO' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Monto recibido (MXN) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={totales.total}
                  step="0.01"
                  value={pagoCon}
                  onChange={(e) => setPagoCon(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={totales.total.toFixed(2)}
                />
                {pagoCon && toNumber(pagoCon, 0) >= totales.total && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    Cambio: ${(toNumber(pagoCon, 0) - totales.total).toFixed(2)}
                  </p>
                )}
                {pagoCon && toNumber(pagoCon, 0) > 0 && toNumber(pagoCon, 0) < totales.total && (
                  <p className="text-xs text-red-600 mt-1">
                    Falta: ${(totales.total - toNumber(pagoCon, 0)).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {metodoPago === 'TARJETA' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Últimos 4 dígitos <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    pattern="\d{4}"
                    inputMode="numeric"
                    value={ultimos4}
                    onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest"
                    placeholder="1234"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Núm. operación (voucher) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ej: 123456"
                  />
                </div>
              </div>
            )}

            {metodoPago === 'TRANSFERENCIA' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Banco <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ej: BBVA, HSBC..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Ref. / Clave de rastreo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ej: CLABE o referencia"
                  />
                </div>
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

    {granelModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 shadow-xl w-80">
          <h3 className="font-semibold text-gray-900 mb-1">{granelModal.producto.nombre}</h3>
          <p className="text-sm text-gray-500 mb-4">
            Stock disponible: {formatStock(getStock(granelModal.producto))}
          </p>
          {error && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
              {error}
            </div>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            autoFocus
            value={granelModal.cantidadStr}
            onChange={(e) => setGranelModal((m) => m ? { ...m, cantidadStr: e.target.value } : m)}
            onKeyDown={(e) => e.key === 'Enter' && confirmarGranel()}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
            placeholder="Ej: 0.500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setGranelModal(null); setError(null) }}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarGranel}
              className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    )}

      {/* Authorization modal for cart item removal */}
      {authEliminar && (
        <AutorizacionModal
          accion="eliminar_item_carrito"
          targetId={authEliminar.productoId}
          onSuccess={(_token, _motivo) => eliminarItemConAuth(authEliminar.productoId)}
          onCancel={() => setAuthEliminar(null)}
        />
      )}
  </>
  )
}