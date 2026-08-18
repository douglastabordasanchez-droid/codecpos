import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Banknote,
  ShoppingBag,
  Barcode,
  X,
  Scale,
  Printer,
  Wifi,
  WifiOff,
  Monitor,
  Wallet,
  Zap,
  Vault,
  Settings,
  Eye,
  EyeOff,
  ScanEye,
  RotateCcw,
  Maximize2,
  Bike,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';
import { TicketReceipt } from './TicketReceipt';
import { 
  useBarcodeScanner, 
  useSerialScale, 
  useThermalPrinter,
  useCashDrawer,
  useCustomerDisplay 
} from '../../hooks/usePeripherals';
import { SyncStatusIndicator } from '../electron/SyncStatusIndicator';
import { PagoMixtoModal } from './PagoMixtoModal';
import { ModalVentaCartera, type DatosVentaCartera } from './ModalVentaCartera';
import { crearCuentaCartera } from '../../lib/carteraService';
import { electronStore, PagoMixtoDetalle } from '../../lib/electronStore';
import { logger } from '../../lib/logger';
import { useAuth } from '../../contexts/AuthContext';
import { antiFraudeService } from '../../lib/antiFraudeService';
import { NotificacionesAntiFraude } from '../notifications/NotificacionesAntiFraude';
import { MultiFacturasInline } from './MultiFacturasInline';
import ProductoNuevoAutoModal from './ProductoNuevoAutoModal';
import { onVentaCompletada } from '../../lib/integracionesService';
import { NequiVerifyModal, type EntidadPago } from '../codecVerify/NequiVerifyModal';
import { cajaDiariaService } from '../../lib/cajaDiariaService';
import { openCashDrawer } from '../../lib/thermalPrinter';
import { ModuloPOS, esModuloActivoGlobal } from '../../lib/permissions';
import { useLanContext } from '../../contexts/LanContext';
import {
  acumularPuntos,
  redimirPuntos,
  buscarCliente as buscarClienteFidelizacion,
  buscarClientesPorTexto,
  obtenerConfiguracionFidelizacion,
  type Cliente,
} from '../../lib/fidelizacionService';
import { buscarPorCodigoBarras } from '../../lib/promocionesService';
import { suscribirCodigosEscaneados } from '../../lib/supabase/scanBroadcast';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { emitirFacturaDianDirecto } from '../../lib/dian/emitirFacturaDian';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from '../../lib/dian/types';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  costo: number;
  pesable?: boolean; // Producto se vende por peso
  aplicaIVA?: boolean; // 🆕 Producto aplica IVA
  tipoInventario?: 'directo' | 'receta';
  recipeId?: string;
  modifiersConfig?: Array<{
    modifierOptionId: string;
    nombre: string;
    precioVenta?: number;
    costo?: number;
    ingredientId?: string;
    consumoInventario?: number;
    unidadInventario?: string;
  }>;
  esComboOnces?: boolean;
  keyword?: string;
  comboComponents?: Array<{
    tipo: 'producto' | 'ingrediente';
    refId: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }>;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  peso?: number; // Para productos pesables
  modifiersSeleccionados?: Array<{
    modifierOptionId: string;
    nombre: string;
    precioVenta: number;
    costo?: number;
    ingredientId?: string;
    consumoInventario?: number;
    unidadInventario?: string;
  }>;
}

interface ClienteFacturaElectronica {
  nombre: string;
  nitCedula: string;
  email: string;
  direccion: string;
}

interface MesaPOS {
  id: string;
  nombre: string;
  activa: boolean;
}

// 🆕 PROPS PARA MÚLTIPLES FACTURAS
interface POSPageNewProps {
  facturaId?: string;
  numeroFactura?: number;
  onUpdateInfo?: (info: { totalItems?: number; total?: number; nombreCliente?: string }) => void;
}

