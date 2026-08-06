/**
 * ============================================
 * GESTIÓN DE DISPOSITIVOS - CODEC POS v2.0
 * Sistema Profesional de Hardware POS
 * ============================================
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Printer,
  Scale,
  Barcode,
  Vault,
  Monitor,
  Wifi,
  WifiOff,
  Zap,
  CheckCircle2,
  AlertCircle,
  Info,
  Crown,
  RefreshCw,
  MonitorPlay,
  Tv,
  Eye,
  EyeOff,
  Star,
  Usb,
  Settings2,
  Trash2,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';
import { DeviceCard } from './DeviceCard';
import { DeviceConfigModal } from './DeviceConfigModal';
import { deviceManager, type DispositivoDetectado } from '../../lib/deviceManager';
import { useDevices } from '../../contexts/DeviceContext';
import { type TipoDispositivo } from '../../lib/deviceRoles';
import { multiDisplayService, obtenerConfigMultiDisplay, guardarConfigMultiDisplay } from '../../lib/multiDisplayService';
import {
  getDefaultPrinterName,
  getPrinterByScope,
  isGlobalPrinterEnabled,
  setGlobalPrinterEnabled,
  setPrinterByScope,
  setDefaultPrinterName as persistDefaultPrinterName,
} from '../../lib/printerConfig';
import {
  ALL_SECTIONS,
  SECTION_INFO,
  getAllSectionPrinters,
  getPrinterForSection,
  setPrinterForSection,
  type PrintSection,
} from '../../lib/sectionPrinterConfig';
import {
  getDrawerConfig,
  setDrawerConfig,
  type DrawerConfig,
} from '../../lib/drawerConfig';
import { openCashDrawer } from '../../lib/thermalPrinter';

export interface Dispositivo {
  id: string;
  tipo: 'impresora' | 'bascula' | 'escaner' | 'cajon' | 'display';
  nombre: string;
  modelo?: string;
  puerto?: string;
  estado: 'conectado' | 'desconectado' | 'error';
  configuracion?: {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    vendorId?: string;
    productId?: string;
  };
  ultimaConexion?: Date;
  fabricante?: string;
}

const TIPO_DISPOSITIVO_INFO = {
  impresora: {
    icono: Printer,
    nombre: 'Impresora Térmica',
    descripcion: 'Impresión de tickets ESC/POS',
    color: 'blue',
    maxBasico: 1,
    maxPremium: 3
  },
  bascula: {
    icono: Scale,
    nombre: 'Báscula Digital',
    descripcion: 'Pesaje de productos',
    color: 'purple',
    maxBasico: 1,
    maxPremium: 3
  },
  escaner: {
    icono: Barcode,
    nombre: 'Escáner de Códigos',
    descripcion: 'Lectura de códigos de barras',
    color: 'green',
    maxBasico: 1,
    maxPremium: 3
  },
  cajon: {
    icono: Vault,
    nombre: 'Cajón Monedero',
    descripcion: 'Apertura electrónica',
    color: 'amber',
    maxBasico: 1,
    maxPremium: 3
  },
  display: {
    icono: Monitor,
    nombre: 'Display Cliente',
    descripcion: 'Pantalla para el cliente',
    color: 'cyan',
    maxBasico: 1,
    maxPremium: 3
  }
};

export default function DispositivosPage() {
  const { darkMode } = usePOS();
  const { devices: dispositivosDetectados, scanning: usbScanning, newDeviceIds, scan: scanFromContext, getDefault, setDefault, setUserType } = useDevices();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [deviceToConfig, setDeviceToConfig] = useState<Dispositivo | null>(null);
  const [planActual, setPlanActual] = useState<'BASICO' | 'PREMIUM'>('PREMIUM');
  const [manualDeviceName, setManualDeviceName] = useState('');
  const [manualDevicePort, setManualDevicePort] = useState('');
  const [defaultPrinterName, setDefaultPrinterNameState] = useState('');
  const [sectionPrinters, setSectionPrinters] = useState<Partial<Record<PrintSection, string>>>(() => getAllSectionPrinters());
  const [globalPrinterName, setGlobalPrinterName] = useState('');
  const [useGlobalPrinterDraft, setUseGlobalPrinterDraft] = useState(false);
  const [printerConfigDirty, setPrinterConfigDirty] = useState(false);
  const [showConfirmGlobalPrinter, setShowConfirmGlobalPrinter] = useState(false);
  const [sectionPrintersOpen, setSectionPrintersOpen] = useState(false);
  const [drawerCfg, setDrawerCfgState] = useState<DrawerConfig>(() => getDrawerConfig());
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 🖥️ Estados para Multi-Pantalla
  const [multiDisplayConfig, setMultiDisplayConfig] = useState(() => obtenerConfigMultiDisplay());
  const [pantallasDetectadas, setPantallasDetectadas] = useState<number>(0);
  const [infoPantallas, setInfoPantallas] = useState<any[]>([]);


  console.log('✅ DispositivosPage renderizado');

  useEffect(() => {
    loadDispositivos();
    loadPlan();
    loadDefaultPrinter();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (defaultPrinterName && scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, [defaultPrinterName]);

  const loadDefaultPrinter = () => {
    setDefaultPrinterNameState(getDefaultPrinterName());
    setSectionPrinters(getAllSectionPrinters());
    setGlobalPrinterName(getPrinterByScope('global'));
    setUseGlobalPrinterDraft(isGlobalPrinterEnabled());
    setPrinterConfigDirty(false);
  };

  const getPrinterOptions = () => {
    const printerOptions = [...dispositivosDetectados.filter(d => d.tipo === 'impresora')];
    const namesInDetected = new Set(printerOptions.map(d => d.nombre));
    dispositivos
      .filter(d => d.tipo === 'impresora' && !namesInDetected.has(d.nombre))
      .forEach(d => printerOptions.push({ ...d, id: d.id, nombre: d.nombre, puerto: d.puerto || '', estado: 'conectado', tipo: 'impresora' } as any));
    return printerOptions;
  };

  const handleSetSectionPrinter = (section: PrintSection, printerName: string) => {
    setSectionPrinters((prev) => {
      if (!printerName) {
        const next = { ...prev };
        delete next[section];
        return next;
      }
      return { ...prev, [section]: printerName };
    });
    setPrinterConfigDirty(true);

    const info = SECTION_INFO[section];
    if (printerName) {
      toast.success(`${info.emoji} ${info.label}`, { description: `Selección pendiente: ${printerName}` });
    } else {
      toast.info(`${info.label}: se quitará la asignación al guardar`);
    }
  };

  const handleSavePrinterSettings = () => {
    for (const section of ALL_SECTIONS) {
      setPrinterForSection(section, sectionPrinters[section] || '');
    }

    setPrinterByScope('global', globalPrinterName);
    setGlobalPrinterEnabled(useGlobalPrinterDraft);
    setPrinterConfigDirty(false);

    toast.success('Configuración de impresoras guardada', {
      description: useGlobalPrinterDraft
        ? 'Modo global activo para todo el sistema.'
        : 'Se aplicó configuración por módulos con fallback global.',
    });
  };

  const handleDrawerCfg = (updates: Partial<DrawerConfig>) => {
    setDrawerConfig(updates);
    setDrawerCfgState(getDrawerConfig());
  };

  const handleProbarCajon = async () => {
    if (!drawerCfg.habilitado) {
      toast.info('Activa el cajón monedero primero');
      return;
    }
    const ok = await openCashDrawer();
    if (ok) toast.success('Cajón abierto correctamente');
    else toast.error('No se abrió — verifica la conexión y configuración');
  };

  const loadDispositivos = () => {
    try {
      const stored = localStorage.getItem('pos-dispositivos');
      if (stored) {
        const parsed = JSON.parse(stored);
        setDispositivos(parsed);
        console.log(`✅ ${parsed.length} dispositivos cargados desde localStorage`);
      }
    } catch (error) {
      console.error('❌ Error cargando dispositivos:', error);
    }
  };

  const loadPlan = () => {
    try {
      const plan = localStorage.getItem('pos-plan') || 'PREMIUM';
      setPlanActual(plan as 'BASICO' | 'PREMIUM');
      // Asegurar que se guarde el plan PREMIUM
      if (!localStorage.getItem('pos-plan')) {
        localStorage.setItem('pos-plan', 'PREMIUM');
      }
    } catch (error) {
      console.error('Error cargando plan:', error);
    }
  };

  const saveDispositivos = (devices: Dispositivo[]) => {
    try {
      localStorage.setItem('pos-dispositivos', JSON.stringify(devices));
      setDispositivos(devices);
    } catch (error) {
      console.error('Error guardando dispositivos:', error);
      toast.error('Error al guardar dispositivos');
    }
  };

  const setDefaultPrinter = (printerName: string) => {
    persistDefaultPrinterName(printerName);
    setDefaultPrinterNameState(printerName);
  };

  const agregarDispositivoDetectado = (device: DispositivoDetectado, options?: { manual?: boolean }) => {
    try {
      const tipoInfo = TIPO_DISPOSITIVO_INFO[device.tipo];
      const maxPermitidos = planActual === 'PREMIUM' ? tipoInfo.maxPremium : tipoInfo.maxBasico;
      const cantidadActual = dispositivos.filter(d => d.tipo === device.tipo).length;

      if (cantidadActual >= maxPermitidos) {
        console.warn(`⚠️ Límite alcanzado para ${tipoInfo.nombre}`);
        return;
      }

      const nuevoDispositivo: Dispositivo = {
        id: device.id,
        tipo: device.tipo,
        nombre: device.nombre,
        modelo: device.modelo,
        fabricante: device.fabricante,
        puerto: device.puerto,
        estado: device.estado,
        configuracion: {
          baudRate: device.configuracion?.baudRate,
          dataBits: device.configuracion?.dataBits,
          stopBits: device.configuracion?.stopBits,
          parity: device.configuracion?.parity,
          vendorId: device.vendorId,
          productId: device.productId,
        },
        ultimaConexion: new Date()
      };

      const nuevosDispositivos = [...dispositivos, nuevoDispositivo];
      saveDispositivos(nuevosDispositivos);

      if (device.tipo === 'impresora') {
        setDefaultPrinter(device.nombre);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
      }

      if (options?.manual) {
        toast.success(`✅ ${device.nombre} agregado`, {
          description: `Conectado en ${device.puerto}`
        });
      }

      console.log(`✅ Dispositivo agregado automáticamente: ${device.nombre}`);
    } catch (error) {
      console.error('Error agregando dispositivo:', error);
    }
  };

  const escanearDispositivos = async () => {
    setScanning(true);
    toast.info('🔍 Buscando dispositivos conectados...', { duration: 2000 });
    try {
      await scanFromContext();
      if (dispositivosDetectados.length > 0) {
        toast.success(`✅ ${dispositivosDetectados.length} dispositivo(s) encontrado(s)`);
      } else {
        toast.warning('⚠️ Escaneo sin resultados', {
          description: 'Puedes mapear manualmente un puerto (COM/LPT/USB) o ruta de red'
        });
      }
    } catch (error) {
      console.error('Error escaneando:', error);
      toast.error('Error al escanear dispositivos');
    } finally {
      setScanning(false);
    }
  };

  const agregarMapeoManual = () => {
    const nombre = manualDeviceName.trim();
    const puerto = manualDevicePort.trim();

    if (!nombre || !puerto) {
      toast.error('Debes indicar nombre y puerto/ruta manual');
      return;
    }

    const nuevoDispositivo: Dispositivo = {
      id: `manual-${Date.now()}`,
      tipo: 'impresora',
      nombre,
      modelo: 'Mapeo Manual',
      fabricante: 'Configuración Manual',
      puerto,
      estado: 'conectado',
      configuracion: {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      },
      ultimaConexion: new Date()
    };

    saveDispositivos([...dispositivos, nuevoDispositivo]);
    setDefaultPrinter(nombre);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setManualDeviceName('');
    setManualDevicePort('');
    toast.success('✅ Mapeo manual guardado', {
      description: `${nombre} → ${puerto}`
    });
  };

  const eliminarDispositivo = (id: string) => {
    const device = dispositivos.find(d => d.id === id);
    if (device) {
      const nuevosDispositivos = dispositivos.filter(d => d.id !== id);
      saveDispositivos(nuevosDispositivos);
      toast.success(`${TIPO_DISPOSITIVO_INFO[device.tipo].nombre} eliminado`);
    }
  };

  const configurarDispositivo = (dispositivo: Dispositivo) => {
    setDeviceToConfig(dispositivo);
    setShowConfigModal(true);
  };

  const probarDispositivo = async (dispositivo: Dispositivo) => {
    toast.info(`🧪 Probando ${dispositivo.nombre}...`);
    
    try {
      const result = await deviceManager.testDevice(dispositivo.id);
      
      if (result) {
        toast.success(`✅ ${dispositivo.nombre} funciona correctamente`);
      } else {
        toast.error(`❌ ${dispositivo.nombre} no responde`);
      }
    } catch (error) {
      console.error('Error probando dispositivo:', error);
      toast.error('Error al probar dispositivo');
    }
  };

  // 🖥️ Funciones Multi-Pantalla
  const detectarPantallas = async () => {
    try {
      const cantidad = await multiDisplayService.detectarPantallas();
      const info = await multiDisplayService.obtenerInfoPantallas();
      setPantallasDetectadas(cantidad);
      setInfoPantallas(info);
      
      if (cantidad > 1) {
        toast.success(`🖥️ Se detectaron ${cantidad} pantallas`, {
          description: 'Multi-pantalla disponible'
        });
      } else {
        toast.info('🖥️ Solo se detectó 1 pantalla', {
          description: 'Conecta una segunda pantalla para usar esta función'
        });
      }
    } catch (error) {
      console.error('Error detectando pantallas:', error);
      toast.error('Error al detectar pantallas');
    }
  };

  const handleMultiDisplayToggle = async () => {
    try {
      const newState = !multiDisplayConfig.activo;
      
      if (newState) {
        // Activar multi-pantalla
        const success = await multiDisplayService.abrirPantallaCliente();
        if (success) {
          const newConfig = { ...multiDisplayConfig, activo: true };
          setMultiDisplayConfig(newConfig);
          guardarConfigMultiDisplay(newConfig);
          toast.success('🖥️ Pantalla del cliente activada', {
            description: 'La segunda pantalla está lista para mostrar precios'
          });
        } else {
          toast.error('❌ No se pudo abrir la pantalla del cliente', {
            description: 'Verifica que tengas una segunda pantalla conectada'
          });
        }
      } else {
        // Desactivar multi-pantalla
        multiDisplayService.cerrarPantallaCliente();
        const newConfig = { ...multiDisplayConfig, activo: false };
        setMultiDisplayConfig(newConfig);
        guardarConfigMultiDisplay(newConfig);
        toast.info('⚪ Pantalla del cliente desactivada');
      }
    } catch (error) {
      console.error('Error en toggle multi-pantalla:', error);
      toast.error('Error al cambiar estado de multi-pantalla');
    }
  };


  const abrirVentanaCliente = () => {
    try {
      // Verificar que la ventana está disponible
      if (typeof window === 'undefined') return;
      
      // Abrir en una nueva pestaña en lugar de popup para evitar problemas de iframe
      const url = '/pantalla-cliente';
      const newTab = window.open(url, '_blank');
      
      if (newTab) {
        toast.success('✅ Pantalla del cliente abierta en nueva pestaña');
      } else {
        toast.warning('⚠️ Permitir ventanas emergentes en el navegador');
      }
    } catch (error) {
      console.error('Error abriendo ventana cliente:', error);
      toast.error('Error al abrir ventana del cliente');
    }
  };

  // ========== ESTADÍSTICAS ==========
  const stats = {
    total: dispositivos.length,
    conectados: dispositivos.filter(d => d.estado === 'conectado').length,
    desconectados: dispositivos.filter(d => d.estado === 'desconectado').length,
    errores: dispositivos.filter(d => d.estado === 'error').length,
    detectados: dispositivosDetectados.length
  };

  const dispositivosPorTipo = Object.entries(TIPO_DISPOSITIVO_INFO).map(([tipo, info]) => {
    const cantidad = dispositivos.filter(d => d.tipo === tipo).length;
    const maxPermitidos = planActual === 'PREMIUM' ? info.maxPremium : info.maxBasico;
    return {
      tipo: tipo as Dispositivo['tipo'],
      info,
      cantidad,
      maxPermitidos,
      disponibles: maxPermitidos - cantidad
    };
  });

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${
        darkMode ? 'bg-slate-900' : 'bg-gray-50'
      }`}>
        <div className="text-center">
          <RefreshCw className={`w-16 h-16 mx-auto mb-4 animate-spin ${
            darkMode ? 'text-purple-500' : 'text-purple-600'
          }`} />
          <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Detectando dispositivos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-8">

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Dispositivos &amp; Hardware
            </h1>
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {stats.total} configurados · {stats.conectados} conectados · {stats.detectados} detectados
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 ${
              planActual === 'PREMIUM'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                : darkMode ? 'bg-slate-700' : 'bg-gray-200'
            }`}>
              {planActual === 'PREMIUM' && <Crown className="w-4 h-4 text-white" />}
              <span className={`font-bold text-sm ${
                planActual === 'PREMIUM' ? 'text-white' : darkMode ? 'text-white' : 'text-gray-700'
              }`}>Plan {planActual}</span>
            </div>
            <Button
              onClick={escanearDispositivos}
              disabled={scanning || usbScanning}
              className="rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${(scanning || usbScanning) ? 'animate-spin' : ''}`} />
              {(scanning || usbScanning) ? 'Escaneando...' : 'Detectar Dispositivos'}
            </Button>
          </div>
        </div>

        {/* DEVICE STATUS — 5 illuminating cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Object.entries(TIPO_DISPOSITIVO_INFO).map(([tipo, info]) => {
            const totalDeTipo = dispositivos.filter(d => d.tipo === tipo).length;
            const conectadosDeTipo = dispositivos.filter(d => d.tipo === tipo && d.estado === 'conectado').length;
            const isActive = conectadosDeTipo > 0 || dispositivosDetectados.filter(d => d.tipo === tipo).length > 0;
            const Icon = info.icono;
            return (
              <motion.div
                key={tipo}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-default ${
                  isActive
                    ? darkMode
                      ? `border-${info.color}-500/40 bg-slate-900/80 shadow-lg`
                      : `border-${info.color}-200 bg-white shadow-lg shadow-${info.color}-100`
                    : darkMode
                    ? 'border-slate-700/50 bg-slate-900/50'
                    : 'border-gray-100 bg-white'
                }`}
              >
                {isActive && (
                  <span className={`absolute top-3 right-3 w-2 h-2 rounded-full bg-${info.color}-500 animate-pulse`} />
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                  isActive
                    ? `bg-gradient-to-br from-${info.color}-400 to-${info.color}-600 shadow-lg shadow-${info.color}-500/30`
                    : darkMode ? 'bg-slate-800' : 'bg-gray-100'
                }`}>
                  <Icon className={`w-8 h-8 ${isActive ? 'text-white' : darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                </div>
                <div className="text-center">
                  <p className={`text-3xl font-black leading-none ${
                    isActive
                      ? darkMode ? `text-${info.color}-300` : `text-${info.color}-700`
                      : darkMode ? 'text-slate-700' : 'text-gray-300'
                  }`}>{totalDeTipo}</p>
                  <p className={`text-xs font-semibold mt-1 leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {info.nombre}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* PRINTER SECTION ASSIGNMENT */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={`${darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'} rounded-3xl border-2`}>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-blue-600' : 'bg-blue-500'}`}>
                  <Printer className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Impresora por Proceso de Negocio
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Asigna qué impresora física se usa independientemente en cada área
                  </p>
                </div>
                <Button
                  onClick={handleSavePrinterSettings}
                  disabled={!printerConfigDirty}
                  className="rounded-xl"
                >
                  Guardar Cambios
                </Button>
              </div>

              <div className={`p-5 rounded-2xl border-2 transition-all ${
                useGlobalPrinterDraft
                  ? darkMode ? 'border-emerald-500/60 bg-emerald-900/20' : 'border-emerald-300 bg-emerald-50'
                  : darkMode ? 'border-violet-500/50 bg-violet-900/20' : 'border-violet-300 bg-violet-50'
              }`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Todo el Sistema (Impresora Global)
                    </p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Configura una única impresora para los más de 20 módulos del sistema POS automáticamente.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                  <div>
                    <p className={`text-xs font-semibold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Impresora global</p>
                    <select
                      value={globalPrinterName}
                      onChange={(e) => {
                        setGlobalPrinterName(e.target.value);
                        setPrinterConfigDirty(true);
                      }}
                      className={`w-full h-10 rounded-xl px-3 border text-sm font-medium ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="">— Predeterminada ({defaultPrinterName || 'ninguna'}) —</option>
                      {getPrinterOptions().map(d => (
                        <option key={d.id} value={d.nombre}>{d.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${darkMode ? 'border-violet-500/40 bg-violet-900/20' : 'border-violet-200 bg-violet-50'}`}>
                    <div>
                      <p className={`text-sm font-bold ${darkMode ? 'text-violet-200' : 'text-violet-800'}`}>
                        Activar como impresora única para todo el sistema
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-violet-300/80' : 'text-violet-700/80'}`}>
                        Si está desactivado, puedes habilitar personalización por módulos.
                      </p>
                    </div>
                    <Switch
                      checked={useGlobalPrinterDraft}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowConfirmGlobalPrinter(true);
                          return;
                        }
                        setUseGlobalPrinterDraft(false);
                        setPrinterConfigDirty(true);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${useGlobalPrinterDraft ? 'opacity-50' : ''}`}>
                {(['pos_tickets', 'cierre_caja', 'gastos'] as PrintSection[]).map((section) => {
                  const info = SECTION_INFO[section];
                  const assigned = sectionPrinters[section] || '';
                  const effectivePrinter = getPrinterForSection(section);
                  const hasSpecific = Boolean(assigned);

                  return (
                    <div key={section} className={`p-5 rounded-2xl border-2 transition-all ${
                      hasSpecific
                        ? darkMode ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
                        : darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-start gap-2 mb-3">
                        <span className="text-2xl leading-none mt-0.5">{info.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{info.label}</p>
                          <p className={`text-[11px] leading-tight ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{info.desc}</p>
                        </div>
                        {hasSpecific && (
                          <button
                            type="button"
                            disabled={useGlobalPrinterDraft}
                            onClick={() => handleSetSectionPrinter(section, '')}
                            title="Quitar asignación"
                            className={`p-1 rounded-lg flex-shrink-0 ${darkMode ? 'text-gray-600 hover:text-red-400' : 'text-gray-300 hover:text-red-500'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <select
                        value={assigned}
                        disabled={useGlobalPrinterDraft}
                        onChange={(e) => handleSetSectionPrinter(section, e.target.value)}
                        className={`w-full h-10 rounded-xl px-3 border text-sm font-medium ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      >
                        <option value="">— Predeterminada ({defaultPrinterName || 'ninguna'}) —</option>
                        {getPrinterOptions().map(d => (
                          <option key={d.id} value={d.nombre}>{d.nombre}</option>
                        ))}
                      </select>
                      <p className={`mt-2 text-[11px] font-semibold ${
                        hasSpecific ? (darkMode ? 'text-blue-400' : 'text-blue-700') : darkMode ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {hasSpecific ? `✓ ${assigned}` : `Usa: ${effectivePrinter || globalPrinterName || 'ninguna configurada'}`}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setSectionPrintersOpen(prev => !prev)}
                  className={`flex items-center gap-2 text-sm font-semibold transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sectionPrintersOpen ? 'rotate-180' : ''}`} />
                  Más secciones — Taller, Reportes, Códigos de Barras, Devoluciones
                </button>

                <AnimatePresence initial={false}>
                  {sectionPrintersOpen && (
                    <motion.div
                      key="extra-sections"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4 ${useGlobalPrinterDraft ? 'opacity-50' : ''}`}>
                        {(['taller', 'reportes', 'codigos_barras', 'devoluciones'] as PrintSection[]).map((section) => {
                          const info = SECTION_INFO[section];
                          const assigned = sectionPrinters[section] || '';
                          const effectivePrinter = getPrinterForSection(section);
                          const hasSpecific = Boolean(assigned);

                          return (
                            <div key={section} className={`p-4 rounded-2xl border transition-all ${
                              hasSpecific
                                ? darkMode ? 'border-blue-700/50 bg-blue-900/15' : 'border-blue-200 bg-blue-50/80'
                                : darkMode ? 'border-slate-700/60 bg-slate-800/30' : 'border-gray-200 bg-gray-50'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{info.emoji}</span>
                                <div className="flex-1">
                                  <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{info.label}</p>
                                </div>
                              </div>
                              <select
                                value={assigned}
                                disabled={useGlobalPrinterDraft}
                                onChange={(e) => handleSetSectionPrinter(section, e.target.value)}
                                className={`w-full h-9 rounded-xl px-3 border text-xs ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                              >
                                <option value="">— Predeterminada ({defaultPrinterName || 'ninguna'}) —</option>
                                {getPrinterOptions().map(d => (
                                  <option key={d.id} value={d.nombre}>{d.nombre}</option>
                                ))}
                              </select>
                              <p className={`mt-1.5 text-[11px] ${hasSpecific ? (darkMode ? 'text-blue-400 font-semibold' : 'text-blue-700 font-semibold') : darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                                {hasSpecific ? `✓ ${assigned}` : `Usa: ${effectivePrinter || globalPrinterName || 'ninguna'}`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* DETECTED DEVICES */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className={`${darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'} rounded-3xl border-2`}>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-purple-600' : 'bg-purple-500'}`}>
                    <Usb className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Detección USB &amp; Sistema</h2>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {dispositivosDetectados.length} dispositivo{dispositivosDetectados.length !== 1 ? 's' : ''} encontrado{dispositivosDetectados.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={escanearDispositivos}
                  disabled={scanning || usbScanning}
                  variant="outline"
                  size="sm"
                  className={`rounded-xl ${darkMode ? 'border-purple-700 text-purple-400' : 'border-purple-400 text-purple-600'}`}
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${(scanning || usbScanning) ? 'animate-spin' : ''}`} />
                  Escanear
                </Button>
              </div>

              {/* Type counters */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(TIPO_DISPOSITIVO_INFO).map(([tipo, info]) => {
                  const count = dispositivosDetectados.filter(d => d.tipo === tipo).length;
                  return (
                    <div key={tipo} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${
                      count > 0
                        ? darkMode ? `border-${info.color}-700/50 bg-${info.color}-900/20` : `border-${info.color}-200 bg-${info.color}-50`
                        : darkMode ? 'border-slate-700/50 bg-slate-800/30' : 'border-gray-100 bg-gray-50'
                    }`}>
                      <info.icono className={`w-4 h-4 ${count > 0 ? `text-${info.color}-${darkMode ? '400' : '500'}` : darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                      <p className={`text-lg font-black leading-none ${count > 0 ? (darkMode ? `text-${info.color}-300` : `text-${info.color}-700`) : darkMode ? 'text-slate-700' : 'text-gray-300'}`}>
                        {count}
                      </p>
                      <p className={`text-[10px] font-semibold text-center leading-tight ${count > 0 ? (darkMode ? 'text-gray-400' : 'text-gray-600') : darkMode ? 'text-slate-700' : 'text-gray-400'}`}>
                        {info.nombre.split(' ')[0]}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Device list */}
              {dispositivosDetectados.length === 0 ? (
                <div className={`p-10 rounded-2xl text-center border-2 border-dashed ${darkMode ? 'border-slate-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <Usb className="w-8 h-8 opacity-30" />
                  </div>
                  <p className={`text-sm font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>No se detectaron dispositivos</p>
                  <p className="text-xs opacity-60">Conecta una impresora, escáner u otro periférico y haz clic en Escanear</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {dispositivosDetectados.map((device) => {
                      const TipoIcono = TIPO_DISPOSITIVO_INFO[device.tipo]?.icono ?? Usb;
                      const tipoInfo = TIPO_DISPOSITIVO_INFO[device.tipo];
                      const color = tipoInfo?.color ?? 'gray';
                      const esNuevo = newDeviceIds.has(device.id);
                      const defaultAssignment = getDefault(device.tipo as TipoDispositivo);
                      const esPredeterminado = defaultAssignment?.deviceId === device.id;

                      return (
                        <motion.div
                          key={device.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -12 }}
                          className={`relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                            esPredeterminado
                              ? darkMode ? 'bg-purple-900/25 border-purple-600/50' : 'bg-purple-50 border-purple-300'
                              : darkMode ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {esNuevo && (
                            <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500 text-white animate-pulse z-10">NUEVO</span>
                          )}
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${darkMode ? `bg-${color}-900/30 border-${color}-700/40` : `bg-${color}-50 border-${color}-200`}`}>
                            <TipoIcono className={`w-6 h-6 text-${color}-${darkMode ? '400' : '500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{device.nombre}</p>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                                device.estado === 'conectado' ? 'bg-green-500/20 text-green-400' : device.estado === 'error' ? 'bg-red-500/20 text-red-400' : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-500'
                              }`}>
                                {device.estado === 'conectado' ? '● Conectado' : device.estado === 'error' ? '● Error' : '○ Inactivo'}
                              </span>
                            </div>
                            {(device.fabricante || device.modelo) && (
                              <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {[device.fabricante, device.modelo].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {device.puerto}{device.vendorId && device.productId && ` · VID:${device.vendorId} PID:${device.productId}`}
                            </p>
                            {esPredeterminado && (
                              <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                                ★ Predeterminado · {tipoInfo?.nombre ?? device.tipo}
                              </p>
                            )}
                          </div>
                          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{tipoInfo?.nombre ?? device.tipo}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="flex items-center gap-1">
                              <Settings2 className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                              <select
                                value={device.tipo}
                                onChange={(e) => setUserType(device.id, e.target.value as TipoDispositivo)}
                                title="Cambiar tipo"
                                className={`text-xs h-8 rounded-xl px-2 border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}
                              >
                                <option value="impresora">Impresora</option>
                                <option value="bascula">Báscula</option>
                                <option value="escaner">Escáner</option>
                                <option value="cajon">Cajón</option>
                                <option value="display">Display</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              title={esPredeterminado ? 'Quitar predeterminado' : 'Predeterminado'}
                              onClick={() => setDefault(device.tipo as TipoDispositivo, esPredeterminado ? null : device)}
                              className={`p-1.5 rounded-lg transition-colors ${esPredeterminado ? 'text-amber-400 hover:text-amber-500' : darkMode ? 'text-gray-600 hover:text-amber-400' : 'text-gray-300 hover:text-amber-500'}`}
                            >
                              <Star className={`w-4 h-4 ${esPredeterminado ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => agregarDispositivoDetectado(device, { manual: true })}
                              className={`text-xs px-3 h-8 rounded-xl font-semibold transition-colors whitespace-nowrap ${darkMode ? 'bg-purple-700 hover:bg-purple-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'}`}
                            >
                              + Agregar
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {/* Manual mapping */}
              <div className={`pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Agregar manualmente (red o puerto específico)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    value={manualDeviceName}
                    onChange={(e) => setManualDeviceName(e.target.value)}
                    placeholder="Nombre (ej: POS-80 CAJA1)"
                    className={`h-9 rounded-xl px-3 border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  <input
                    value={manualDevicePort}
                    onChange={(e) => setManualDevicePort(e.target.value)}
                    placeholder="Puerto (COM3, USB001, \\\\CAJA1\\Termica)"
                    className={`h-9 rounded-xl px-3 border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  <Button onClick={agregarMapeoManual} className="h-9 rounded-xl text-sm">
                    Guardar mapeo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* CASH DRAWER + MULTI DISPLAY side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Cajón Monedero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className={`h-full ${
              drawerCfg.habilitado
                ? darkMode ? 'bg-amber-900/20 border-amber-500/40' : 'bg-amber-50 border-amber-300'
                : darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'
            } rounded-3xl border-2`}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    drawerCfg.habilitado ? 'bg-gradient-to-br from-amber-400 to-amber-600' : darkMode ? 'bg-slate-700' : 'bg-gray-200'
                  }`}>
                    <Vault className={`w-5 h-5 ${drawerCfg.habilitado ? 'text-white' : darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <h2 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Cajón Monedero</h2>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Apertura electrónica automática</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDrawerCfg({ habilitado: !drawerCfg.habilitado })}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      drawerCfg.habilitado ? 'bg-amber-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${drawerCfg.habilitado ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {drawerCfg.habilitado && (
                  <div className="space-y-3">
                    <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                      <button
                        type="button"
                        onClick={() => handleDrawerCfg({ modo: 'via_impresora' })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                          drawerCfg.modo === 'via_impresora'
                            ? darkMode ? 'bg-amber-600 text-white' : 'bg-amber-500 text-white shadow-sm'
                            : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Via Impresora
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDrawerCfg({ modo: 'directo_pc' })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                          drawerCfg.modo === 'directo_pc'
                            ? darkMode ? 'bg-amber-600 text-white' : 'bg-amber-500 text-white shadow-sm'
                            : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Puerto Directo
                      </button>
                    </div>

                    {drawerCfg.modo === 'directo_pc' && (
                      <div className="space-y-2">
                        <input
                          value={drawerCfg.puertoDirecto || ''}
                          onChange={(e) => handleDrawerCfg({ puertoDirecto: e.target.value })}
                          placeholder="Puerto (ej: COM3)"
                          className={`w-full h-9 rounded-xl px-3 border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <select
                          value={String(drawerCfg.pin)}
                          onChange={(e) => handleDrawerCfg({ pin: Number(e.target.value) as 2 | 5 })}
                          className={`w-full h-9 rounded-xl px-3 border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                        >
                          <option value="2">Pin 2 (recomendado)</option>
                          <option value="5">Pin 5</option>
                        </select>
                      </div>
                    )}

                    <Button
                      onClick={handleProbarCajon}
                      variant="outline"
                      className={`w-full rounded-xl ${darkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/20' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Probar Apertura
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Multi-Display */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className={`h-full ${
              multiDisplayConfig.activo
                ? darkMode ? 'bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-cyan-500/50' : 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-300'
                : darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'
            } rounded-3xl border-2`}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    multiDisplayConfig.activo ? 'bg-gradient-to-br from-cyan-500 to-blue-600' : darkMode ? 'bg-slate-700' : 'bg-gray-200'
                  }`}>
                    <MonitorPlay className={`w-5 h-5 ${multiDisplayConfig.activo ? 'text-white' : darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <h2 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Multi-Pantalla Dual</h2>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Pantalla secundaria para el cliente</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleMultiDisplayToggle}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      multiDisplayConfig.activo ? 'bg-cyan-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${multiDisplayConfig.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={detectarPantallas}
                    variant="outline"
                    size="sm"
                    className={`flex-1 rounded-xl ${darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Tv className="w-4 h-4 mr-1.5" />
                    Detectar Pantallas
                    {pantallasDetectadas > 0 && (
                      <span className={`ml-2 text-[10px] font-black ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{pantallasDetectadas}</span>
                    )}
                  </Button>
                  {multiDisplayConfig.activo && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={abrirVentanaCliente}
                      className="rounded-xl border-cyan-500 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
                    >
                      <MonitorPlay className="w-4 h-4 mr-1.5" />
                      Abrir
                    </Button>
                  )}
                </div>

                {pantallasDetectadas > 0 && (
                  <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <p className={`text-xs font-semibold mb-2 ${pantallasDetectadas > 1 ? (darkMode ? 'text-cyan-400' : 'text-cyan-600') : darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {pantallasDetectadas} {pantallasDetectadas === 1 ? 'pantalla' : 'pantallas'} detectada{pantallasDetectadas !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-1">
                      {infoPantallas.map((pantalla, index) => (
                        <div key={index} className={`text-xs flex items-center justify-between ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span className="flex items-center gap-2">
                            <span>{pantalla.esPrincipal ? '⭐' : '📺'}</span>
                            <span className="font-semibold">{pantalla.nombre}</span>
                          </span>
                          <span className="opacity-70">{pantalla.ancho}×{pantalla.alto}px</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className="flex gap-2">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                      <strong>Cajero</strong> ve el POS completo. <strong>Cliente</strong> ve productos y precios en tiempo real en la segunda pantalla.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* MY CONFIGURED DEVICES */}
        <div className="space-y-4">
          <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Mis Dispositivos Configurados ({dispositivos.length})
          </h2>

          {dispositivos.length === 0 ? (
            <Card className={`${darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'} rounded-3xl border-2`}>
              <CardContent className="p-12 text-center">
                <Zap className={`w-20 h-20 mx-auto mb-4 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                <p className={`text-xl font-bold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>No hay dispositivos configurados</p>
                <p className={`text-sm mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Conecta tus dispositivos USB y haz clic en "Detectar Dispositivos"</p>
                <Button onClick={escanearDispositivos} className="mt-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl">
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Detectar Dispositivos
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {dispositivos.map((dispositivo) => (
                  <DeviceCard
                    key={dispositivo.id}
                    dispositivo={dispositivo}
                    darkMode={darkMode}
                    onEliminar={() => eliminarDispositivo(dispositivo.id)}
                    onConfigurar={() => configurarDispositivo(dispositivo)}
                    onProbar={() => probarDispositivo(dispositivo)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

      </div>

      <Dialog open={showConfirmGlobalPrinter} onOpenChange={setShowConfirmGlobalPrinter}>
        <DialogContent className={darkMode ? 'bg-slate-900 border-slate-700 text-white' : ''}>
          <DialogHeader>
            <DialogTitle>Confirmar impresora global</DialogTitle>
            <DialogDescription className={darkMode ? 'text-slate-300' : ''}>
              ¡Configuración Global Activada! Todo el sistema CODEC POS quedará vinculado a esta impresora de forma unificada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmGlobalPrinter(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setUseGlobalPrinterDraft(true);
                setPrinterConfigDirty(true);
                setShowConfirmGlobalPrinter(false);
                toast.success('¡Configuración Global Activada! Todo el sistema CODEC POS quedará vinculado a esta impresora de forma unificada.');
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeviceConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        dispositivo={deviceToConfig}
        darkMode={darkMode}
        onSave={(updatedDevice) => {
          const index = dispositivos.findIndex(d => d.id === updatedDevice.id);
          if (index !== -1) {
            const updated = [...dispositivos];
            updated[index] = updatedDevice;
            saveDispositivos(updated);
            toast.success('Configuración guardada');
          }
          setShowConfigModal(false);
        }}
      />
    </div>
  );
}

