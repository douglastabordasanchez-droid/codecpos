/**
 * CODEC POS v2.0 — App Móvil Codec Verify
 * ─────────────────────────────────────────
 * PROTOCOLO DE CONEXIÓN (para el desarrollador del servidor POS):
 *
 * 1. WebSocket en ws://[IP_DEL_PC]:3969
 *
 * 2. Handshake:
 *    App → Servidor: { "tipo": "autenticar_app", "pin": "482756" }
 *    Servidor → App OK: { "tipo": "autenticacion_ok", "tienda": "Minimercado El Éxito" }
 *    Servidor → App ERROR: { "tipo": "autenticacion_error", "mensaje": "PIN incorrecto" }
 *
 * 3. Eventos en tiempo real que el servidor debe emitir:
 *    { "tipo": "evento_pos", "payload": { "evento": "...", ...campos } }
 *
 *    Eventos soportados:
 *    - venta_completada   → { total, cajero, metodoPago, productos }
 *    - pago_verificado    → { monto, banco, remitente, referencia }
 *    - stock_bajo         → { producto, stockActual, stockMinimo }
 *    - producto_vencido   → { producto, fechaVencimiento }
 *    - cierre_caja        → { cajero, totalEfectivo, totalDigital }
 *    - devolucion_registrada → { total, cajero, motivo }
 *    - nuevo_cliente      → { nombre, telefono }
 *    - turno_abierto/cerrado → { cajero, hora }
 *
 *    Bancos soportados: nequi, daviplata, bancolombia, bbva, davivienda, dale, efectivo
 *
 * 4. API REST fallback (cuando no hay WebSocket):
 *    GET  /api/health                    → { ok: true, version: "2.0" }
 *    POST /api/codec-verify/conectar     → { pin } → { success, token, datosNegocio }
 *    GET  /api/dashboard                 → métricas del día
 *    GET  /api/ventas                    → lista de ventas recientes
 *    GET  /api/inventario                → lista de productos con stock
 *    GET  /api/estadisticas              → ventas por día, top productos
 *
 * 5. QR que genera el POS debe contener:
 *    { "ip": "192.168.1.100", "puerto": "3969", "pin": "482756" }
 *    PIN temporal: 6 dígitos, expira en 10 minutos.
 *
 * 6. Mejoras pendientes en el servidor:
 *    - Broadcast a múltiples dispositivos conectados (multiples cajeros)
 *    - Detección SMS real de Nequi/DaviPlata/Bancolombia/BBVA/Davivienda
 *    - Soporte WSS (WebSocket Seguro) para conexiones fuera de la red local
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, QrCode, Wifi, WifiOff, CheckCircle2,
  Bell, DollarSign, TrendingUp, Package, AlertTriangle,
  ChevronRight, Activity, BarChart3, Clock, Home,
  Settings, LogOut, ArrowUpRight, CircleDot,
  User, Lock, Star, Search, Filter,
  Box, ShoppingBag, RefreshCw, ChevronDown,
  Smartphone, AlertCircle, Info, Send,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Tipos ───────────────────────────────────────────
type Pantalla = 'conectar' | 'inicio' | 'pagos' | 'ventas' | 'inventario' | 'estadisticas' | 'alertas' | 'perfil' | 'admin';

type RolUsuario = 'cajero' | 'admin';

interface DatosConexion {
  ip: string;
  port: string;
  pin: string;
  tienda: string;
  token?: string;
}

interface UsuarioApp {
  nombre: string;
  rol: RolUsuario;
  telefono: string;
}

interface EventoPOS {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  leido: boolean;
}

interface ResumenVentas {
  totalHoy: number;
  transacciones: number;
  efectivo: number;
  digital: number;
  devolucionesHoy: number;
  metaMensual: number;
  avanceMensual: number;
}

interface AlertaStock {
  id: string;
  producto: string;
  stock: number;
  minimo: number;
  categoria: string;
  vencimiento?: string;
  critico: boolean;
}

interface NotificacionPago {
  id: string;
  banco: string;
  monto: number;
  remitente: string;
  referencia: string;
  timestamp: Date;
  confirmado: boolean;
}

interface ProductoInventario {
  id: string;
  nombre: string;
  categoria: string;
  stock: number;
  precio: number;
  codigo: string;
  vencimiento?: string;
  stockBajo: boolean;
}

interface VentaDia {
  fecha: string;
  total: number;
  transacciones: number;
}

// ─── Colores por banco ────────────────────────────────
const BANCO_CONFIG: Record<string, { color: string; bg: string; bgLight: string; icon: string; nombre: string }> = {
  nequi:       { color: 'text-purple-400',  bg: 'bg-purple-600',    bgLight: 'bg-purple-900/30',  icon: '💜', nombre: 'Nequi' },
  daviplata:   { color: 'text-red-400',     bg: 'bg-red-600',       bgLight: 'bg-red-900/30',     icon: '❤️', nombre: 'Daviplata' },
  bancolombia: { color: 'text-yellow-400',  bg: 'bg-yellow-600',    bgLight: 'bg-yellow-900/30',  icon: '💛', nombre: 'Bancolombia' },
  bbva:        { color: 'text-sky-400',     bg: 'bg-sky-700',       bgLight: 'bg-sky-900/30',     icon: '🔵', nombre: 'BBVA' },
  davivienda:  { color: 'text-rose-400',    bg: 'bg-rose-700',      bgLight: 'bg-rose-900/30',    icon: '🏠', nombre: 'Davivienda' },
  dale:        { color: 'text-green-400',   bg: 'bg-green-600',     bgLight: 'bg-green-900/30',   icon: '💚', nombre: 'Dale!' },
  efectivo:    { color: 'text-slate-300',   bg: 'bg-slate-600',     bgLight: 'bg-slate-800/60',   icon: '💵', nombre: 'Efectivo' },
};

// ─── Datos mock ───────────────────────────────────────
function mockResumen(): ResumenVentas {
  return { totalHoy: 1_248_500, transacciones: 37, efectivo: 820_000, digital: 428_500, devolucionesHoy: 2, metaMensual: 40_000_000, avanceMensual: 28_350_000 };
}

function mockAlertas(): AlertaStock[] {
  return [
    { id: '1', producto: 'Leche Entera 1L',   stock: 3,  minimo: 10, categoria: 'Lácteos',    critico: true  },
    { id: '2', producto: 'Arroz Diana 500g',   stock: 5,  minimo: 20, categoria: 'Granos',     critico: true  },
    { id: '3', producto: 'Aceite Girasol 1L',  stock: 8,  minimo: 12, categoria: 'Aceites',    vencimiento: '2026-04-01', critico: false },
    { id: '4', producto: 'Gaseosa 1.5L',       stock: 12, minimo: 15, categoria: 'Bebidas',    critico: false },
    { id: '5', producto: 'Pan Tajado',         stock: 2,  minimo: 8,  categoria: 'Panadería',  vencimiento: '2026-03-05', critico: true  },
  ];
}

function mockPagos(): NotificacionPago[] {
  const bancos = ['nequi', 'daviplata', 'bancolombia', 'dale', 'efectivo', 'bbva'];
  return Array.from({ length: 12 }, (_, i) => ({
    id: `p-${i}`,
    banco: bancos[i % bancos.length],
    monto: [48700, 95000, 23500, 120000, 67800, 15000, 200000, 38000, 55500, 180000, 42000, 88500][i],
    remitente: `300${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`,
    referencia: `POS-${Date.now() - i * 120000}`,
    timestamp: new Date(Date.now() - i * 12 * 60 * 1000),
    confirmado: true,
  }));
}

function mockInventario(): ProductoInventario[] {
  return [
    { id: '1', nombre: 'Leche Entera 1L',      categoria: 'Lácteos',    stock: 3,   precio: 3200,  codigo: '750100001', stockBajo: true  },
    { id: '2', nombre: 'Arroz Diana 500g',      categoria: 'Granos',     stock: 5,   precio: 2800,  codigo: '750100002', stockBajo: true  },
    { id: '3', nombre: 'Aceite Girasol 1L',     categoria: 'Aceites',    stock: 8,   precio: 9500,  codigo: '750100003', vencimiento: '2026-04-01', stockBajo: true  },
    { id: '4', nombre: 'Gaseosa 1.5L',          categoria: 'Bebidas',    stock: 24,  precio: 5200,  codigo: '750100004', stockBajo: false },
    { id: '5', nombre: 'Pan Tajado',            categoria: 'Panadería',  stock: 2,   precio: 6800,  codigo: '750100005', vencimiento: '2026-03-05', stockBajo: true  },
    { id: '6', nombre: 'Huevos x12',            categoria: 'Huevos',     stock: 18,  precio: 12000, codigo: '750100006', stockBajo: false },
    { id: '7', nombre: 'Jabón Rey 400g',        categoria: 'Aseo',       stock: 30,  precio: 3500,  codigo: '750100007', stockBajo: false },
    { id: '8', nombre: 'Coca-Cola 600ml',       categoria: 'Bebidas',    stock: 48,  precio: 3200,  codigo: '750100008', stockBajo: false },
    { id: '9', nombre: 'Café Águila Roja 250g', categoria: 'Café/Té',    stock: 9,   precio: 15000, codigo: '750100009', stockBajo: false },
    { id: '10', nombre: 'Azúcar Manuelita 1kg', categoria: 'Granos',     stock: 15,  precio: 4800,  codigo: '750100010', stockBajo: false },
  ];
}

function mockVentasDias(): VentaDia[] {
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return dias.map((fecha, i) => ({
    fecha,
    total: [850000, 920000, 780000, 1100000, 1350000, 1600000, 400000][i],
    transacciones: [28, 31, 24, 38, 45, 55, 14][i],
  }));
}

// ─── Status Bar ───────────────────────────────────────
function StatusBar({ tienda, conectado, noLeidos }: { tienda: string; conectado: boolean; noLeidos: number }) {
  const [hora, setHora] = useState(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const t = setInterval(() => setHora(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1">
      <span className="text-white text-xs font-bold">{hora}</span>
      <div className="flex items-center gap-1.5">
        {noLeidos > 0 && (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">{noLeidos > 9 ? '9+' : noLeidos}</span>
          </div>
        )}
        {conectado ? <Wifi className="w-3.5 h-3.5 text-white" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
        <div className="w-6 h-3 rounded-sm border border-white/60 p-0.5">
          <div className="h-full w-3/4 bg-white rounded-[2px]" />
        </div>
      </div>
    </div>
  );
}

// ─── Pantalla: Conectar ───────────────────────────────
function PantallaConectar({ onConectado }: { onConectado: (d: DatosConexion, ws: WebSocket | null, usuario: UsuarioApp) => void }) {
  const [paso, setPaso] = useState<'inicio' | 'escaneando' | 'pin' | 'conectando' | 'usuario'>('inicio');
  const [pinInput, setPinInput] = useState('');
  const [ipInput, setIpInput] = useState('');
  const [error, setError] = useState('');
  const [nombreInput, setNombreInput] = useState('');
  const [rolInput, setRolInput] = useState<RolUsuario>('cajero');
  const [datosTemp, setDatosTemp] = useState<DatosConexion | null>(null);

  const simularEscaneoQR = () => {
    setPaso('escaneando');
    setTimeout(() => {
      setIpInput('192.168.1.100');
      setPinInput('482756');
      setPaso('pin');
    }, 1800);
  };

  const conectar = () => {
    if (pinInput.length !== 6) { setError('El PIN debe tener 6 dígitos'); return; }
    setError('');
    setPaso('conectando');
    setTimeout(() => {
      const datos: DatosConexion = { ip: ipInput || '192.168.1.100', port: '3969', pin: pinInput, tienda: 'Minimercado El Éxito', token: 'eyJ.mock.token' };
      let ws: WebSocket | null = null;
      try {
        ws = new WebSocket(`ws://${datos.ip}:${datos.port}`);
        ws.onopen = () => ws!.send(JSON.stringify({ tipo: 'autenticar_app', pin: datos.pin }));
        ws.onerror = () => { ws = null; };
      } catch { ws = null; }
      setDatosTemp(datos);
      setPaso('usuario');
    }, 2000);
  };

  const finalizarConexion = () => {
    if (!nombreInput.trim()) { setError('Ingresa tu nombre'); return; }
    if (!datosTemp) return;
    const usuario: UsuarioApp = { nombre: nombreInput, rol: rolInput, telefono: '' };
    onConectado(datosTemp, null, usuario);
  };

  return (
    <div className="flex-1 flex flex-col px-6 pt-6 pb-8 overflow-y-auto">
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-2xl shadow-violet-900/60 mb-4">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-white text-2xl font-black">Codec Verify</h1>
        <p className="text-violet-400 text-sm mt-1">App del cajero · v2.0</p>
      </div>

      <AnimatePresence mode="wait">

        {paso === 'inicio' && (
          <motion.div key="inicio" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <button onClick={simularEscaneoQR}
              className="w-full bg-violet-600 hover:bg-violet-500 active:scale-[0.97] rounded-2xl p-5 flex items-center gap-4 transition-all shadow-lg shadow-violet-900/40">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold">Escanear QR del POS</p>
                <p className="text-violet-300 text-xs mt-0.5">Conexión automática · Recomendado</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60 ml-auto" />
            </button>

            <button onClick={() => setPaso('pin')}
              className="w-full bg-slate-800 hover:bg-slate-700 active:scale-[0.97] border border-slate-700 rounded-2xl p-5 flex items-center gap-4 transition-all">
              <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Wifi className="w-6 h-6 text-slate-300" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold">Ingresar IP y PIN</p>
                <p className="text-slate-400 text-xs mt-0.5">Conexión manual · Puerto 3969</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 ml-auto" />
            </button>

            <div className="mt-4 p-4 rounded-2xl bg-violet-950/40 border border-violet-800/30">
              <p className="text-violet-300 text-xs font-semibold mb-2">ℹ️ Cómo conectarse</p>
              <p className="text-slate-400 text-xs leading-relaxed">
                Abre CODEC POS en el PC → Ve a <span className="text-violet-300 font-mono">Codec Verify → Generar QR</span> → Escanea con esta app. El PIN expira en 10 minutos.
              </p>
            </div>
          </motion.div>
        )}

        {paso === 'escaneando' && (
          <motion.div key="escaneando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center flex-1 gap-6">
            <div className="relative w-52 h-52">
              <div className="absolute inset-0 rounded-3xl border-4 border-violet-500/40" />
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-violet-400 rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-violet-400 rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-violet-400 rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-violet-400 rounded-br-2xl" />
              <motion.div animate={{ top: ['15%', '80%', '15%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-4 right-4 h-0.5 bg-violet-400 shadow-lg shadow-violet-500/50" style={{ position: 'absolute' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <QrCode className="w-16 h-16 text-violet-500/30" />
              </div>
            </div>
            <p className="text-violet-300 text-sm animate-pulse">Apunta la cámara al QR del POS...</p>
          </motion.div>
        )}

        {paso === 'pin' && (
          <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">IP del PC con CODEC POS</label>
              <input type="text" value={ipInput} onChange={e => setIpInput(e.target.value)} placeholder="192.168.1.100"
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-white font-mono text-lg focus:outline-none focus:border-violet-500 transition-colors" />
              <p className="text-slate-600 text-xs mt-1 ml-1">Puerto: 3969 (ws://IP:3969)</p>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">PIN de 6 dígitos</label>
              <input type="number" value={pinInput} onChange={e => setPinInput(e.target.value.slice(0, 6))} placeholder="• • • • • •"
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-white font-mono text-2xl text-center tracking-widest focus:outline-none focus:border-violet-500 transition-colors" />
              <p className="text-slate-600 text-xs mt-1 ml-1">Generado en el POS · Válido 10 min</p>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button onClick={conectar} className="w-full bg-violet-600 hover:bg-violet-500 rounded-2xl py-4 text-white font-bold text-lg transition-all mt-2 active:scale-[0.97]">
              Conectar al POS
            </button>
            <button onClick={() => { setPaso('inicio'); setError(''); }} className="w-full text-slate-500 text-sm py-2">← Volver</button>
          </motion.div>
        )}

        {paso === 'conectando' && (
          <motion.div key="conectando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center flex-1 gap-5">
            <div className="w-20 h-20 rounded-full border-4 border-violet-700 border-t-violet-400 animate-spin" />
            <div className="text-center">
              <p className="text-white font-bold text-lg">Conectando...</p>
              <p className="text-slate-400 text-sm mt-1">ws://{ipInput || '192.168.1.100'}:3969</p>
              <p className="text-slate-500 text-xs mt-1">Verificando PIN con el servidor</p>
            </div>
          </motion.div>
        )}

        {paso === 'usuario' && (
          <motion.div key="usuario" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <p className="text-emerald-400 font-semibold text-sm">Conectado a {datosTemp?.tienda}</p>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Tu nombre</label>
              <input type="text" value={nombreInput} onChange={e => setNombreInput(e.target.value)} placeholder="ej: Carlos Martínez"
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-violet-500 transition-colors" />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Tu rol</label>
              <div className="grid grid-cols-2 gap-3">
                {(['cajero', 'admin'] as RolUsuario[]).map(r => (
                  <button key={r} onClick={() => setRolInput(r)}
                    className={`py-3 rounded-2xl font-semibold transition-all ${rolInput === r ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                    {r === 'cajero' ? '🧑‍💼 Cajero' : '👑 Admin'}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button onClick={finalizarConexion} className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-2xl py-4 text-white font-bold text-lg transition-all active:scale-[0.97]">
              Entrar al panel
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ─── Pantalla: Inicio ─────────────────────────────────
function PantallaInicio({ datos, eventos, conexion, usuario, onNavegarA }: {
  datos: ResumenVentas; eventos: EventoPOS[]; conexion: DatosConexion;
  usuario: UsuarioApp; onNavegarA: (p: Pantalla) => void;
}) {
  const pct = Math.round((datos.avanceMensual / datos.metaMensual) * 100);
  const recientes = eventos.slice(0, 4);
  const alertasCount = mockAlertas().filter(a => a.critico).length;
  const pagosNoLeidos = eventos.filter(e => e.tipo === 'pago_verificado' && !e.leido).length;

  const saludo = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
      <div className="pt-1 pb-0.5">
        <p className="text-slate-400 text-xs">{saludo()} 👋 · {usuario.rol === 'admin' ? '👑 Admin' : '🧑‍💼 Cajero'}</p>
        <h2 className="text-white font-black text-lg leading-tight">{usuario.nombre}</h2>
        <p className="text-slate-500 text-xs">{conexion.tienda}</p>
      </div>

      {/* Ventas hoy */}
      <div className="bg-gradient-to-br from-violet-700 to-purple-900 rounded-3xl p-4 shadow-xl shadow-violet-900/50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-violet-300 text-xs font-semibold uppercase tracking-wider">Ventas de hoy</p>
          <div className="flex items-center gap-1 text-emerald-400 text-xs">
            <ArrowUpRight className="w-3 h-3" /><span>+12%</span>
          </div>
        </div>
        <p className="text-white text-3xl font-black">${datos.totalHoy.toLocaleString('es-CO')}</p>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <div><p className="text-violet-300">Trans.</p><p className="text-white font-bold">{datos.transacciones}</p></div>
          <div className="w-px h-6 bg-violet-600" />
          <div><p className="text-violet-300">Efectivo</p><p className="text-white font-bold">${(datos.efectivo / 1000).toFixed(0)}K</p></div>
          <div className="w-px h-6 bg-violet-600" />
          <div><p className="text-violet-300">Digital</p><p className="text-white font-bold">${(datos.digital / 1000).toFixed(0)}K</p></div>
          <div className="w-px h-6 bg-violet-600" />
          <div><p className="text-violet-300">Devol.</p><p className="text-red-400 font-bold">{datos.devolucionesHoy}</p></div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-violet-300">Meta mensual</span>
            <span className="text-white font-bold">{pct}%</span>
          </div>
          <div className="h-1.5 bg-violet-900 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, delay: 0.3 }}
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full" />
          </div>
        </div>
      </div>

      {/* Grid de accesos rápidos */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pagos',      icono: <DollarSign className="w-5 h-5" />,    color: 'from-emerald-800 to-emerald-950', pantalla: 'pagos' as Pantalla,       badge: pagosNoLeidos },
          { label: 'Inventario', icono: <Package className="w-5 h-5" />,       color: 'from-blue-800 to-blue-950',      pantalla: 'inventario' as Pantalla,  badge: mockInventario().filter(p => p.stockBajo).length },
          { label: 'Alertas',    icono: <AlertTriangle className="w-5 h-5" />, color: 'from-amber-800 to-amber-950',    pantalla: 'alertas' as Pantalla,     badge: alertasCount },
          { label: 'Ventas',     icono: <BarChart3 className="w-5 h-5" />,     color: 'from-violet-800 to-violet-950',  pantalla: 'ventas' as Pantalla,      badge: 0 },
          { label: 'Stats',      icono: <TrendingUp className="w-5 h-5" />,    color: 'from-pink-800 to-pink-950',      pantalla: 'estadisticas' as Pantalla, badge: 0 },
          { label: usuario.rol === 'admin' ? 'Admin' : 'Perfil',
            icono: usuario.rol === 'admin' ? <Star className="w-5 h-5" /> : <User className="w-5 h-5" />,
            color: usuario.rol === 'admin' ? 'from-yellow-800 to-yellow-950' : 'from-slate-700 to-slate-900',
            pantalla: (usuario.rol === 'admin' ? 'admin' : 'perfil') as Pantalla, badge: 0 },
        ].map(item => (
          <button key={item.label} onClick={() => onNavegarA(item.pantalla)}
            className={`relative bg-gradient-to-br ${item.color} rounded-2xl p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-all border border-white/5`}>
            {item.badge > 0 && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">{item.badge > 9 ? '9+' : item.badge}</span>
              </div>
            )}
            <div className="text-white">{item.icono}</div>
            <span className="text-white text-[11px] font-semibold">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Actividad reciente */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-white font-bold text-sm">Actividad reciente</p>
          <button onClick={() => onNavegarA('pagos')} className="text-violet-400 text-xs">Ver todo →</button>
        </div>
        <div className="space-y-2">
          {recientes.length === 0 ? (
            <div className="text-center py-6">
              <CircleDot className="w-7 h-7 text-slate-600 mx-auto mb-2 animate-pulse" />
              <p className="text-slate-500 text-xs">Esperando eventos del POS...</p>
            </div>
          ) : recientes.map(ev => <EventoCard key={ev.id} evento={ev} compact />)}
        </div>
      </div>
    </div>
  );
}