// Aclara/oscurece un color hex un porcentaje dado (positivo = más claro,
// negativo = más oscuro). Se usa para armar el degradado de los botones de
// método de pago a partir del color base configurable de cada método.
function shadeColor(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  if (isNaN(num)) return hex;
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

// Estilo con degradado + volumen para los botones de "Procesar Pago",
// derivado del color base de cada método (configurable por el usuario).
function estiloBotonPago(color: string) {
  return {
    backgroundImage: `linear-gradient(155deg, ${shadeColor(color, 22)} 0%, ${color} 55%, ${shadeColor(color, -18)} 100%)`,
    boxShadow: `0 6px 16px -4px ${color}80, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.15)`,
  };
}

// 🚀 FIX rendimiento: obtenerConfigIVA()/getConfigFacturacion() parseaban
// 'codec_pos_config' desde localStorage en CADA llamada (varias veces por
// render). Cache a nivel de módulo, invalidado por comparación barata del
// string crudo — evita el JSON.parse repetido salvo que la config realmente
// haya cambiado (ej. el usuario la edita en Configuración).
let _configCacheRaw: string | null = null;
let _configCacheParsed: any = {};
function leerConfigEmpresaCacheada(): any {
  const raw = localStorage.getItem('codec_pos_config') || '{}';
  if (raw !== _configCacheRaw) {
    try { _configCacheParsed = JSON.parse(raw); } catch { _configCacheParsed = {}; }
    _configCacheRaw = raw;
  }
  return _configCacheParsed;
}

export default function POSPageNew({ facturaId, numeroFactura, onUpdateInfo }: POSPageNewProps = {}) {
  const navigate = useNavigate();
  const { darkMode, triggerRefresh, uiScale, setUiScale } = usePOS();
  const { emitLanEvent } = useLanContext();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [combosOnces, setCombosOnces] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [transferLoaded, setTransferLoaded] = useState(false);
  const transferLoadedRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [loading, setLoading] = useState(false);
  // 🛡️ Guard anti-doble-cobro: evita que un doble clic/doble-tap en el botón de pago
  // genere dos ventas con el mismo número de factura (una de ellas se pierde en silencio
  // porque el id ya existe en IndexedDB). Ver procesarVenta() y handlePagoMixto().
  const procesandoPagoRef = useRef(false);
  // 🚀 Debounce del filtro de sugerencias de búsqueda (ver handleBuscarProducto)
  // — evita escanear el catálogo completo (hasta 20,000 productos en
  // licencias pagas) en cada tecla presionada.
  const busquedaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [ventaActual, setVentaActual] = useState<any>(null);
  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [productoPesable, setProductoPesable] = useState<Producto | null>(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [productosSugeridos, setProductosSugeridos] = useState<Producto[]>([]);
  const [pagoMixtoDetalles, setPagoMixtoDetalles] = useState<PagoMixtoDetalle[]>([]);
  const [pagoMixtoTotal, setPagoMixtoTotal] = useState(0);
  const [showPagoMixtoModal, setShowPagoMixtoModal] = useState(false);
  const [showVentaCarteraModal, setShowVentaCarteraModal] = useState(false);
  const [metodoPagoSimple, setMetodoPagoSimple] = useState<'tarjeta' | 'rappi' | null>(null);
  // Modal de verificación de pago (Nequi/Daviplata/Transferencia) — cuando
  // Codec Verify está activo, espera la confirmación real del pago antes de
  // habilitar "Confirmar Pago"; cuando está inactivo, se comporta como un
  // modal de confirmación normal (ver NequiVerifyModal.tsx).
  const [showVerificacionPagoModal, setShowVerificacionPagoModal] = useState(false);
  const [entidadVerificacion, setEntidadVerificacion] = useState<EntidadPago>('nequi');
  const [tiempoInicioSesion] = useState<number>(Date.now()); // Contador de tiempo de conexión
  const [showProductoNuevoModal, setShowProductoNuevoModal] = useState(false);
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState<string>('');
  const [logoEmpresa, setLogoEmpresa] = useState<string>('');
  const [nombreComercial, setNombreComercial] = useState<string>('');
  const [showProductoManualModal, setShowProductoManualModal] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [productoPendienteModifiers, setProductoPendienteModifiers] = useState<Producto | null>(null);
  const [modifiersSeleccionTemp, setModifiersSeleccionTemp] = useState<Array<{
    modifierOptionId: string;
    nombre: string;
    precioVenta: number;
    costo?: number;
    ingredientId?: string;
    consumoInventario?: number;
    unidadInventario?: string;
  }>>([]);
  const [guardandoProductoManual, setGuardandoProductoManual] = useState(false);
  const [clienteFE, setClienteFE] = useState<ClienteFacturaElectronica>({
    nombre: '',
    nitCedula: '',
    email: '',
    direccion: '',
  });
  const [manualForm, setManualForm] = useState({
    nombre: '',
    precioVenta: '',
    precioCosto: '0',
    cantidadInicial: '1',
    categoria: 'Manuales',
  });
  const [mesasDisponibles, setMesasDisponibles] = useState<MesaPOS[]>([]);
  const [mesaActivaId, setMesaActivaId] = useState<string>(() => {
    try {
      const storedMesa = localStorage.getItem('codecpos_mesa_activa');
      return storedMesa || 'general';
    } catch {
      return 'general';
    }
  });
  const [referenciaMesaTransfer, setReferenciaMesaTransfer] = useState<string | null>(null);

  const [toggleModuloPanaderiaOncesActivo, setToggleModuloPanaderiaOncesActivo] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('codecpos_panaderia_onces_activo');
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });
  
  const { usuarioActual } = useAuth();
  const esSuperUsuario = usuarioActual?.rol === 'super_usuario';
  const modulosUsuario = (usuarioActual?.modulosActivos || []) as ModuloPOS[];
  const usaControlModulosCliente = modulosUsuario.length > 0;
  const moduloPanaderiaOncesPermitido = esModuloActivoGlobal(ModuloPOS.PANADERIA_ONCES) && (esSuperUsuario
    ? true
    : !usaControlModulosCliente || modulosUsuario.includes(ModuloPOS.PANADERIA_ONCES));
  const moduloPanaderiaOncesActivo = moduloPanaderiaOncesPermitido && toggleModuloPanaderiaOncesActivo;
  const alertaAdminCajaMostradaRef = useRef(false);
  const skipCajaCheckRef = useRef(false);
  const continuarSinCajaRef = useRef<(() => void) | null>(null);
  const [showSinCajaModal, setShowSinCajaModal] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const sugerenciasRef = useRef<HTMLDivElement>(null);

  // ── Fidelización ──────────────────────────────────────────────────────────────
  const [clienteFidelizacion, setClienteFidelizacion] = useState<Cliente | null>(null);
  const [puntosARedimirFidel, setPuntosARedimirFidel] = useState(0);
  const [pesosXPunto, setPesosXPunto] = useState(10);
  const [showFidelBusqueda, setShowFidelBusqueda] = useState(false);
  const [fidelBusquedaTexto, setFidelBusquedaTexto] = useState('');
  const [fidelResultados, setFidelResultados] = useState<Cliente[]>([]);

  const STORAGE_MESAS = 'codecpos_mesas_config';
  const STORAGE_CUENTAS_MESAS = 'codecpos_mesas_cuentas';
  const STORAGE_MESA_ACTIVA = 'codecpos_mesa_activa';
  const STORAGE_TRANSFER_CART = 'codecpos_carrito_transferido';
  const STORAGE_METODOS_PAGO = 'codecpos_metodos_pago_config';

  // ── Configuración dinámica de métodos de pago ─────────────────────────────
  interface MetodoPagoConfig { id: string; label: string; enabled: boolean; color: string; tipo: string; }
  const METODOS_PAGO_DEFAULT: MetodoPagoConfig[] = [
    { id: 'efectivo',      label: 'Efectivo',      enabled: true,  color: '#22c55e', tipo: 'efectivo' },
    { id: 'tarjeta',       label: 'Tarjeta',        enabled: true,  color: '#3b82f6', tipo: 'tarjeta' },
    { id: 'transferencia', label: 'Transferencia',  enabled: true,  color: '#a855f7', tipo: 'transferencia' },
    { id: 'nequi',         label: 'Nequi',          enabled: true,  color: '#d946ef', tipo: 'nequi' },
    { id: 'daviplata',     label: 'Daviplata',      enabled: true,  color: '#ef4444', tipo: 'daviplata' },
    { id: 'pago_mixto',    label: 'Pago Mixto',     enabled: true,  color: '#f59e0b', tipo: 'pago_mixto' },
    { id: 'rappi',         label: 'Rappi',          enabled: true,  color: '#ff6b35', tipo: 'rappi' },
    { id: 'bonos',         label: 'Bonos',          enabled: false, color: '#10b981', tipo: 'bonos' },
    { id: 'fidelizacion',  label: 'Puntos/Fidelidad', enabled: true, color: '#8b5cf6', tipo: 'fidelizacion' },
    { id: 'cartera',       label: 'Cartera',        enabled: true,  color: '#f97316', tipo: 'cartera' },
  ];
  // Solo `enabled`, `label` y `color` son personalizables desde el panel de
  // configuración (ver más abajo, `showPagoConfig`) — `tipo`/`id` son cableado
  // interno y SIEMPRE deben venir del default, nunca de una config guardada
  // antigua. Si se hiciera spread completo, una instalación que ya tuviera
  // guardado el Rappi legacy (tipo:'transferencia') quedaría atascada para
  // siempre reutilizando ese tipo viejo aunque el código ya lo cambiara.
  const mezclarConGuardado = (saved: MetodoPagoConfig[]): MetodoPagoConfig[] =>
    METODOS_PAGO_DEFAULT.map(def => {
      const s = saved.find(x => x.id === def.id);
      return s ? { ...def, enabled: s.enabled, label: s.label, color: s.color } : def;
    });
  const [metodosPago, setMetodosPago] = useState<MetodoPagoConfig[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_METODOS_PAGO);
      if (!raw) return METODOS_PAGO_DEFAULT;
      return mezclarConGuardado(JSON.parse(raw));
    } catch { return METODOS_PAGO_DEFAULT; }
  });
  const [showPagoConfig, setShowPagoConfig] = useState(false);

  const guardarMetodosPago = (lista: MetodoPagoConfig[]) => {
    setMetodosPago(lista);
    try { localStorage.setItem(STORAGE_METODOS_PAGO, JSON.stringify(lista)); } catch { /* storage lleno */ }
    window.dispatchEvent(new CustomEvent('codecpos:metodos-pago-cambio', { detail: { config: lista } }));
  };

  // Recargar métodos de pago cuando el servidor LAN los sincroniza a esta terminal
  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem(STORAGE_METODOS_PAGO);
        if (raw) setMetodosPago(mezclarConGuardado(JSON.parse(raw)));
      } catch {}
    };
    window.addEventListener('codecpos:metodos-pago-sincronizados', handler);
    return () => window.removeEventListener('codecpos:metodos-pago-sincronizados', handler);
  }, []);

  // ── Zoom / Ajuste de pantalla ──────────────────────────────────────────────
  const ZOOM_WELCOMED_KEY = 'codecpos_zoom_welcomed';
  const [showZoomPanel, setShowZoomPanel] = useState(false);
  const [showZoomWelcome, setShowZoomWelcome] = useState(false);
  // uiScale and setUiScale come from POSContext — the CSS transform is applied in POSLayoutSidebar
  const [zoomSlider, setZoomSlider] = useState<number>(uiScale);

  const calcularZoomOptimo = useCallback((): number => {
    const logical = window.screen.width / (window.devicePixelRatio || 1);
    if (logical < 1100) return 0.72;
    if (logical < 1280) return 0.80;
    if (logical < 1366) return 0.87;
    if (logical < 1440) return 0.92;
    if (logical < 1600) return 1.00;
    if (logical < 1920) return 1.05;
    if (logical < 2560) return 1.15;
    return 1.30;
  }, []);

  const aplicarZoom = useCallback((factor: number) => {
    const clamped = parseFloat(Math.max(0.5, Math.min(1.8, factor)).toFixed(2));
    setUiScale(clamped);
    setZoomSlider(clamped);
  }, [setUiScale]);

  const autoAjustarZoom = useCallback(() => {
    const optimo = calcularZoomOptimo();
    aplicarZoom(optimo);
    localStorage.setItem(ZOOM_WELCOMED_KEY, '1');
    toast.success(`Pantalla ajustada al ${Math.round(optimo * 100)}%`, {
      description: `${window.screen.width}×${window.screen.height} · DPR ${(window.devicePixelRatio || 1).toFixed(1)}×`,
    });
  }, [calcularZoomOptimo, aplicarZoom]);

  // Mostrar bienvenida si es la primera vez (zoom ya aplicado por POSLayoutSidebar via contexto)
  useEffect(() => {
    const welcomed = localStorage.getItem(ZOOM_WELCOMED_KEY);
    if (!welcomed) {
      const t = setTimeout(() => setShowZoomWelcome(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const getFechaLocalISO = () => {
    const ahora = new Date();
    const tzOffsetMs = ahora.getTimezoneOffset() * 60000;
    return new Date(ahora.getTime() - tzOffsetMs).toISOString().split('T')[0];
  };

  const validarEstadoCaja = useCallback(() => {
    const fechaHoy = getFechaLocalISO();
    const sesionActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaHoy);
    const esAdmin = usuarioActual?.rol === 'super_usuario';

    if (!sesionActiva && !alertaAdminCajaMostradaRef.current) {
      if (esAdmin) {
        toast.info('Sin apertura de caja activa. Como administrador puedes operar con normalidad.');
      } else {
        toast.warning('No hay apertura de caja activa. Al procesar una venta se te pedirá confirmación.');
      }
      alertaAdminCajaMostradaRef.current = true;
    }

    if (sesionActiva) {
      alertaAdminCajaMostradaRef.current = false;
    }
  }, [usuarioActual?.id, usuarioActual?.rol]);

  const cargarMesas = useCallback(() => {
    if (!moduloPanaderiaOncesActivo) {
      setMesasDisponibles([{ id: 'general', nombre: 'General', activa: true }]);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_MESAS);
      const parsed = raw ? JSON.parse(raw) : null;
      const base: MesaPOS[] = Array.isArray(parsed) && parsed.length > 0
        ? parsed.filter((m: any) => m?.activa !== false).map((m: any) => ({ id: String(m.id), nombre: String(m.nombre), activa: true }))
        : [
            { id: 'mesa-1', nombre: 'Mesa 1', activa: true },
            { id: 'mesa-2', nombre: 'Mesa 2', activa: true },
            { id: 'mesa-3', nombre: 'Mesa 3', activa: true },
          ];
      setMesasDisponibles([{ id: 'general', nombre: 'General', activa: true }, ...base]);
    } catch {
      setMesasDisponibles([
        { id: 'general', nombre: 'General', activa: true },
        { id: 'mesa-1', nombre: 'Mesa 1', activa: true },
        { id: 'mesa-2', nombre: 'Mesa 2', activa: true },
        { id: 'mesa-3', nombre: 'Mesa 3', activa: true },
      ]);
    }
  }, [moduloPanaderiaOncesActivo]);

  useEffect(() => {
    if (!moduloPanaderiaOncesActivo && mesaActivaId !== 'general') {
      setMesaActivaId('general');
    }
  }, [moduloPanaderiaOncesActivo, mesaActivaId]);

  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_MESA_ACTIVA);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const actualizarToggleModulo = () => {
      try {
        const raw = localStorage.getItem('codecpos_panaderia_onces_activo');
        setToggleModuloPanaderiaOncesActivo(raw === null ? true : raw === 'true');
      } catch {
        setToggleModuloPanaderiaOncesActivo(true);
      }
    };

    actualizarToggleModulo();
    window.addEventListener('codecpos-panaderia-onces-toggle', actualizarToggleModulo);
    window.addEventListener('storage', actualizarToggleModulo);

    return () => {
      window.removeEventListener('codecpos-panaderia-onces-toggle', actualizarToggleModulo);
      window.removeEventListener('storage', actualizarToggleModulo);
    };
  }, []);

  const guardarCarritoMesa = useCallback((mesaId: string, cart: ItemCarrito[]) => {
    try {
      const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS);
      const map = raw ? JSON.parse(raw) : {};
      map[mesaId] = cart;
      localStorage.setItem(STORAGE_CUENTAS_MESAS, JSON.stringify(map));
    } catch {
      // no-op
    }
  }, []);

  const cargarCarritoMesa = useCallback((mesaId: string): ItemCarrito[] => {
    try {
      const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS);
      const map = raw ? JSON.parse(raw) : {};
      return Array.isArray(map?.[mesaId]) ? map[mesaId] : [];
    } catch {
      return [];
    }
  }, []);

  // Limpia la cuenta de Panadería que originó esta venta (mesa o cuenta libre)
  const limpiarCuentaPanaderia = () => {
    try {
      const origen = localStorage.getItem('codecpos_panaderia_origen');
      if (!origen) return;
      if (origen === 'libre') {
        localStorage.removeItem('codecpos_panaderia_cuenta_libre');
      } else {
        const cuentas = JSON.parse(localStorage.getItem('codecpos_mesas_cuentas') || '{}');
        delete cuentas[origen];
        localStorage.setItem('codecpos_mesas_cuentas', JSON.stringify(cuentas));
      }
      localStorage.removeItem('codecpos_panaderia_origen');
      localStorage.removeItem('codecpos_referencia_mesa');
    } catch {
      // no-op
    }
  };

  // Periféricos REALES
  const bascula = useSerialScale();
  const impresora = useThermalPrinter();
  const displayCliente = useCustomerDisplay();
  const cajon = useCashDrawer(impresora);

  // Scanner de códigos de barras REAL (USB HID)
  // Sin useCallback: el hook useBarcodeScanner usa un ref interno, por lo que
  // siempre llama a la versión más reciente de esta función (con el estado actual de productos)
  const handleBarcodeScan = (codigo: string) => {
    setCodigoBarras(codigo);
    buscarYAgregarProducto(codigo);
  };

  useBarcodeScanner(handleBarcodeScan);

  // Cargar configuración de fidelización (pesosXPunto) al montar
  useEffect(() => {
    obtenerConfiguracionFidelizacion()
      .then(cfg => setPesosXPunto(cfg.pesosXPunto))
      .catch(() => {});
  }, []);

  useEffect(() => {
    validarEstadoCaja();

    const onFocus = () => validarEstadoCaja();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') validarEstadoCaja();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    loadProductos();
    cargarMesas();
    
    // 🖼️ Cargar logo y nombre comercial de la empresa
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      setLogoEmpresa(config.logoUrl || '');
      setNombreComercial(config.nombreComercial || '');
    } catch (error) {
      console.error('Error cargando configuración de empresa:', error);
    }
    
    // ⚡ NOTA: se removió el polling de antiFraudeService.iniciarEscucha() —
    // hacía fetch cada 5s a http://localhost:3001/confirmaciones-pendientes,
    // un servidor que nunca existió en el proyecto (nadie lo implementó),
    // así que era ruido de red constante en la pantalla de venta sin ningún
    // efecto real (confirmarTransaccion() solo se llamaba desde ahí). La
    // confirmación de pago real hoy corre por Codec Verify (Supabase
    // Realtime, ver CodecVerifyListener).

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [usuarioActual?.id, validarEstadoCaja, cargarMesas]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_TRANSFER_CART);

      if (raw) {
        const transferCart = JSON.parse(raw);
        if (Array.isArray(transferCart) && transferCart.length > 0) {
          const cartItems: ItemCarrito[] = transferCart
            .filter((item: any) => item && item.producto && typeof item.cantidad !== 'undefined')
            .map((item: any) => ({
              producto: item.producto,
              cantidad: Number(item.cantidad) || 1,
              peso: item.peso,
              modifiersSeleccionados: Array.isArray(item.modifiersSeleccionados) ? item.modifiersSeleccionados.map((mod: any) => ({
                modifierOptionId: mod.modifierOptionId,
                nombre: mod.nombre,
                precioVenta: Number(mod.precioVenta) || 0,
                costo: Number(mod.costo) || 0,
                ingredientId: mod.ingredientId,
                consumoInventario: Number(mod.consumoInventario) || 0,
                unidadInventario: mod.unidadInventario,
              })) : undefined,
            }));

          if (cartItems.length > 0) {
            transferLoadedRef.current = true;
            setCarrito(cartItems);
            setTransferLoaded(true);
            setMostrarPago(true);
          }
        }
        const refMesa = localStorage.getItem('codecpos_referencia_mesa');
        if (refMesa) setReferenciaMesaTransfer(refMesa);
      }
    } catch (error) {
      console.error('Error cargando carrito transferido:', error);
    } finally {
      localStorage.removeItem(STORAGE_TRANSFER_CART);
      localStorage.removeItem('codecpos_referencia_mesa');
    }
  }, []);

  useEffect(() => {
    if (transferLoadedRef.current || transferLoaded) {
      return;
    }

    const cartMesa = cargarCarritoMesa(mesaActivaId);
    setCarrito(cartMesa);
  }, [mesaActivaId, cargarCarritoMesa, transferLoaded]);

  useEffect(() => {
    guardarCarritoMesa(mesaActivaId, carrito);
  }, [carrito, mesaActivaId, guardarCarritoMesa]);

  useEffect(() => {
    // Actualizar display del cliente cuando cambia el total
    if (displayCliente.conectado) {
      displayCliente.mostrarTotal(calcularTotal());
    }
  }, [carrito, displayCliente.conectado]);

  // 🆕 REPORTAR CAMBIOS AL COMPONENTE PADRE (MultiFacturasPOS)
  useEffect(() => {
    if (onUpdateInfo) {
      const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
      const total = calcularTotal();
      onUpdateInfo({ totalItems, total });
    }
  }, [carrito, onUpdateInfo]);

  useEffect(() => {
    if (showProductoManualModal) {
      document.body.style.overflow = 'hidden';
      return;
    }

    document.body.style.overflow = '';
  }, [showProductoManualModal]);

  const loadProductos = async () => {
    try {
      setLoading(true);

      // ⚡ Antes intentaba primero un fetch a http://localhost:3001/productos
      // (un servidor que nunca existió en el proyecto) y solo caía a
      // localStorage cuando fallaba — es decir, siempre esperaba un fetch
      // condenado a fallar antes de cargar el catálogo real. Se quitó: se
      // lee directo de localStorage.
      const productosLocal = localStorage.getItem('pos-productos');
      if (productosLocal) {
        let productosParsed: any[] = [];
        let modificadores: any[] = [];
        let opciones: any[] = [];
        try { productosParsed = JSON.parse(productosLocal); } catch { productosParsed = []; }
        try { modificadores = JSON.parse(localStorage.getItem('pos-modificadores-producto') || '[]'); } catch { modificadores = []; }
        try { opciones = JSON.parse(localStorage.getItem('pos-opciones-modificador') || '[]'); } catch { opciones = []; }

        const productosConModificadores = (Array.isArray(productosParsed) ? productosParsed : []).map((p: any) => {
          const modsProducto = (Array.isArray(modificadores) ? modificadores : []).filter((m: any) => m.productoId === p.id && m.activo !== false);
          const modIds = new Set(modsProducto.map((m: any) => m.id));
          const opcionesProducto = (Array.isArray(opciones) ? opciones : [])
            .filter((o: any) => modIds.has(o.modificadorId) && o.activo !== false)
            .map((o: any) => ({
              modifierOptionId: o.id,
              nombre: o.nombre,
              precioVenta: Number(o.precioVenta) || 0,
              costo: Number(o.costo) || 0,
              ingredientId: o.ingredientId,
              consumoInventario: Number(o.consumoInventario) || 0,
              unidadInventario: o.unidadInventario,
            }));

          return {
            ...p,
            tipoInventario: p.tipoInventario || (p.recipeId ? 'receta' : 'directo'),
            modifiersConfig: opcionesProducto,
          };
        });

        const combos = (await electronStore.obtenerCombosOnces()).map((c: any) => ({
          id: c.id,
          codigo: c.codigo || c.keyword || c.nombre,
          keyword: c.keyword || '',
          nombre: c.nombre,
          precio: Number(c.precio) || 0,
          stock: 999999,
          categoria: 'Combos',
          costo: 0,
          pesable: false,
          aplicaIVA: true,
          tipoInventario: 'directo' as const,
          esComboOnces: true,
          comboComponents: Array.isArray(c.componentes) ? c.componentes : [],
        }));

        setCombosOnces(combos);
        setProductos([...productosConModificadores, ...combos]);
      } else {
        // Inventario vacío por defecto
        const combos = (await electronStore.obtenerCombosOnces()).map((c: any) => ({
          id: c.id,
          codigo: c.codigo || c.keyword || c.nombre,
          keyword: c.keyword || '',
          nombre: c.nombre,
          precio: Number(c.precio) || 0,
          stock: 999999,
          categoria: 'Combos',
          costo: 0,
          pesable: false,
          aplicaIVA: true,
          tipoInventario: 'directo' as const,
          esComboOnces: true,
          comboComponents: Array.isArray(c.componentes) ? c.componentes : [],
        }));
        setCombosOnces(combos);
        setProductos(combos);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
      toast.error('Error al cargar productos.');
    } finally {
      setLoading(false);
    }
  };

  const buscarYAgregarProducto = async (codigo: string) => {
    console.log('📷 Código escaneado:', codigo);
    
    // Primero intenta buscar por código de barras exacto
    let producto = productos.find(p => p.codigo === codigo);

    if (!producto) {
      const needle = codigo.toLowerCase().trim();
      producto = combosOnces.find((c: any) =>
        String(c.codigo || '').toLowerCase() === needle ||
        String(c.keyword || '').toLowerCase() === needle ||
        String(c.nombre || '').toLowerCase() === needle
      );
    }
    
    // Si no encuentra, intenta buscar por nombre parcial (solo si hay UNA coincidencia exacta)
    if (!producto && codigo.trim().length > 0) {
      const coincidencias = productos.filter(p => 
        p.nombre.toLowerCase() === codigo.toLowerCase().trim()
      );
      
      if (coincidencias.length === 1) {
        producto = coincidencias[0];
      }
    }
    
    if (producto) {
      // ✅ PRODUCTO ENCONTRADO
      if (producto.pesable) {
        // Producto se vende por peso, esperar lectura de báscula
        if (!bascula.conectado) {
          toast.error('Conecta la báscula para productos pesables', {
            icon: '⚖️',
            duration: 3000,
          });
          return;
        }
        setProductoPesable(producto);
        toast.info(`Coloca ${producto.nombre} en la báscula...`, {
          icon: '⚖️',
          duration: 3000,
        });
      } else {
        agregarAlCarrito(producto);
        // Notificación exitosa con info del producto
        toast.success(`✅ ${producto.nombre}`, {
          description: `$${producto.precio.toLocaleString('es-CO')} - Código: ${codigo}`,
          duration: 2000,
          icon: '🛒',
        });
      }
      setCodigoBarras('');
      setShowSugerencias(false);
    } else {
      // ── Verificar si es código de promoción o combo activo ──────────────────
      try {
        const promoResult = await buscarPorCodigoBarras(codigo);
        if (promoResult) {
          const { tipo, data } = promoResult;
          const precio = tipo === 'combo'
            ? (data as any).precioCombo
            : ((data as any).valorDescuento || 0);
          const comps = tipo === 'combo'
            ? ((data as any).productos || []).map((p: any) => ({
                tipo: 'producto' as const,
                refId: p.productoId,
                nombre: p.productoNombre,
                cantidad: p.cantidad,
              }))
            : ((data as any).comboItems || []).map((p: any) => ({
                tipo: 'producto' as const,
                refId: p.productoId,
                nombre: p.productoNombre,
                cantidad: p.cantidad,
              }));
          const productoPromo: Producto = {
            id: data.id,
            codigo: (data as any).codigoPromo || data.id,
            nombre: data.nombre,
            precio,
            stock: 9999,
            categoria: tipo === 'combo' ? 'Combo' : 'Promoción',
            costo: 0,
            comboComponents: comps,
          };
          agregarAlCarrito(productoPromo);
          toast.success(`${data.nombre} agregado`, {
            description: `Precio especial: $${precio.toLocaleString('es-CO')}`,
            duration: 2000,
          });
          setCodigoBarras('');
          setShowSugerencias(false);
          return;
        }
      } catch { /* no es promoción/combo — continuar */ }

      // ── Verificar si es tarjeta de cliente fidelización ────────────────────
      try {
        const cli = await buscarClienteFidelizacion(codigo);
        if (cli) {
          setClienteFidelizacion(cli);
          toast.success(`Cliente: ${cli.nombre}`, {
            description: `${cli.puntos.toLocaleString('es-CO')} puntos · Nivel ${cli.nivelFidelidad}`,
            duration: 3000,
          });
          setCodigoBarras('');
          setShowSugerencias(false);
          return;
        }
      } catch { /* no es cliente — continuar */ }

      // ❌ PRODUCTO NO ENCONTRADO - Abrir modal de creación automática
      setCodigoNoEncontrado(codigo);
      setShowProductoNuevoModal(true);
      setCodigoBarras('');
      setShowSugerencias(false);
    }
  };

  // 📱 Escáner híbrido: un código escaneado con la cámara del celular (PWA)
  // llega aquí en tiempo real y se procesa exactamente igual que si lo
  // hubiera tecleado un lector de código de barras físico en esta caja.
  const buscarYAgregarProductoRef = useRef(buscarYAgregarProducto);
  buscarYAgregarProductoRef.current = buscarYAgregarProducto;

  useEffect(() => {
    const clienteId = getLinkedClienteId();
    if (!clienteId) return;
    const unsubscribe = suscribirCodigosEscaneados(clienteId, (codigo) => {
      buscarYAgregarProductoRef.current(codigo);
    });
    return unsubscribe;
  }, []);

  // 🔄 Refrescar productos en memoria cuando el motor de sync (Fase 2) aplica
  // cambios remotos a IndexedDB — si no, un producto nuevo/editado desde otro
  // dispositivo queda invisible en esta pantalla hasta recargar la app.
  useEffect(() => {
    const onProductosSincronizados = () => { loadProductos(); };
    window.addEventListener('codecpos:productos-sincronizados', onProductosSincronizados);
    return () => window.removeEventListener('codecpos:productos-sincronizados', onProductosSincronizados);
  }, []);

  // Buscar productos mientras el usuario escribe
  const handleBuscarProducto = (texto: string) => {
    setCodigoBarras(texto); // el input sigue respondiendo al instante

    if (busquedaTimeoutRef.current) clearTimeout(busquedaTimeoutRef.current);

    if (texto.trim().length === 0) {
      setShowSugerencias(false);
      setProductosSugeridos([]);
      return;
    }

    // 🚀 El filtro sobre el catálogo completo se debounce ~120ms — imperceptible
    // al escribir, pero evita repetir el escaneo completo en cada tecla.
    busquedaTimeoutRef.current = setTimeout(() => {
      const t = texto.toLowerCase();
      const coincidencias = productos.filter(p =>
        p.codigo.toLowerCase().includes(t) ||
        p.nombre.toLowerCase().includes(t) ||
        String(p.keyword || '').toLowerCase().includes(t)
      ).slice(0, 8); // Limitar a 8 resultados

      if (coincidencias.length > 0) {
        setProductosSugeridos(coincidencias);
        setShowSugerencias(true);
      } else {
        setProductosSugeridos([]);
        setShowSugerencias(false);
      }
    }, 120);
  };

  // Seleccionar producto de las sugerencias
  const seleccionarProductoSugerido = (producto: Producto) => {
    if (producto.pesable) {
      if (!bascula.conectado) {
        toast.error('Conecta la báscula para productos pesables');
        return;
      }
      setProductoPesable(producto);
      toast.info(`Coloca ${producto.nombre} en la báscula...`);
    } else {
      agregarAlCarrito(producto);
    }
    setCodigoBarras('');
    setShowSugerencias(false);
    setProductosSugeridos([]);
  };

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sugerenciasRef.current && 
        !sugerenciasRef.current.contains(event.target as Node) &&
        barcodeInputRef.current &&
        !barcodeInputRef.current.contains(event.target as Node)
      ) {
        setShowSugerencias(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const agregarProductoPesable = () => {
    if (!productoPesable) return;

    const pesoRaw = bascula?.peso ?? 0;
    const pesoKg = pesoRaw / 1000;
    if (pesoKg === 0) {
      toast.error('No se detectó peso en la báscula');
      return;
    }

    const itemExistente = carrito.find(item => item.producto.id === productoPesable.id);
    
    if (itemExistente) {
      setCarrito(carrito.map(item =>
        item.producto.id === productoPesable.id
          ? { ...item, peso: (item.peso || 0) + pesoKg }
          : item
      ));
    } else {
      // 🆕 AGREGADO AL INICIO - Último producto aparece primero
      setCarrito([{ 
        producto: productoPesable, 
        cantidad: 1,
        peso: pesoKg 
      }, ...carrito]);
    }

    toast.success(`${productoPesable.nombre} - ${pesoKg.toFixed(2)} kg agregado`);
    setProductoPesable(null);
    bascula.tarar();
  };

  // Guardar nuevo producto desde el modal de auto-completado
  const handleGuardarProductoNuevo = (nuevoProducto: any) => {
    try {
      // Agregar a la lista de productos
      const productosActualizados = [...productos, nuevoProducto];
      setProductos(productosActualizados);
      
      // Guardar en localStorage
      localStorage.setItem('pos-productos', JSON.stringify(productosActualizados));
      
      // Agregar automáticamente al carrito
      agregarAlCarrito(nuevoProducto);
      
      console.log('✅ Producto creado y agregado al carrito:', nuevoProducto);
    } catch (error) {
      console.error('Error guardando producto:', error);
      toast.error('Error al guardar el producto');
    }
  };

  const agregarAlCarritoDirecto = (producto: Producto, modifiersElegidos?: ItemCarrito['modifiersSeleccionados']) => {
    if (producto.stock <= 0) {
      toast.error('Producto sin stock');
      return;
    }

    const itemExistente = carrito.find(item => item.producto.id === producto.id);
    
    if (itemExistente) {
      if (itemExistente.cantidad >= producto.stock) {
        toast.error('No hay suficiente stock');
        return;
      }
      setCarrito(carrito.map(item =>
        item.producto.id === producto.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      ));
    } else {
      // 🆕 AGREGADO AL INICIO (unshift) - Último producto aparece primero
      setCarrito([{ producto, cantidad: 1, modifiersSeleccionados: modifiersElegidos || (producto.modifiersConfig || []).map(m => ({ ...m, precioVenta: Number(m.precioVenta) || 0 })) }, ...carrito]);
    }

    toast.success(`${producto.nombre} agregado al carrito`);
  };

  const agregarAlCarrito = (producto: Producto) => {
    if ((producto.modifiersConfig || []).length > 0) {
      setProductoPendienteModifiers(producto);
      setModifiersSeleccionTemp((producto.modifiersConfig || []).map(m => ({ ...m, precioVenta: Number(m.precioVenta) || 0 })));
      setShowModifiersModal(true);
      return;
    }
    agregarAlCarritoDirecto(producto);
  };

  const agregarAlCarritoConCantidad = (producto: Producto, cantidad: number) => {
    const cantidadSolicitada = Math.max(1, Math.floor(Number(cantidad) || 1));

    if (producto.stock <= 0) {
      toast.error('Producto sin stock');
      return;
    }

    const itemExistente = carrito.find(item => item.producto.id === producto.id);

    if (itemExistente) {
      const nuevaCantidad = itemExistente.cantidad + cantidadSolicitada;
      if (nuevaCantidad > producto.stock) {
        toast.error('No hay suficiente stock');
        return;
      }

      setCarrito(carrito.map(item =>
        item.producto.id === producto.id
          ? { ...item, cantidad: nuevaCantidad }
          : item
      ));
    } else {
      if (cantidadSolicitada > producto.stock) {
        toast.error('No hay suficiente stock');
        return;
      }
      setCarrito([{ producto, cantidad: cantidadSolicitada, modifiersSeleccionados: (producto.modifiersConfig || []).map(m => ({ ...m, precioVenta: Number(m.precioVenta) || 0 })) }, ...carrito]);
    }

    toast.success(`${producto.nombre} agregado al carrito`);
  };

  const generarCodigoManual = () => `MAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const cerrarModalProductoManual = () => {
    setShowProductoManualModal(false);
    setGuardandoProductoManual(false);
    setManualForm({
      nombre: '',
      precioVenta: '',
      precioCosto: '0',
      cantidadInicial: '1',
      categoria: 'Manuales',
    });

    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  };

  const guardarProductoManual = async () => {
    const nombre = manualForm.nombre.trim();
    const precioVenta = Number(manualForm.precioVenta);
    const precioCosto = Math.max(0, Number(manualForm.precioCosto) || 0);
    const cantidadInicial = Math.max(1, Math.floor(Number(manualForm.cantidadInicial) || 1));
    const categoria = (manualForm.categoria || 'Manuales').trim() || 'Manuales';

    if (!nombre) {
      toast.error('El nombre del producto es obligatorio');
      return;
    }

    if (!(precioVenta > 0)) {
      toast.error('El precio de venta debe ser mayor a 0');
      return;
    }

    const codigoManual = generarCodigoManual();
    const productoManual: Producto = {
      id: codigoManual,
      codigo: codigoManual,
      nombre,
      precio: precioVenta,
      stock: cantidadInicial,
      categoria,
      costo: precioCosto,
      pesable: false,
      aplicaIVA: false,
    };

    try {
      setGuardandoProductoManual(true);
      const productoGuardado = await electronStore.addInventoryItem(productoManual);
      setProductos((prev) => [productoGuardado, ...prev]);
      agregarAlCarritoConCantidad(productoGuardado, cantidadInicial);
      toast.success('Producto manual guardado y agregado al carrito');
      cerrarModalProductoManual();
    } catch (error) {
      console.error('Error creando producto manual:', error);
      toast.error('No se pudo guardar el producto manual');
    } finally {
      setGuardandoProductoManual(false);
    }
  };

  const aumentarCantidad = (productoId: string) => {
    const item = carrito.find(i => i.producto.id === productoId);
    if (item && item.cantidad >= item.producto.stock) {
      toast.error('No hay más stock disponible');
      return;
    }

    setCarrito(carrito.map(item =>
      item.producto.id === productoId
        ? { ...item, cantidad: item.cantidad + 1 }
        : item
    ));
  };

  const disminuirCantidad = (productoId: string) => {
    setCarrito(carrito.map(item =>
      item.producto.id === productoId && item.cantidad > 1
        ? { ...item, cantidad: item.cantidad - 1 }
        : item
    ));
  };

  const eliminarDelCarrito = (productoId: string) => {
    setCarrito(carrito.filter(item => item.producto.id !== productoId));
    toast.info('Producto eliminado del carrito');
  };

  // Función para obtener configuración de IVA (DESACTIVADO POR DEFECTO)
  const obtenerConfigIVA = () => {
    const config = leerConfigEmpresaCacheada();
    return {
      ivaHabilitado: config.ivaHabilitado === true,
      porcentajeIVA: config.porcentajeIVA || 19,
    };
  };

  // 🛡️ Un item de carrito corrupto/viejo (ej. cargado desde un
  // 'pos-cuentas-mesas' de una versión anterior, o con el producto ya
  // eliminado) hacía que cualquier cálculo del carrito lanzara una excepción
  // no capturada, tumbando toda la pantalla de pago en silencio. Se filtran
  // antes de operar en vez de asumir que siempre tienen la forma esperada.
  const carritoItemsValidos = () => {
    const validos = carrito.filter(item => item?.producto && typeof item.producto.precio === 'number' && !Number.isNaN(item.producto.precio));
    if (validos.length !== carrito.length) {
      console.warn(`⚠️ ${carrito.length - validos.length} item(s) del carrito descartado(s) por datos inválidos`);
    }
    return validos;
  };

  // Calcular subtotal (sin IVA)
  const calcularSubtotal = () => {
    return carritoItemsValidos().reduce((total, item) => {
      const extraMods = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
      if (item.producto.pesable && item.peso) {
        return total + ((item.producto.precio + extraMods) * item.peso);
      }
      return total + ((item.producto.precio + extraMods) * item.cantidad);
    }, 0);
  };

  // Calcular IVA - Solo de productos que aplican IVA
  const calcularIVA = () => {
    const { ivaHabilitado, porcentajeIVA } = obtenerConfigIVA();
    if (!ivaHabilitado) return 0;

    // Calcular subtotal SOLO de productos que aplican IVA
    const subtotalConIVA = carritoItemsValidos().reduce((total, item) => {
      // Solo incluir si el producto tiene aplicaIVA: true
      if (!item.producto.aplicaIVA) return total;

      if (item.producto.pesable && item.peso) {
        return total + (item.producto.precio * item.peso);
      }
      return total + (item.producto.precio * item.cantidad);
    }, 0);

    return subtotalConIVA * (porcentajeIVA / 100);
  };

  // Calcular total (subtotal + IVA)
  const calcularTotal = () => {
    const subtotal = calcularSubtotal();
    const iva = calcularIVA();
    return subtotal + iva;
  };

  const calcularCambio = () => {
    const recibido = parseFloat(efectivoRecibido) || 0;
    const total = calcularTotal();
    return Math.max(0, recibido - total);
  };

  // Calcular utilidad neta de la venta
  const calcularUtilidadNeta = () => {
    return carritoItemsValidos().reduce((utilidad, item) => {
      const extraCosto = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.costo) || 0), 0);
      const extraVenta = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
      const costo = (item.producto.costo || 0) + extraCosto;
      const precioVenta = item.producto.precio + extraVenta;
      const cantidad = item.producto.pesable && item.peso ? item.peso : item.cantidad;
      return utilidad + ((precioVenta - costo) * cantidad);
    }, 0);
  };

  // Calcular tiempo transcurrido desde el inicio de sesión (en minutos)
  const calcularTiempoTrabajo = () => {
    return Math.floor((Date.now() - tiempoInicioSesion) / 60000); // Convertir a minutos
  };

  const getConfigFacturacion = () => {
    const config = leerConfigEmpresaCacheada();
    return {
      feActiva: Boolean(config.facturacionElectronicaHabilitada && config.ecosistemaFacturacionActivo),
      endpointApiUrl: String(config.endpointApiUrl || '').trim(),
      apiKey: String(config.apiKey || '').trim(),
      apiSecret: String(config.apiSecret || '').trim(),
    };
  };

  const validarClienteFacturacion = () => {
    if (!clienteFE.nitCedula.trim() || !clienteFE.email.trim() || !clienteFE.direccion.trim()) {
      toast.error('Para facturación electrónica debes registrar NIT/Cédula, correo y dirección del cliente.');
      return false;
    }
    return true;
  };

  const procesarVenta = async (metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata' | 'rappi' | 'bonos' | 'fidelizacion') => {
    // 🛡️ Anti-doble-cobro: si ya hay una venta en curso, ignorar el clic repetido.
    // procesandoPagoRef es síncrono (a diferencia del state) por lo que bloquea
    // incluso el segundo clic disparado en el mismo tick antes del re-render.
    if (procesandoPagoRef.current) return;
    procesandoPagoRef.current = true;
    setProcesandoPago(true);

    try {
    // ✅ VALIDACIÓN CRÍTICA 1: Usuario autenticado
    if (!usuarioActual?.id) {
      toast.error('🔐 Sesión expirada - Por favor vuelve a hacer login');
      navigate('/login');
      return;
    }

    if (!usuarioActual?.nombreCompleto && !usuarioActual?.username) {
      toast.error('⚠️ Usuario no válido - Identidad desconocida');
      return;
    }

    // ✅ VALIDACIÓN CRÍTICA 2: Caja abierta (excepto admins)
    if (usuarioActual?.rol !== 'super_usuario') {
      const fechaOperativa = getFechaLocalISO();
      const sesionCajaCheck = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaOperativa);
      if (!sesionCajaCheck) {
        toast.error('💰 Debes abrir tu caja antes de realizar ventas');
        return;
      }
    }

    if (carrito.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    const total = calcularTotal();
    const feConfig = getConfigFacturacion();

    if (metodoPago === 'efectivo') {
      const recibido = parseFloat(efectivoRecibido) || 0;
      if (recibido < total) {
        toast.error('Efectivo insuficiente');
        return;
      }
    }

    // Validar pago con puntos de fidelización
    let puntosRequeridos = 0;
    if (metodoPago === 'fidelizacion') {
      if (!clienteFidelizacion) {
        toast.error('Selecciona un cliente de fidelización primero');
        return;
      }
      puntosRequeridos = Math.ceil(total / pesosXPunto);
      if (clienteFidelizacion.puntos < puntosRequeridos) {
        toast.error(
          `Puntos insuficientes — necesitas ${puntosRequeridos.toLocaleString('es-CO')} pts (disponibles: ${clienteFidelizacion.puntos.toLocaleString('es-CO')})`
        );
        return;
      }
    }

    if (feConfig.feActiva && !validarClienteFacturacion()) {
      return;
    }

    try {
      const fechaOperativa = getFechaLocalISO();
      const sesionCajaActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaOperativa);
      const esAdmin = usuarioActual?.rol === 'super_usuario';
      let config: any = {};
      try { config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}'); } catch { config = {}; }
      // 🛡️ FIX: el número de factura salía SOLO de un contador en
      // localStorage, que puede desincronizarse de lo que realmente hay en
      // IndexedDB (backup/restore, migración de equipo, limpieza parcial).
      // Cuando eso pasa, la siguiente venta choca con un id ya existente y
      // se pierde en silencio. Se reconcilia con el máximo real guardado.
      const ultimaFacturaLS = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
      let ultimoNumeroDB = 0;
      try { ultimoNumeroDB = await electronStore.getUltimoNumeroVenta(); } catch { /* usar solo localStorage si falla */ }
      const numeroFactura = Math.max(ultimaFacturaLS, ultimoNumeroDB) + 1;
      const prefijoFactura = config.prefijoFactura || 'FAC';
      const numeroFacturaCompleto = `${prefijoFactura}${numeroFactura.toString().padStart(6, '0')}`;

      if (!sesionCajaActiva) {
        if (esAdmin) {
          toast.info('Venta procesada en modo Administrador (Sin apertura de caja activa).');
        } else if (!skipCajaCheckRef.current) {
          continuarSinCajaRef.current = () => { skipCajaCheckRef.current = true; procesarVenta(metodoPago); };
          setShowSinCajaModal(true);
          return;
        }
      }
      skipCajaCheckRef.current = false;

      const subtotal = calcularSubtotal();
      const iva = calcularIVA();
      const configIVA = obtenerConfigIVA();

      const venta = {
        numeroFactura: numeroFacturaCompleto,
        items: carrito.map(item => ({
          ...(function() {
            const extraMods = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
            const cantidadVenta = item.producto.pesable ? (item.peso || 0) : item.cantidad;
            const precioFinal = (Number(item.producto.precio) || 0) + extraMods;
            return {
              id: item.producto.id,
              codigo: item.producto.codigo,
              nombre: item.producto.nombre,
              cantidad: cantidadVenta,
              precio: item.producto.precio,
              precioVenta: precioFinal,
              precioCompra: item.producto.costo || 0,
              subtotal: precioFinal * cantidadVenta,
              categoria: item.producto.categoria,
              costo: (item.producto.costo || 0) + (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.costo) || 0), 0),
              productoTipo: item.producto.tipoInventario || 'directo',
              recipeId: item.producto.recipeId,
              comboComponents: item.producto.comboComponents,
              modifiers: (item.modifiersSeleccionados || []).map(mod => ({
                modifierOptionId: mod.modifierOptionId,
                nombre: mod.nombre,
                cantidad: 1,
                precioVenta: Number(mod.precioVenta || 0),
                costo: Number(mod.costo || 0),
                ingredientId: mod.ingredientId,
                consumoInventario: Number(mod.consumoInventario || 0),
                unidadInventario: mod.unidadInventario,
              })),
            };
          })(),
        })),
        subtotal: configIVA.ivaHabilitado ? subtotal : undefined,
        iva: configIVA.ivaHabilitado ? iva : undefined,
        porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : undefined,
        total,
        metodoPago,
        efectivoRecibido: metodoPago === 'efectivo' ? parseFloat(efectivoRecibido) : total,
        cambio: metodoPago === 'efectivo' ? calcularCambio() : 0,
        fecha: new Date().toISOString(),
        cliente: clienteFE,
        cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero',
        facturacionElectronica: feConfig.feActiva,
        facturaEstado: feConfig.feActiva ? 'PENDIENTE_ENVIO' : 'NO_APLICA',
        mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
        referencia_mesa: referenciaMesaTransfer ?? undefined,
      };

      try {
        const validacionInventario = await electronStore.validarDisponibilidadVenta(venta.items as any);
        if (!validacionInventario.ok && validacionInventario.faltantes.length > 0) {
          const faltante = validacionInventario.faltantes[0];
          toast.warning(`Stock bajo: ${faltante.nombre} (disponible: ${faltante.disponible} ${faltante.unidad || ''})`, {
            description: 'La venta se registrará igualmente.',
          });
        }
      } catch { /* validación no crítica — continuar */ }

      try { localStorage.setItem('pos-ultima-factura', numeroFactura.toString()); } catch { /* storage lleno */ }

      let respuestaElectronica: any = null;
      let facturaEstado = venta.facturaEstado;

      // Este bloque es del stub de "proveedor externo" (webhook genérico) —
      // cuando el negocio eligió "DIAN directo" la emisión corre aparte, en
      // segundo plano y sin bloquear la venta (ver emitirFacturaDianDirecto
      // más abajo), así que aquí no debe intentar pegarle a un endpoint que
      // ni siquiera aplica en ese modo.
      if (feConfig.feActiva && config.modoFacturacionElectronica !== 'dian_directo') {
        const payloadElectronico = {
          documento: {
            numero: numeroFacturaCompleto,
            fecha: venta.fecha,
          },
          cliente: {
            nombre: clienteFE.nombre || 'Consumidor final',
            nitCedula: clienteFE.nitCedula,
            email: clienteFE.email,
            direccion: clienteFE.direccion,
          },
          totales: {
            subtotal: subtotal,
            iva,
            total,
            porcentajeIVA: configIVA.porcentajeIVA,
          },
          items: venta.items.map((it) => ({
            codigo: it.codigo,
            descripcion: it.nombre,
            cantidad: it.cantidad,
            precioUnitario: it.precio,
            subtotal: it.subtotal,
            iva: it.costo !== undefined && configIVA.ivaHabilitado ? Number((it.subtotal * (configIVA.porcentajeIVA / 100)).toFixed(2)) : 0,
            total: configIVA.ivaHabilitado ? Number((it.subtotal * (1 + configIVA.porcentajeIVA / 100)).toFixed(2)) : it.subtotal,
          })),
        };

        try {
          const feResponse = await fetch(feConfig.endpointApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${feConfig.apiKey}`,
              'x-api-key': feConfig.apiKey,
              'x-api-secret': feConfig.apiSecret,
            },
            body: JSON.stringify(payloadElectronico),
            // Evita que el punto de pago se congele si el proveedor de FE
            // no responde: sin esto, un endpoint caído podía dejar el
            // checkout colgado por decenas de segundos (timeout por defecto
            // del navegador) en vez de caer rápido a modo contingencia.
            signal: AbortSignal.timeout(15000),
          });

          if (!feResponse.ok) {
            throw new Error(`HTTP ${feResponse.status}`);
          }

          respuestaElectronica = await feResponse.json();
          facturaEstado = 'SINCRONIZADA';
        } catch (error) {
          facturaEstado = 'PENDIENTE_SINCRONIZAR';
          toast.error('Proveedor FE no responde. Se guarda como pendiente por sincronizar (contingencia).');
          console.error('Error FE proveedor:', error);
        }
      }

      // ✅ MOSTRAR ÉXITO Y LIMPIAR UI — siempre ocurre, independiente de persistencia
      toast.success('¡Venta procesada exitosamente!', {
        description: `Factura ${numeroFacturaCompleto} - Total: $${total.toLocaleString('es-CO')}`,
      });

      try {
        setVentaActual({
          ...venta,
          facturaEstado,
          folioElectronico: respuestaElectronica?.folio || respuestaElectronica?.folioFiscal || null,
          cufe: respuestaElectronica?.cufe || null,
          qrUrl: respuestaElectronica?.qrUrl || respuestaElectronica?.qr_url || null,
          contingencia: facturaEstado === 'PENDIENTE_SINCRONIZAR',
        });
        setMostrarTicket(true);
      } catch { /* UI no crítica */ }
      setCarrito([]);
      try { guardarCarritoMesa(mesaActivaId, []); } catch { /* mesa no crítica */ }
      setEfectivoRecibido('');
      try { limpiarCuentaPanaderia(); } catch { /* panadería no crítica */ }
      try { if ((window as any).__eliminarFacturaActual) (window as any).__eliminarFacturaActual(); } catch {}
      setMostrarPago(false);

      // 💾 PERSISTENCIA CRÍTICA — se espera porque de esto depende que la venta
      // realmente quede guardada; todo lo demás (estadísticas, LAN, webhooks,
      // fidelización, refresco de catálogo) es "best-effort" y antes se
      // esperaba igual con `await` en cadena, manteniendo el botón de pago
      // deshabilitado varios segundos de más después de que la venta ya
      // estaba guardada — la causa más probable de "el sistema se pone lento
      // al facturar". Ahora esos pasos corren en segundo plano sin bloquear.
      if (usuarioActual) {
        try {
          await electronStore.registrarVenta({
            id: numeroFacturaCompleto,
            numero: numeroFactura,
            numeroFactura: numeroFacturaCompleto,
            fecha: new Date().toISOString(),
            fechaOperativa,
            sesionCajaId: sesionCajaActiva?.id,
            items: venta.items,
            // 🛡️ FIX: aquí se guardaba `subtotal: total` (es decir, el total CON
            // IVA) y el IVA no se guardaba en absoluto. La tirilla que se
            // imprime en el momento de la venta sí mostraba el desglose (lo
            // tenía en memoria), pero cualquier REIMPRESIÓN posterior —desde
            // Ventas, desde Reportes, el PDF o el Excel— leía estos campos y
            // por eso salía sin línea de IVA y con "Subtotal" igual al total.
            // El export de Excel incluso rotula esa columna "Total sin IVA".
            subtotal: configIVA.ivaHabilitado ? subtotal : total,
            iva: configIVA.ivaHabilitado ? iva : 0,
            porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : 0,
            descuento: 0,
            total,
            metodoPago,
            cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
            cajeroId: usuarioActual.id || 'user-1',
            sincronizado: false,
            puntoVentaId: 'POS-001',
            createdAt: Date.now(),
            syncStatus: 'pending',
            cliente: clienteFE.nombre || 'Consumidor final',
            facturaEstado,
            folioElectronico: respuestaElectronica?.folio || respuestaElectronica?.folioFiscal || null,
            cufe: respuestaElectronica?.cufe || null,
            qrUrl: respuestaElectronica?.qrUrl || respuestaElectronica?.qr_url || null,
            facturacionElectronica: feConfig.feActiva,
            mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
            referencia_mesa: referenciaMesaTransfer ?? undefined,
          });
        } catch (persistError) {
          // 🚨 Esta venta ya se mostró como exitosa al cajero pero NO quedó guardada.
          // Debe quedar visible en la Caja Negra para poder auditar reclamos de "ventas perdidas".
          logger.critical(
            `Venta ${numeroFacturaCompleto} no se pudo persistir en la base de datos`,
            persistError as Error,
            { numeroFactura: numeroFacturaCompleto, total, metodoPago, cajero: usuarioActual.nombreCompleto || usuarioActual.username }
          );
        }
      }

      // 🚀 TAREAS EN SEGUNDO PLANO — no se esperan, para que el botón de pago
      // vuelva a habilitarse de inmediato y el cajero pueda cobrar la
      // siguiente venta sin esperar estadísticas, LAN, webhooks ni fidelización.
      (async () => {
        try {
          if (usuarioActual) {
            const utilidadNeta = calcularUtilidadNeta();
            const tiempoTrabajo = calcularTiempoTrabajo();

            try { await electronStore.calcularEstadisticasDelDia(); } catch { /* estadísticas no críticas */ }

            console.log(`💼 Cajero: ${usuarioActual.nombreCompleto || usuarioActual.username} | Tiempo: ${tiempoTrabajo} min | Utilidad: $${utilidadNeta.toLocaleString('es-CO')}`);

            emitLanEvent('VENTA_NUEVA', {
              total,
              metodoPago,
              cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
              items: carrito.length,
              numeroFactura: numeroFacturaCompleto,
            });
          }

          // 🧾 DIAN directo: emitir factura electrónica (best-effort — nunca
          // bloquea la venta, ver emitirFacturaDian.ts). Solo corre cuando el
          // negocio eligió explícitamente "DIAN directo" en Configuración,
          // separado del stub de proveedor externo (feConfig.feActiva) que
          // ya se maneja arriba de forma síncrona.
          if (feConfig.feActiva && config.modoFacturacionElectronica === 'dian_directo') {
            const clienteIdVinculado = getLinkedClienteId();
            if (clienteIdVinculado) {
              emitirFacturaDianDirecto({
                clienteId: clienteIdVinculado,
                ventaReferencia: numeroFacturaCompleto,
                fecha: venta.fecha,
                adquirente: clienteFE.nitCedula.trim()
                  ? { tipoDocumento: '13', numeroDocumento: clienteFE.nitCedula.trim(), nombreORazonSocial: clienteFE.nombre || 'Consumidor final', email: clienteFE.email || undefined, direccion: clienteFE.direccion || undefined }
                  : { tipoDocumento: '13', numeroDocumento: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, nombreORazonSocial: 'Consumidor final' },
                items: venta.items.map((it) => ({
                  codigo: it.codigo,
                  descripcion: it.nombre,
                  cantidad: it.cantidad,
                  precioUnitario: it.precioVenta,
                  subtotal: it.subtotal,
                  impuestos: configIVA.ivaHabilitado ? [{ codigo: '01' as const, porcentaje: configIVA.porcentajeIVA, valor: Number((it.subtotal * (configIVA.porcentajeIVA / 100)).toFixed(2)) }] : undefined,
                })),
                subtotal: configIVA.ivaHabilitado ? subtotal : total,
                totalImpuestos: configIVA.ivaHabilitado ? iva : 0,
                total,
              }).catch(() => {});
            } else {
              console.warn('[DIAN] Negocio no vinculado a la nube — no se puede emitir factura DIAN directa (necesita cliente_id de nuestra base de datos).');
            }
          }

          // 🔔 NOTIFICACIONES AUTOMÁTICAS A INTEGRACIONES
          onVentaCompletada({
            total,
            metodoPago,
            productos: carrito.reduce((s, i) => s + i.cantidad, 0),
            cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero',
          }).catch(() => {});

          // 🔐 SISTEMA ANTI-FRAUDE
          if (metodoPago === 'nequi' || metodoPago === 'daviplata' || metodoPago === 'transferencia') {
            try {
              await antiFraudeService.registrarTransaccionPendiente(
                numeroFacturaCompleto,
                metodoPago as 'nequi' | 'daviplata' | 'transferencia',
                total
              );
            } catch { /* anti-fraude no crítico */ }
          }

          if (metodoPago === 'efectivo') {
            try { openCashDrawer(); } catch { /* cajón no crítico */ }
          }

          try { await loadProductos(); } catch { /* refresco no crítico */ }
          try { triggerRefresh(); } catch { /* refresh no crítico */ }

          // ── Fidelización: acumular o redimir puntos ─────────────────────────────
          if (clienteFidelizacion) {
            try {
              if (metodoPago === 'fidelizacion') {
                await redimirPuntos(clienteFidelizacion.id, puntosRequeridos, numeroFacturaCompleto);
                toast.success(`${puntosRequeridos.toLocaleString('es-CO')} puntos redimidos`, {
                  description: clienteFidelizacion.nombre,
                  duration: 3000,
                });
              } else {
                const ganados = await acumularPuntos(clienteFidelizacion.id, total, numeroFacturaCompleto);
                if (ganados > 0) {
                  toast.success(`+${ganados} puntos acumulados`, {
                    description: `${clienteFidelizacion.nombre} · Nivel ${clienteFidelizacion.nivelFidelidad}`,
                    duration: 3000,
                  });
                }
              }
            } catch { /* fidelización no crítica */ }
            setClienteFidelizacion(null);
            setPuntosARedimirFidel(0);
          }
        } catch (bgError) {
          console.error('Error en tareas en segundo plano de procesarVenta:', bgError);
        }
      })();
    } catch (error) {
      // 🚨 Este catch interno cubre la lógica de persistencia/envío (más abajo).
      // Se relanza para que el catch exterior — que también cubre las
      // validaciones previas, ver más abajo — sea el único punto que decide
      // cómo informar al usuario y auditar el fallo.
      console.error('Error en la lógica interna de procesarVenta:', error);
      throw error;
    }
    } catch (error) {
      // 🚨 FIX: este bloque exterior antes NO tenía `catch`, solo `finally` —
      // cualquier error en las validaciones previas (sesión, caja, carrito
      // vacío, facturación electrónica, cálculo del carrito, etc.) se
      // propagaba sin capturar y el botón "Confirmar Pago" simplemente no
      // hacía nada, sin toast ni registro. Esto es lo más probable detrás de
      // "el sistema no deja registrar ventas" en instalaciones con datos más
      // variados que la máquina de pruebas. Ahora todo error de
      // procesarVenta queda visible al cajero y auditado en la Caja Negra.
      console.error('Error inesperado en procesarVenta:', error);
      toast.error('No se pudo procesar la venta. Intenta de nuevo; si el problema persiste, contacta a soporte.');
      logger.critical(
        'Error inesperado (no manejado previamente) en procesarVenta()',
        error as Error,
        { usuario: usuarioActual?.nombreCompleto || usuarioActual?.username }
      );
    } finally {
      procesandoPagoRef.current = false;
      setProcesandoPago(false);
    }
  };

  // Función para procesar pago mixto
  const handlePagoMixto = async (detalles: any[]) => {
    // 🛡️ Anti-doble-cobro: mismo mecanismo que procesarVenta().
    if (procesandoPagoRef.current) return;
    procesandoPagoRef.current = true;
    setProcesandoPago(true);

    if (carrito.length === 0) {
      toast.error('El carrito está vacío');
      procesandoPagoRef.current = false;
      setProcesandoPago(false);
      return;
    }

    try {
      // 🚨 FIX: calcularTotal() antes se ejecutaba ANTES de este `try` — si un
      // item corrupto del carrito lo hacía lanzar, procesandoPagoRef quedaba
      // en `true` para siempre (el finally nunca se alcanzaba) y el checkout
      // se congelaba de forma permanente hasta reiniciar la app.
      const total = calcularTotal();
      const fechaOperativa = getFechaLocalISO();
      const sesionCajaActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaOperativa);
      const esAdmin = usuarioActual?.rol === 'super_usuario';
      let config: any = {};
      // 🚨 FIX: usaba la clave legacy 'pos-config-empresa' — el resto de la app
      // (incluida procesarVenta) usa 'codec_pos_config' como fuente única de
      // verdad, así que el prefijo de factura configurado nunca se aplicaba aquí.
      try { config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}'); } catch { config = {}; }
      // 🛡️ FIX: ver comentario equivalente en procesarVenta() — se reconcilia
      // el contador local con el máximo real en IndexedDB para evitar
      // colisiones de número de factura que pierden la venta en silencio.
      const ultimaFacturaLS = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
      let ultimoNumeroDB = 0;
      try { ultimoNumeroDB = await electronStore.getUltimoNumeroVenta(); } catch { /* usar solo localStorage si falla */ }
      const numeroFactura = Math.max(ultimaFacturaLS, ultimoNumeroDB) + 1;
      const prefijoFactura = config.prefijoFactura || 'FAC';
      const numeroFacturaCompleto = `${prefijoFactura}${numeroFactura.toString().padStart(6, '0')}`;

      if (!sesionCajaActiva) {
        if (esAdmin) {
          toast.info('Pago mixto procesado en modo Administrador (Sin apertura de caja activa).');
        } else if (!skipCajaCheckRef.current) {
          continuarSinCajaRef.current = () => { skipCajaCheckRef.current = true; handlePagoMixto(detalles); };
          setShowSinCajaModal(true);
          return;
        }
      }
      skipCajaCheckRef.current = false;

      const subtotal = calcularSubtotal();
      const iva = calcularIVA();
      const configIVA = obtenerConfigIVA();

      const venta = {
        numeroFactura: numeroFacturaCompleto,
        items: carrito.map(item => ({
          ...(function() {
            const extraMods = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
            const cantidadVenta = item.producto.pesable ? (item.peso || 0) : item.cantidad;
            const precioFinal = (Number(item.producto.precio) || 0) + extraMods;
            return {
              id: item.producto.id,
              codigo: item.producto.codigo,
              nombre: item.producto.nombre,
              cantidad: cantidadVenta,
              precio: item.producto.precio,
              precioVenta: precioFinal,
              precioCompra: item.producto.costo || 0,
              subtotal: precioFinal * cantidadVenta,
              categoria: item.producto.categoria,
              costo: (item.producto.costo || 0) + (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.costo) || 0), 0),
              productoTipo: item.producto.tipoInventario || 'directo',
              recipeId: item.producto.recipeId,
              comboComponents: item.producto.comboComponents,
              modifiers: (item.modifiersSeleccionados || []).map(mod => ({
                modifierOptionId: mod.modifierOptionId,
                nombre: mod.nombre,
                cantidad: 1,
                precioVenta: Number(mod.precioVenta || 0),
                costo: Number(mod.costo || 0),
                ingredientId: mod.ingredientId,
                consumoInventario: Number(mod.consumoInventario || 0),
                unidadInventario: mod.unidadInventario,
              })),
            };
          })(),
        })),
        subtotal: configIVA.ivaHabilitado ? subtotal : undefined,
        iva: configIVA.ivaHabilitado ? iva : undefined,
        porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : undefined,
        total,
        metodoPago: 'mixto' as any,
        pagoMixtoDetalles: detalles,
        fecha: new Date().toISOString(),
        cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero',
        mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
        referencia_mesa: referenciaMesaTransfer ?? undefined,
      };

      try {
        const validacionInventario = await electronStore.validarDisponibilidadVenta(venta.items as any);
        if (!validacionInventario.ok && validacionInventario.faltantes.length > 0) {
          const faltante = validacionInventario.faltantes[0];
          toast.warning(`Stock bajo: ${faltante.nombre} (disponible: ${faltante.disponible} ${faltante.unidad || ''})`, {
            description: 'La venta se registrará igualmente.',
          });
        }
      } catch { /* validación no crítica — continuar */ }

      try { localStorage.setItem('pos-ultima-factura', numeroFactura.toString()); } catch { /* storage lleno */ }

      // ✅ MOSTRAR ÉXITO Y LIMPIAR UI — siempre ocurre, independiente de persistencia
      toast.success('¡Venta con Pago Mixto procesada exitosamente!', {
        description: `Factura ${numeroFacturaCompleto} - Total: $${total.toLocaleString('es-CO')}`,
      });

      try { setVentaActual(venta); setMostrarTicket(true); } catch { /* UI no crítica */ }
      setPagoMixtoTotal(0);
      setShowPagoModal(false);
      try { if ((window as any).__eliminarFacturaActual) (window as any).__eliminarFacturaActual(); } catch {}
      setCarrito([]);
      try { guardarCarritoMesa(mesaActivaId, []); } catch { /* mesa no crítica */ }
      setEfectivoRecibido('');
      try { limpiarCuentaPanaderia(); } catch { /* panadería no crítica */ }
      setMostrarPago(false);

      // 💾 PERSISTENCIA CRÍTICA — ver comentario equivalente en procesarVenta().
      const pagoMixtoObj: any = {};
      detalles.forEach((detalle: any) => { pagoMixtoObj[detalle.metodo] = detalle.monto; });

      if (usuarioActual) {
        try {
          await electronStore.registrarVenta({
            id: numeroFacturaCompleto,
            numero: numeroFactura,
            numeroFactura: numeroFacturaCompleto,
            fecha: new Date().toISOString(),
            fechaOperativa,
            sesionCajaId: sesionCajaActiva?.id,
            items: venta.items,
            // 🛡️ FIX: ver comentario equivalente en procesarVenta() — se
            // persiste la base gravable y el IVA para que la reimpresión y los
            // exportes muestren el mismo desglose que la tirilla original.
            subtotal: configIVA.ivaHabilitado ? subtotal : total,
            iva: configIVA.ivaHabilitado ? iva : 0,
            porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : 0,
            descuento: 0,
            total,
            metodoPago: 'mixto',
            pagoMixto: pagoMixtoObj,
            cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
            cajeroId: usuarioActual.id || 'user-1',
            sincronizado: false,
            puntoVentaId: 'POS-001',
            createdAt: Date.now(),
            syncStatus: 'pending',
            mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
            referencia_mesa: referenciaMesaTransfer ?? undefined,
          });
        } catch (persistError) {
          // 🚨 Ver comentario equivalente en procesarVenta(): venta mostrada como exitosa
          // pero no persistida — debe quedar registrada en la Caja Negra.
          logger.critical(
            `Venta mixta ${numeroFacturaCompleto} no se pudo persistir en la base de datos`,
            persistError as Error,
            { numeroFactura: numeroFacturaCompleto, total, metodoPago: 'mixto', cajero: usuarioActual.nombreCompleto || usuarioActual.username }
          );
        }
      }

      // 🚀 TAREAS EN SEGUNDO PLANO — ver comentario equivalente en procesarVenta().
      (async () => {
        try {
          if (usuarioActual) {
            const utilidadNeta = calcularUtilidadNeta();
            const tiempoTrabajo = calcularTiempoTrabajo();

            try { await electronStore.calcularEstadisticasDelDia(); } catch { /* estadísticas no críticas */ }

            console.log(`💼 Cajero: ${usuarioActual.nombreCompleto || usuarioActual.username} | Tiempo: ${tiempoTrabajo} min | Utilidad: $${utilidadNeta.toLocaleString('es-CO')}`);

            emitLanEvent('VENTA_NUEVA', {
              total,
              metodoPago: 'mixto',
              cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
              items: carrito.length,
              numeroFactura: numeroFacturaCompleto,
            });
          }

          // 🔐 SISTEMA ANTI-FRAUDE
          for (const detalle of detalles) {
            if (detalle.metodo === 'nequi' || detalle.metodo === 'daviplata' || detalle.metodo === 'transferencia') {
              try {
                await antiFraudeService.registrarTransaccionPendiente(
                  numeroFacturaCompleto,
                  detalle.metodo as 'nequi' | 'daviplata' | 'transferencia',
                  detalle.monto
                );
              } catch { /* anti-fraude no crítico */ }
            }
          }

          const tieneEfectivo = detalles.some(d => d.metodo === 'efectivo');
          if (tieneEfectivo) { try { openCashDrawer(); } catch { /* cajón no crítico */ } }

          try { await loadProductos(); } catch { /* refresco no crítico */ }
          try { triggerRefresh(); } catch { /* refresh no crítico */ }
        } catch (bgError) {
          console.error('Error en tareas en segundo plano de handlePagoMixto:', bgError);
        }
      })();
    } catch (error) {
      console.error('Error inesperado en handlePagoMixto:', error);
      toast.error('No se pudo procesar el pago mixto. Intenta de nuevo; si el problema persiste, contacta a soporte.');
      logger.critical(
        'Error inesperado (no manejado previamente) en handlePagoMixto()',
        error as Error,
        { usuario: usuarioActual?.nombreCompleto || usuarioActual?.username }
      );
    } finally {
      procesandoPagoRef.current = false;
      setProcesandoPago(false);
    }
  };

  // Venta a Cartera (crédito a cliente) — mismo patrón que handlePagoMixto:
  // función propia en vez de reusar procesarVenta(), porque necesita datos
  // extra (cliente, abono inicial, días de crédito) que no aplican a los
  // demás métodos de pago.
  const handleVentaCartera = async (datosCartera: DatosVentaCartera) => {
    if (procesandoPagoRef.current) return;
    procesandoPagoRef.current = true;
    setProcesandoPago(true);

    if (carrito.length === 0) {
      toast.error('El carrito está vacío');
      procesandoPagoRef.current = false;
      setProcesandoPago(false);
      return;
    }

    try {
      const total = calcularTotal();
      const fechaOperativa = getFechaLocalISO();
      const sesionCajaActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaOperativa);
      const esAdmin = usuarioActual?.rol === 'super_usuario';
      let config: any = {};
      try { config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}'); } catch { config = {}; }
      const ultimaFacturaLS = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
      let ultimoNumeroDB = 0;
      try { ultimoNumeroDB = await electronStore.getUltimoNumeroVenta(); } catch { /* usar solo localStorage si falla */ }
      const numeroFactura = Math.max(ultimaFacturaLS, ultimoNumeroDB) + 1;
      const prefijoFactura = config.prefijoFactura || 'FAC';
      const numeroFacturaCompleto = `${prefijoFactura}${numeroFactura.toString().padStart(6, '0')}`;

      if (!sesionCajaActiva) {
        if (esAdmin) {
          toast.info('Venta a Cartera procesada en modo Administrador (Sin apertura de caja activa).');
        } else if (!skipCajaCheckRef.current) {
          continuarSinCajaRef.current = () => { skipCajaCheckRef.current = true; handleVentaCartera(datosCartera); };
          setShowSinCajaModal(true);
          return;
        }
      }
      skipCajaCheckRef.current = false;

      const subtotal = calcularSubtotal();
      const iva = calcularIVA();
      const configIVA = obtenerConfigIVA();

      const itemsVenta = carrito.map(item => ({
        ...(function() {
          const extraMods = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
          const cantidadVenta = item.producto.pesable ? (item.peso || 0) : item.cantidad;
          const precioFinal = (Number(item.producto.precio) || 0) + extraMods;
          return {
            id: item.producto.id,
            codigo: item.producto.codigo,
            nombre: item.producto.nombre,
            cantidad: cantidadVenta,
            precio: item.producto.precio,
            precioVenta: precioFinal,
            precioCompra: item.producto.costo || 0,
            subtotal: precioFinal * cantidadVenta,
            categoria: item.producto.categoria,
            costo: (item.producto.costo || 0) + (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.costo) || 0), 0),
            productoTipo: item.producto.tipoInventario || 'directo',
            recipeId: item.producto.recipeId,
            comboComponents: item.producto.comboComponents,
            modifiers: (item.modifiersSeleccionados || []).map(mod => ({
              modifierOptionId: mod.modifierOptionId,
              nombre: mod.nombre,
              cantidad: 1,
              precioVenta: Number(mod.precioVenta || 0),
              costo: Number(mod.costo || 0),
              ingredientId: mod.ingredientId,
              consumoInventario: Number(mod.consumoInventario || 0),
              unidadInventario: mod.unidadInventario,
            })),
          };
        })(),
      }));

      try {
        const validacionInventario = await electronStore.validarDisponibilidadVenta(itemsVenta as any);
        if (!validacionInventario.ok && validacionInventario.faltantes.length > 0) {
          const faltante = validacionInventario.faltantes[0];
          toast.warning(`Stock bajo: ${faltante.nombre} (disponible: ${faltante.disponible} ${faltante.unidad || ''})`, {
            description: 'La venta se registrará igualmente.',
          });
        }
      } catch { /* validación no crítica — continuar */ }

      try { localStorage.setItem('pos-ultima-factura', numeroFactura.toString()); } catch { /* storage lleno */ }

      const fechaVencimientoCartera = new Date();
      fechaVencimientoCartera.setDate(fechaVencimientoCartera.getDate() + datosCartera.diasCredito);
      const carteraCuentaId = `CART-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const saldoPendiente = Math.max(0, total - datosCartera.montoAbonoInicial);

      toast.success('¡Venta a Cartera registrada!', {
        description: `Factura ${numeroFacturaCompleto} - Saldo pendiente: $${saldoPendiente.toLocaleString('es-CO')}`,
      });

      const ventaParaTicket = {
        numeroFactura: numeroFacturaCompleto,
        items: itemsVenta,
        subtotal: configIVA.ivaHabilitado ? subtotal : undefined,
        iva: configIVA.ivaHabilitado ? iva : undefined,
        porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : undefined,
        total,
        metodoPago: 'cartera' as any,
        fecha: new Date().toISOString(),
        cliente: datosCartera.clienteNombre,
        cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero',
        mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
        referencia_mesa: referenciaMesaTransfer ?? undefined,
      };

      try { setVentaActual(ventaParaTicket); setMostrarTicket(true); } catch { /* UI no crítica */ }
      setShowVentaCarteraModal(false);
      setCarrito([]);
      try { guardarCarritoMesa(mesaActivaId, []); } catch { /* mesa no crítica */ }
      setEfectivoRecibido('');
      try { limpiarCuentaPanaderia(); } catch { /* panadería no crítica */ }
      try { if ((window as any).__eliminarFacturaActual) (window as any).__eliminarFacturaActual(); } catch {}
      setMostrarPago(false);

      // 💾 PERSISTENCIA CRÍTICA — ver comentario equivalente en procesarVenta().
      if (usuarioActual) {
        try {
          await electronStore.registrarVenta({
            id: numeroFacturaCompleto,
            numero: numeroFactura,
            numeroFactura: numeroFacturaCompleto,
            fecha: new Date().toISOString(),
            fechaOperativa,
            sesionCajaId: sesionCajaActiva?.id,
            items: itemsVenta,
            subtotal: configIVA.ivaHabilitado ? subtotal : total,
            iva: configIVA.ivaHabilitado ? iva : 0,
            porcentajeIVA: configIVA.ivaHabilitado ? configIVA.porcentajeIVA : 0,
            descuento: 0,
            total,
            metodoPago: 'cartera',
            cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
            cajeroId: usuarioActual.id || 'user-1',
            sincronizado: false,
            puntoVentaId: 'POS-001',
            createdAt: Date.now(),
            syncStatus: 'pending',
            cliente: datosCartera.clienteNombre,
            clienteId: datosCartera.clienteId,
            carteraCuentaId,
            carteraSaldoPendiente: saldoPendiente,
            carteraFechaVencimiento: fechaVencimientoCartera.toISOString(),
            mesa: mesasDisponibles.find(m => m.id === mesaActivaId)?.nombre || 'General',
            referencia_mesa: referenciaMesaTransfer ?? undefined,
          });

          // La cuenta de cartera es lo que hace cobrable el saldo — si esto
          // falla, la venta ya quedó guardada pero SIN forma de cobrarla
          // después, así que se marca como crítico igual que un fallo de
          // persistencia de la venta misma.
          try {
            await crearCuentaCartera({
              id: carteraCuentaId,
              ventaId: numeroFacturaCompleto,
              numeroFactura: numeroFacturaCompleto,
              clienteId: datosCartera.clienteId,
              clienteNombre: datosCartera.clienteNombre,
              clienteTelefono: datosCartera.clienteTelefono,
              clienteDocumento: datosCartera.clienteDocumento,
              total,
              abonoInicial: datosCartera.montoAbonoInicial,
              metodoAbonoInicial: datosCartera.metodoAbonoInicial,
              diasCredito: datosCartera.diasCredito,
              sesionCajaId: sesionCajaActiva?.id,
              usuarioCreador: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
            });
          } catch (carteraError) {
            logger.critical(
              `Venta ${numeroFacturaCompleto} se guardó pero la cuenta de Cartera no se pudo crear`,
              carteraError as Error,
              { numeroFactura: numeroFacturaCompleto, cliente: datosCartera.clienteNombre, total, saldoPendiente }
            );
            toast.error('La venta se guardó pero hubo un error creando la cuenta de cartera — repórtalo a soporte.');
          }
        } catch (persistError) {
          logger.critical(
            `Venta a Cartera ${numeroFacturaCompleto} no se pudo persistir en la base de datos`,
            persistError as Error,
            { numeroFactura: numeroFacturaCompleto, total, metodoPago: 'cartera', cajero: usuarioActual.nombreCompleto || usuarioActual.username }
          );
        }
      }

      // 🚀 TAREAS EN SEGUNDO PLANO — ver comentario equivalente en procesarVenta().
      (async () => {
        try {
          if (usuarioActual) {
            try { await electronStore.calcularEstadisticasDelDia(); } catch { /* estadísticas no críticas */ }
            emitLanEvent('VENTA_NUEVA', {
              total,
              metodoPago: 'cartera',
              cajero: usuarioActual.nombreCompleto || usuarioActual.username || 'Cajero',
              items: carrito.length,
              numeroFactura: numeroFacturaCompleto,
            });
          }
          try { await loadProductos(); } catch { /* refresco no crítico */ }
          try { triggerRefresh(); } catch { /* refresh no crítico */ }
        } catch (bgError) {
          console.error('Error en tareas en segundo plano de handleVentaCartera:', bgError);
        }
      })();
    } catch (error) {
      console.error('Error inesperado en handleVentaCartera:', error);
      toast.error('No se pudo procesar la venta a cartera. Intenta de nuevo; si el problema persiste, contacta a soporte.');
      logger.critical(
        'Error inesperado (no manejado previamente) en handleVentaCartera()',
        error as Error,
        { usuario: usuarioActual?.nombreCompleto || usuarioActual?.username }
      );
    } finally {
      procesandoPagoRef.current = false;
      setProcesandoPago(false);
    }
  };

  // 🚀 FIX rendimiento: 'productosFiltrados' se calculaba filtrando TODO el
  // catálogo (hasta 20,000 productos) en cada render, pero no se usaba en
  // ningún lugar del componente (confirmado por búsqueda completa) — trabajo
  // puro desperdiciado en cada tecla/click. Eliminado.

  const total = calcularTotal();

  return (
    <div className="h-screen flex flex-col">
      {/* Barra de Periféricos Compacta con Logo */}
      <div className={`px-3 py-2 border-b flex-shrink-0 ${
        darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-gray-50/50 border-gray-200'
      }`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Logo de la Empresa — marco 3D sutil */}
          <div className={`flex items-center gap-3 pr-4 mr-3 border-r ${
            darkMode ? 'border-slate-700' : 'border-gray-300'
          }`}>
            <div className="relative h-12 w-12 flex-shrink-0">
              {/* Capa de profundidad (sombra desplazada) */}
              <div
                className={`absolute inset-0 rounded-lg ${darkMode ? 'bg-black/50' : 'bg-gray-400/40'}`}
                style={{ transform: 'translate(2px, 2.5px)', borderRadius: 10 }}
              />
              {/* Superficie principal */}
              <div
                className="relative h-full w-full rounded-lg overflow-hidden flex items-center justify-center"
                style={{
                  background: darkMode
                    ? 'linear-gradient(145deg, #334155 0%, #1e293b 100%)'
                    : 'linear-gradient(145deg, #ffffff 0%, #e2e8f0 100%)',
                  boxShadow: darkMode
                    ? '2px 2px 5px rgba(0,0,0,0.55), -1px -1px 3px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)'
                    : '2px 2px 5px rgba(0,0,0,0.18), -1px -1px 3px rgba(255,255,255,0.95), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                {/* Reflejo superior (vidrio) */}
                <div
                  className="absolute inset-x-0 top-0 h-2/5 pointer-events-none rounded-t-lg"
                  style={{ background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)' }}
                />
                <img
                  src={logoEmpresa || '/logo.png'}
                  alt={nombreComercial || 'Logo empresa'}
                  className="h-full w-full object-contain p-1 relative z-10"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            </div>
            {nombreComercial && (
              <span className={`text-base font-bold hidden lg:inline max-w-[160px] truncate ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {nombreComercial}
              </span>
            )}
          </div>
          
          <Button
            size="sm"
            variant={bascula.conectado ? 'default' : 'outline'}
            onClick={bascula.conectado ? bascula.desconectarBascula : bascula.conectarBascula}
            className={`rounded-lg text-[10px] h-7 px-2 transition-colors ${bascula.conectado ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white' : ''}`}
          >
            <Scale className="w-3 h-3 mr-1" />
            {bascula.conectado ? `${(bascula.peso / 1000).toFixed(2)}kg` : 'Báscula'}
          </Button>

          <Button
            size="sm"
            variant={impresora.conectado ? 'default' : 'outline'}
            onClick={impresora.conectado ? impresora.desconectarImpresora : impresora.conectarImpresora}
            className={`rounded-lg text-[10px] h-7 px-2 transition-colors ${impresora.conectado ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white' : ''}`}
          >
            <Printer className="w-3 h-3 mr-1" />
            Impresora
          </Button>

          <Button
            size="sm"
            variant={cajon.conectado ? 'default' : 'outline'}
            onClick={cajon.abrirCajon}
            disabled={!impresora.conectado}
            className={`rounded-lg text-[10px] h-7 px-2 transition-colors ${cajon.conectado ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white' : ''}`}
            title={!impresora.conectado ? 'Conecta la impresora primero' : 'Abrir cajón monedero'}
          >
            <Vault className="w-3 h-3 mr-1" />
            Cajón
          </Button>

          <Button
            size="sm"
            variant={displayCliente.conectado ? 'default' : 'outline'}
            onClick={displayCliente.conectarDisplay}
            className={`rounded-lg text-[10px] h-7 px-2 transition-colors ${displayCliente.conectado ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white' : ''}`}
          >
            <Monitor className="w-3 h-3 mr-1" />
            Display
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowZoomPanel(true)}
            className={`rounded-lg text-[10px] h-7 px-2 transition-colors border-violet-400 text-violet-600 hover:bg-violet-50 hover:border-violet-500 ${darkMode ? 'border-violet-600 text-violet-400 hover:bg-violet-900/30' : ''}`}
            title="Ajustar escala de pantalla"
          >
            <ScanEye className="w-3 h-3 mr-1" />
            {Math.round(uiScale * 100)}%
          </Button>

          {bascula.conectado && (
            <Button
              size="sm"
              variant="outline"
              onClick={bascula.tarar}
              className="rounded-lg text-[10px] h-7 px-2"
            >
              Tarar
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <SyncStatusIndicator />
            
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
              darkMode ? 'bg-slate-700/50 text-gray-400' : 'bg-white text-gray-500'
            } text-[10px]`}>
              <Barcode className="w-3 h-3" />
              Scanner
            </div>
          </div>
        </div>
      </div>

      {/* CONTENEDOR CON SCROLL GENERAL */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full">
          {/* Panel Izquierdo - CARRITO DE COMPRAS */}
          <div className={`w-2/5 p-6 border-r flex flex-col ${
            darkMode ? 'border-slate-700' : 'border-gray-200'
          }`}>
            {/* Header del Carrito */}
            <div className="mb-4 flex-shrink-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Productos en Carrito
                  </h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {carrito.length} {carrito.length === 1 ? 'producto' : 'productos'}
                  </p>
                </div>
              </div>

              {/* 🆕 BOTONES DE FACTURAS INLINE */}
              <div className="mb-3">
                <MultiFacturasInline
                  carritoActual={carrito}
                  searchTermActual={searchTerm}
                  onRestaurarFactura={(nuevoCarrito, nuevoSearchTerm) => {
                    setCarrito(nuevoCarrito);
                    setSearchTerm(nuevoSearchTerm);
                  }}
                  onLimpiarCarrito={() => {
                    setCarrito([]);
                    setSearchTerm('');
                  }}
                />
              </div>
            </div>

            {/* Lista de Productos en Carrito - EXPANDIDA */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence>
                {carrito.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center py-12"
                  >
                    <ShoppingBag className={`w-24 h-24 mb-4 ${darkMode ? 'text-slate-700' : 'text-gray-300'}`} />
                    <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Carrito vacío
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-gray-600' : 'text-gray-500'}`}>
                      Escanea productos para comenzar
                    </p>
                  </motion.div>
                ) : (
                  <div className="space-y-2 pb-2">
                    {carrito.map((item, index) => {
                      const extraMods = (item.modifiersSeleccionados || []).reduce((s, m) => s + (Number(m.precioVenta) || 0), 0);
                      const subtotal = item.peso 
                        ? (item.producto.precio + extraMods) * item.peso 
                        : (item.producto.precio + extraMods) * item.cantidad;

                      return (
                        <motion.div
                          key={`${item.producto.id}-${index}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className={`border-2 rounded-2xl p-3 ${
                            darkMode 
                              ? 'bg-slate-800/50 border-slate-700' 
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-bold text-sm mb-1 truncate ${
                                darkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {item.producto.nombre}
                              </h4>
                              <p className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {item.producto.codigo}
                              </p>
                              
                              {item.peso ? (
                                <div className="flex items-center gap-2">
                                  <Scale className="w-4 h-4 text-blue-500" />
                                  <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {item.peso.toFixed(2)} kg × ${item.producto.precio.toLocaleString('es-CO')}/kg
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (item.cantidad > 1) {
                                          setCarrito(carrito.map((c, i) => 
                                            i === index ? { ...c, cantidad: c.cantidad - 1 } : c
                                          ));
                                        }
                                      }}
                                      className={`w-7 h-7 p-0 rounded-lg ${
                                        darkMode ? 'border-slate-600' : ''
                                      }`}
                                    >
                                      <Minus className="w-3 h-3" />
                                    </Button>
                                    
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={item.cantidad}
                                      onChange={(e) => {
                                        const soloDigitos = e.target.value.replace(/[^0-9]/g, '');
                                        const valor = soloDigitos === '' ? 0 : parseInt(soloDigitos, 10);
                                        setCarrito(carrito.map((c, i) =>
                                          i === index ? { ...c, cantidad: valor } : c
                                        ));
                                      }}
                                      onBlur={() => {
                                        const maxima = item.producto.stock;
                                        const corregida = Math.max(1, Math.min(item.cantidad, maxima));
                                        if (item.cantidad > maxima) toast.error('Stock insuficiente');
                                        if (corregida !== item.cantidad) {
                                          setCarrito(carrito.map((c, i) =>
                                            i === index ? { ...c, cantidad: corregida } : c
                                          ));
                                        }
                                      }}
                                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                      onFocus={(e) => e.target.select()}
                                      className={`w-14 text-center font-bold bg-transparent border rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                                        darkMode ? 'text-white border-slate-600' : 'text-gray-900 border-gray-300'
                                      }`}
                                    />

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (item.cantidad < item.producto.stock) {
                                          setCarrito(carrito.map((c, i) =>
                                            i === index ? { ...c, cantidad: c.cantidad + 1 } : c
                                          ));
                                        } else {
                                          toast.error('Stock insuficiente');
                                        }
                                      }}
                                      className={`w-7 h-7 p-0 rounded-lg ${
                                        darkMode ? 'border-slate-600' : ''
                                      }`}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  
                                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    × ${(item.producto.precio + extraMods).toLocaleString('es-CO')}
                                  </span>
                                </div>
                              )}

                              {(item.modifiersSeleccionados || []).length > 0 && (
                                <div className={`mt-1 text-[11px] ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                                  + {item.modifiersSeleccionados?.map(m => m.nombre).join(', ')}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <p className="text-lg font-black bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent whitespace-nowrap">
                                ${subtotal.toLocaleString('es-CO')}
                              </p>
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCarrito(carrito.filter((_, i) => i !== index));
                                  toast.success('Producto eliminado del carrito');
                                }}
                                className={`w-8 h-8 p-0 rounded-lg ${
                                  darkMode 
                                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/20' 
                                    : 'border-red-300 text-red-500 hover:bg-red-50'
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Botón Limpiar Carrito - 16px de margen */}
            {carrito.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setCarrito([]);
                  toast.success('Carrito limpiado');
                }}
                className={`w-full rounded-xl h-10 flex-shrink-0 mt-4 mb-6 ${
                  darkMode 
                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/20' 
                    : 'border-red-300 text-red-500 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar Todo el Carrito
              </Button>
            )}
          </div>

          {/* Panel Derecho - RESUMEN Y COBRO */}
          <div className={`w-3/5 flex flex-col p-6 ${
            darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-gray-50 to-white'
          }`}>
            {/* Scanner Manual con Buscador Inteligente */}
            <Card className={`backdrop-blur-xl border mb-3 flex-shrink-0 relative z-50 ${
              darkMode ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
            } rounded-2xl`}>
              <CardContent className="p-2.5">
                {moduloPanaderiaOncesActivo && (
                  <div className="mb-2 flex items-center gap-2">
                    <img src="/mesa.png" alt="Mesa" className="w-7 h-7 object-contain" />
                    <select
                      value={mesaActivaId}
                      onChange={(e) => setMesaActivaId(e.target.value)}
                      className={`h-9 rounded-xl px-3 text-sm border ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      {mesasDisponibles.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Buscador Inteligente de Productos
                    </h3>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Escribe código de barras o nombre del producto
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Input
                      ref={barcodeInputRef}
                      value={codigoBarras}
                      onChange={(e) => handleBuscarProducto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && codigoBarras.trim()) {
                          buscarYAgregarProducto(codigoBarras);
                        } else if (e.key === 'Escape') {
                          setShowSugerencias(false);
                          setCodigoBarras('');
                        } else if (e.key === 'ArrowDown' && productosSugeridos.length > 0) {
                          e.preventDefault();
                          setShowSugerencias(true);
                        }
                      }}
                      placeholder="Busca por código, nombre o categoría..."
                      className={`rounded-xl text-base h-10 ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white placeholder:text-gray-500' : 'bg-white placeholder:text-gray-400'
                      }`}
                    />
                    <Button
                      type="button"
                      onClick={() => setShowProductoManualModal(true)}
                      className={`h-10 px-3 rounded-xl font-bold text-sm whitespace-nowrap ${
                        darkMode
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700'
                      }`}
                    >
                      + Manual
                    </Button>
                  </div>
                  
                  {/* Dropdown de Sugerencias */}
                  <AnimatePresence>
                    {showSugerencias && productosSugeridos.length > 0 && (
                      <motion.div
                        ref={sugerenciasRef}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-xl z-[100] max-h-[300px] overflow-y-auto ${
                          darkMode 
                            ? 'bg-slate-800 border-slate-600' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className={`p-1.5 border-b sticky top-0 ${
                          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
                        }`}>
                          <p className={`text-[10px] font-semibold px-2 py-0.5 ${
                            darkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {productosSugeridos.length} {productosSugeridos.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                          </p>
                        </div>
                        
                        <div className="p-1 space-y-0.5">
                          {productosSugeridos.map((producto, index) => (
                            <motion.button
                              key={producto.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.03 }}
                              onClick={() => seleccionarProductoSugerido(producto)}
                              className={`w-full text-left p-2 rounded-lg transition-all ${
                                darkMode 
                                  ? 'hover:bg-blue-500/20 border border-transparent hover:border-blue-500/50' 
                                  : 'hover:bg-blue-50 border border-transparent hover:border-blue-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    {producto.pesable && (
                                      <Scale className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                    )}
                                    <h4 className={`font-bold text-xs truncate ${
                                      darkMode ? 'text-white' : 'text-gray-900'
                                    }`}>
                                      {producto.nombre}
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <p className={`text-[10px] font-mono ${
                                      darkMode ? 'text-gray-400' : 'text-gray-600'
                                    }`}>
                                      {producto.codigo}
                                    </p>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                      producto.stock > 10 
                                        ? darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                        : producto.stock > 0
                                          ? darkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
                                          : darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                                    }`}>
                                      Stock: {producto.stock}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-sm font-black bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                                    ${producto.precio.toLocaleString('es-CO')}
                                  </p>
                                  {producto.pesable && (
                                    <p className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                      por kg
                                    </p>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            {/* DISPLAY GIGANTE DEL TOTAL - FIJO Y SIEMPRE VISIBLE */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center relative z-0 py-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center mb-6"
              >
                <p className={`text-2xl font-semibold mb-4 ${
                  darkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  TOTAL A PAGAR
                </p>

                {/* Mostrar desglose SOLO cuando IVA esté activado */}
                {carrito.length > 0 && obtenerConfigIVA().ivaHabilitado && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-4 p-5 rounded-2xl border-2 ${
                      darkMode 
                        ? 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 backdrop-blur-xl' 
                        : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 shadow-lg'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className={`text-lg font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          💰 Subtotal:
                        </span>
                        <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          ${calcularSubtotal().toLocaleString('es-CO')}
                        </span>
                      </div>
                      
                      <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      
                      <div className="flex justify-between items-center">
                        <span className={`text-base font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          + IVA ({obtenerConfigIVA().porcentajeIVA}%):
                        </span>
                        <span className={`text-xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          ${calcularIVA().toLocaleString('es-CO')}
                        </span>
                      </div>
                      
                      <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                        ℹ️ Solo productos con IVA aplicable
                      </div>
                    </div>
                  </motion.div>
                )}
                
                <motion.div
                  key={total}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-emerald-600 blur-3xl opacity-20 animate-pulse" />
                  <h1 className="relative text-9xl font-black bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent tracking-tight">
                    ${total.toLocaleString('es-CO')}
                  </h1>
                </motion.div>

                <div className={`mt-6 text-xl font-semibold ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  {carrito.length} {carrito.length === 1 ? 'producto' : 'productos'}
                </div>
              </motion.div>
            </div>

            {/* Widget Fidelización */}
            <div className="flex-shrink-0 mb-3">
              {clienteFidelizacion ? (
                <div className={`rounded-2xl border px-4 py-4 ${
                  darkMode ? 'bg-purple-900/40 border-purple-600/60' : 'bg-purple-50 border-purple-300'
                }`}>
                  <div className="flex items-center gap-4">
                    {/* Avatar +30% */}
                    <div className={`w-14 h-14 flex-shrink-0 rounded-full flex items-center justify-center text-white font-black text-2xl ${
                      darkMode ? 'bg-purple-600' : 'bg-purple-500'
                    }`}>
                      {clienteFidelizacion.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xl font-black truncate leading-tight ${darkMode ? 'text-purple-200' : 'text-purple-800'}`}>
                        {clienteFidelizacion.nombre}
                      </p>
                      <p className={`text-sm mt-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-500'}`}>
                        {clienteFidelizacion.puntos.toLocaleString('es-CO')} pts · {clienteFidelizacion.nivelFidelidad}
                        {' '}· ${(clienteFidelizacion.puntos * pesosXPunto).toLocaleString('es-CO')} en puntos
                      </p>
                    </div>
                    <button
                      onClick={() => { setClienteFidelizacion(null); setPuntosARedimirFidel(0); }}
                      className={`flex-shrink-0 p-2 rounded-full transition-colors ${darkMode ? 'text-purple-400 hover:text-white hover:bg-purple-700' : 'text-purple-400 hover:text-purple-700 hover:bg-purple-100'}`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowFidelBusqueda(true)}
                  className={`w-full py-3.5 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all ${
                    darkMode
                      ? 'border-purple-700/50 text-purple-400 hover:bg-purple-900/20 hover:border-purple-600'
                      : 'border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-400'
                  }`}
                >
                  + Asociar cliente fidelización
                </button>
              )}
            </div>

            {/* Botón COBRAR Gigante */}
            <div className="flex-shrink-0">
              <Button
                onClick={() => setShowPagoModal(true)}
                disabled={carrito.length === 0}
                className="w-full h-24 rounded-3xl text-3xl font-black bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-2xl hover:shadow-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DollarSign className="w-10 h-10 mr-4" />
                COBRAR
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Producto Pesable */}
      <AnimatePresence>
        {showModifiersModal && productoPendienteModifiers && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowModifiersModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-2xl rounded-2xl border p-5 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={`text-xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Seleccionar adiciones</h3>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{productoPendienteModifiers.nombre}</p>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(productoPendienteModifiers.modifiersConfig || []).map((m) => {
                  const checked = modifiersSeleccionTemp.some(x => x.modifierOptionId === m.modifierOptionId);
                  return (
                    <label key={m.modifierOptionId} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setModifiersSeleccionTemp(prev => [...prev, { ...m, precioVenta: Number(m.precioVenta) || 0 }]);
                            } else {
                              setModifiersSeleccionTemp(prev => prev.filter(x => x.modifierOptionId !== m.modifierOptionId));
                            }
                          }}
                        />
                        <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{m.nombre}</span>
                      </div>
                      <span className="font-bold text-emerald-500">+${Number(m.precioVenta || 0).toLocaleString('es-CO')}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Extra: <span className="font-bold text-emerald-500">${modifiersSeleccionTemp.reduce((s, m) => s + (Number(m.precioVenta) || 0), 0).toLocaleString('es-CO')}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowModifiersModal(false)}>Cancelar</Button>
                  <Button onClick={() => {
                    if (!productoPendienteModifiers) return;
                    agregarAlCarritoDirecto(productoPendienteModifiers, modifiersSeleccionTemp);
                    setShowModifiersModal(false);
                    setProductoPendienteModifiers(null);
                  }}>
                    Confirmar
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showProductoManualModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
            onClick={cerrarModalProductoManual}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl p-6 ${
                darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Producto Manual
                </h3>
                <Button type="button" size="icon" variant="ghost" className="rounded-xl" onClick={cerrarModalProductoManual}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`text-sm font-semibold mb-1 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Nombre del producto *
                  </label>
                  <Input
                    value={manualForm.nombre}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, nombre: e.target.value }))}
                    className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
                    placeholder="Ej: Camiseta promoción"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-sm font-semibold mb-1 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Precio de venta *
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      value={manualForm.precioVenta}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, precioVenta: e.target.value }))}
                      className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={`text-sm font-semibold mb-1 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Precio de costo
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualForm.precioCosto}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, precioCosto: e.target.value }))}
                      className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-sm font-semibold mb-1 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Cantidad inicial
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={manualForm.cantidadInicial}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, cantidadInicial: e.target.value }))}
                      className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
                    />
                  </div>
                  <div>
                    <label className={`text-sm font-semibold mb-1 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Categoría
                    </label>
                    <select
                      value={manualForm.categoria}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, categoria: e.target.value }))}
                      className={`w-full h-10 rounded-xl px-3 text-sm ${
                        darkMode
                          ? 'bg-slate-800 border border-slate-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="Manuales">Manuales</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <Button type="button" variant="outline" onClick={cerrarModalProductoManual}>
                  Cancelar
                </Button>
                <Button type="button" onClick={guardarProductoManual} disabled={guardandoProductoManual} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {guardandoProductoManual ? 'Guardando...' : 'Agregar'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {productoPesable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className={`max-w-md w-full rounded-3xl p-8 ${
                darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
              }`}
            >
              <div className="text-center mb-6">
                <Scale className="w-20 h-20 text-blue-500 mx-auto mb-4" />
                <h3 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {productoPesable.nombre}
                </h3>
                <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  ${productoPesable.precio.toLocaleString('es-CO')} /kg
                </p>
              </div>

              <div className={`p-6 rounded-2xl mb-6 ${
                darkMode ? 'bg-slate-800 border-2 border-slate-700' : 'bg-gray-50'
              }`}>
                <div className="text-center">
                  <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Peso detectado:
                  </p>
                  <div className="text-6xl font-bold text-blue-500 mb-2">
                    {(bascula.peso / 1000).toFixed(3)}
                  </div>
                  <p className={`text-xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    kilogramos
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setProductoPesable(null)}
                  variant="outline"
                  className="flex-1 rounded-2xl h-14 text-lg"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={agregarProductoPesable}
                  disabled={bascula.peso === 0}
                  className="flex-1 rounded-2xl h-14 text-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  Agregar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Pago */}
      <AnimatePresence>
        {showPagoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 overflow-y-auto py-6 flex items-start justify-center px-4"
            onClick={() => { setShowPagoModal(false); setShowPagoConfig(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`max-w-2xl w-full rounded-3xl flex flex-col max-h-[calc(100vh-48px)] ${
                darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
              }`}
            >
              {/* Cabecera fija — siempre visible */}
              <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
                <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Procesar Pago
                </h2>
                <div className="flex items-center gap-2">
                  {esSuperUsuario && (
                    <Button
                      onClick={() => setShowPagoConfig(v => !v)}
                      size="icon"
                      variant="ghost"
                      className={`rounded-xl ${showPagoConfig ? 'text-amber-400 bg-amber-500/10' : ''}`}
                      title="Configurar métodos de pago"
                    >
                      <Settings className="w-5 h-5" />
                    </Button>
                  )}
                  <Button
                    onClick={() => { setShowPagoModal(false); setShowPagoConfig(false); }}
                    size="icon"
                    variant="ghost"
                    className="rounded-xl"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </div>

              {/* Cuerpo scrollable — config + total + botones */}
              <div className="overflow-y-auto flex-1 px-8 pb-8">

              {/* Panel de configuración de métodos de pago */}
              <AnimatePresence>
                {showPagoConfig && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`mb-5 rounded-2xl border p-4 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-amber-50 border-amber-200'}`}
                  >
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                      Configurar métodos de pago
                    </p>
                    <div className="space-y-2">
                      {metodosPago.map((m, i) => (
                        <div key={m.id} className={`flex items-center gap-3 p-2 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-white'}`}>
                          <button
                            onClick={() => guardarMetodosPago(metodosPago.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))}
                            className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${m.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${m.enabled ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          <input
                            value={m.label}
                            onChange={e => guardarMetodosPago(metodosPago.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                            className={`flex-1 text-sm px-2 py-1 rounded-lg border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                          <input
                            type="color"
                            value={m.color}
                            onChange={e => guardarMetodosPago(metodosPago.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                            className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5"
                            title="Color del botón"
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={`p-6 rounded-2xl mb-6 ${
                darkMode ? 'bg-slate-800' : 'bg-gray-50'
              }`}>
                <div className="text-center">
                  <p className={`text-xl mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total a Pagar:
                  </p>
                  <div className="text-6xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                    ${calcularTotal().toLocaleString('es-CO')}
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {getConfigFacturacion().feActiva && (
                  <div className={`p-4 rounded-2xl border-2 ${darkMode ? 'bg-slate-800 border-orange-500' : 'bg-orange-50 border-orange-300'}`}>
                    <p className={`text-sm font-bold mb-3 ${darkMode ? 'text-orange-200' : 'text-orange-700'}`}>
                      Datos obligatorios del cliente (Facturación Electrónica)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        value={clienteFE.nombre}
                        onChange={(e) => setClienteFE((p) => ({ ...p, nombre: e.target.value }))}
                        placeholder="Nombre cliente"
                        className={darkMode ? 'bg-slate-900 border-slate-500 text-white' : ''}
                      />
                      <Input
                        value={clienteFE.nitCedula}
                        onChange={(e) => setClienteFE((p) => ({ ...p, nitCedula: e.target.value }))}
                        placeholder="NIT / Cédula *"
                        className={darkMode ? 'bg-slate-900 border-slate-500 text-white' : ''}
                      />
                      <Input
                        value={clienteFE.email}
                        onChange={(e) => setClienteFE((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Correo electrónico *"
                        className={darkMode ? 'bg-slate-900 border-slate-500 text-white' : ''}
                      />
                      <Input
                        value={clienteFE.direccion}
                        onChange={(e) => setClienteFE((p) => ({ ...p, direccion: e.target.value }))}
                        placeholder="Dirección *"
                        className={darkMode ? 'bg-slate-900 border-slate-500 text-white' : ''}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className={`block mb-2 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Efectivo Recibido:
                  </label>
                  <Input
                    type="number"
                    value={efectivoRecibido}
                    onChange={(e) => setEfectivoRecibido(e.target.value)}
                    placeholder="0"
                    className={`text-2xl font-bold h-16 rounded-2xl ${
                      darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                    }`}
                  />
                </div>

                {efectivoRecibido && parseFloat(efectivoRecibido) >= calcularTotal() && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl ${
                      darkMode ? 'bg-emerald-500/20 border-2 border-emerald-500' : 'bg-emerald-50 border-2 border-emerald-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Cambio:
                      </span>
                      <span className="text-3xl font-bold text-emerald-500">
                        ${calcularCambio().toLocaleString('es-CO')}
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {metodosPago.filter(m => m.enabled).map(m => {
                  const style = estiloBotonPago(m.color);
                  const cls = 'h-20 rounded-2xl flex flex-col items-center justify-center text-white font-bold text-sm border border-white/20 transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 disabled:hover:translate-y-0 disabled:hover:brightness-100';
                  if (m.id === 'efectivo') return (
                    <button key={m.id} style={style}
                      onClick={() => procesarVenta('efectivo')}
                      disabled={procesandoPago || !efectivoRecibido || parseFloat(efectivoRecibido) < calcularTotal()}
                      className={`${cls} disabled:opacity-40`}>
                      <Banknote className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'tarjeta') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setMetodoPagoSimple('tarjeta'); }} className={cls}>
                      <CreditCard className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'transferencia') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setEntidadVerificacion('transferencia'); setShowVerificacionPagoModal(true); }} className={cls}>
                      <Wallet className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'rappi') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setMetodoPagoSimple('rappi'); }} className={cls}>
                      <Bike className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'nequi') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setEntidadVerificacion('nequi'); setShowVerificacionPagoModal(true); }} className={cls}>
                      <DollarSign className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'daviplata') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setEntidadVerificacion('daviplata'); setShowVerificacionPagoModal(true); }} className={cls}>
                      <DollarSign className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'pago_mixto') return (
                    <button key={m.id} style={style} onClick={() => { setShowPagoModal(false); setShowPagoMixtoModal(true); }} className={cls}>
                      <Zap className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'bonos') return (
                    <button key={m.id} style={style} onClick={() => procesarVenta('bonos')} disabled={procesandoPago} className={`${cls} disabled:opacity-40`}>
                      <Wallet className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'fidelizacion') return (
                    <button key={m.id} style={style} disabled={procesandoPago} onClick={() => {
                      if (!clienteFidelizacion) {
                        toast.error('Primero asocia un cliente de fidelización');
                        return;
                      }
                      const puntosNecesarios = Math.ceil(calcularTotal() / pesosXPunto);
                      if (clienteFidelizacion.puntos < puntosNecesarios) {
                        toast.error(`Puntos insuficientes — necesitas ${puntosNecesarios.toLocaleString('es-CO')} pts`);
                        return;
                      }
                      setShowPagoModal(false);
                      procesarVenta('fidelizacion');
                    }} className={`${cls} disabled:opacity-40`}>
                      <Wallet className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  if (m.id === 'cartera') return (
                    <button key={m.id} style={style} disabled={procesandoPago} onClick={() => {
                      setShowPagoModal(false);
                      setShowVentaCarteraModal(true);
                    }} className={`${cls} disabled:opacity-40`}>
                      <Wallet className="w-7 h-7 mb-1" />{m.label}
                    </button>
                  );
                  return null;
                })}
              </div>

              </div>{/* fin cuerpo scrollable */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Búsqueda Cliente Fidelización */}
      <AnimatePresence>
        {showFidelBusqueda && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
            onClick={() => { setShowFidelBusqueda(false); setFidelBusquedaTexto(''); setFidelResultados([]); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Buscar Cliente
                </h3>
                <button
                  onClick={() => { setShowFidelBusqueda(false); setFidelBusquedaTexto(''); setFidelResultados([]); }}
                  className={`p-1 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                autoFocus
                value={fidelBusquedaTexto}
                onChange={async e => {
                  setFidelBusquedaTexto(e.target.value);
                  if (e.target.value.length >= 2) {
                    const res = await buscarClientesPorTexto(e.target.value).catch(() => []);
                    setFidelResultados(res);
                  } else {
                    setFidelResultados([]);
                  }
                }}
                placeholder="Nombre, cédula o teléfono..."
                className={`w-full px-4 py-2.5 rounded-xl border text-sm mb-3 outline-none focus:ring-2 focus:ring-purple-500 ${
                  darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-400' : 'border-gray-200 placeholder:text-gray-400'
                }`}
              />
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {fidelResultados.map(c => (
                  <button
                    key={c.id}
                    className={`w-full text-left px-4 py-2.5 rounded-xl transition-colors ${
                      darkMode ? 'hover:bg-purple-900/30 text-white' : 'hover:bg-purple-50 text-gray-900'
                    }`}
                    onClick={() => {
                      setClienteFidelizacion(c);
                      setShowFidelBusqueda(false);
                      setFidelBusquedaTexto('');
                      setFidelResultados([]);
                      toast.success(`Cliente: ${c.nombre}`, {
                        description: `${c.puntos.toLocaleString('es-CO')} puntos · Nivel ${c.nivelFidelidad}`,
                        duration: 3000,
                      });
                    }}
                  >
                    <div className="font-medium text-sm">{c.nombre}</div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {c.documento} · {c.puntos.toLocaleString('es-CO')} pts · ${(c.puntos * pesosXPunto).toLocaleString('es-CO')}
                    </div>
                  </button>
                ))}
                {fidelBusquedaTexto.length >= 2 && fidelResultados.length === 0 && (
                  <p className={`text-sm text-center py-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Sin resultados
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Ticket — sin animación de entrada/salida a propósito: este
          popup se abre en el momento más caliente del flujo (justo después
          de cobrar), así que aparece instantáneo en vez de esperar la
          transición de framer-motion. */}
      {mostrarTicket && ventaActual && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setMostrarTicket(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-2xl w-full rounded-3xl p-8 ${
              darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
            } max-h-[92vh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Factura de Venta
              </h2>
              <Button
                onClick={() => setMostrarTicket(false)}
                size="icon"
                variant="ghost"
                className="rounded-xl"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <TicketReceipt venta={ventaActual} />
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Métodos de Pago Simples */}
      <AnimatePresence>
        {metodoPagoSimple && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => { setMetodoPagoSimple(null); setShowPagoModal(true); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`max-w-md w-full rounded-3xl p-8 ${
                darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
              }`}
            >
              <div className="text-center mb-6">
                {metodoPagoSimple === 'tarjeta' && (
                  <>
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CreditCard className="w-10 h-10 text-white" />
                    </div>
                    <h3 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Confirmar Pago con Tarjeta
                    </h3>
                  </>
                )}
                {metodoPagoSimple === 'rappi' && (
                  <>
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bike className="w-10 h-10 text-white" />
                    </div>
                    <h3 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Confirmar Pago con Rappi
                    </h3>
                  </>
                )}
                <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  ¿Confirmas que la transacción se realizará por {metodoPagoSimple === 'tarjeta' ? 'tarjeta' : metodoPagoSimple}?
                </p>
              </div>

              <div className={`p-6 rounded-2xl mb-6 ${
                darkMode ? 'bg-slate-800' : 'bg-gray-50'
              }`}>
                <div className="text-center">
                  <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total a cobrar:
                  </p>
                  <div className="text-5xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                    ${calcularTotal().toLocaleString('es-CO')}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => { setMetodoPagoSimple(null); setShowPagoModal(true); }}
                  variant="outline"
                  className="flex-1 rounded-2xl h-14 text-lg"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    procesarVenta(metodoPagoSimple);
                    setMetodoPagoSimple(null);
                    setShowPagoModal(false);
                  }}
                  disabled={procesandoPago}
                  className="flex-1 rounded-2xl h-14 text-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40"
                >
                  Confirmar Pago
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de verificación de pago (Nequi/Daviplata/Transferencia) con CODEC Verify */}
      <NequiVerifyModal
        visible={showVerificacionPagoModal}
        entidad={entidadVerificacion}
        monto={calcularTotal()}
        darkMode={darkMode}
        cajeroNombre={usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero'}
        numeroFactura={facturaId}
        onCancelar={() => { setShowVerificacionPagoModal(false); setShowPagoModal(true); }}
        onConfirmar={() => {
          setShowVerificacionPagoModal(false);
          procesarVenta(entidadVerificacion);
          setShowPagoModal(false);
        }}
      />

      {/* Modal de Pago Mixto */}
      <PagoMixtoModal
        isOpen={showPagoMixtoModal}
        onClose={() => setShowPagoMixtoModal(false)}
        totalVenta={calcularTotal()}
        subtotal={calcularSubtotal()}
        iva={calcularIVA()}
        porcentajeIVA={obtenerConfigIVA().porcentajeIVA}
        ivaHabilitado={obtenerConfigIVA().ivaHabilitado}
        onConfirm={(detalles) => {
          // Convertir objeto PagoMixtoDetalle a array para handlePagoMixto
          const detallesArray: any[] = [];
          if (detalles.efectivo) detallesArray.push({ metodo: 'efectivo', monto: detalles.efectivo });
          if (detalles.tarjeta) detallesArray.push({ metodo: 'tarjeta', monto: detalles.tarjeta });
          if (detalles.nequi) detallesArray.push({ metodo: 'nequi', monto: detalles.nequi });
          if (detalles.daviplata) detallesArray.push({ metodo: 'daviplata', monto: detalles.daviplata });
          if (detalles.transferencia) detallesArray.push({ metodo: 'transferencia', monto: detalles.transferencia });
          
          handlePagoMixto(detallesArray);
          setShowPagoMixtoModal(false);
        }}
      />

      {/* Modal de Venta a Cartera (crédito a cliente) */}
      <ModalVentaCartera
        isOpen={showVentaCarteraModal}
        onClose={() => setShowVentaCarteraModal(false)}
        totalVenta={calcularTotal()}
        diasCreditoDefault={(() => {
          try {
            const cfg = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
            return Number(cfg.carteraDiasCredito) || 30;
          } catch { return 30; }
        })()}
        onConfirm={(datos) => { handleVentaCartera(datos); }}
      />

      {/* Sistema de Notificaciones Anti-Fraude */}
      <NotificacionesAntiFraude />

      {/* Modal de Producto Nuevo con Auto-Completado */}
      {showProductoNuevoModal && (
        <ProductoNuevoAutoModal
          codigoBarras={codigoNoEncontrado}
          onClose={() => {
            setShowProductoNuevoModal(false);
            setCodigoNoEncontrado('');
          }}
          onSave={handleGuardarProductoNuevo}
        />
      )}

      {/* ── Panel de Zoom rápido ── */}
      <AnimatePresence>
        {showZoomPanel && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowZoomPanel(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-5 ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <ScanEye className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className={`font-black text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>Escala de pantalla</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {window.screen.width}×{window.screen.height} · DPR {(window.devicePixelRatio||1).toFixed(1)}×
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowZoomPanel(false)} className={`p-1.5 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Auto-ajustar */}
              <button
                type="button"
                onClick={() => { autoAjustarZoom(); setShowZoomPanel(false); }}
                className="w-full rounded-2xl py-3.5 px-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98] transition-all shadow-lg text-white font-black text-sm flex items-center justify-center gap-2"
              >
                <ScanEye className="w-4 h-4" />
                Auto-ajustar para este monitor
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20">
                  → {Math.round(calcularZoomOptimo() * 100)}%
                </span>
              </button>

              {/* Presets */}
              <div className="grid grid-cols-4 gap-2">
                {([0.80, 1.00, 1.15, 1.30] as const).map(pct => (
                  <button key={pct} type="button" onClick={() => aplicarZoom(pct)}
                    className={`rounded-xl py-2.5 text-center transition-all hover:scale-105 active:scale-95 border-2 ${Math.abs(uiScale - pct) < 0.04 ? 'border-violet-500 bg-violet-600 text-white' : darkMode ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    <p className="font-black text-sm">{Math.round(pct * 100)}%</p>
                    <p className={`text-[10px] mt-0.5 ${Math.abs(uiScale - pct) < 0.04 ? 'text-white/70' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {pct === 0.80 ? 'Pequeño' : pct === 1.00 ? 'Normal' : pct === 1.15 ? 'Grande' : '4K'}
                    </p>
                  </button>
                ))}
              </div>

              {/* Slider fino */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ajuste fino</p>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-violet-400' : 'bg-violet-100 text-violet-700'}`}>{Math.round(zoomSlider * 100)}%</span>
                </div>
                <input type="range" min="50" max="180" step="1"
                  value={Math.round(zoomSlider * 100)}
                  onChange={e => setZoomSlider(parseFloat((Number(e.target.value) / 100).toFixed(2)))}
                  className="w-full h-2 rounded-full accent-violet-600 cursor-pointer"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { aplicarZoom(zoomSlider); setShowZoomPanel(false); }}
                    className="flex-1 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />Aplicar
                  </button>
                  <button type="button" onClick={() => { aplicarZoom(1); }}
                    className={`h-9 px-4 rounded-xl font-bold text-sm border transition-colors flex items-center gap-1.5 ${darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                    <RotateCcw className="w-3.5 h-3.5" />100%
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal: Sin apertura de caja (cajero) ── */}
      <AnimatePresence>
        {showSinCajaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className={`w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4 ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${darkMode ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                <Vault className="w-7 h-7 text-amber-500" />
              </div>
              <div className="text-center">
                <h3 className={`text-lg font-black mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Sin Apertura de Caja
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No hay una sesión de caja activa para este turno. Para control de arqueo se recomienda abrir caja, pero puedes continuar igualmente.
                </p>
              </div>
              <div className="space-y-2 pt-1">
                <Button
                  onClick={() => { setShowSinCajaModal(false); continuarSinCajaRef.current = null; navigate('/cierre-caja'); }}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 h-11 font-bold rounded-xl"
                >
                  Ir a Apertura de Caja
                </Button>
                <Button
                  onClick={() => { const fn = continuarSinCajaRef.current; continuarSinCajaRef.current = null; setShowSinCajaModal(false); fn?.(); }}
                  variant="outline"
                  className={`w-full h-11 font-bold rounded-xl border-2 ${darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  Continuar sin abrir caja
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Popup de bienvenida (primera vez) ── */}
      <AnimatePresence>
        {showZoomWelcome && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260, delay: 0.05 }}
              className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
            >
              {/* Banner */}
              <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 p-6 text-center">
                <div className="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 shadow-xl">
                  <ScanEye className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-black text-white">¡Ajusta tu pantalla!</h2>
                <p className="text-white/75 text-sm mt-1">Para que el POS se vea perfecto en tu monitor</p>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Info del monitor */}
                <div className={`rounded-2xl p-4 grid grid-cols-2 gap-3 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  {[
                    { label: 'Resolución', value: `${window.screen.width}×${window.screen.height}` },
                    { label: 'Escala SO', value: `${Math.round((window.devicePixelRatio || 1) * 100)}%` },
                    { label: 'Zoom recomendado', value: `${Math.round(calcularZoomOptimo() * 100)}%` },
                    { label: 'Zoom actual', value: `${Math.round(uiScale * 100)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className={`rounded-xl p-2.5 text-center ${darkMode ? 'bg-slate-700' : 'bg-white'} border ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
                      <p className={`text-sm font-black mt-0.5 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Botones */}
                <button
                  type="button"
                  onClick={() => { autoAjustarZoom(); setShowZoomWelcome(false); }}
                  className="w-full rounded-2xl py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98] transition-all shadow-lg text-white font-black text-base flex items-center justify-center gap-2"
                >
                  <ScanEye className="w-5 h-5" />
                  Auto-ajustar al {Math.round(calcularZoomOptimo() * 100)}%
                </button>

                <div className="grid grid-cols-3 gap-2">
                  {([0.85, 1.00, 1.15] as const).map(pct => (
                    <button key={pct} type="button"
                      onClick={async () => { await aplicarZoom(pct); localStorage.setItem(ZOOM_WELCOMED_KEY, '1'); setShowZoomWelcome(false); toast.success(`Zoom ajustado al ${Math.round(pct * 100)}%`); }}
                      className={`rounded-2xl py-3 text-center border-2 transition-all hover:scale-105 active:scale-95 ${darkMode ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-violet-600' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-400'}`}>
                      <p className="font-black">{Math.round(pct * 100)}%</p>
                      <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{pct < 1 ? 'Compacto' : pct === 1 ? 'Normal' : 'Grande'}</p>
                    </button>
                  ))}
                </div>

                <button type="button"
                  onClick={() => { localStorage.setItem(ZOOM_WELCOMED_KEY, '1'); setShowZoomWelcome(false); }}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                  Continuar sin ajustar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
