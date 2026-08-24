/**
 * CODEC POS v2.0 - Módulo de Apertura y Cierre de Caja
 * Sistema completo para apertura y cierre de turnos
 * ✅ Apertura de caja con base inicial
 * ✅ Conteo físico vs sistema
 * ✅ Detección automática de faltantes/sobrantes
 * ✅ Impresión de recibo de cierre
 * ✅ Registro de arqueos en historial
 * ✅ Sincronización de ventas pendientes al cajero activo
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Printer,
  Save,
  Calculator,
  Clock,
  User,
  FileText,
  Calendar,
  CreditCard,
  Banknote,
  Wallet,
  PlayCircle,
  StopCircle,
  LogIn,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Search,
  Bike,
  Landmark,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { electronStore } from '../../lib/electronStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { ModalInicioTurno } from '../turnos/ModalInicioTurno';
import { onCierreCaja } from '../../lib/integracionesService';
import { historicoService } from '../../lib/historicoService';
import { useLanContext } from '../../contexts/LanContext';
import { reportesService } from '../../services/reportesService';
import { cajaDiariaService } from '../../lib/cajaDiariaService';
import { employeeActivityLogService } from '../../lib/employeeActivityLogService';
import ModalCierreCaja, { type CierreDataModal } from './ModalCierreCaja';
import ModalCierreDetallado from './ModalCierreDetallado';
import ModalHistorialCierres from './ModalHistorialCierres';

interface AperturaCaja {
  id: string;
  fecha: string;
  cajero: string;
  baseInicial: number;
  billetes: {
    b100000: number;
    b50000: number;
    b20000: number;
    b10000: number;
    b5000: number;
    b2000: number;
    b1000: number;
    m500: number;
    m200: number;
    m100: number;
    m50: number;
  };
}

interface CierreCaja {
  id: string;
  fecha: string;
  cajero: string;
  aperturaId: string;
  fechaApertura: string;
  baseInicial: number;
  totalSistema: number;
  totalFisico: number;
  totalFinal: number;
  diferencia: number;
  desglose: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    bancolombia: number;
    rappi: number;
  };
  billetes: {
    b100000: number;
    b50000: number;
    b20000: number;
    b10000: number;
    b5000: number;
    b2000: number;
    b1000: number;
    m500: number;
    m200: number;
    m100: number;
    m50: number;
  };
  observaciones: string;
  estado: 'cuadrado' | 'faltante' | 'sobrante';
  // Datos adicionales para reconstruir la tirilla idéntica en Reportes → Historial de Cierres
  gastosEfectivo: number;
  gastosDetalle: GastoDetalleCierre[];
  gastosTransferencia: number;
  gastosTarjetaBanco: number;
  devoluciones: number;
  // Abonos de Cartera (venta a crédito) recibidos durante este turno — ver carteraService.ts
  abonosCarteraEfectivo: number;
  abonosCarteraTransferencia: number;
  abonosCarteraTarjetaBanco: number;
  abonosCarteraDetalle: GastoDetalleCierre[];
  cantidadTransacciones: number;
  ticketPromedio: number;
  productosTop: Array<{ nombre: string; cantidad: number; total: number }>;
  transferenciaEsperada: number;
  tarjetaBancoEsperado: number;
  totalEsperadoAnalitico: number;
}

interface GastoDetalleCierre {
  descripcion: string;
  concepto?: string;
  monto: number;
  medioPago?: string;
}

export default function CierreCajaPage() {
  const { usuarioActual, esDesarrollador, esSuperUsuario } = useAuth();
  const { darkMode } = usePOS();
  const { emitLanEvent } = useLanContext();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Estado del turno
  const [turnoActivo, setTurnoActivo] = useState(false);
  const [aperturaActual, setAperturaActual] = useState<AperturaCaja | null>(null);
  const [ventasPendientes, setVentasPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  // Datos del sistema
  const [totalSistema, setTotalSistema] = useState(0);
  const [desgloseSistema, setDesgloseSistema] = useState({
    efectivo: 0,
    tarjeta: 0,
    nequi: 0,
    daviplata: 0,
    transferencia: 0,
    bancolombia: 0,
    rappi: 0,
  });

  // Conteo físico de billetes y monedas (para apertura y cierre)
  const [billetes, setBilletes] = useState({
    b100000: 0,
    b50000: 0,
    b20000: 0,
    b10000: 0,
    b5000: 0,
    b2000: 0,
    b1000: 0,
    m500: 0,
    m200: 0,
    m100: 0,
    m50: 0,
  });

  const [totalContado, setTotalContado] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [modalInicioTurno, setModalInicioTurno] = useState(false);
  const inputImportRef = useRef<HTMLInputElement | null>(null);
  const [gastosEfectivoDia, setGastosEfectivoDia] = useState(0);
  const [gastosTransferenciaDia, setGastosTransferenciaDia] = useState(0);
  const [gastosTarjetaBancoDia, setGastosTarjetaBancoDia] = useState(0);
  const [salidasDevolucionEfectivoDia, setSalidasDevolucionEfectivoDia] = useState(0);
  const [abonosCarteraEfectivoDia, setAbonosCarteraEfectivoDia] = useState(0);
  const [abonosCarteraTransferenciaDia, setAbonosCarteraTransferenciaDia] = useState(0);
  const [abonosCarteraTarjetaBancoDia, setAbonosCarteraTarjetaBancoDia] = useState(0);

  // Tab activo: controlado para que cambie automáticamente al cerrar/abrir caja
  const [activeTab, setActiveTab] = useState<string>('apertura');

  // Modal de cierre de caja
  const [showModalCierre, setShowModalCierre] = useState(false);
  const [cierreDataModal, setCierreDataModal] = useState<CierreDataModal | null>(null);
  // Almacena el objeto cierre calculado para usarlo en la confirmación
  const pendingCierreRef = useRef<any>(null);

  // Modal de cierre detallado (auditoría ultra-detallada)
  const [showModalDetallado, setShowModalDetallado] = useState(false);

  // Modal de historial de cierres
  const [showHistorialCierres, setShowHistorialCierres] = useState(false);

  const getFechaLocalISO = (date: Date = new Date()) => {
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
  };

  const normalizarCanalGasto = (metodoPagoRaw: string): 'efectivo' | 'transferencia' | 'tarjeta_banco' => {
    const metodo = String(metodoPagoRaw || '').toLowerCase();
    if (metodo === 'efectivo') return 'efectivo';
    if (metodo === 'nequi' || metodo === 'daviplata' || metodo === 'transferencia' || metodo === 'bancolombia') return 'transferencia';
    if (['tarjeta', 'tarjeta_banco', 'banco', 'cheque'].includes(metodo)) return 'tarjeta_banco';
    return 'transferencia';
  };

  // Denominaciones
  const denominaciones = [
    { key: 'b100000', label: '$100.000', valor: 100000 },
    { key: 'b50000', label: '$50.000', valor: 50000 },
    { key: 'b20000', label: '$20.000', valor: 20000 },
    { key: 'b10000', label: '$10.000', valor: 10000 },
    { key: 'b5000', label: '$5.000', valor: 5000 },
    { key: 'b2000', label: '$2.000', valor: 2000 },
    { key: 'b1000', label: '$1.000', valor: 1000 },
    { key: 'm500', label: '$500', valor: 500 },
    { key: 'm200', label: '$200', valor: 200 },
    { key: 'm100', label: '$100', valor: 100 },
    { key: 'm50', label: '$50', valor: 50 },
  ];

  useEffect(() => {
    inicializar();
  }, []);

  // Detectar cuando el usuario inicia sesión
  useEffect(() => {
    if (usuarioActual && !turnoActivo) {
      inicializar();
    }
  }, [usuarioActual]);

  // Sincronizar tab activo con el estado del turno
  useEffect(() => {
    setActiveTab(turnoActivo ? 'cierre' : 'apertura');
  }, [turnoActivo]);

  // Calcular total contado cuando cambian los billetes
  useEffect(() => {
    const total = denominaciones.reduce((sum, denom) => {
      return sum + (billetes[denom.key as keyof typeof billetes] * denom.valor);
    }, 0);
    setTotalContado(total);
  }, [billetes]);

  const inicializar = async () => {
    try {
      setIsLoading(true);
      
      const fechaHoy = getFechaLocalISO();
      const sesionActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, fechaHoy);

      if (sesionActiva) {
        const aperturaNormalizada: AperturaCaja = {
          id: sesionActiva.id,
          fecha: sesionActiva.aperturaISO,
          cajero: sesionActiva.usuarioNombre,
          baseInicial: sesionActiva.baseInicial,
          billetes: {
            b100000: 0, b50000: 0, b20000: 0, b10000: 0, b5000: 0, b2000: 0, b1000: 0, m500: 0, m200: 0, m100: 0, m50: 0,
          },
        };
        setAperturaActual(aperturaNormalizada);
        setTurnoActivo(true);
        await cargarDatosSistema(sesionActiva.id);
      } else {
        setAperturaActual(null);
        setTurnoActivo(false);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error inicializando:', error);
      setIsLoading(false);
    }
  };

  // Recalcula gastos y devoluciones del día directamente desde su fuente
  // (localStorage / electronStore), sin depender de estado de React cacheado.
  // Se usa tanto para refrescar la UI (cargarDatosSistema) como para obtener
  // los valores 100% actuales justo antes de cerrar caja (handleCerrarCaja) —
  // antes, handleCerrarCaja reutilizaba el estado ya cargado en el último
  // render, que podía quedar desactualizado si se registraba un gasto con la
  // página de Cierre de Caja ya abierta, causando diferencias sin explicación.
  const calcularGastosYDevolucionesDelDia = async (sesionCajaId?: string) => {
    const devoluciones = await electronStore.obtenerDevolucionesDelDia({
      incluirTodosLosCajeros: !!esSuperUsuario,
      cajeroId: esSuperUsuario ? undefined : usuarioActual?.id,
      cajeroNombre: esSuperUsuario ? undefined : (usuarioActual?.nombreCompleto || usuarioActual?.username),
      sesionCajaId,
    });

    const salidasDevolucionEfectivo = (Array.isArray(devoluciones) ? devoluciones : [])
      .filter((d: any) => String(d?.metodoPago || '') === 'efectivo')
      .reduce((sum: number, d: any) => sum + (Number(d?.totalDevolucion) || 0), 0);

    const gastos = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
    const hoy = getFechaLocalISO();
    const gastosDia = (Array.isArray(gastos) ? gastos : []).filter((g: any) => {
      // Los gastos de Caja Mayor/Banco son dinero externo al cajero: no deben
      // alterar el arqueo físico de su turno, por lo que se excluyen aquí.
      if (String(g?.origenFondos || 'caja_menor') === 'caja_mayor') return false;
      const fechaRaw = g?.fecha ? new Date(g.fecha) : new Date();
      const fecha = getFechaLocalISO(fechaRaw);
      const usuario = g?.registradoPorId || g?.usuarioId;
      const sesionGasto = String(g?.sesionCajaId || '');
      const coincideUsuario = esSuperUsuario ? true : usuarioActual?.id ? usuario === usuarioActual.id : true;
      // Si el gasto no trae sesionCajaId (registros legacy), se permite por fecha+usuario.
      const coincideSesion = sesionCajaId ? (sesionGasto ? sesionGasto === sesionCajaId : true) : true;
      return fecha === hoy && coincideUsuario && coincideSesion;
    });

    const gastosEfectivo = gastosDia
      .filter((g: any) => normalizarCanalGasto(String(g?.medioPagoEgreso || g?.medio_pago || g?.metodoPago || 'efectivo')) === 'efectivo')
      .reduce((sum: number, g: any) => sum + (Number(g?.monto) || 0), 0);

    const gastosTransferencia = gastosDia
      .filter((g: any) => normalizarCanalGasto(String(g?.medioPagoEgreso || g?.medio_pago || g?.metodoPago || 'transferencia')) === 'transferencia')
      .reduce((sum: number, g: any) => sum + (Number(g?.monto) || 0), 0);

    const gastosTarjetaBanco = gastosDia
      .filter((g: any) => normalizarCanalGasto(String(g?.medioPagoEgreso || g?.medio_pago || g?.metodoPago || 'tarjeta_banco')) === 'tarjeta_banco')
      .reduce((sum: number, g: any) => sum + (Number(g?.monto) || 0), 0);

    const gastosDetalle: GastoDetalleCierre[] = gastosDia
      .map((g: any) => ({
        descripcion: String(g?.descripcion || g?.concepto || g?.categoriaConcepto || 'Gasto operativo'),
        concepto: String(g?.concepto || g?.categoriaConcepto || g?.descripcion || 'Gasto operativo'),
        monto: Number(g?.monto) || 0,
        medioPago: String(g?.medio_pago || g?.medioPagoEgreso || g?.metodoPago || '').toUpperCase(),
      }))
      .filter((g) => g.monto > 0)
      .sort((a, b) => b.monto - a.monto);

    return { gastosEfectivo, gastosTransferencia, gastosTarjetaBanco, gastosDetalle, salidasDevolucionEfectivo };
  };

  // Abonos de Cartera (venta a crédito) recibidos hoy — mismo mecanismo que
  // calcularGastosYDevolucionesDelDia (localStorage + sesionCajaId), pero
  // SUMANDO en vez de restando: es dinero real que entró a caja hoy, así
  // haya sido por una venta a crédito registrada otro día. Ver carteraService.ts.
  const calcularAbonosCarteraDelDia = async (sesionCajaId?: string) => {
    const abonos = JSON.parse(localStorage.getItem('pos-abonos-cartera') || '[]');
    const hoy = getFechaLocalISO();
    const abonosDia = (Array.isArray(abonos) ? abonos : []).filter((a: any) => {
      const fechaRaw = a?.fecha ? new Date(a.fecha) : new Date();
      const fecha = getFechaLocalISO(fechaRaw);
      const sesionAbono = String(a?.sesionCajaId || '');
      const coincideSesion = sesionCajaId ? (sesionAbono ? sesionAbono === sesionCajaId : true) : true;
      return fecha === hoy && coincideSesion;
    });

    const abonosCarteraEfectivo = abonosDia
      .filter((a: any) => normalizarCanalGasto(String(a?.metodoPago || 'efectivo')) === 'efectivo')
      .reduce((sum: number, a: any) => sum + (Number(a?.monto) || 0), 0);

    const abonosCarteraTransferencia = abonosDia
      .filter((a: any) => normalizarCanalGasto(String(a?.metodoPago || 'transferencia')) === 'transferencia')
      .reduce((sum: number, a: any) => sum + (Number(a?.monto) || 0), 0);

    const abonosCarteraTarjetaBanco = abonosDia
      .filter((a: any) => normalizarCanalGasto(String(a?.metodoPago || 'tarjeta_banco')) === 'tarjeta_banco')
      .reduce((sum: number, a: any) => sum + (Number(a?.monto) || 0), 0);

    const abonosCarteraDetalle: GastoDetalleCierre[] = abonosDia
      .map((a: any) => ({
        descripcion: `Abono de ${String(a?.clienteNombre || 'cliente')} (Cartera)`,
        concepto: 'Abono de Cartera',
        monto: Number(a?.monto) || 0,
        medioPago: String(a?.metodoPago || '').toUpperCase(),
      }))
      .filter((a) => a.monto > 0)
      .sort((a, b) => b.monto - a.monto);

    return { abonosCarteraEfectivo, abonosCarteraTransferencia, abonosCarteraTarjetaBanco, abonosCarteraDetalle };
  };

  const cargarDatosSistema = async (sesionIdDirecto?: string) => {
    try {
      const sesionCajaId = sesionIdDirecto ?? aperturaActual?.id;
      const stats = await electronStore.calcularEstadisticasDelDia({
        incluirTodosLosCajeros: !!esSuperUsuario,
        cajeroId: esSuperUsuario ? undefined : usuarioActual?.id,
        cajeroNombre: esSuperUsuario ? undefined : (usuarioActual?.nombreCompleto || usuarioActual?.username),
        sesionCajaId,
      });

      const { gastosEfectivo, gastosTransferencia, gastosTarjetaBanco, salidasDevolucionEfectivo } =
        await calcularGastosYDevolucionesDelDia(sesionCajaId);
      const { abonosCarteraEfectivo, abonosCarteraTransferencia, abonosCarteraTarjetaBanco } =
        await calcularAbonosCarteraDelDia(sesionCajaId);

      setTotalSistema(stats.totalIngresos);
      setDesgloseSistema({
        efectivo: stats.ventasPorMetodo.efectivo,
        tarjeta: stats.ventasPorMetodo.tarjeta,
        nequi: stats.ventasPorMetodo.nequi,
        daviplata: stats.ventasPorMetodo.daviplata,
        transferencia: stats.ventasPorMetodo.transferencia,
        bancolombia: stats.ventasPorMetodo.bancolombia,
        rappi: stats.ventasPorMetodo.rappi,
      });
      setGastosEfectivoDia(gastosEfectivo);
      setGastosTransferenciaDia(gastosTransferencia);
      setGastosTarjetaBancoDia(gastosTarjetaBanco);
      setSalidasDevolucionEfectivoDia(salidasDevolucionEfectivo);
      setAbonosCarteraEfectivoDia(abonosCarteraEfectivo);
      setAbonosCarteraTransferenciaDia(abonosCarteraTransferencia);
      setAbonosCarteraTarjetaBancoDia(abonosCarteraTarjetaBanco);
    } catch (error) {
      console.error('Error cargando datos del sistema:', error);
      toast.error('Error al cargar datos del sistema');
    }
  };

  const handleBilleteChange = (key: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setBilletes(prev => ({ ...prev, [key]: numValue }));
  };

  const handleAperturaCaja = () => {
    if (totalContado === 0) {
      toast.error('Debes contar la base inicial', {
        description: 'Ingresa los billetes y monedas con los que inicias'
      });
      return;
    }

    const apertura: AperturaCaja = {
      id: `APER-${Date.now()}`,
      fecha: new Date().toISOString(),
      cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Desconocido',
      baseInicial: totalContado,
      billetes: { ...billetes },
    };

    const sesion = cajaDiariaService.abrirSesion({
      usuarioId: usuarioActual?.id || 'unknown',
      usuarioNombre: apertura.cajero,
      baseInicial: totalContado,
    });
    const aperturaConSesion: AperturaCaja = { ...apertura, id: sesion.id, fecha: sesion.aperturaISO };

    employeeActivityLogService.registerApertura({
      sesionCajaId: sesion.id,
      usuarioId: usuarioActual?.id || 'unknown',
      usuarioNombre: apertura.cajero,
      aperturaISO: sesion.aperturaISO,
      baseInicial: apertura.baseInicial,
    });

    // Guardado legacy para compatibilidad
    localStorage.setItem(`pos-apertura-actual-${usuarioActual?.id || 'unknown'}`, JSON.stringify(aperturaConSesion));
    setAperturaActual(aperturaConSesion);
    setTurnoActivo(true);

    // Guardar en historial (no crítico — si falla el sistema igual queda abierto)
    try {
      const historial = JSON.parse(localStorage.getItem('pos-aperturas-historial') || '[]');
      historial.push(apertura);
      localStorage.setItem('pos-aperturas-historial', JSON.stringify(historial));
    } catch { /* historial no bloquea la apertura */ }

    // 📡 Notificar apertura a terminales LAN
    emitLanEvent('CAJA_APERTURA', {
      baseInicial: totalContado,
      cajero: apertura.cajero,
      sesionId: sesion.id,
    });

    toast.success('¡Caja abierta exitosamente!', {
      description: `Base inicial: ${formatCurrency(totalContado)}`,
      icon: '✅'
    });

    // Resetear billetes para el cierre
    setBilletes({
      b100000: 0,
      b50000: 0,
      b20000: 0,
      b10000: 0,
      b5000: 0,
      b2000: 0,
      b1000: 0,
      m500: 0,
      m200: 0,
      m100: 0,
      m50: 0,
    });

    // Cargar datos del sistema pasando el ID directamente para evitar estado obsoleto
    cargarDatosSistema(sesion.id);
  };

  const calcularEfectivoEsperado = (baseInicial: number, ventasEfectivoNetas: number, gastosEfectivo: number, devolucionesEfectivo: number) => {
    const ventasEfectivoBrutas = ventasEfectivoNetas + devolucionesEfectivo;
    return baseInicial + ventasEfectivoBrutas - gastosEfectivo - devolucionesEfectivo;
  };

  const calcularDiferencia = () => {
    if (!aperturaActual) return 0;

    const totalEsperado = calcularEfectivoEsperado(
      aperturaActual.baseInicial,
      desgloseSistema.efectivo,
      gastosEfectivoDia,
      salidasDevolucionEfectivoDia
    ) + abonosCarteraEfectivoDia;

    // Diferencia = Total Físico Contado - Total Esperado
    return totalContado - totalEsperado;
  };

  const getEstadoCierre = (): 'cuadrado' | 'faltante' | 'sobrante' => {
    const diferencia = calcularDiferencia();
    if (Math.abs(diferencia) <= 500) return 'cuadrado'; // Tolerancia de $500
    return diferencia < 0 ? 'faltante' : 'sobrante';
  };

  const formatCurrency = (value: number): string => {
    return `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
  };

  // Abre el modal de cierre mostrando la vista previa del reporte
  const handleCerrarCaja = async () => {
    if (!aperturaActual) return;

    if (totalContado === 0) {
      toast.error('Debes contar el efectivo en caja', {
        description: 'Ingresa los billetes y monedas actuales'
      });
      return;
    }

    try {
      setIsSaving(true);

      const fechaActual = new Date();

      // Recalcular ventas en tiempo real
      const stats = await electronStore.calcularEstadisticasDelDia({
        incluirTodosLosCajeros: !!esSuperUsuario,
        cajeroId: esSuperUsuario ? undefined : usuarioActual?.id,
        cajeroNombre: esSuperUsuario ? undefined : (usuarioActual?.nombreCompleto || usuarioActual?.username),
        sesionCajaId: aperturaActual.id,
      });

      const desgloseActual = {
        efectivo: Number(stats.ventasPorMetodo?.efectivo) || 0,
        tarjeta: Number(stats.ventasPorMetodo?.tarjeta) || 0,
        nequi: Number(stats.ventasPorMetodo?.nequi) || 0,
        daviplata: Number(stats.ventasPorMetodo?.daviplata) || 0,
        transferencia: Number(stats.ventasPorMetodo?.transferencia) || 0,
        bancolombia: Number(stats.ventasPorMetodo?.bancolombia) || 0,
        rappi: Number(stats.ventasPorMetodo?.rappi) || 0,
      };
      const totalSistemaActual = Number(stats.totalIngresos) || 0;

      // 🆕 Recalcular gastos y devoluciones frescos justo antes de cerrar —
      // ya no se reutiliza el estado cargado al abrir la página, que podía
      // quedar desactualizado si se registró un gasto mientras esta pantalla
      // ya estaba abierta.
      const {
        gastosEfectivo: gastosEfectivoActual,
        gastosTransferencia: gastosTransferenciaActual,
        gastosTarjetaBanco: gastosTarjetaBancoActual,
        gastosDetalle: gastosDetalleActual,
        salidasDevolucionEfectivo: salidasDevolucionEfectivoActual,
      } = await calcularGastosYDevolucionesDelDia(aperturaActual.id);
      const {
        abonosCarteraEfectivo: abonosCarteraEfectivoActual,
        abonosCarteraTransferencia: abonosCarteraTransferenciaActual,
        abonosCarteraTarjetaBanco: abonosCarteraTarjetaBancoActual,
        abonosCarteraDetalle: abonosCarteraDetalleActual,
      } = await calcularAbonosCarteraDelDia(aperturaActual.id);

      const totalEsperadoEfectivo = calcularEfectivoEsperado(
        aperturaActual.baseInicial,
        desgloseActual.efectivo,
        gastosEfectivoActual,
        salidasDevolucionEfectivoActual
      ) + abonosCarteraEfectivoActual;
      const transferenciaEsperada = Math.max(
        0,
        (desgloseActual.transferencia + desgloseActual.nequi + desgloseActual.daviplata + desgloseActual.bancolombia + desgloseActual.rappi) - gastosTransferenciaActual
      ) + abonosCarteraTransferenciaActual;
      const tarjetaBancoEsperado = Math.max(0, desgloseActual.tarjeta - gastosTarjetaBancoActual) + abonosCarteraTarjetaBancoActual;
      const totalEsperadoAnalitico = totalEsperadoEfectivo + transferenciaEsperada + tarjetaBancoEsperado;
      const diferenciaActual = totalContado - totalEsperadoEfectivo;
      const estadoActual: 'cuadrado' | 'faltante' | 'sobrante' =
        Math.abs(diferenciaActual) <= 500 ? 'cuadrado' : diferenciaActual < 0 ? 'faltante' : 'sobrante';

      // Calcular top productos a partir de las ventas del día
      const productosTop = await calcularProductosTop(stats);
      const cantidadTransacciones = stats.totalTransacciones || stats.totalVentas || 0;
      const ticketPromedio = stats.ticketPromedio || 0;

      const cierre: CierreCaja = {
        id: `CIERRE-${Date.now()}`,
        fecha: fechaActual.toISOString(),
        cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Desconocido',
        aperturaId: aperturaActual.id,
        fechaApertura: aperturaActual.fecha,
        baseInicial: aperturaActual.baseInicial,
        totalSistema: totalSistemaActual,
        totalFisico: totalContado,
        totalFinal: totalEsperadoEfectivo,
        diferencia: diferenciaActual,
        desglose: desgloseActual,
        billetes: { ...billetes },
        observaciones,
        estado: estadoActual,
        gastosEfectivo: gastosEfectivoActual,
        gastosDetalle: gastosDetalleActual,
        gastosTransferencia: gastosTransferenciaActual,
        gastosTarjetaBanco: gastosTarjetaBancoActual,
        devoluciones: salidasDevolucionEfectivoActual,
        abonosCarteraEfectivo: abonosCarteraEfectivoActual,
        abonosCarteraTransferencia: abonosCarteraTransferenciaActual,
        abonosCarteraTarjetaBanco: abonosCarteraTarjetaBancoActual,
        abonosCarteraDetalle: abonosCarteraDetalleActual,
        cantidadTransacciones,
        ticketPromedio,
        productosTop,
        transferenciaEsperada,
        tarjetaBancoEsperado,
        totalEsperadoAnalitico,
      };

      // Guardar cierre pendiente para uso después de que el usuario confirme
      pendingCierreRef.current = { cierre, stats };

      // Armar datos para el modal
      const modalData: CierreDataModal = {
        cajero: cierre.cajero,
        fechaApertura: aperturaActual.fecha,
        fechaCierre: cierre.fecha,
        baseInicial: cierre.baseInicial,
        desglose: cierre.desglose,
        totalSistema: totalSistemaActual,
        gastosEfectivo: gastosEfectivoActual,
        gastosDetalle: gastosDetalleActual,
        gastosTransferencia: gastosTransferenciaActual,
        gastosTarjetaBanco: gastosTarjetaBancoActual,
        devoluciones: salidasDevolucionEfectivoActual,
        abonosCarteraEfectivo: abonosCarteraEfectivoActual,
        abonosCarteraTransferencia: abonosCarteraTransferenciaActual,
        abonosCarteraTarjetaBanco: abonosCarteraTarjetaBancoActual,
        abonosCarteraDetalle: abonosCarteraDetalleActual,
        efectivoEsperado: totalEsperadoEfectivo,
        transferenciaEsperada,
        tarjetaBancoEsperado,
        totalEsperadoAnalitico,
        totalFisicoContado: totalContado,
        diferencia: diferenciaActual,
        estado: estadoActual,
        observaciones,
        cantidadTransacciones: stats.totalTransacciones || stats.totalVentas || 0,
        ticketPromedio: stats.ticketPromedio || 0,
        productosTop,
        billetes: { ...billetes },
      };

      setCierreDataModal(modalData);
      setIsSaving(false);
      setShowModalCierre(true);
    } catch (error) {
      console.error('Error preparando cierre:', error);
      toast.error('Error al calcular el cierre de caja');
      setIsSaving(false);
    }
  };

  // Calcula el top de productos vendidos en el día
  const calcularProductosTop = async (stats: any) => {
    try {
      const ventas = await electronStore.obtenerVentasDelDia({
        incluirTodosLosCajeros: !!esSuperUsuario,
        cajeroId: esSuperUsuario ? undefined : usuarioActual?.id,
        cajeroNombre: esSuperUsuario ? undefined : (usuarioActual?.nombreCompleto || usuarioActual?.username),
        sesionCajaId: aperturaActual?.id,
      });

      const mapa = new Map<string, { cantidad: number; total: number }>();
      for (const venta of (Array.isArray(ventas) ? ventas : [])) {
        for (const item of (venta.items || [])) {
          const nombre = String(item.nombre || 'Producto sin nombre');
          const prev = mapa.get(nombre) || { cantidad: 0, total: 0 };
          mapa.set(nombre, {
            cantidad: prev.cantidad + (Number(item.cantidad) || 1),
            total: prev.total + (Number((item as any).subtotal ?? (item as any).total ?? 0)),
          });
        }
      }

      return Array.from(mapa.entries())
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 8);
    } catch {
      return [];
    }
  };

  const confirmarCierre = async (_tipo: 'imprimir' | 'descargar' | 'guardar') => {
    const pending = pendingCierreRef.current;
    if (!pending || !aperturaActual) {
      setShowModalCierre(false);
      setCierreDataModal(null);
      return;
    }

    const { cierre, stats } = pending;
    const fechaDia = getFechaLocalISO(new Date(cierre.fecha));
    const aperturaId = aperturaActual.id;
    const usuarioId = usuarioActual?.id || 'unknown';

    // ── PASO 1: Cerrar sesión e imprimir ticket térmico si aplica ──
    // (sincrónico — no bloquea más de lo necesario)
    try { cajaDiariaService.cerrarSesion(aperturaId); } catch {}
    try { cajaDiariaService.cerrarSesionesDelUsuarioHoy(usuarioId); } catch {}
    try { localStorage.removeItem(`pos-apertura-actual-${usuarioId}`); } catch {}
    try { localStorage.setItem('pos_ultimo_cierre_ts', String(Date.now())); } catch {}

    // Guardar en localStorage como respaldo inmediato (siempre)
    try {
      const cierres = JSON.parse(localStorage.getItem('pos-cierres-caja') || '[]');
      cierres.push(cierre);
      localStorage.setItem('pos-cierres-caja', JSON.stringify(cierres));
    } catch {}

    // NOTA: la impresión térmica del cierre ya la dispara ModalCierreCaja
    // (triggerPrint) usando la MISMA tirilla que se ve en la vista previa.
    // Antes, este paso imprimía además un segundo ticket simplificado con un
    // formato distinto — el usuario recibía dos tiquetes diferentes por cada
    // cierre. Se eliminó para que solo se imprima el que ya vio en pantalla.

    // ── PASO 3: Resetear TODA la UI inmediatamente ──
    setAperturaActual(null);
    setTurnoActivo(false);              // ← dispara useEffect → activeTab = 'apertura'
    setTotalSistema(0);
    setDesgloseSistema({ efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, bancolombia: 0, rappi: 0 });
    setBilletes({ b100000: 0, b50000: 0, b20000: 0, b10000: 0, b5000: 0, b2000: 0, b1000: 0, m500: 0, m200: 0, m100: 0, m50: 0 });
    setObservaciones('');
    setGastosEfectivoDia(0);
    setGastosTransferenciaDia(0);
    setGastosTarjetaBancoDia(0);
    setSalidasDevolucionEfectivoDia(0);
    setVentasPendientes(0);
    setIsSaving(false);
    pendingCierreRef.current = null;
    setShowModalCierre(false);
    setCierreDataModal(null);

    // ── PASO 4: Toast de éxito inmediato ──
    toast.success('¡Caja cerrada exitosamente!', {
      description: `${cierre.cajero} · Total vendido: ${formatCurrency(cierre.totalSistema)}`,
      icon: '✅',
    });

    // ── PASO 5: Persistencia en background (no bloquea la UI) ──
    const persistirEnBackground = async () => {
      const wt = <T,>(p: Promise<T>, ms = 2000): Promise<T | null> =>
        Promise.race([p.then(r => r).catch(() => null as any), new Promise<null>(r => setTimeout(() => r(null), ms))]);

      // Guardar histórico (en paralelo, máximo 2s por operación)
      const results = await Promise.allSettled([
        wt(historicoService.guardarCierre({
          id: cierre.id, fecha: fechaDia, cajero: cierre.cajero, cajeroId: usuarioId,
          baseInicial: cierre.baseInicial, totalSistema: cierre.totalSistema,
          totalFisico: cierre.totalFisico, diferencia: cierre.diferencia,
          estado: cierre.estado, desglose: cierre.desglose,
          cantidadVentas: stats.totalTransacciones || 0, observaciones: cierre.observaciones,
        })),
        wt(historicoService.guardarEstadisticasDiarias({
          fecha: fechaDia, totalIngresos: cierre.totalSistema,
          totalVentas: stats.totalTransacciones || 0, ticketPromedio: stats.ticketPromedio || 0,
          ventasPorHora: [], productosMasVendidos: stats.productosPopulares?.slice(0, 10) || [],
          metodosPago: {
            efectivo: stats.ventasPorMetodo?.efectivo || 0,
            tarjeta: stats.ventasPorMetodo?.tarjeta || 0,
            nequi: stats.ventasPorMetodo?.nequi || 0,
            daviplata: stats.ventasPorMetodo?.daviplata || 0,
            transferencia: stats.ventasPorMetodo?.transferencia || 0,
            bancolombia: stats.ventasPorMetodo?.bancolombia || 0,
            rappi: stats.ventasPorMetodo?.rappi || 0,
          },
        })),
        wt(historicoService.guardarContabilidadDiaria({
          id: `CONT-${fechaDia}-${Date.now()}`, fecha: fechaDia,
          cajero: cierre.cajero, cajeroId: usuarioId,
          saldoInicialCaja: cierre.baseInicial, ventasDelDia: cierre.totalSistema,
          saldoFinalCaja: cierre.baseInicial + cierre.totalSistema,
          totalTransacciones: stats.totalTransacciones || 0,
        })),
      ]);

      // Si alguno falló, guardar respaldo adicional
      const algoFallo = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null));
      if (algoFallo) {
        try {
          const pendientes = JSON.parse(localStorage.getItem('pos-cierres-pendientes') || '[]');
          pendientes.push({ cierre, stats, fechaDia, guardadoEn: new Date().toISOString() });
          localStorage.setItem('pos-cierres-pendientes', JSON.stringify(pendientes));
        } catch {}
      }

      // Arqueo electrónico (opcional)
      try { await wt(electronStore.guardarArqueoCaja(cierre as any)); } catch {}

      try {
        employeeActivityLogService.registerCierre({
          sesionCajaId: aperturaId,
          cierreISO: cierre.fecha,
          totalVentas: cierre.totalSistema,
          totalTransacciones: stats.totalTransacciones || 0,
          resumenOperaciones: {
            efectivo: cierre.desglose.efectivo,
            tarjeta: cierre.desglose.tarjeta,
            nequi: cierre.desglose.nequi,
            daviplata: cierre.desglose.daviplata,
            transferencia: cierre.desglose.transferencia,
            rappi: cierre.desglose.rappi,
          },
        });
      } catch {}

      // Reporte de auditoría
      try {
        const ahora = new Date();
        const expiracion = new Date(ahora);
        expiracion.setDate(expiracion.getDate() + 180);
        reportesService.guardarReporte({
          id: `cierre-${cierre.id || Date.now()}`,
          tipo: 'cierres',
          nombre: `Cierre de caja — ${cierre.cajero} — ${format(ahora, 'dd/MM/yyyy HH:mm', { locale: es })}`,
          fechaGeneracion: ahora.toISOString(),
          fechaExpiracion: expiracion.toISOString(),
          periodo: { inicio: aperturaActual?.fecha || ahora.toISOString(), fin: ahora.toISOString() },
          datos: cierre,
          metadata: { totalRegistros: stats.totalTransacciones || 0, generadoPor: cierre.cajero || 'Cajero', cajeroId: usuarioId, cajeroNombre: cierre.cajero },
        });
      } catch {}

      // Integraciones LAN
      onCierreCaja({ totalVentas: cierre.totalSistema || 0, totalTransacciones: stats.totalTransacciones || 0, cajero: cierre.cajero || 'Cajero' }).catch(() => {});
      // 📡 Se envía el cierre COMPLETO (no solo el total) para que el terminal
      // que lo reciba (Admin u otro cajero) pueda mostrar el mismo reporte
      // detallado — desglose por método de pago, gastos, diferencia, etc. —
      // sin tener que ir físicamente a esa terminal a consultarlo.
      emitLanEvent('CAJA_CIERRE', {
        totalVentas: cierre.totalSistema || 0,
        cajero: cierre.cajero || 'Cajero',
        diferencia: cierre.diferencia,
        fecha: cierre.fecha,
        cierre,
        cantidadTransacciones: stats.totalTransacciones || 0,
      });
    };

    persistirEnBackground().catch(() => {});
  };

  const exportarHistoricoJSON = async () => {
    if (!esDesarrollador) {
      toast.error('Acceso denegado', { description: 'Solo Admin puede exportar histórico contable.' });
      return;
    }

    try {
      const payload = await historicoService.exportarDatos();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `codecpos_historico_${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Histórico exportado correctamente', {
        description: `Ventas: ${payload.ventas.length} · Cierres: ${payload.cierres.length} · Estadísticas: ${payload.estadisticas.length} · Contabilidad: ${payload.contabilidad.length}`,
      });
    } catch (error) {
      console.error('❌ Error exportando histórico:', error);
      toast.error('No se pudo exportar el histórico');
    }
  };

  const descargarContabilidad6Meses = async () => {
    try {
      const payload = await historicoService.exportarDatos();
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - 180);
      const limiteISO = fechaLimite.toISOString().split('T')[0];

      const solo6Meses = {
        ...payload,
        ventas: payload.ventas.filter(v => v.fecha >= fechaLimite.toISOString()),
        cierres: payload.cierres.filter(c => c.fecha >= limiteISO),
        estadisticas: payload.estadisticas.filter(s => s.fecha >= limiteISO),
        contabilidad: payload.contabilidad.filter(c => c.fecha >= limiteISO),
        metadata: {
          ...payload.metadata,
          rango: `Últimos 6 meses desde ${limiteISO}`,
          exportedAt: new Date().toISOString(),
        },
      };

      const blob = new Blob([JSON.stringify(solo6Meses, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `codecpos_contabilidad_6_meses_${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Contabilidad descargada', {
        description: 'Se descargó el respaldo de los últimos 6 meses para conservar tu información.',
      });
    } catch (error) {
      console.error('❌ Error descargando contabilidad de 6 meses:', error);
      toast.error('No se pudo descargar la contabilidad');
    }
  };

  const importarHistoricoJSON = async (file: File) => {
    if (!esDesarrollador) {
      toast.error('Acceso denegado', { description: 'Solo Admin puede importar histórico contable.' });
      return;
    }

    try {
      const content = await file.text();
      const data = JSON.parse(content);
      const res = await historicoService.importarDatos(data);

      if (!res.ok) {
        toast.error('La importación no pudo completarse');
        return;
      }

      toast.success('Histórico importado correctamente', {
        description: `Ventas: ${res.ventas} · Cierres: ${res.cierres} · Estadísticas: ${res.estadisticas} · Contabilidad: ${res.contabilidad}`,
      });
    } catch (error) {
      console.error('❌ Error importando histórico:', error);
      toast.error('Archivo inválido o formato no compatible');
    } finally {
      if (inputImportRef.current) {
        inputImportRef.current.value = '';
      }
    }
  };

  const respaldarYLimpiarHistorico = async () => {
    if (!esDesarrollador) {
      toast.error('Acceso denegado', { description: 'Solo Admin puede purgar históricos contables.' });
      return;
    }

    const confirmado = window.confirm(
      'Se exportará un respaldo JSON y luego se eliminará TODO el histórico local. ¿Deseas continuar?'
    );

    if (!confirmado) return;

    try {
      await exportarHistoricoJSON();
      const result = await historicoService.limpiarTodoHistorico();

      if (!result.ok) {
        toast.error('No se pudo limpiar el histórico después del respaldo');
        return;
      }

      toast.success('Histórico limpiado después del respaldo', {
        description: `Eliminados → Ventas: ${result.borrados.ventas}, Cierres: ${result.borrados.cierres}, Estadísticas: ${result.borrados.estadisticas}, Contabilidad: ${result.borrados.contabilidad}`,
      });
    } catch (error) {
      console.error('❌ Error en respaldo + limpieza:', error);
      toast.error('No se pudo completar respaldo y limpieza');
    }
  };

  const diferencia = calcularDiferencia();
  const estadoCierre = getEstadoCierre();
  // Si es cajero y no tiene el permiso verFaltanteCaja, oculta la diferencia en pantalla
  // (el cálculo sigue corriendo internamente y se guarda para el reporte impreso)
  const puedeVerFaltante =
    usuarioActual?.rol === 'super_usuario' || usuarioActual?.permisos?.verFaltanteCaja !== false;
  const transferenciaEsperada = Math.max(
    0,
    (desgloseSistema.transferencia + desgloseSistema.nequi + desgloseSistema.daviplata + desgloseSistema.bancolombia + desgloseSistema.rappi) - gastosTransferenciaDia
  ) + abonosCarteraTransferenciaDia;
  const tarjetaBancoEsperado = Math.max(0, desgloseSistema.tarjeta - gastosTarjetaBancoDia) + abonosCarteraTarjetaBancoDia;
  const totalEsperado = aperturaActual
    ? calcularEfectivoEsperado(
        aperturaActual.baseInicial,
        desgloseSistema.efectivo,
        gastosEfectivoDia,
        salidasDevolucionEfectivoDia
      ) + abonosCarteraEfectivoDia
    : 0;
  const totalEsperadoAnalitico = totalEsperado + transferenciaEsperada + tarjetaBancoEsperado;

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode 
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
          : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
      }`}>
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen h-screen overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 scrollbar-track-slate-800' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-100 scrollbar-track-gray-200'
    }`}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-4xl font-bold mb-2 ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>Gestión de Caja</h1>
            <p className={`flex items-center gap-2 ${
              darkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <Calendar className="w-4 h-4" />
              {format(new Date(), "dd 'de' MMMM, yyyy - HH:mm", { locale: es })}
            </p>
            <p className={`flex items-center gap-2 mt-1 ${
              darkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <User className="w-4 h-4" />
              Cajero: {usuarioActual?.nombreCompleto || usuarioActual?.username}
            </p>
          </div>
          <div>
            {turnoActivo ? (
              <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white text-lg px-4 py-2">
                <CheckCircle className="w-5 h-5 mr-2" />
                Turno Activo
              </Badge>
            ) : (
              <Button
                onClick={() => setModalInicioTurno(true)}
                className="bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white text-lg px-6 py-3 h-auto font-bold shadow-lg"
              >
                <StopCircle className="w-5 h-5 mr-2" />
                Sin Turno - Click para iniciar
              </Button>
            )}
          </div>
        </div>

        <div className={`mb-4 p-4 rounded-2xl border-2 ${
          darkMode
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className={`font-bold ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                ⚠️ Aviso importante de contabilidad
              </p>
              <p className={`text-sm ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>
                El sistema conserva información por 6 meses. Descarga periódicamente tu contabilidad para evitar pérdida de datos.
              </p>
            </div>
            <Button
              type="button"
              onClick={descargarContabilidad6Meses}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar contabilidad (6 meses)
            </Button>
          </div>
        </div>

        {/* Herramientas de histórico (backup / reintegración) */}
        {esDesarrollador && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputImportRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importarHistoricoJSON(file);
            }}
          />

          <Button
            type="button"
            onClick={exportarHistoricoJSON}
            variant="outline"
            className="border-emerald-500 text-emerald-500 hover:bg-emerald-500/10"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar histórico JSON
          </Button>

          <Button
            type="button"
            onClick={() => inputImportRef.current?.click()}
            variant="outline"
            className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar histórico JSON
          </Button>

          <Button
            type="button"
            onClick={respaldarYLimpiarHistorico}
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Respaldar y limpiar histórico
          </Button>
        </div>
        )}
      </div>

      {/* Modal de Inicio de Turno */}
      <ModalInicioTurno
        open={modalInicioTurno}
        onOpenChange={setModalInicioTurno}
      />

      {/* Modal de Vista Previa y Confirmación de Cierre de Caja */}
      <ModalCierreCaja
        open={showModalCierre}
        onClose={() => { setShowModalCierre(false); setCierreDataModal(null); pendingCierreRef.current = null; }}
        onConfirmar={confirmarCierre}
        data={cierreDataModal}
        darkMode={darkMode}
      />

      {/* Modal de Auditoría Ultra-Detallada */}
      <ModalCierreDetallado
        open={showModalDetallado}
        onClose={() => setShowModalDetallado(false)}
        darkMode={darkMode}
        cajeroId={usuarioActual?.id}
        cajeroNombre={usuarioActual?.nombreCompleto || usuarioActual?.username}
        esSuperUsuario={esSuperUsuario}
        sesionCajaId={aperturaActual?.id}
        fechaApertura={aperturaActual?.fecha}
      />

      {/* Modal de Historial de Cierres */}
      <ModalHistorialCierres
        open={showHistorialCierres}
        onClose={() => setShowHistorialCierres(false)}
        darkMode={darkMode}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className={`grid w-full max-w-md grid-cols-2 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <TabsTrigger value="apertura" disabled={turnoActivo}>
            <PlayCircle className="w-4 h-4 mr-2" />
            Apertura de Caja
          </TabsTrigger>
          <TabsTrigger value="cierre" disabled={!turnoActivo}>
            <StopCircle className="w-4 h-4 mr-2" />
            Cierre de Caja
          </TabsTrigger>
        </TabsList>

        {/* TAB: APERTURA DE CAJA */}
        <TabsContent value="apertura">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel Izquierdo - Info */}
            <Card className={`${
              darkMode 
                ? 'bg-slate-800/50 border-slate-700' 
                : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-lg'
            }`}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${
                  darkMode ? 'text-white' : 'text-blue-900'
                }`}>
                  <LogIn className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  Instrucciones de Apertura
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`p-4 rounded-xl border ${
                  darkMode 
                    ? 'bg-blue-500/10 border-blue-500/30' 
                    : 'bg-blue-100 border-blue-300'
                }`}>
                  <h3 className={`font-bold mb-3 flex items-center gap-2 ${
                    darkMode ? 'text-blue-300' : 'text-blue-700'
                  }`}>
                    <CheckCircle className="w-5 h-5" />
                    ¿Cómo abrir la caja?
                  </h3>
                  <ol className={`space-y-2 text-sm list-decimal list-inside ${
                    darkMode ? 'text-slate-300' : 'text-blue-800'
                  }`}>
                    <li>Cuenta todos los billetes y monedas que recibes</li>
                    <li>Ingresa las cantidades en los campos de la derecha</li>
                    <li>Verifica que el total sea correcto</li>
                    <li>Haz clic en "Abrir Caja" para iniciar tu turno</li>
                  </ol>
                </div>

                <div className={`p-4 rounded-xl border ${
                  darkMode 
                    ? 'bg-amber-500/10 border-amber-500/30' 
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <h3 className={`font-bold mb-2 flex items-center gap-2 ${
                    darkMode ? 'text-amber-300' : 'text-amber-700'
                  }`}>
                    <AlertTriangle className="w-5 h-5" />
                    Importante
                  </h3>
                  <p className={`text-sm ${
                    darkMode ? 'text-slate-300' : 'text-amber-800'
                  }`}>
                    Esta base inicial se usará para calcular el cierre de caja.
                    Asegúrate de contar correctamente todos los billetes y monedas.
                  </p>
                </div>

                {aperturaActual && (
                  <div className={`p-4 rounded-xl border ${
                    darkMode 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-emerald-50 border-emerald-300'
                  }`}>
                    <h3 className={`font-bold mb-2 ${
                      darkMode ? 'text-green-300' : 'text-emerald-700'
                    }`}>Turno Actual</h3>
                    <div className={`text-sm space-y-1 ${
                      darkMode ? 'text-slate-300' : 'text-emerald-800'
                    }`}>
                      <p>Apertura: {format(new Date(aperturaActual.fecha), "HH:mm", { locale: es })}</p>
                      <p>Base: {formatCurrency(aperturaActual.baseInicial)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel Derecho - Conteo */}
            <Card className={`${
              darkMode 
                ? 'bg-slate-800/50 border-slate-700' 
                : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 shadow-lg'
            }`}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${
                  darkMode ? 'text-white' : 'text-emerald-900'
                }`}>
                  <Banknote className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-emerald-600'}`} />
                  Base Inicial en Efectivo
                </CardTitle>
                <p className={`text-sm ${
                  darkMode ? 'text-slate-400' : 'text-emerald-700'
                }`}>
                  Cuenta los billetes y monedas que recibes
                </p>
              </CardHeader>
              <CardContent>
                {/* Grid de Billetes */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {denominaciones.map((denom) => (
                    <motion.div
                      key={denom.key}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative"
                    >
                      <Label htmlFor={`aper-${denom.key}`} className={`text-sm font-semibold mb-2 block ${
                        darkMode ? 'text-slate-300' : 'text-emerald-800'
                      }`}>
                        {denom.label}
                      </Label>
                      <Input
                        id={`aper-${denom.key}`}
                        type="number"
                        min="0"
                        value={billetes[denom.key as keyof typeof billetes] || ''}
                        onChange={(e) => handleBilleteChange(denom.key, e.target.value)}
                        className={`text-center text-lg font-bold ${
                          darkMode 
                            ? 'bg-slate-700/50 border-slate-600 text-white' 
                            : 'bg-white border-2 border-emerald-300 text-emerald-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
                        }`}
                        placeholder="0"
                      />
                      <p className={`text-xs text-center mt-1 ${
                        darkMode ? 'text-slate-500' : 'text-emerald-600 font-medium'
                      }`}>
                        = {formatCurrency((billetes[denom.key as keyof typeof billetes] || 0) * denom.valor)}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <Separator className={`mb-6 ${darkMode ? 'bg-slate-700' : 'bg-emerald-200'}`} />

                {/* Total */}
                <div className={`p-6 rounded-xl mb-6 border ${
                  darkMode 
                    ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border-emerald-500/30' 
                    : 'bg-gradient-to-br from-emerald-100 to-teal-100 border-2 border-emerald-400 shadow-[0_8px_20px_rgba(16,185,129,0.2)]'
                }`}>
                  <p className={`text-sm font-semibold mb-2 ${
                    darkMode ? 'text-emerald-300' : 'text-emerald-700'
                  }`}>BASE INICIAL</p>
                  <p className={`text-5xl font-black ${
                    darkMode ? 'text-white' : 'text-emerald-900'
                  }`}>{formatCurrency(totalContado)}</p>
                </div>

                {/* Botón Abrir Caja */}
                <Button
                  onClick={handleAperturaCaja}
                  disabled={totalContado === 0}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 h-14 text-lg font-bold"
                >
                  <PlayCircle className="w-5 h-5 mr-2" />
                  Abrir Caja e Iniciar Turno
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: CIERRE DE CAJA */}
        <TabsContent value="cierre">
          {/* Botones de acción rápida */}
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <Button
              onClick={() => setShowHistorialCierres(true)}
              variant="outline"
              className={`gap-2 rounded-xl ${
                darkMode
                  ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10'
                  : 'border-purple-300 text-purple-600 hover:bg-purple-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Historial de Cierres
            </Button>
            {turnoActivo && (
              <Button
                onClick={() => setShowModalDetallado(true)}
                variant="outline"
                className={`gap-2 rounded-xl ${
                  darkMode
                    ? 'border-violet-500/50 text-violet-400 hover:bg-violet-500/10'
                    : 'border-violet-300 text-violet-600 hover:bg-violet-50'
                }`}
              >
                <Search className="w-4 h-4" />
                Auditoría del Turno Actual
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Panel Izquierdo - Datos del Sistema */}
            <div className="lg:col-span-1">
              {/* Base Inicial */}
              {aperturaActual && (
                <Card className={`${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-md'} mb-6`}>
                  <CardHeader>
                    <CardTitle className={`${darkMode ? 'text-white' : 'text-slate-800'} flex items-center gap-2`}>
                      <LogIn className="w-5 h-5 text-purple-400" />
                      Base Inicial
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 rounded-xl">
                      <p className={`${darkMode ? 'text-purple-300' : 'text-purple-600'} text-sm font-semibold mb-1`}>CON LO QUE INICIASTE</p>
                      <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-3xl font-black`}>{formatCurrency(aperturaActual.baseInicial)}</p>
                      <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-xs mt-2`}>
                        {format(new Date(aperturaActual.fecha), "HH:mm", { locale: es })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Datos del Sistema */}
              <Card className={`${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-md'} mb-6`}>
                <CardHeader>
                  <CardTitle className={`${darkMode ? 'text-white' : 'text-slate-800'} flex items-center gap-2`}>
                    <Calculator className="w-5 h-5 text-blue-400" />
                    Ventas del Día
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Total Sistema */}
                  <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-xl">
                    <p className={`${darkMode ? 'text-blue-300' : 'text-blue-600'} text-sm font-semibold mb-1`}>TOTAL VENTAS</p>
                    <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-3xl font-black`}>{formatCurrency(totalSistema)}</p>
                  </div>

                  <Separator className={darkMode ? 'bg-slate-700' : 'bg-gray-200'} />

                  {/* Desglose por Método */}
                  <div className="space-y-3">
                    <h3 className={`${darkMode ? 'text-white' : 'text-slate-800'} font-semibold text-sm`}>Desglose por Método</h3>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-green-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Efectivo</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.efectivo)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Tarjeta</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.tarjeta)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-purple-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Nequi</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.nequi)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-red-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Daviplata</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.daviplata)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-cyan-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Transferencia</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.transferencia)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-yellow-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Bancolombia</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.bancolombia)}</span>
                    </div>

                    <div className={`flex items-center justify-between p-3 ${darkMode ? 'bg-slate-700/30' : 'bg-gray-100'} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <Bike className="w-4 h-4 text-orange-400" />
                        <span className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>Rappi</span>
                      </div>
                      <span className={`${darkMode ? 'text-white' : 'text-slate-900'} font-bold`}>{formatCurrency(desgloseSistema.rappi)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resultado del Cierre */}
              {puedeVerFaltante && (
                <Card className={`border-2 ${
                  estadoCierre === 'cuadrado'
                    ? 'bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/50'
                    : estadoCierre === 'faltante'
                    ? 'bg-gradient-to-br from-red-500/10 to-red-600/10 border-red-500/50'
                    : 'bg-gradient-to-br from-orange-500/10 to-orange-600/10 border-orange-500/50'
                }`}>
                  <CardContent className="p-6">
                    <div className="text-center">
                      {estadoCierre === 'cuadrado' ? (
                        <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                      ) : estadoCierre === 'faltante' ? (
                        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                      ) : (
                        <AlertTriangle className="w-16 h-16 text-orange-400 mx-auto mb-4" />
                      )}
                      <h3 className={`text-2xl font-bold mb-2 ${
                        estadoCierre === 'cuadrado' ? 'text-green-400'
                        : estadoCierre === 'faltante' ? 'text-red-400'
                        : 'text-orange-400'
                      }`}>
                        {estadoCierre === 'cuadrado' ? 'Caja Cuadrada'
                         : estadoCierre === 'faltante' ? 'Faltante en Caja'
                         : 'Sobrante en Caja'}
                      </h3>
                      <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-sm mb-4`}>
                        {estadoCierre === 'cuadrado'
                          ? 'El conteo físico coincide con el sistema'
                          : `Diferencia detectada: ${formatCurrency(Math.abs(diferencia))}`}
                      </p>
                      <div className={`p-4 ${darkMode ? 'bg-slate-800/50' : 'bg-gray-100'} rounded-xl`}>
                        <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-xs mb-1`}>DIFERENCIA</p>
                        <p className={`text-4xl font-black ${
                          estadoCierre === 'cuadrado' ? 'text-green-400'
                          : estadoCierre === 'faltante' ? 'text-red-400'
                          : 'text-orange-400'
                        }`}>
                          {diferencia >= 0 ? '+' : ''}{formatCurrency(diferencia)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Panel Central/Derecho - Conteo Físico */}
            <div className="lg:col-span-2">
              <Card className={darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-md'}>
                <CardHeader>
                  <CardTitle className={`${darkMode ? 'text-white' : 'text-slate-800'} flex items-center gap-2`}>
                    <Banknote className="w-5 h-5 text-green-400" />
                    Conteo Físico de Efectivo
                  </CardTitle>
                  <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-sm`}>
                    Cuenta todo el efectivo que tienes en la caja ahora
                  </p>
                </CardHeader>
                <CardContent>
                  {/* Grid de Billetes */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                    {denominaciones.map((denom) => (
                      <motion.div
                        key={denom.key}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative"
                      >
                        <Label htmlFor={`cierre-${denom.key}`} className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm font-semibold mb-2 block`}>
                          {denom.label}
                        </Label>
                        <Input
                          id={`cierre-${denom.key}`}
                          type="number"
                          min="0"
                          value={billetes[denom.key as keyof typeof billetes] || ''}
                          onChange={(e) => handleBilleteChange(denom.key, e.target.value)}
                          className={`${darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-800 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200'} text-center text-lg font-bold`}
                          placeholder="0"
                        />
                        <p className={`${darkMode ? 'text-slate-500' : 'text-gray-500'} text-xs text-center mt-1`}>
                          = {formatCurrency((billetes[denom.key as keyof typeof billetes] || 0) * denom.valor)}
                        </p>
                      </motion.div>
                    ))}
                  </div>

                  <Separator className={`${darkMode ? 'bg-slate-700' : 'bg-gray-200'} mb-6`} />

                  {/* Resumen del Cierre */}
                  <div className="space-y-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                      {/* Base Inicial */}
                      {aperturaActual && (
                        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                          <p className={`${darkMode ? 'text-purple-300' : 'text-purple-600'} text-xs font-semibold mb-1`}>BASE INICIAL</p>
                          <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(aperturaActual.baseInicial)}</p>
                        </div>
                      )}

                      {/* Ventas Efectivo */}
                      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-blue-300' : 'text-blue-600'} text-xs font-semibold mb-1`}>+ VENTAS EFECTIVO</p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(desgloseSistema.efectivo)}</p>
                      </div>

                      {/* Devoluciones */}
                      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-red-300' : 'text-red-600'} text-xs font-semibold mb-1`}>- DEVOLUCIONES EFECTIVO</p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(salidasDevolucionEfectivoDia)}</p>
                      </div>
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-red-300' : 'text-red-600'} text-xs font-semibold mb-1`}>- GASTOS EFECTIVO</p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(gastosEfectivoDia)}</p>
                      </div>

                      {/* Abonos de Cartera (crédito a clientes) recibidos hoy */}
                      <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-orange-300' : 'text-orange-600'} text-xs font-semibold mb-1`}>+ ABONOS CARTERA</p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(abonosCarteraEfectivoDia)}</p>
                      </div>
                      <div className="text-center">
                        <p className={`${darkMode ? 'text-amber-300' : 'text-amber-600'} text-xs font-semibold mb-1`}>= EFECTIVO ESPERADO</p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>{formatCurrency(totalEsperado)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-indigo-300' : 'text-indigo-700'} text-xs font-semibold mb-1`}>
                          TRANSFERENCIAS ESPERADAS (NETO EGRESOS)
                        </p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>
                          {formatCurrency(transferenciaEsperada)}
                        </p>
                      </div>
                      <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-cyan-300' : 'text-cyan-700'} text-xs font-semibold mb-1`}>
                          TARJETA/BANCO ESPERADO (NETO EGRESOS)
                        </p>
                        <p className={`${darkMode ? 'text-white' : 'text-slate-900'} text-2xl font-bold`}>
                          {formatCurrency(tarjetaBancoEsperado)}
                        </p>
                      </div>
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <p className={`${darkMode ? 'text-emerald-300' : 'text-emerald-700'} text-xs font-semibold mb-1`}>
                          TOTAL ESPERADO ANALÍTICO
                        </p>
                        <p className={`${darkMode ? 'text-white' : 'text-emerald-900'} text-2xl font-bold`}>
                          {formatCurrency(totalEsperadoAnalitico)}
                        </p>
                      </div>
                    </div>

                    {/* Total Físico */}
                    <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border border-emerald-500/30 rounded-xl">
                      <p className={`${darkMode ? 'text-emerald-300' : 'text-emerald-700'} text-sm font-semibold mb-2`}>TOTAL FÍSICO CONTADO</p>
                      <p className={`${darkMode ? 'text-white' : 'text-emerald-900'} text-5xl font-black`}>{formatCurrency(totalContado)}</p>
                      <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-sm mt-2`}>
                        Esperado efectivo: {formatCurrency(totalEsperado)}
                      </p>
                    </div>
                  </div>

                  {/* Observaciones */}
                  <div className="mb-6">
                    <Label htmlFor="observaciones" className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm font-semibold mb-2 block`}>
                      Observaciones (opcional)
                    </Label>
                    <textarea
                      id="observaciones"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      className={`w-full h-24 ${darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-800 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200'} border rounded-lg p-3 resize-none focus:outline-none`}
                      placeholder="Agrega comentarios sobre el cierre de caja..."
                    />
                  </div>

                  {/* Botones de Acción */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleCerrarCaja}
                      disabled={isSaving || totalContado === 0}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 h-14 text-lg font-bold"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                          Calculando cierre...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5 mr-2" />
                          Cerrar Caja y Finalizar Turno
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}