// ─── EventoCard ───────────────────────────────────────
function EventoCard({ evento, compact = false }: { evento: EventoPOS; compact?: boolean }) {
  const iconos: Record<string, string> = {
    venta_completada: '💰', pago_verificado: '✅', stock_bajo: '⚠️',
    producto_vencido: '🗑️', cierre_caja: '🏦', devolucion_registrada: '↩️',
    nuevo_cliente: '👤', turno_abierto: '🟢', turno_cerrado: '🔴',
  };
  const colores: Record<string, string> = {
    venta_completada: 'border-emerald-700/40 bg-emerald-900/20',
    pago_verificado: 'border-violet-700/40 bg-violet-900/20',
    stock_bajo: 'border-amber-700/40 bg-amber-900/20',
    cierre_caja: 'border-blue-700/40 bg-blue-900/20',
    default: 'border-slate-700 bg-slate-800/40',
  };
  const color = colores[evento.tipo] || colores.default;
  const icono = iconos[evento.tipo] || '📌';
  const p = evento.payload;
  const hora = evento.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const subtexto = () => {
    if (evento.tipo === 'venta_completada') return `$${Number(p.total).toLocaleString('es-CO')} · ${p.metodoPago}`;
    if (evento.tipo === 'pago_verificado') return `$${Number(p.monto).toLocaleString('es-CO')} vía ${String(p.banco).toUpperCase()}`;
    if (evento.tipo === 'stock_bajo') return `Stock: ${p.stockActual} · Mín: ${p.stockMinimo}`;
    return '';
  };
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className={`rounded-2xl border p-3 flex items-center gap-3 ${color} ${!evento.leido ? 'ring-1 ring-violet-500/30' : ''}`}>
      <span className="text-lg flex-shrink-0">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold truncate">
          {evento.tipo.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </p>
        {subtexto() && <p className="text-slate-400 text-xs truncate">{subtexto()}</p>}
      </div>
      <span className="text-slate-500 text-[10px] flex-shrink-0">{hora}</span>
    </motion.div>
  );
}

