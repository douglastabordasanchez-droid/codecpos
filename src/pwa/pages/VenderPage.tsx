/**
 * Vender — web y celular, con la misma lógica de cobro que Electron.
 *
 *  · Computador: productos en cuadrícula con categorías a la izquierda y el
 *    carrito con el cobro siempre visible a la derecha (como Electron).
 *  · Celular: cuadrícula de productos y el cobro en una hoja que sube.
 *  · Lector de código de barras USB/Bluetooth: funciona sin tocar el buscador.
 *  · Efectivo con valor recibido y cambio; pago mixto; venta a crédito.
 *  · Codec Verify activo + Nequi, Daviplata, Bre-B o transferencia: ventana
 *    "Esperando el pago" que confirma la venta sola cuando llega el pago.
 *  · Impresora y cajón monedero configurados en Dispositivos.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Package, Camera, Share2, Eye, Printer, Inbox, ShieldCheck,
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { crearVentaMovil, ItemCarritoMovil, MetodosMultiplesMovil } from '../lib/ventaMovilService';
import { getSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';
import { SucursalFiltro } from '../components/SucursalFiltro';
import { crearCuentaCarteraMovil } from '../lib/carteraMovilService';
import { compartirRecibo, obtenerDatosFactura } from '../lib/compartirFactura';
import { ModalVistaFactura } from '../../app/components/factura/ModalVistaFactura';
import { emitirFacturaDianDirecto } from '../../app/lib/dian/emitirFacturaDian';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from '../../app/lib/dian/types';
import { codecVerifyPwaActivo } from '../lib/codecVerifyPwa';
import { EsperandoPagoModal, METODOS_TRANSFERENCIA } from '../components/EsperandoPagoModal';
import type { NotificacionPagoRow } from '../../app/lib/supabase/codecVerifyService';
import { obtenerDispositivos, imprimirTicket, abrirCajon, tieneImpresoraDirecta } from '../lib/impresoraWeb';
import { armarTicketVenta } from '../lib/ticketVentaWeb';
import { useMiNegocio } from '../hooks/useMiNegocio';

interface ProductoFila {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  stock: number;
  codigo_barras: string | null;
  foto_url: string | null;
  talla?: string | null;
  color?: string | null;
}

const METODOS_PAGO = [
  { valor: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { valor: 'nequi', label: 'Nequi', emoji: '💜' },
  { valor: 'daviplata', label: 'Daviplata', emoji: '❤️' },
  { valor: 'bre_b', label: 'Bre-B', emoji: '🔵' },
  { valor: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
  { valor: 'transferencia', label: 'Transferencia', emoji: '🏦' },
  { valor: 'rappi', label: 'Rappi', emoji: '🛵' },
  { valor: 'mixto', label: 'Mixto', emoji: '🔀' },
  { valor: 'cartera', label: 'Crédito', emoji: '📒' },
];

/** Mismos sub-métodos que el pago mixto de Electron (PagoMixtoModal.tsx). */
const SUBMETODOS_MIXTO: { valor: keyof MetodosMultiplesMovil; label: string; emoji: string }[] = [
  { valor: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { valor: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
  { valor: 'nequi', label: 'Nequi', emoji: '💜' },
  { valor: 'daviplata', label: 'Daviplata', emoji: '❤️' },
  { valor: 'transferencia', label: 'Transferencia', emoji: '🏦' },
  { valor: 'rappi', label: 'Rappi', emoji: '🛵' },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const campo = 'h-10 w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm';

interface VentaCompletada {
  id: string;
  numero: number;
  total: number;
  metodoPago: string;
  cambio: number;
  items: ItemCarritoMovil[];
  propina: number;
  verificado: boolean;
}

/** Billetes sugeridos para el efectivo recibido: el valor exacto y los redondeos útiles. */
function billetesSugeridos(total: number): number[] {
  const opciones = new Set<number>([total]);
  for (const paso of [1000, 5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / paso) * paso;
    if (v > total) opciones.add(v);
  }
  return [...opciones].sort((a, b) => a - b).slice(0, 5);
}

export default function VenderPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [tallaFiltro, setTallaFiltro] = useState<string | null>(null);
  // Mi negocio (el mismo de Electron): en tienda de ropa se ven talla y color y se filtra por talla.
  const { miNegocio } = useMiNegocio();
  const modoRopa = miNegocio?.tipoNegocio === 'ropa';
  const [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState<Record<string, ItemCarritoMovil>>({});
  const [configPropina, setConfigPropina] = useState({ activa: false, porcentaje: 0 });
  const [permitirModificarPrecio, setPermitirModificarPrecio] = useState(false);
  const [propinaManual, setPropinaManual] = useState<number | null>(null);
  const [mostrarCheckout, setMostrarCheckout] = useState(false);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [recibido, setRecibido] = useState('');
  const [montosMixto, setMontosMixto] = useState<Record<string, string>>({});
  const [carteraNombre, setCarteraNombre] = useState('');
  const [carteraTelefono, setCarteraTelefono] = useState('');
  const [carteraDocumento, setCarteraDocumento] = useState('');
  const [carteraDias, setCarteraDias] = useState('30');
  const [carteraAbonoInicial, setCarteraAbonoInicial] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventaCompletada, setVentaCompletada] = useState<VentaCompletada | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [viendoFactura, setViendoFactura] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [docClienteFactura, setDocClienteFactura] = useState('');
  const [nombreClienteFactura, setNombreClienteFactura] = useState('');
  const [esperando, setEsperando] = useState<{ clave: string } | null>(null);
  const [verifyActivo, setVerifyActivo] = useState(codecVerifyPwaActivo);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // 🏪 Sucursal efectiva para Vender — misma regla que Alimentos y Bebidas
  // (ver sucursalActiva.ts): operativo con sucursal fija = siempre la suya;
  // admin = la conectada por QR desde el TopBar, o ninguna (Tienda Principal
  // por defecto) si no ha escaneado nada.
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [sucursalActiva, setSucursalActivaLocal] = useState(getSucursalActiva());
  useEffect(() => suscribirSucursalActiva(() => setSucursalActivaLocal(getSucursalActiva())), []);
  const tiendaEfectiva = esAdmin ? (sucursalActiva?.id ?? null) : (empleado?.tienda_id ?? null);

  useEffect(() => {
    const actualizar = () => setVerifyActivo(codecVerifyPwaActivo());
    window.addEventListener('codecverify-pwa:config-changed', actualizar);
    return () => window.removeEventListener('codecverify-pwa:config-changed', actualizar);
  }, []);

  const cargarProductos = async () => {
    if (!empleado) return;
    setCargando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, categoria, precio_venta, stock, codigo_barras, foto_url, talla, color')
      .eq('cliente_id', empleado.cliente_id)
      .eq('activo', true)
      .order('nombre');
    let filas = (data as ProductoFila[]) || [];

    // 🏪 Multi-Tienda: en una sucursal distinta de la principal el stock real
    // vive en `tiendas_stock` (migración 0092), no en `productos.stock`.
    const tiendaId = tiendaEfectiva;
    if (tiendaId && tiendaId !== 'tienda_principal') {
      const { data: stockTienda } = await client!
        .from('tiendas_stock')
        .select('producto_id, cantidad')
        .eq('cliente_id', empleado.cliente_id)
        .eq('tienda_id', tiendaId);
      const stockPorProducto = new Map((stockTienda || []).map((s: any) => [s.producto_id, Number(s.cantidad) || 0]));
      filas = filas.map((p) => ({ ...p, stock: stockPorProducto.get(p.id) ?? 0 }));
    }

    setProductos(filas);
    setCargando(false);
  };

  useEffect(() => {
    cargarProductos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id, tiendaEfectiva]);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    client?.from('clientes_pos')
      .select('propina_activa, porcentaje_propina_predeterminado, permitir_modificar_precio')
      .eq('id', empleado.cliente_id)
      .maybeSingle()
      .then(({ data }) => {
        setConfigPropina({
          activa: data?.propina_activa === true,
          porcentaje: Math.max(0, Number(data?.porcentaje_propina_predeterminado) || 0),
        });
        setPermitirModificarPrecio(data?.permitir_modificar_precio === true);
      });
  }, [empleado?.cliente_id]);

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [productos],
  );

  const tallas = useMemo(
    () => (modoRopa ? [...new Set(productos.map((p) => p.talla).filter(Boolean) as string[])] : []),
    [productos, modoRopa],
  );

  const filtrados = productos.filter((p) => {
    if (categoria && p.categoria !== categoria) return false;
    if (tallaFiltro && p.talla !== tallaFiltro) return false;
    const q = busqueda.toLowerCase();
    return !q || p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q) || (p.codigo_barras || '').includes(busqueda);
  });

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = itemsCarrito.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
  const propinaAplicada = configPropina.activa
    ? Math.max(0, propinaManual === null ? Math.round(totalCarrito * (configPropina.porcentaje / 100)) : propinaManual)
    : 0;
  const totalAPagar = totalCarrito + propinaAplicada;
  const cantidadCarrito = itemsCarrito.reduce((acc, it) => acc + it.cantidad, 0);
  const recibidoNum = Number(recibido) || 0;
  const cambio = metodoPago === 'efectivo' && recibidoNum > 0 ? recibidoNum - totalAPagar : 0;
  const esperaraPago = verifyActivo && METODOS_TRANSFERENCIA.includes(metodoPago);

  const agregarAlCarrito = (p: ProductoFila) => {
    setCarrito((prev) => {
      const actual = prev[p.id];
      const cantidad = (actual?.cantidad || 0) + 1;
      if (cantidad > p.stock) {
        toast.error(`Sin más stock de ${p.nombre}`);
        return prev;
      }
      return {
        ...prev,
        [p.id]: {
          productoId: p.id,
          // En tienda de ropa el nombre lleva talla y color: así salen en el carrito, el ticket y la factura.
          nombre: modoRopa ? [p.nombre, p.talla ? `Talla ${p.talla}` : '', p.color || ''].filter(Boolean).join(' · ') : p.nombre,
          precio: actual?.precio ?? p.precio_venta,
          precioOriginal: p.precio_venta,
          cantidad,
        },
      };
    });
  };

  /** Busca por código de barras exacto (lector USB/Bluetooth o cámara) y lo agrega. */
  const agregarPorCodigo = (codigo: string) => {
    const limpio = codigo.trim();
    if (!limpio) return false;
    const encontrado = productos.find((p) => p.codigo_barras === limpio);
    if (encontrado) {
      agregarAlCarrito(encontrado);
      return true;
    }
    return false;
  };

  // Lector de código de barras como teclado: los lectores "escriben" el código muy rápido y
  // terminan con Enter. Se captura aunque el buscador no esté enfocado.
  useEffect(() => {
    let buffer = '';
    let ultimo = 0;
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)) return;
      const ahora = Date.now();
      if (ahora - ultimo > 60) buffer = '';
      ultimo = ahora;
      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          if (!agregarPorCodigo(buffer)) toast.error(`No hay un producto con el código ${buffer}`);
          e.preventDefault();
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos]);

  /** Ajusta el precio manual de una línea del carrito -- solo si "permitirModificarPrecio" está activo en Configuración. */
  const editarPrecioItem = (productoId: string, nuevoPrecio: number) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      return { ...prev, [productoId]: { ...actual, precio: Math.max(0, nuevoPrecio) } };
    });
  };

  const totalMixto = SUBMETODOS_MIXTO.reduce((s, m) => s + (Number(montosMixto[m.valor]) || 0), 0);
  const diferenciaMixto = totalAPagar - totalMixto;
  const mixtoValido = metodoPago !== 'mixto' || Math.abs(diferenciaMixto) < 1;

  const cambiarCantidad = (productoId: string, delta: number) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      const nuevaCantidad = actual.cantidad + delta;
      if (nuevaCantidad <= 0) {
        const { [productoId]: _omit, ...resto } = prev;
        return resto;
      }
      const producto = productos.find((p) => p.id === productoId);
      if (producto && nuevaCantidad > producto.stock) return prev;
      return { ...prev, [productoId]: { ...actual, cantidad: nuevaCantidad } };
    });
  };

  const vaciarCarrito = () => setCarrito({});

  /** Valida el cobro y, si es una transferencia con Codec Verify, espera el pago antes de registrar. */
  const handleCobrar = () => {
    if (!empleado || itemsCarrito.length === 0) return;
    if (metodoPago === 'mixto' && !mixtoValido) {
      setError(diferenciaMixto > 0 ? `Faltan ${money(diferenciaMixto)} por distribuir` : `Sobran ${money(-diferenciaMixto)} distribuidos de más`);
      return;
    }
    if (metodoPago === 'cartera' && !carteraNombre.trim()) {
      setError('Ingresa el nombre del cliente para vender a crédito');
      return;
    }
    if (metodoPago === 'efectivo' && recibidoNum > 0 && recibidoNum < totalAPagar) {
      setError(`El efectivo recibido no alcanza: faltan ${money(totalAPagar - recibidoNum)}`);
      return;
    }
    setError(null);
    if (esperaraPago) {
      setEsperando({ clave: `WEB-${empleado.id.slice(0, 6)}-${Date.now()}` });
      return;
    }
    registrarVenta(null);
  };

  const registrarVenta = async (pagoVerificado: NotificacionPagoRow | null) => {
    if (!empleado) return;
    setEsperando(null);
    setProcesando(true);
    setError(null);
    const metodosMultiples: MetodosMultiplesMovil | undefined = metodoPago === 'mixto'
      ? SUBMETODOS_MIXTO.reduce((acc, m) => {
          const v = Number(montosMixto[m.valor]) || 0;
          if (v > 0) acc[m.valor] = v;
          return acc;
        }, {} as MetodosMultiplesMovil)
      : undefined;
    const items = itemsCarrito;
    const resultado = await crearVentaMovil(empleado.cliente_id, empleado.id, empleado.nombre_completo, items, metodoPago, metodosMultiples, propinaAplicada, configPropina.porcentaje, propinaManual !== null, tiendaEfectiva);

    // La venta ya quedó registrada -- crear la cuenta de cartera es un paso aparte, igual que en
    // Electron. Si falla, la venta no se pierde, pero se avisa.
    if (resultado.ok && metodoPago === 'cartera' && resultado.ventaId) {
      const abonoInicial = Math.max(0, Number(carteraAbonoInicial) || 0);
      const carteraResultado = await crearCuentaCarteraMovil(empleado.cliente_id, {
        ventaLocalId: resultado.ventaId,
        numeroFactura: resultado.numero ? String(resultado.numero) : undefined,
        clienteNombre: carteraNombre.trim(),
        clienteTelefono: carteraTelefono.trim() || undefined,
        clienteDocumento: carteraDocumento.trim() || undefined,
        total: totalAPagar,
        abonoInicial,
        diasCredito: Math.max(1, Number(carteraDias) || 30),
        usuarioCreador: empleado.nombre_completo,
      });
      if (!carteraResultado.ok) {
        toast.error('La venta se registró, pero no se pudo crear la cuenta de cartera', { description: carteraResultado.error });
      }
    }
    setProcesando(false);

    if (resultado.ok && resultado.ventaId && resultado.numero) {
      // El pago verificado queda ligado a esta venta (antes estaba reclamado con una clave temporal).
      if (pagoVerificado) {
        getSupabaseClient()?.from('notificaciones_pago')
          .update({ numero_factura_local: String(resultado.numero), venta_id: resultado.ventaId })
          .eq('id', pagoVerificado.id)
          .then(({ error: e }) => { if (e) console.warn('[vender] No se ligó el pago a la venta:', e.message); });
      }
      const completada: VentaCompletada = {
        id: resultado.ventaId, numero: resultado.numero, total: totalAPagar, metodoPago, cambio: Math.max(0, cambio),
        items, propina: propinaAplicada, verificado: !!pagoVerificado,
      };
      setVentaCompletada(completada);
      setMostrarCheckout(true);
      setCarteraNombre('');
      setCarteraTelefono('');
      setCarteraDocumento('');
      setCarteraAbonoInicial('');
      // DIAN directo — nunca bloquea la venta (ya se guardó arriba).
      emitirFacturaDianDirecto({
        clienteId: empleado.cliente_id,
        ventaReferencia: resultado.ventaId,
        fecha: new Date().toISOString(),
        adquirente: docClienteFactura.trim()
          ? { tipoDocumento: '13', numeroDocumento: docClienteFactura.trim(), nombreORazonSocial: nombreClienteFactura.trim() || 'Consumidor final' }
          : { tipoDocumento: '13', numeroDocumento: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, nombreORazonSocial: 'Consumidor final' },
        items: items.map((it) => ({ descripcion: it.nombre, cantidad: it.cantidad, precioUnitario: it.precio, subtotal: it.cantidad * it.precio })),
        subtotal: totalCarrito,
        totalImpuestos: 0,
        total: totalAPagar,
        pago: { metodo: metodoPago },
      }).catch(() => {});
      setDocClienteFactura('');
      setNombreClienteFactura('');
      setCarrito({});
      setPropinaManual(null);
      setRecibido('');
      cargarProductos();
      despuesDeVender(completada);
    } else {
      setError(resultado.error || 'No se pudo registrar la venta');
      setMostrarCheckout(true);
    }
  };

  /** Impresión automática y cajón monedero, según Dispositivos. */
  const despuesDeVender = async (v: VentaCompletada) => {
    const cfg = obtenerDispositivos();
    const abrir = tieneImpresoraDirecta() && (cfg.cajon.abrirSiempre || (cfg.cajon.abrirConEfectivo && v.metodoPago === 'efectivo'));
    try {
      if (cfg.imprimirAlVender && cfg.impresora.tipo) await imprimirVenta(v);
      if (abrir) await abrirCajon();
    } catch (e: any) {
      toast.error('No se pudo usar la impresora', { description: e?.message, action: { label: 'Dispositivos', onClick: () => navigate('/dispositivos') } });
    }
  };

  const imprimirVenta = async (v: VentaCompletada) => {
    if (!empleado) return;
    const ticket = await armarTicketVenta(empleado.cliente_id, {
      numero: v.numero, items: v.items, total: v.total, propina: v.propina, metodoPago: v.metodoPago, cambio: v.cambio, cajero: empleado.nombre_completo,
    });
    await imprimirTicket(ticket);
  };

  const handleImprimirTicket = async () => {
    if (!ventaCompletada) return;
    if (!obtenerDispositivos().impresora.tipo) {
      toast('Primero conecta una impresora', { action: { label: 'Ir a Dispositivos', onClick: () => navigate('/dispositivos') } });
      return;
    }
    setImprimiendo(true);
    try {
      await imprimirVenta(ventaCompletada);
    } catch (e: any) {
      toast.error('No se pudo imprimir', { description: e?.message });
    }
    setImprimiendo(false);
  };

  const datosFactura = () => ({
    id: ventaCompletada!.id,
    numero: ventaCompletada!.numero,
    created_at: new Date().toISOString(),
    total: ventaCompletada!.total,
    metodo_pago: ventaCompletada!.metodoPago,
    cajero_nombre: empleado!.nombre_completo,
  });

  const handleCompartirFactura = async () => {
    if (!empleado || !ventaCompletada) return;
    setCompartiendo(true);
    const r = await compartirRecibo(empleado.cliente_id, datosFactura());
    if (!r.ok) toast.error(r.error || 'No se pudo compartir la factura');
    setCompartiendo(false);
  };

  const handleVerFactura = () => {
    if (!empleado || !ventaCompletada) return;
    setViendoFactura(true);
  };

  const cerrarTodo = () => {
    setVentaCompletada(null);
    setMostrarCheckout(false);
    setMetodoPago('efectivo');
    setMontosMixto({});
    setPropinaManual(null);
    setRecibido('');
    setError(null);
    setTimeout(() => buscadorRef.current?.focus(), 50);
  };

  // ---- Escáner de cámara integrado (busca y agrega directo al carrito) ----
  const abrirScanner = () => {
    setMostrarScanner(true);
    setTimeout(() => {
      if (!videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, _err, controls) => {
          controlsRef.current = controls;
          if (result) {
            const codigo = result.getText();
            controls.stop();
            setMostrarScanner(false);
            if (!agregarPorCodigo(codigo)) setBusqueda(codigo);
          }
        })
        .catch(() => setMostrarScanner(false));
    }, 100);
  };

  const cerrarScanner = () => {
    controlsRef.current?.stop();
    setMostrarScanner(false);
  };

  // ── Piezas de la pantalla ────────────────────────────────────────────────
  const rejillaProductos = (
    <>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && agregarPorCodigo(busqueda)) setBusqueda('');
              else if (e.key === 'Enter' && filtrados.length === 1) { agregarAlCarrito(filtrados[0]); setBusqueda(''); }
            }}
            placeholder="Buscar producto o escanear código..."
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
          />
        </div>
        <button
          onClick={abrirScanner}
          className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20"
          aria-label="Escanear con la cámara"
        >
          <Camera className="w-5 h-5" style={{ color: '#fff' }} />
        </button>
      </div>

      {categorias.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 [scrollbar-width:none]">
          {[null, ...categorias].map((c) => (
            <button
              key={c ?? 'todas'}
              onClick={() => setCategoria(c)}
              className={`h-8 px-3 rounded-full text-xs font-semibold shrink-0 ${categoria === c ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              {c ?? 'Todas'}
            </button>
          ))}
        </div>
      )}

      {tallas.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 [scrollbar-width:none]">
          <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wide shrink-0 mr-1">Talla</span>
          {[null, ...tallas].map((t) => (
            <button
              key={t ?? 'todas'}
              onClick={() => setTallaFiltro(t)}
              className={`h-8 min-w-8 px-2.5 rounded-lg text-xs font-bold shrink-0 ${tallaFiltro === t ? 'bg-white text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              {t ?? 'Todas'}
            </button>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-10">Sin productos</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
          {filtrados.map((p) => {
            const enCarrito = carrito[p.id]?.cantidad || 0;
            const sinStock = p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => !sinStock && agregarAlCarrito(p)}
                disabled={sinStock}
                className={`relative text-left rounded-2xl overflow-hidden border transition-all active:scale-[0.97] disabled:opacity-40 ${enCarrito ? 'border-amber-500 bg-amber-500/5' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'}`}
              >
                <div className="aspect-[4/3] bg-slate-800 flex items-center justify-center overflow-hidden">
                  {p.foto_url ? <img src={p.foto_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-amber-500/70" />}
                </div>
                <div className="p-2.5">
                  <p className="text-white text-sm font-semibold leading-tight line-clamp-2 min-h-[2.4em]">{p.nombre}</p>
                  {modoRopa && (p.talla || p.color) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.talla && <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold">{p.talla}</span>}
                      {p.color && <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px]">{p.color}</span>}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-emerald-400 font-black text-sm">{money(p.precio_venta)}</span>
                    <span className={`text-[10px] ${p.stock <= 3 ? 'text-red-400' : 'text-slate-500'}`}>{p.stock} und</span>
                  </div>
                </div>
                {enCarrito > 0 && (
                  <span className="absolute top-2 right-2 min-w-7 h-7 px-1.5 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center shadow">
                    {enCarrito}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const listaCarrito = (
    <div className="space-y-2">
      {itemsCarrito.length === 0 && (
        <div className="text-center py-8">
          <ShoppingCart className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Toca un producto o escanea su código</p>
        </div>
      )}
      {itemsCarrito.map((it) => (
        <div key={it.productoId} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate">{it.nombre}</p>
            {permitirModificarPrecio ? (
              <input
                type="number" inputMode="numeric" min={0} value={it.precio}
                onChange={(e) => editarPrecioItem(it.productoId, e.target.value === '' ? 0 : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className={`mt-0.5 w-24 text-xs font-semibold bg-transparent border rounded-lg px-1.5 py-0.5 ${it.precioOriginal != null && it.precio !== it.precioOriginal ? 'border-amber-500 text-amber-400' : 'border-slate-700 text-slate-300'}`}
              />
            ) : (
              <p className="text-slate-500 text-xs">{money(it.precio)} c/u</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => cambiarCantidad(it.productoId, -1)} className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-white"><Minus className="w-3.5 h-3.5" /></button>
            <span className="text-white font-bold text-sm w-5 text-center">{it.cantidad}</span>
            <button onClick={() => cambiarCantidad(it.productoId, 1)} className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-slate-950"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <span className="text-white font-bold text-sm w-20 text-right shrink-0">{money(it.cantidad * it.precio)}</span>
          <button onClick={() => setCarrito((prev) => { const { [it.productoId]: _omit, ...resto } = prev; return resto; })} className="text-red-400 shrink-0" aria-label="Quitar">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {itemsCarrito.length > 0 && (
        <button onClick={vaciarCarrito} className="text-slate-500 text-xs underline">Vaciar carrito</button>
      )}
    </div>
  );

  const panelPago = (
    <div className="space-y-4">
      {configPropina.activa && totalCarrito > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-slate-200 text-sm font-bold">Propina{propinaManual === null ? ` (${configPropina.porcentaje}%)` : ''}</p>
            <button type="button" onClick={() => setPropinaManual(0)} className="text-red-400 text-xs">Sin propina</button>
          </div>
          <input type="number" min="0" inputMode="numeric" value={propinaManual === null ? propinaAplicada : propinaManual} onChange={(e) => setPropinaManual(Math.max(0, Number(e.target.value) || 0))} className="w-28 h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white text-right" />
        </div>
      )}

      <div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Medio de pago</p>
        <div className="grid grid-cols-3 gap-2">
          {METODOS_PAGO.map((m) => (
            <button
              key={m.valor}
              onClick={() => { setMetodoPago(m.valor); setError(null); }}
              className={`h-12 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${metodoPago === m.valor ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        {esperaraPago && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> Codec Verify esperará el pago y confirmará la venta sola.</p>
        )}
      </div>

      {metodoPago === 'efectivo' && totalAPagar > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-slate-300 text-sm shrink-0">Recibido</span>
            {/* min-w-0: sin esto la casilla numérica no se encoge y empuja toda la hoja fuera de la pantalla */}
            <input type="number" inputMode="numeric" min={0} placeholder={String(totalAPagar)} value={recibido} onChange={(e) => setRecibido(e.target.value)} className="h-11 min-w-0 flex-1 w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-white text-lg font-bold text-right" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {billetesSugeridos(totalAPagar).map((b) => (
              <button
                key={b}
                onClick={() => setRecibido(String(b))}
                className={`h-9 rounded-lg text-xs font-bold border ${recibidoNum === b ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-slate-900 border-slate-700 text-white'}`}
              >
                {b === totalAPagar ? 'Exacto' : money(b)}
              </button>
            ))}
          </div>
          {recibidoNum > 0 && (
            <div className={`flex items-center justify-between pt-2 border-t border-slate-800 ${cambio >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className="text-sm font-semibold">{cambio >= 0 ? 'Cambio' : 'Falta'}</span>
              <span className="text-2xl font-black">{money(Math.abs(cambio))}</span>
            </div>
          )}
        </div>
      )}

      {metodoPago === 'mixto' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <p className="text-slate-400 text-[11px]">Distribuye el total entre los métodos que uses:</p>
          {SUBMETODOS_MIXTO.map((m) => (
            <div key={m.valor} className="flex items-center gap-2">
              <span className="text-sm w-7 shrink-0 text-center">{m.emoji}</span>
              <span className="text-slate-300 text-xs w-24 shrink-0">{m.label}</span>
              <input type="number" inputMode="numeric" placeholder="0" value={montosMixto[m.valor] || ''} onChange={(e) => setMontosMixto((prev) => ({ ...prev, [m.valor]: e.target.value }))} className={campo} />
            </div>
          ))}
          <div className={`flex items-center justify-between pt-2 border-t border-slate-800 text-sm ${mixtoValido ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span>{mixtoValido ? 'Cuadra' : diferenciaMixto > 0 ? 'Falta distribuir' : 'Sobra distribuido'}</span>
            <span className="font-bold">{money(Math.abs(diferenciaMixto))}</span>
          </div>
        </div>
      )}

      {metodoPago === 'cartera' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
          <p className="text-slate-400 text-[11px]">Venta a crédito: se registra el saldo pendiente del cliente.</p>
          <input value={carteraNombre} onChange={(e) => setCarteraNombre(e.target.value)} placeholder="Nombre del cliente *" className={campo} />
          <div className="flex gap-2">
            <input value={carteraTelefono} onChange={(e) => setCarteraTelefono(e.target.value)} placeholder="Teléfono" className={campo} />
            <input value={carteraDocumento} onChange={(e) => setCarteraDocumento(e.target.value)} placeholder="Documento" className={campo} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs w-28 shrink-0">Días de crédito</span>
            <input type="number" inputMode="numeric" min={1} value={carteraDias} onChange={(e) => setCarteraDias(e.target.value)} className={campo} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs w-28 shrink-0">Abono inicial</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={carteraAbonoInicial} onChange={(e) => setCarteraAbonoInicial(e.target.value)} className={campo} />
          </div>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-slate-400 text-xs font-bold uppercase tracking-wide">Identificar cliente (factura electrónica)</summary>
        <p className="text-slate-500 text-[11px] my-2">Si el cliente da su NIT o cédula, la venta se factura a su nombre. Vacío: consumidor final.</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={docClienteFactura} onChange={(e) => setDocClienteFactura(e.target.value)} placeholder="NIT / Cédula" className={campo} />
          <input value={nombreClienteFactura} onChange={(e) => setNombreClienteFactura(e.target.value)} placeholder="Nombre" className={campo} />
        </div>
      </details>

      <div className="flex items-end justify-between pt-1">
        <div>
          <p className="text-slate-400 text-xs">{cantidadCarrito} producto{cantidadCarrito !== 1 ? 's' : ''}{propinaAplicada > 0 ? ` · propina ${money(propinaAplicada)}` : ''}</p>
          <p className="text-slate-300 text-sm font-semibold">Total a cobrar</p>
        </div>
        <span className="text-emerald-400 font-black text-3xl tracking-tight">{money(totalAPagar)}</span>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleCobrar}
        disabled={procesando || itemsCarrito.length === 0 || !mixtoValido}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-40"
        style={{ color: '#ffffff' }}
      >
        {procesando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
        {procesando ? 'Registrando...' : esperaraPago ? `Cobrar ${money(totalAPagar)} y esperar el pago` : `Cobrar ${money(totalAPagar)}`}
      </button>
    </div>
  );

  const ventaLista = ventaCompletada && (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-white font-black text-xl mb-1">Venta registrada</h2>
      <p className="text-slate-400 text-sm mb-5">
        Factura #{ventaCompletada.numero}{ventaCompletada.verificado ? ' · pago verificado por Codec Verify' : ''}
      </p>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-5">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total cobrado</p>
        <p className="text-emerald-400 text-3xl font-black">{money(ventaCompletada.total)}</p>
        {ventaCompletada.cambio > 0 && <p className="text-white text-lg font-bold mt-2">Cambio: {money(ventaCompletada.cambio)}</p>}
      </div>
      <div className="space-y-2">
        <button onClick={handleImprimirTicket} disabled={imprimiendo} className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ color: '#fff' }}>
          {imprimiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />} Imprimir ticket
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleVerFactura} className="h-12 rounded-xl border border-slate-700 bg-slate-900/50 text-slate-300 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Eye className="w-4 h-4" /> Ver factura
          </button>
          <button onClick={handleCompartirFactura} disabled={compartiendo} className="h-12 rounded-xl border border-slate-700 bg-slate-900/50 text-slate-300 text-sm font-semibold flex items-center justify-center gap-1.5">
            {compartiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
          </button>
        </div>
        {tieneImpresoraDirecta() && (
          <button onClick={() => abrirCajon().catch((e) => toast.error(String(e?.message || e)))} className="w-full h-11 rounded-xl border border-slate-700 bg-slate-900/50 text-slate-300 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Inbox className="w-4 h-4" /> Abrir caja
          </button>
        )}
        <button onClick={cerrarTodo} className="w-full h-12 rounded-xl bg-slate-800 text-white text-sm font-bold">Nueva venta</button>
      </div>
      {viendoFactura && empleado && (
        <ModalVistaFactura
          abierta
          onCerrar={() => setViendoFactura(false)}
          titulo={`FAC${String(ventaCompletada.numero ?? 0).padStart(6, '0')}`}
          obtenerDatos={() => obtenerDatosFactura(empleado.cliente_id, datosFactura())}
        />
      )}
    </div>
  );

  const modalEspera = esperando && empleado && (
    <EsperandoPagoModal
      clienteId={empleado.cliente_id}
      monto={totalAPagar}
      metodo={metodoPago}
      clave={esperando.clave}
      onPagado={(pago) => registrarVenta(pago)}
      onConfirmarManual={() => registrarVenta(null)}
      onCancelar={() => setEsperando(null)}
    />
  );

  const escaner = mostrarScanner && (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6">
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black aspect-square">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4/5 h-1/3 border-2 border-amber-400/70 rounded-xl" />
        </div>
      </div>
      <button onClick={cerrarScanner} className="mt-6 h-11 px-6 rounded-xl border border-white/30 bg-white/10" style={{ color: '#fff' }}>Cancelar</button>
    </div>
  );

  // ── Total arriba con el resumen de lo que se va agregando ────────────────
  const resumenVenta = (
    <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/60 shadow-xl overflow-hidden">
      <div className="px-5 pt-5 pb-4 text-center">
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.18em]">Total a cobrar</p>
        <p className="text-emerald-400 font-black tracking-tight leading-none mt-1.5" style={{ fontSize: 'clamp(38px, 9vw, 52px)' }}>
          {money(totalAPagar)}
        </p>
        <p className="text-slate-500 text-xs mt-1.5">
          {cantidadCarrito === 0
            ? 'Toca un producto o escanea su código'
            : `${cantidadCarrito} producto${cantidadCarrito !== 1 ? 's' : ''}${propinaAplicada > 0 ? ` · incluye propina ${money(propinaAplicada)}` : ''}`}
        </p>
      </div>

      {itemsCarrito.length > 0 && (
        <div className="border-t border-slate-800/80">
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/70">
            {[...itemsCarrito].reverse().map((it) => (
              <div key={it.productoId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-8 h-8 px-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-sm font-black flex items-center justify-center shrink-0">
                  {it.cantidad}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold truncate">{it.nombre}</p>
                  <p className="text-slate-500 text-[11px]">{money(it.precio)} c/u</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => cambiarCantidad(it.productoId, -1)} className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Quitar uno">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => cambiarCantidad(it.productoId, 1)} className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Agregar uno">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-white text-sm font-bold w-20 text-right shrink-0 tabular-nums">{money(it.cantidad * it.precio)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800/80">
            <button onClick={vaciarCarrito} className="text-slate-500 text-xs font-semibold flex items-center gap-1 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" /> Vaciar
            </button>
            <span className="text-slate-500 text-[11px]">{itemsCarrito.length} {itemsCarrito.length === 1 ? 'línea' : 'líneas'}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-40 lg:pb-28">
      <div className="max-w-6xl mx-auto">
        <div className="px-4 lg:px-6 pt-6 pb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-white text-xl lg:text-2xl font-black">Vender</h1>
            <p className="text-slate-500 text-xs">Busca, escanea o toca los productos</p>
          </div>
        </div>
        <SucursalFiltro />
        <div className="px-4 lg:px-6 mb-4">{resumenVenta}</div>
        <div className="px-4 lg:px-6">{rejillaProductos}</div>
      </div>

      {cantidadCarrito > 0 && !mostrarCheckout && (
        <div className="fixed bottom-16 lg:bottom-6 left-0 right-0 lg:left-auto lg:right-8 px-4 lg:px-0 pb-3 lg:pb-0 z-30">
          <button
            onClick={() => setMostrarCheckout(true)}
            className="w-full lg:w-[380px] h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/40 flex items-center justify-between px-5"
          >
            <span className="flex items-center gap-2 font-bold text-sm" style={{ color: '#fff' }}>
              <ShoppingCart className="w-5 h-5" /> {cantidadCarrito} producto{cantidadCarrito !== 1 ? 's' : ''}
            </span>
            <span className="font-black text-lg" style={{ color: '#fff' }}>Cobrar {money(totalAPagar)}</span>
          </button>
        </div>
      )}

      {mostrarCheckout && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end lg:items-center justify-center" onClick={() => !ventaCompletada && !procesando && setMostrarCheckout(false)}>
          <div
            className="w-full lg:max-w-lg bg-slate-950 rounded-t-3xl lg:rounded-3xl border-t lg:border border-slate-800 max-h-[90vh] overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {ventaCompletada ? (
              <div className="px-5 pt-8 pb-8">{ventaLista}</div>
            ) : (
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h2 className="text-white font-bold text-lg">Confirmar venta</h2>
                  <button onClick={() => setMostrarCheckout(false)} className="text-slate-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-5 mb-4">{listaCarrito}</div>
                <div className="px-5 pb-8">{panelPago}</div>
              </>
            )}
          </div>
        </div>
      )}
      {modalEspera}
      {escaner}
    </div>
  );
}