// ─── Pantalla: Pagos ──────────────────────────────────
function PantallaPagos({ pagos, eventos }: { pagos: NotificacionPago[]; eventos: EventoPOS[] }) {
  const [filtroBanco, setFiltroBanco] = useState<string>('todos');
  const todosPagos = [...pagos];
  const filtrados = filtroBanco === 'todos' ? todosPagos : todosPagos.filter(p => p.banco === filtroBanco);
  const totalFiltrado = filtrados.reduce((s, p) => s + p.monto, 0);
  const porBanco = Object.entries(BANCO_CONFIG).map(([key, cfg]) => ({
    key, cfg, total: todosPagos.filter(p => p.banco === key).reduce((s, p) => s + p.monto, 0),
    count: todosPagos.filter(p => p.banco === key).length,
  })).filter(b => b.count > 0);

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-4 pt-2 pb-3 space-y-3">
        {/* Resumen */}
        <div className="bg-gradient-to-r from-emerald-800/80 to-teal-900/80 rounded-2xl p-4 flex items-center gap-4 border border-emerald-700/30">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/40 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <p className="text-emerald-300 text-xs">Total recibido hoy</p>
            <p className="text-white font-black text-2xl">${totalFiltrado.toLocaleString('es-CO')}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-slate-400 text-xs">{filtrados.length} pagos</p>
          </div>
        </div>

        {/* Resumen por banco */}
        <div className="grid grid-cols-2 gap-2">
          {porBanco.map(({ key, cfg, total, count }) => (
            <button key={key} onClick={() => setFiltroBanco(filtroBanco === key ? 'todos' : key)}
              className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${filtroBanco === key ? `border-violet-500 bg-violet-900/30` : 'border-slate-700 bg-slate-800/40'}`}>
              <span className="text-base">{cfg.icon}</span>
              <div className="text-left">
                <p className="text-white text-xs font-semibold">{cfg.nombre}</p>
                <p className="text-slate-400 text-[10px]">${(total / 1000).toFixed(0)}K · {count}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Filtros rápidos */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {['todos', ...Object.keys(BANCO_CONFIG)].map(b => (
            <button key={b} onClick={() => setFiltroBanco(b)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${filtroBanco === b ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
              {b === 'todos' ? 'Todos' : (BANCO_CONFIG[b]?.icon + ' ' + BANCO_CONFIG[b]?.nombre)}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de pagos */}
      <div className="px-4 space-y-2">
        {/* Eventos en tiempo real primero */}
        {eventos.filter(e => e.tipo === 'pago_verificado').map(ev => (
          <div key={ev.id} className="relative">
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            <EventoCard evento={ev} />
          </div>
        ))}
        {filtrados.map(pago => {
          const cfg = BANCO_CONFIG[pago.banco] || BANCO_CONFIG.efectivo;
          return (
            <motion.div key={pago.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3.5 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 text-base`}>{cfg.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-white font-bold">${pago.monto.toLocaleString('es-CO')}</p>
                  <div className="flex items-center gap-1 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3 h-3" /><span>OK</span>
                  </div>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">{cfg.nombre} · {pago.remitente}</p>
                <p className="text-slate-600 text-[10px] mt-0.5 font-mono">{pago.referencia}</p>
              </div>
              <p className="text-slate-500 text-[10px] flex-shrink-0">{pago.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
            </motion.div>
          );
        })}
        {filtrados.length === 0 && (
          <div className="text-center py-8">
            <DollarSign className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Sin pagos de {BANCO_CONFIG[filtroBanco]?.nombre || filtroBanco} hoy</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pantalla: Ventas ─────────────────────────────────
function PantallaVentas({ datos }: { datos: ResumenVentas }) {
  const ventasDias = mockVentasDias();
  const maxValor = Math.max(...ventasDias.map(v => v.total));
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 pt-1">
        {[
          { label: 'Ticket promedio', valor: `$${Math.round(datos.totalHoy / datos.transacciones).toLocaleString('es-CO')}`, ic: '🎟️' },
          { label: 'Devoluciones',    valor: datos.devolucionesHoy, ic: '↩️' },
          { label: 'Efectivo',        valor: `$${(datos.efectivo / 1000).toFixed(0)}K`, ic: '💵' },
          { label: 'Digital',         valor: `$${(datos.digital / 1000).toFixed(0)}K`, ic: '📱' },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 mb-1"><span className="text-base">{k.ic}</span><p className="text-slate-400 text-xs">{k.label}</p></div>
            <p className="text-white font-black text-xl">{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Gráfico semana */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-4">Ventas esta semana</p>
        <div className="flex items-end gap-1.5 h-24">
          {ventasDias.map((v, i) => (
            <div key={v.fecha} className="flex-1 flex flex-col items-center gap-1">
              <motion.div initial={{ height: 0 }} animate={{ height: `${(v.total / maxValor) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                className={`w-full rounded-t-md min-h-[4px] ${i === 5 ? 'bg-emerald-500' : 'bg-violet-600'}`} />
              <span className="text-[9px] text-slate-500">{v.fecha}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <p className="text-slate-500 text-xs">Mejor día: <span className="text-emerald-400">Sáb</span></p>
          <p className="text-slate-500 text-xs">Total sem: <span className="text-white font-bold">$7.0M</span></p>
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-3">Métodos de pago hoy</p>
        <div className="space-y-2.5">
          {[
            { nombre: 'Efectivo',    val: datos.efectivo,              pct: Math.round(datos.efectivo / datos.totalHoy * 100),    color: 'bg-slate-500' },
            { nombre: 'Nequi',       val: Math.round(datos.digital*.40), pct: Math.round(datos.digital*.40/datos.totalHoy*100), color: 'bg-purple-600' },
            { nombre: 'Daviplata',   val: Math.round(datos.digital*.30), pct: Math.round(datos.digital*.30/datos.totalHoy*100), color: 'bg-red-600' },
            { nombre: 'Bancolombia', val: Math.round(datos.digital*.20), pct: Math.round(datos.digital*.20/datos.totalHoy*100), color: 'bg-yellow-600' },
            { nombre: 'Otros',       val: Math.round(datos.digital*.10), pct: Math.round(datos.digital*.10/datos.totalHoy*100), color: 'bg-sky-600' },
          ].map(m => (
            <div key={m.nombre}>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300 text-xs">{m.nombre}</span>
                <span className="text-white text-xs font-semibold">${m.val.toLocaleString('es-CO')} · {m.pct}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${m.pct}%` }} transition={{ duration: 0.8 }}
                  className={`h-full ${m.color} rounded-full`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta mensual */}
      <div className="bg-gradient-to-br from-violet-900/50 to-purple-900/50 border border-violet-700/40 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-violet-300 text-sm font-semibold">Meta mensual</p>
          <TrendingUp className="w-4 h-4 text-violet-400" />
        </div>
        <p className="text-white font-black text-2xl">${datos.avanceMensual.toLocaleString('es-CO')}</p>
        <p className="text-violet-400 text-xs mt-0.5">de ${datos.metaMensual.toLocaleString('es-CO')}</p>
        <div className="mt-3 h-2 bg-violet-950 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(datos.avanceMensual / datos.metaMensual * 100)}%` }} transition={{ duration: 1 }}
            className="h-full bg-gradient-to-r from-violet-400 to-emerald-400 rounded-full" />
        </div>
        <p className="text-right text-xs text-emerald-400 mt-1 font-bold">
          {Math.round(datos.avanceMensual / datos.metaMensual * 100)}% · Faltan ${(datos.metaMensual - datos.avanceMensual).toLocaleString('es-CO')}
        </p>
      </div>
    </div>
  );
}

// ─── Pantalla: Inventario ─────────────────────────────
function PantallaInventario() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'bajo' | 'vence'>('todos');
  const productos = mockInventario();

  const filtrados = productos.filter(p => {
    const ok = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.includes(busqueda);
    if (filtro === 'bajo') return ok && p.stockBajo;
    if (filtro === 'vence') return ok && !!p.vencimiento;
    return ok;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-2 pb-3 space-y-2">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 text-center">
            <p className="text-white font-black text-xl">{productos.length}</p>
            <p className="text-slate-400 text-[10px]">Productos</p>
          </div>
          <div className="bg-red-900/30 border border-red-800/40 rounded-xl p-2.5 text-center">
            <p className="text-red-400 font-black text-xl">{productos.filter(p => p.stockBajo).length}</p>
            <p className="text-slate-400 text-[10px]">Stock bajo</p>
          </div>
          <div className="bg-amber-900/30 border border-amber-800/40 rounded-xl p-2.5 text-center">
            <p className="text-amber-400 font-black text-xl">{productos.filter(p => p.vencimiento).length}</p>
            <p className="text-slate-400 text-[10px]">Por vencer</p>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors" />
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {[{ k: 'todos', l: 'Todos' }, { k: 'bajo', l: '⚠️ Stock bajo' }, { k: 'vence', l: '📅 Por vencer' }].map(f => (
            <button key={f.k} onClick={() => setFiltro(f.k as typeof filtro)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${filtro === f.k ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {filtrados.map(p => (
          <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`rounded-2xl border p-3 flex items-center gap-3 ${p.stockBajo ? 'border-red-800/40 bg-red-900/10' : 'border-slate-700 bg-slate-800/40'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.stockBajo ? 'bg-red-800/40' : 'bg-slate-700'}`}>
              <Box className={`w-5 h-5 ${p.stockBajo ? 'text-red-400' : 'text-slate-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{p.nombre}</p>
              <p className="text-slate-500 text-xs">{p.categoria} · <span className="font-mono">{p.codigo}</span></p>
              {p.vencimiento && <p className="text-amber-400 text-xs">📅 Vence: {p.vencimiento}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`font-black text-xl ${p.stockBajo ? 'text-red-400' : 'text-white'}`}>{p.stock}</p>
              <p className="text-slate-500 text-xs">${p.precio.toLocaleString('es-CO')}</p>
            </div>
          </motion.div>
        ))}
        {filtrados.length === 0 && (
          <div className="text-center py-10">
            <Package className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Sin resultados</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pantalla: Estadísticas ───────────────────────────
function PantallaEstadisticas({ datos }: { datos: ResumenVentas }) {
  const ventasDias = mockVentasDias();
  const topProductos = [
    { nombre: 'Leche Entera 1L',   unidades: 45, total: 144000 },
    { nombre: 'Gaseosa 1.5L',      unidades: 38, total: 197600 },
    { nombre: 'Huevos x12',        unidades: 32, total: 384000 },
    { nombre: 'Pan Tajado',        unidades: 28, total: 190400 },
    { nombre: 'Arroz Diana 500g',  unidades: 25, total: 70000  },
  ];
  const maxTop = topProductos[0].total;

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-1">
      {/* Top productos */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-400" />
          <p className="text-white font-semibold text-sm">Top 5 productos hoy</p>
        </div>
        <div className="space-y-3">
          {topProductos.map((p, i) => (
            <div key={p.nombre}>
              <div className="flex justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-4 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>#{i+1}</span>
                  <span className="text-slate-300 text-xs truncate max-w-[140px]">{p.nombre}</span>
                </div>
                <span className="text-white text-xs font-semibold">${p.total.toLocaleString('es-CO')}</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(p.total / maxTop) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                  className={`h-full rounded-full ${i === 0 ? 'bg-yellow-500' : 'bg-violet-600'}`} />
              </div>
              <p className="text-slate-600 text-[10px] mt-0.5">{p.unidades} unidades vendidas</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparativo semana */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-1">Comparativo semanal</p>
        <p className="text-slate-400 text-xs mb-3">vs semana anterior</p>
        <div className="space-y-2">
          {ventasDias.map((v, i) => {
            const anterior = [720000, 810000, 850000, 950000, 1100000, 1400000, 350000][i];
            const diff = Math.round(((v.total - anterior) / anterior) * 100);
            return (
              <div key={v.fecha} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-8">{v.fecha}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full" style={{ width: `${(v.total / 2000000) * 100}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-10 text-right ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {diff >= 0 ? '+' : ''}{diff}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Horas pico */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-3">⏰ Horas pico</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { hora: '8-10am', nivel: 'Bajo',   color: 'text-slate-400', bg: 'bg-slate-700' },
            { hora: '10-12m', nivel: 'Medio',  color: 'text-amber-400', bg: 'bg-amber-800/40' },
            { hora: '12-2pm', nivel: 'Alto',   color: 'text-red-400',   bg: 'bg-red-800/40' },
            { hora: '4-6pm',  nivel: 'Medio',  color: 'text-amber-400', bg: 'bg-amber-800/40' },
          ].map(h => (
            <div key={h.hora} className={`${h.bg} border border-white/5 rounded-xl p-2 text-center`}>
              <p className="text-white text-xs font-bold">{h.hora}</p>
              <p className={`text-[10px] font-semibold ${h.color}`}>{h.nivel}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pantalla: Alertas ────────────────────────────────
function PantallaAlertas({ alertas }: { alertas: AlertaStock[] }) {
  const criticas = alertas.filter(a => a.critico);
  const normales = alertas.filter(a => !a.critico);
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-900/30 border border-red-800/50 rounded-2xl p-3 text-center">
          <p className="text-red-400 font-black text-2xl">{criticas.length}</p>
          <p className="text-red-400 text-xs font-semibold">🚨 Críticas</p>
        </div>
        <div className="bg-amber-900/30 border border-amber-800/50 rounded-2xl p-3 text-center">
          <p className="text-amber-400 font-black text-2xl">{normales.length}</p>
          <p className="text-amber-400 text-xs font-semibold">⚠️ Atención</p>
        </div>
      </div>
      {criticas.length > 0 && (
        <div>
          <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">🚨 Acción inmediata</p>
          <div className="space-y-2">
            {criticas.map(a => (
              <div key={a.id} className="bg-red-900/20 border border-red-800/40 rounded-2xl p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{a.producto}</p>
                    <p className="text-slate-400 text-xs">{a.categoria}</p>
                    {a.vencimiento && <p className="text-red-400 text-xs mt-0.5">⚠️ Vence: {a.vencimiento}</p>}
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-red-400 font-black text-xl">{a.stock}</p>
                    <p className="text-slate-500 text-xs">de {a.minimo} mín</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-red-950 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (a.stock / a.minimo) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {normales.length > 0 && (
        <div>
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">⚠️ Stock bajo</p>
          <div className="space-y-2">
            {normales.map(a => (
              <div key={a.id} className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{a.producto}</p>
                    <p className="text-slate-400 text-xs">{a.categoria}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-amber-400 font-black text-xl">{a.stock}</p>
                    <p className="text-slate-500 text-xs">de {a.minimo} mín</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-amber-950 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (a.stock / a.minimo) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pantalla: Perfil ─────────────────────────────────
function PantallaPerfil({ usuario, conexion, onDesconectar }: { usuario: UsuarioApp; conexion: DatosConexion; onDesconectar: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-1">
      {/* Avatar */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-violet-700 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-2xl font-black">{usuario.nombre.charAt(0)}</span>
        </div>
        <div>
          <p className="text-white font-bold">{usuario.nombre}</p>
          <p className="text-violet-400 text-xs">{usuario.rol === 'admin' ? '👑 Administrador' : '🧑‍💼 Cajero'}</p>
          <p className="text-slate-500 text-xs mt-0.5">{conexion.tienda}</p>
        </div>
      </div>

      {/* Conexión */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-2.5">
        <p className="text-white font-semibold text-sm">Conexión activa</p>
        {[
          { l: 'Servidor', v: `ws://${conexion.ip}:${conexion.port}` },
          { l: 'Estado', v: '🟢 Conectado' },
          { l: 'Protocolo', v: 'WebSocket' },
          { l: 'Token', v: conexion.token ? `${conexion.token.slice(0,12)}...` : 'N/A' },
        ].map(item => (
          <div key={item.l} className="flex justify-between">
            <span className="text-slate-400 text-xs">{item.l}</span>
            <span className="text-white text-xs font-mono">{item.v}</span>
          </div>
        ))}
      </div>

      {/* Notificaciones */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-3">Notificaciones activas</p>
        {[
          { l: 'Pagos verificados (Nequi, Daviplata...)', on: true },
          { l: 'Ventas grandes (+$200K)', on: true },
          { l: 'Stock crítico', on: true },
          { l: 'Cierre de caja', on: true },
          { l: 'Devoluciones', on: false },
          { l: 'Nuevos clientes', on: false },
        ].map(n => (
          <div key={n.l} className="flex justify-between items-center py-1.5 border-b border-slate-700/50 last:border-0">
            <span className="text-slate-300 text-xs">{n.l}</span>
            <div className={`w-8 h-4 rounded-full ${n.on ? 'bg-violet-600' : 'bg-slate-700'} relative transition-all flex-shrink-0`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${n.on ? 'left-4' : 'left-0.5'}`} />
            </div>
          </div>
        ))}
      </div>

      <button onClick={onDesconectar}
        className="w-full bg-red-900/30 border border-red-800/50 rounded-2xl p-4 flex items-center justify-center gap-3 text-red-400 font-semibold active:scale-95 transition-all">
        <LogOut className="w-4 h-4" />Desconectar del POS
      </button>
    </div>
  );
}

// ─── Pantalla: Admin ──────────────────────────────────
function PantallaAdmin({ datos }: { datos: ResumenVentas }) {
  const [turnoAbierto, setTurnoAbierto] = useState(true);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-1">
      {/* Badge Admin */}
      <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-2xl p-3 flex items-center gap-3">
        <Star className="w-5 h-5 text-yellow-400 flex-shrink-0" />
        <div>
          <p className="text-yellow-300 font-semibold text-sm">Panel Administrador</p>
          <p className="text-slate-400 text-xs">Acceso exclusivo · Solo visible para admins</p>
        </div>
      </div>

      {/* Control de turno */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-3">Control de turno</p>
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-bold ${turnoAbierto ? 'text-emerald-400' : 'text-red-400'}`}>
              {turnoAbierto ? '🟢 Turno abierto' : '🔴 Turno cerrado'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">Desde las 7:00 AM · 8h 30min</p>
          </div>
          <button onClick={() => { setTurnoAbierto(!turnoAbierto); toast.info(turnoAbierto ? 'Turno cerrado' : 'Turno abierto'); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${turnoAbierto ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}>
            {turnoAbierto ? 'Cerrar turno' : 'Abrir turno'}
          </button>
        </div>
      </div>

      {/* Resumen para cierre */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-2">
        <p className="text-white font-semibold text-sm">Resumen del turno</p>
        {[
          { l: 'Total ventas',    v: `$${datos.totalHoy.toLocaleString('es-CO')}`,   c: 'text-white' },
          { l: 'Transacciones',  v: datos.transacciones,                              c: 'text-white' },
          { l: 'Efectivo',       v: `$${datos.efectivo.toLocaleString('es-CO')}`,    c: 'text-emerald-400' },
          { l: 'Digital',        v: `$${datos.digital.toLocaleString('es-CO')}`,     c: 'text-violet-400' },
          { l: 'Devoluciones',   v: datos.devolucionesHoy,                            c: 'text-red-400' },
        ].map(r => (
          <div key={r.l} className="flex justify-between py-1 border-b border-slate-700/40 last:border-0">
            <span className="text-slate-400 text-sm">{r.l}</span>
            <span className={`font-bold text-sm ${r.c}`}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Acciones admin */}
      <div className="space-y-2">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Acciones del administrador</p>
        {[
          { l: '📊 Generar reporte del día', desc: 'PDF con todas las ventas y métricas' },
          { l: '🔄 Sincronizar inventario',   desc: 'Actualizar stock desde el POS' },
          { l: '👥 Ver cajeros activos',       desc: '3 dispositivos conectados' },
          { l: '🔐 Revocar accesos',           desc: 'Desconectar dispositivos remotos' },
        ].map(a => (
          <button key={a.l} onClick={() => toast.info(a.l, { description: 'Función disponible con servidor activo' })}
            className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-3.5 flex items-center justify-between active:scale-[0.98] transition-all">
            <div className="text-left">
              <p className="text-white text-sm font-semibold">{a.l}</p>
              <p className="text-slate-500 text-xs mt-0.5">{a.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Notificación flotante ────────────────────────────
function NotificacionFlotante({ evento, onCerrar }: { evento: EventoPOS; onCerrar: () => void }) {
  const p = evento.payload;
  const banco = String(p.banco || 'efectivo');
  const cfg = BANCO_CONFIG[banco] || BANCO_CONFIG.efectivo;
  useEffect(() => { const t = setTimeout(onCerrar, 6000); return () => clearTimeout(t); }, [onCerrar]);
  return (
    <motion.div initial={{ y: -120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -120, opacity: 0 }}
      className="absolute top-14 left-4 right-4 z-50 bg-slate-900/95 border border-violet-700/50 rounded-3xl p-4 shadow-2xl shadow-violet-900/60 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl ${cfg.bg} flex items-center justify-center text-xl flex-shrink-0`}>{cfg.icon}</div>
        <div className="flex-1">
          <p className="text-white font-black text-lg">
            +${Number(p.monto || p.total || 0).toLocaleString('es-CO')}
          </p>
          <p className="text-slate-400 text-xs">
            {evento.tipo === 'pago_verificado' ? `${cfg.nombre} · ${p.remitente}` : `Venta · ${p.cajero}`}
          </p>
        </div>
        <button onClick={onCerrar} className="text-slate-600 p-1 text-lg leading-none">✕</button>
      </div>
    </motion.div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────
export function CodecVerifyMobile() {
  const [pantalla, setPantalla] = useState<Pantalla>('conectar');
  const [conectado, setConectado] = useState(false);
  const [conexion, setConexion] = useState<DatosConexion>({ ip: '', port: '3969', pin: '', tienda: '' });
  const [usuario, setUsuario] = useState<UsuarioApp>({ nombre: '', rol: 'cajero', telefono: '' });

  const [resumen] = useState<ResumenVentas>(mockResumen());
  const [alertas] = useState<AlertaStock[]>(mockAlertas());
  const [pagos] = useState<NotificacionPago[]>(mockPagos());
  const [eventos, setEventos] = useState<EventoPOS[]>([]);
  const [notifFlotante, setNotifFlotante] = useState<EventoPOS | null>(null);

  const eventosNoLeidos = eventos.filter(e => !e.leido).length;

  const recibirEvento = useCallback((ev: EventoPOS) => {
    setEventos(prev => [ev, ...prev].slice(0, 50));
    if (['pago_verificado', 'venta_completada'].includes(ev.tipo)) {
      setNotifFlotante(ev);
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    }
  }, []);

  const simularEventosPOS = useCallback(() => {
    [
      { delay: 10000, ev: { tipo: 'pago_verificado', payload: { evento: 'pago_verificado', banco: 'nequi', monto: 48700, remitente: '3001234567', referencia: `POS-${Date.now()}` } } },
      { delay: 22000, ev: { tipo: 'venta_completada', payload: { evento: 'venta_completada', total: 95000, cajero: 'Carlos M.', metodoPago: 'Daviplata', productos: 4 } } },
      { delay: 38000, ev: { tipo: 'stock_bajo', payload: { evento: 'stock_bajo', producto: 'Leche 1L', stockActual: 2, stockMinimo: 10 } } },
      { delay: 55000, ev: { tipo: 'pago_verificado', payload: { evento: 'pago_verificado', banco: 'bancolombia', monto: 120000, remitente: '3209876543', referencia: `POS-${Date.now()+1}` } } },
    ].forEach(({ delay, ev }) => {
      setTimeout(() => recibirEvento({ id: `sim-${Date.now()}-${ev.tipo}`, ...ev, timestamp: new Date(), leido: false }), delay);
    });
  }, [recibirEvento]);

  const handleConectado = useCallback((datos: DatosConexion, ws: WebSocket | null, usr: UsuarioApp) => {
    setConexion(datos);
    setUsuario(usr);
    setConectado(true);
    setPantalla('inicio');
    simularEventosPOS();
    toast.success(`✅ Bienvenido, ${usr.nombre}`, { description: `${datos.tienda} · ws://${datos.ip}:${datos.port}` });
  }, [simularEventosPOS]);

  const desconectar = () => {
    setConectado(false);
    setPantalla('conectar');
    setEventos([]);
    toast.info('Desconectado del POS');
  };

  const navegar = (p: Pantalla) => {
    if (['pagos', 'inicio'].includes(p)) setEventos(prev => prev.map(e => ({ ...e, leido: true })));
    setPantalla(p);
  };

  // Tabs según rol
  const tabs: Array<{ id: Pantalla; icono: React.ReactNode; label: string }> = [
    { id: 'inicio',       icono: <Home className="w-5 h-5" />,          label: 'Inicio'     },
    { id: 'pagos',        icono: <DollarSign className="w-5 h-5" />,    label: 'Pagos'      },
    { id: 'inventario',   icono: <Package className="w-5 h-5" />,       label: 'Stock'      },
    { id: 'estadisticas', icono: <BarChart3 className="w-5 h-5" />,     label: 'Stats'      },
    { id: usuario.rol === 'admin' ? 'admin' : 'perfil',
      icono: usuario.rol === 'admin' ? <Star className="w-5 h-5" /> : <User className="w-5 h-5" />,
      label: usuario.rol === 'admin' ? 'Admin' : 'Perfil' },
  ];

  const titulos: Record<Pantalla, string> = {
    conectar: '', inicio: '🏠 Inicio', pagos: '💳 Pagos',
    ventas: '📊 Ventas', inventario: '📦 Inventario',
    estadisticas: '📈 Estadísticas', alertas: '🔔 Alertas',
    perfil: '👤 Perfil', admin: '👑 Admin',
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="relative w-[390px] h-[844px] bg-slate-950 rounded-[50px] overflow-hidden border-4 border-slate-800 shadow-2xl flex flex-col"
        style={{ boxShadow: '0 0 0 2px #0f172a, 0 30px 80px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)' }}>

        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-slate-950 rounded-b-3xl z-50 flex items-end justify-center pb-1.5 border-b border-slate-900">
          <div className="w-20 h-1 bg-slate-800 rounded-full" />
        </div>

        {/* Status bar */}
        {conectado && (
          <div className="pt-8">
            <StatusBar tienda={conexion.tienda} conectado={conectado} noLeidos={eventosNoLeidos} />
          </div>
        )}

        {/* Notificación flotante */}
        <AnimatePresence>
          {notifFlotante && conectado && (
            <NotificacionFlotante evento={notifFlotante} onCerrar={() => setNotifFlotante(null)} />
          )}
        </AnimatePresence>

        {/* Contenido */}
        <div className={`flex-1 flex flex-col overflow-hidden ${!conectado ? 'pt-10 bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950' : ''}`}>

          {/* Header */}
          {conectado && (
            <div className="px-4 py-2 flex items-center justify-between flex-shrink-0">
              <h3 className="text-white font-bold text-sm">{titulos[pantalla]}</h3>
              <div className="flex items-center gap-2">
                {pantalla !== 'inicio' && pantalla !== 'alertas' && (
                  <button onClick={() => navegar('alertas')}
                    className="relative w-7 h-7 rounded-full bg-amber-900/30 border border-amber-700/40 flex items-center justify-center">
                    <Bell className="w-3.5 h-3.5 text-amber-400" />
                    {alertas.filter(a => a.critico).length > 0 && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">{alertas.filter(a => a.critico).length}</span>
                      </div>
                    )}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400 text-[10px] font-bold">EN VIVO</span>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {!conectado && (
              <motion.div key="conectar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaConectar onConectado={handleConectado} />
              </motion.div>
            )}
            {conectado && pantalla === 'inicio' && (
              <motion.div key="inicio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaInicio datos={resumen} eventos={eventos} conexion={conexion} usuario={usuario} onNavegarA={navegar} />
              </motion.div>
            )}
            {conectado && pantalla === 'pagos' && (
              <motion.div key="pagos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaPagos pagos={pagos} eventos={eventos} />
              </motion.div>
            )}
            {conectado && pantalla === 'ventas' && (
              <motion.div key="ventas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaVentas datos={resumen} />
              </motion.div>
            )}
            {conectado && pantalla === 'inventario' && (
              <motion.div key="inventario" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaInventario />
              </motion.div>
            )}
            {conectado && pantalla === 'estadisticas' && (
              <motion.div key="estadisticas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaEstadisticas datos={resumen} />
              </motion.div>
            )}
            {conectado && pantalla === 'alertas' && (
              <motion.div key="alertas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaAlertas alertas={alertas} />
              </motion.div>
            )}
            {conectado && pantalla === 'perfil' && (
              <motion.div key="perfil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaPerfil usuario={usuario} conexion={conexion} onDesconectar={desconectar} />
              </motion.div>
            )}
            {conectado && pantalla === 'admin' && (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <PantallaAdmin datos={resumen} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tab bar */}
        {conectado && (
          <div className="bg-slate-900/95 border-t border-slate-800 px-2 py-2 flex items-center justify-around backdrop-blur-xl flex-shrink-0">
            {tabs.map(tab => {
              const activo = pantalla === tab.id || (tab.id === 'admin' && pantalla === 'admin') || (tab.id === 'perfil' && pantalla === 'perfil');
              const badge = tab.id === 'pagos' ? eventosNoLeidos
                : tab.id === 'inventario' ? mockInventario().filter(p => p.stockBajo).length : 0;
              return (
                <button key={tab.id} onClick={() => navegar(tab.id)}
                  className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all ${activo ? 'text-violet-400' : 'text-slate-600'}`}>
                  {badge > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[9px] font-bold">{badge > 9 ? '9+' : badge}</span>
                    </div>
                  )}
                  {tab.icono}
                  <span className="text-[10px] font-semibold">{tab.label}</span>
                  {activo && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-400" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Home indicator */}
        <div className="pb-2 flex justify-center flex-shrink-0">
          <div className="w-28 h-1 bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}
