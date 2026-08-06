/**
 * CODEC POS - Configuración del Sistema
 * Sistema desarrollado por Codec Studio
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Save, Building, FileText, Printer, DollarSign, Shield, Settings, MapPin, Phone, Mail, ImageIcon, Upload, Receipt, AlertCircle, Key, Lock, CheckCircle, Monitor, Zap, Crown, Check, X, Infinity, TrendingUp, Users, BarChart3, Smartphone, Database, Copy, ChevronDown, ChevronUp, Store, Webhook, Sparkles, Download, HardDrive, Wrench, Power, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLicense } from '../../contexts/LicenseContext';
import { SyncStatusCard } from '../electron/SyncStatusCard';
import { VinculacionNubeCard } from '../electron/VinculacionNubeCard';
import { CodecLogoHorizontal, CodecFavicon } from '../shared/CodecLogos';
import { PlanSummaryCard } from './PlanSummaryCard';
import { ConfiguracionTipoNegocio } from '../settings/ConfiguracionTipoNegocio';
import { ConfiguracionIntegraciones } from '../settings/ConfiguracionIntegraciones';
import { electronStore } from '../../lib/electronStore';
import { backupService } from '../../lib/backupService';
import {
  ModuloPOS,
  obtenerModulosGlobales,
  guardarModulosGlobales,
  guardarModulosCliente,
  EVENTO_MODULOS_GLOBALES_ACTUALIZADOS,
  esModuloPermitidoLicenciaDesarrollador,
  type ConfiguracionModulosGlobal,
} from '../../lib/permissions';

interface ConfiguracionEmpresa {
  // Datos de la empresa
  razonSocial: string;
  nombreComercial: string;
  /** Nombre que aparece en mensajes de WhatsApp enviados al cliente (opcional) */
  nombreEmpresaCliente: string;
  nit: string;
  digitoVerificacion: string;
  direccion: string;
  telefono: string;
  email: string;
  ciudad: string;
  departamento: string;
  logoUrl: string; // URL o base64 del logo
  
  // Configuración de impresora
  nombreImpresora: string;
  tamañoPapel: string;
  
  // Mensajes personalizados
  mensajeTirillaArriba: string; // Mensaje superior
  mensajeTirilla: string;        // Mensaje central (mantener compatibilidad)
  mensajeTirillaBajo: string;    // Mensaje inferior
  eslogan: string;
  
  // Configuración de IVA
  ivaHabilitado: boolean;
  porcentajeIVA: number;
  regimenFiscal: 'simplificado' | 'comun' | 'gran_contribuyente';
  
  // Facturación Electrónica
  facturacionElectronicaHabilitada: boolean;
  prefijoFactura: string;
  consecutivoInicial: number;
  tipoDocumento: 'factura' | 'factura_contingencia' | 'nota_debito' | 'nota_credito';
  claveResolucionDIAN: string;
  fechaResolucionDIAN: string;
  rangoAutorizadoDesde: number;
  rangoAutorizadoHasta: number;
  endpointApiUrl: string;
  apiKey: string;
  apiSecret: string;
  ecosistemaFacturacionActivo: boolean;
}

const WORKSPACE_MODULE_OPTIONS: Array<{ id: ModuloPOS; nombre: string; descripcion: string }> = [
  { id: ModuloPOS.PUNTO_DE_VENTA, nombre: 'Punto de Venta', descripcion: 'Cobro principal y flujo de caja.' },
  { id: ModuloPOS.PANADERIA_ONCES, nombre: 'Panadería y Onces', descripcion: 'Recetas, mermas y producción.' },
  { id: ModuloPOS.PRODUCTOS, nombre: 'Inventario', descripcion: 'Productos, stock y costos.' },
  { id: ModuloPOS.DASHBOARD, nombre: 'Dashboard', descripcion: 'Métricas estratégicas del negocio.' },
  { id: ModuloPOS.VENTAS_HISTORIAL, nombre: 'Ventas', descripcion: 'Historial y trazabilidad comercial.' },
  { id: ModuloPOS.DEVOLUCIONES, nombre: 'Devoluciones', descripcion: 'Cambios y devoluciones de ventas.' },
  { id: ModuloPOS.CIERRE_CAJA, nombre: 'Cierre de Caja', descripcion: 'Apertura, arqueo y cierre diario.' },
  { id: ModuloPOS.REPORTES, nombre: 'Reportes', descripcion: 'Exportes y análisis operativos.' },
  { id: ModuloPOS.GASTOS, nombre: 'Gastos', descripcion: 'Registro de egresos y conceptos.' },
  { id: ModuloPOS.DISPOSITIVOS, nombre: 'Dispositivos', descripcion: 'Gestión de hardware conectado.' },
  { id: ModuloPOS.USUARIOS, nombre: 'Personal', descripcion: 'Gestión de usuarios y equipo.' },
  { id: ModuloPOS.ALERTAS_STOCK, nombre: 'Alertas', descripcion: 'Notificaciones por stock crítico.' },
  { id: ModuloPOS.CODIGOS_BARRAS, nombre: 'Códigos de Barras', descripcion: 'Etiquetas y códigos de producto.' },
  { id: ModuloPOS.FIDELIZACION, nombre: 'Fidelización', descripcion: 'Programa de recompensas.' },
  { id: ModuloPOS.PROVEEDORES, nombre: 'Proveedores', descripcion: 'Compras y seguimiento de abastecimiento.' },
  { id: ModuloPOS.PROMOCIONES, nombre: 'Promociones', descripcion: 'Campañas y descuentos activos.' },
  { id: ModuloPOS.MULTITIENDA, nombre: 'Multi-Tienda', descripcion: 'Administración de sucursales.' },
  { id: ModuloPOS.INTEGRACIONES, nombre: 'Integraciones', descripcion: 'Conexiones con servicios externos.' },
  { id: ModuloPOS.TALLER_REPARACIONES, nombre: 'Taller de Reparaciones', descripcion: 'Órdenes y soporte técnico.' },
  { id: ModuloPOS.CODEC_VERIFY, nombre: 'Codec Verify', descripcion: 'Verificación avanzada y seguridad.' },
  { id: ModuloPOS.MONITOREO_TERMINALES, nombre: 'Monitoreo de Terminales', descripcion: 'Estado de terminales en red local.' },
];

// Componente de Sección Desplegable
interface AccordionSectionProps {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  darkMode: boolean;
  gradient?: string;
  borderColor?: string;
}

function AccordionSection({ 
  id, 
  title, 
  description, 
  icon, 
  isOpen, 
  onToggle, 
  children, 
  darkMode,
  gradient = 'from-slate-800 to-slate-900',
  borderColor = 'border-slate-700'
}: AccordionSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className={`shadow-xl border ${
        darkMode 
          ? `bg-gradient-to-br ${gradient} ${borderColor}` 
          : 'bg-white border-gray-200'
      }`}>
        <CardHeader 
          className="cursor-pointer hover:bg-opacity-80 transition-all"
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {icon}
              <div>
                <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {title}
                </CardTitle>
                <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                  {description}
                </CardDescription>
              </div>
            </div>
            
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className={`p-2 rounded-lg ${
                darkMode 
                  ? 'hover:bg-slate-700' 
                  : 'hover:bg-gray-100'
              }`}
            >
              <ChevronDown className={`w-5 h-5 ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`} />
            </motion.div>
          </div>
        </CardHeader>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <CardContent className="pt-0">
                {children}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export default function ConfiguracionPage() {
  const { darkMode } = usePOS();
  const { esSuperUsuario, usuarioActual } = useAuth();
  const { licenseInfo, machineId, isLoadingMachineId } = useLicense();
  const [saving, setSaving] = useState(false);
  const [reseteandoSistema, setReseteandoSistema] = useState(false);
  const [descargandoBackup, setDescargandoBackup] = useState(false);
  const [restaurandoArchivo, setRestaurandoArchivo] = useState(false);
  const [backupDiarioHabilitado, setBackupDiarioHabilitadoState] = useState(() => backupService.isBackupDiarioHabilitado());
  const inputArchivoBackupRef = useRef<HTMLInputElement>(null);
  const inputConfigClienteRef = useRef<HTMLInputElement>(null);
  const [importandoConfigCliente, setImportandoConfigCliente] = useState(false);
  const [reiniciandoApp, setReiniciandoApp] = useState(false);
  const [reparandoEmergencia, setReparandoEmergencia] = useState(false);
  const [conectandoFacturacion, setConectandoFacturacion] = useState(false);
  const [modulosGlobalesConfig, setModulosGlobalesConfig] = useState<ConfiguracionModulosGlobal>(() => obtenerModulosGlobales());
  const [showConfirmForceGlobalModules, setShowConfirmForceGlobalModules] = useState(false);
  
  // Estados para controlar secciones desplegables
  const [sectionsOpen, setSectionsOpen] = useState({
    informacionBasica: true,
    tipoNegocio: false,
    mensajes: false,
    machineId: false,
    iva: false,
    margenAutomatico: false,
    workspaceModules: false,
    facturacionElectronica: false,
    integraciones: false,
    plan: false,
    respaldoDatos: false,
    reseteoSistema: false,
    sincronizacionNube: false,
  });

  const [config, setConfig] = useState<ConfiguracionEmpresa>(() => {
    const saved = localStorage.getItem('codec_pos_config');
    return saved ? JSON.parse(saved) : {
      razonSocial: '',
      nombreComercial: '',
      nombreEmpresaCliente: '',
      nit: '',
      digitoVerificacion: '',
      direccion: '',
      telefono: '',
      email: '',
      ciudad: '',
      departamento: '',
      logoUrl: '', // URL o base64 del logo
      nombreImpresora: 'POS-58',
      tamañoPapel: '58mm',
      mensajeTirillaArriba: '',
      mensajeTirilla: '¡Gracias por su compra!',
      mensajeTirillaBajo: '¡Vuelva Pronto!',
      eslogan: 'Tu tienda de confianza',
      ivaHabilitado: false, // 🆕 DESACTIVADO POR DEFECTO
      porcentajeIVA: 19,
      regimenFiscal: 'simplificado',
      // Facturación Electrónica
      facturacionElectronicaHabilitada: false,
      prefijoFactura: 'FE',
      consecutivoInicial: 1,
      tipoDocumento: 'factura',
      claveResolucionDIAN: '',
      fechaResolucionDIAN: '',
      rangoAutorizadoDesde: 1,
      rangoAutorizadoHasta: 5000,
      endpointApiUrl: '',
      apiKey: '',
      apiSecret: '',
      ecosistemaFacturacionActivo: false,
    };
  });

  // 💰 NUEVO: Estado para Margen de Ganancia Automático
  const [margenConfig, setMargenConfig] = useState(() => {
    const saved = localStorage.getItem('pos-margen-automatico-config');
    return saved ? JSON.parse(saved) : {
      activo: false,
      porcentaje: 30
    };
  });

  const [modulosWorkspaceDirty, setModulosWorkspaceDirty] = useState(false);

  const handleMargenChange = (field: 'activo' | 'porcentaje', value: boolean | number) => {
    const newConfig = { ...margenConfig, [field]: value };
    setMargenConfig(newConfig);
    localStorage.setItem('pos-margen-automatico-config', JSON.stringify(newConfig));
    
    if (field === 'activo') {
      toast.success(
        value ? '✅ Margen automático activado' : '⚪ Margen automático desactivado',
        { description: value ? 'Los precios se calcularán automáticamente' : 'Podrás ingresar precios manualmente' }
      );
    }
  };

  const handleChange = (field: keyof ConfiguracionEmpresa, value: string | boolean | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP, etc.)');
      return;
    }

    const maxSizeMB = 5;
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`El archivo es muy grande. Máximo permitido: ${maxSizeMB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || '');
      handleChange('logoUrl', base64);
      toast.success('Logo cargado correctamente');
    };
    reader.onerror = () => {
      toast.error('No se pudo leer la imagen seleccionada');
    };
    reader.readAsDataURL(file);

    event.target.value = '';
  };

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    const syncConfigModulos = () => {
      if (!modulosWorkspaceDirty) {
        setModulosGlobalesConfig(obtenerModulosGlobales());
      }
    };

    window.addEventListener(EVENTO_MODULOS_GLOBALES_ACTUALIZADOS, syncConfigModulos);
    window.addEventListener('storage', syncConfigModulos);

    return () => {
      window.removeEventListener(EVENTO_MODULOS_GLOBALES_ACTUALIZADOS, syncConfigModulos);
      window.removeEventListener('storage', syncConfigModulos);
    };
  }, [modulosWorkspaceDirty]);

  const modulosWorkspaceDisponibles = useMemo(
    () => WORKSPACE_MODULE_OPTIONS.filter((modulo) => esModuloPermitidoLicenciaDesarrollador(modulo.id)),
    [modulosGlobalesConfig.ultimaActualizacion],
  );

  const handleToggleModuloWorkspace = (moduloId: ModuloPOS) => {
    if (!esModuloPermitidoLicenciaDesarrollador(moduloId)) {
      toast.error('Este módulo está restringido por licencia del desarrollador.');
      return;
    }

    const yaActivo = modulosGlobalesConfig.modulosActivos.includes(moduloId);
    const modulosActivos = yaActivo
      ? modulosGlobalesConfig.modulosActivos.filter((id) => id !== moduloId)
      : [...modulosGlobalesConfig.modulosActivos, moduloId];

    const nextConfig: ConfiguracionModulosGlobal = {
      ...modulosGlobalesConfig,
      modulosActivos,
    };

    setModulosGlobalesConfig(nextConfig);
    setModulosWorkspaceDirty(true);
  };

  const setForceGlobalModules = (value: boolean) => {
    const nextConfig: ConfiguracionModulosGlobal = {
      ...modulosGlobalesConfig,
      forceGlobalModules: value,
    };

    setModulosGlobalesConfig(nextConfig);
    setModulosWorkspaceDirty(true);
  };

  const handleSave = () => {
    setSaving(true);
    
    // Validaciones básicas
    if (!config.nombreComercial.trim()) {
      toast.error('El nombre comercial es requerido');
      setSaving(false);
      return;
    }

    if (!config.nit.trim()) {
      toast.error('El NIT es requerido');
      setSaving(false);
      return;
    }

    if (config.nit.trim().length < 6 || !/^\d+$/.test(config.nit.trim())) {
      toast.error('El NIT debe contener solo dígitos (mínimo 6)');
      setSaving(false);
      return;
    }

    if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email.trim())) {
      toast.error('El correo electrónico no tiene un formato válido');
      setSaving(false);
      return;
    }

    if (config.telefono && !/^[\d\s\-+()]{7,15}$/.test(config.telefono.trim())) {
      toast.error('El teléfono debe tener entre 7 y 15 dígitos');
      setSaving(false);
      return;
    }

    try {
      // Guardar en localStorage
      localStorage.setItem('codec_pos_config', JSON.stringify(config));
      guardarModulosGlobales(modulosGlobalesConfig);
      setModulosWorkspaceDirty(false);
      
      toast.success('¡Configuración guardada exitosamente!', {
        description: 'Los cambios se han aplicado correctamente'
      });
    } catch (error) {
      toast.error('Error al guardar la configuración');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarYConectarFacturacion = async () => {
    if (!config.endpointApiUrl.trim() || !config.apiKey.trim()) {
      toast.error('Debes ingresar ENDPOINT_API_URL y API_KEY/TOKEN');
      return;
    }

    setConectandoFacturacion(true);
    try {
      const response = await fetch(config.endpointApiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey.trim()}`,
          'x-api-key': config.apiKey.trim(),
          'x-api-secret': config.apiSecret.trim(),
        },
        body: JSON.stringify({ type: 'connection_test', source: 'codec_pos' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const nuevaConfig = {
        ...config,
        ecosistemaFacturacionActivo: true,
        facturacionElectronicaHabilitada: true,
      };
      setConfig(nuevaConfig);
      localStorage.setItem('codec_pos_config', JSON.stringify(nuevaConfig));
      window.dispatchEvent(new Event('codec-fe-updated'));

      toast.success('Conexión exitosa. Ecosistema FE activado globalmente.');
    } catch (error) {
      const nuevaConfig = {
        ...config,
        ecosistemaFacturacionActivo: false,
      };
      setConfig(nuevaConfig);
      localStorage.setItem('codec_pos_config', JSON.stringify(nuevaConfig));
      toast.error('No se pudo conectar con el proveedor. Verifica endpoint/credenciales.');
      console.error(error);
    } finally {
      setConectandoFacturacion(false);
    }
  };

  const handleDescargarBackup = async () => {
    setDescargandoBackup(true);
    try {
      const ok = await backupService.descargarBackupArchivo();
      if (ok) {
        toast.success('Backup descargado correctamente', {
          description: 'Guarda este archivo en un USB, la nube o donde prefieras. Si algo pasa, solo súbelo para restaurar todo.',
        });
      } else {
        toast.error('No se pudo generar el backup');
      }
    } finally {
      setDescargandoBackup(false);
    }
  };

  const handleToggleBackupDiario = (habilitado: boolean) => {
    backupService.setBackupDiarioHabilitado(habilitado);
    setBackupDiarioHabilitadoState(habilitado);
    toast.success(habilitado
      ? 'Backup diario activado: se descargará un archivo automáticamente cada vez que abras el sistema por primera vez en el día'
      : 'Backup diario desactivado');
  };

  const handleArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!file) return;

    if (!confirm(
      `¿Restaurar el sistema desde "${file.name}"?\n\n` +
      `Esto REEMPLAZARÁ todos los productos, ventas y usuarios actuales por los del archivo. ` +
      `Esta acción no se puede deshacer.\n\n¿Continuar?`
    )) return;

    setRestaurandoArchivo(true);
    try {
      const resultado = await backupService.restaurarDesdeArchivo(file);
      if (resultado.exito) {
        toast.success('Sistema restaurado correctamente. Reiniciando...');
      } else {
        toast.error(resultado.error || 'No se pudo restaurar el backup');
        setRestaurandoArchivo(false);
      }
    } catch {
      setRestaurandoArchivo(false);
    }
  };

  /**
   * 🛡️ NUEVO: importa un archivo de configuración generado por el proveedor
   * desde su Panel de Administración ("Generar archivo de configuración").
   * No hay ninguna nube conectando esa máquina con esta — el archivo es el
   * único puente. Aplica localmente los módulos/licencia que el proveedor
   * haya definido para ESTA cuenta, validando primero que el archivo
   * corresponda al usuario que tiene la sesión abierta en este equipo.
   */
  const handleArchivoConfigClienteSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportandoConfigCliente(true);
    try {
      const texto = await file.text();
      const payload = JSON.parse(texto);

      if (payload?.tipo !== 'codecpos_config_cliente' || !payload?.cliente?.usuario || !payload?.cliente?.id) {
        toast.error('Este archivo no es una configuración de cliente válida de CODEC POS');
        return;
      }

      const clienteImportado = payload.cliente;

      // 🛡️ Evita aplicar por error (o a propósito) la configuración de OTRA
      // cuenta en esta máquina.
      if (usuarioActual?.username && clienteImportado.usuario.toLowerCase() !== usuarioActual.username.toLowerCase()) {
        toast.error('Este archivo pertenece a otra cuenta', {
          description: `El archivo es para el usuario "${clienteImportado.usuario}", pero has iniciado sesión como "${usuarioActual.username}".`,
        });
        return;
      }

      // 1) codecpos_dev_clientes — upsert por id, sin tocar otros clientes
      //    que puedan existir localmente en esta máquina.
      try {
        const actuales = JSON.parse(localStorage.getItem('codecpos_dev_clientes') || '[]');
        const lista = Array.isArray(actuales) ? actuales : [];
        const idx = lista.findIndex((c: any) => c.id === clienteImportado.id);
        if (idx >= 0) lista[idx] = { ...lista[idx], ...clienteImportado };
        else lista.push(clienteImportado);
        localStorage.setItem('codecpos_dev_clientes', JSON.stringify(lista));
      } catch { /* no crítico */ }

      // 2) codecpos_usuarios / codec_pos_usuarios — misma lógica que
      //    sincronizarClienteEnUsuarios() del Panel de Administración,
      //    replicada aquí porque esta pantalla corre en la máquina del
      //    CLIENTE, no en la del proveedor.
      const localId = `cli_${clienteImportado.id}`;
      const usuarioAdmin = {
        id: localId,
        nombreCompleto: clienteImportado.nombreNegocio,
        cedula: clienteImportado.nit || '000000000',
        username: clienteImportado.usuario,
        password: clienteImportado.contraseña,
        rol: 'super_usuario',
        activo: clienteImportado.estado === 'ACTIVA' || (clienteImportado.duracion === 'VITALICIA' && clienteImportado.estado !== 'SUSPENDIDA'),
        fechaCreacion: new Date(clienteImportado.fechaActivacion || Date.now()).toISOString(),
        creadoPor: 'PANEL_DESARROLLADOR',
        permisos: {
          dashboard: true, ventas: true, productos: true, alertas: true,
          configuracion: true, usuarios: true, cierreCaja: true, reportes: true,
          gastos: true, codecVerify: true, devoluciones: true, empleados: true,
          multitienda: true, fidelizacion: true, panaderiaOnces: true,
        },
      };
      for (const key of ['codecpos_usuarios', 'codec_pos_usuarios']) {
        try {
          const actuales = JSON.parse(localStorage.getItem(key) || '[]');
          const lista = Array.isArray(actuales) ? actuales : [];
          const idx = lista.findIndex((u: any) => u.id === localId || (u.creadoPor === 'PANEL_DESARROLLADOR' && u.username === clienteImportado.usuario));
          if (idx >= 0) lista[idx] = usuarioAdmin; else lista.push(usuarioAdmin);
          localStorage.setItem(key, JSON.stringify(lista));
        } catch { /* no crítico */ }
      }

      // 3) Módulos + permisos — vía guardarModulosCliente(), la MISMA función
      //    que usa el Panel de Administración: además de guardar, activa lo
      //    que haga falta a nivel global y avisa al sidebar de esta terminal
      //    (evento 'codecpos:usuario-cambio') para que se refresque sin
      //    necesidad de reiniciar la app.
      if (Array.isArray(payload.modulosActivos)) {
        guardarModulosCliente({
          clienteId: clienteImportado.id,
          modulosActivos: payload.modulosActivos,
          modulosDesactivados: payload.modulosDesactivados || [],
          ultimaActualizacion: new Date().toISOString(),
        });
      }

      window.dispatchEvent(new CustomEvent('codecpos:usuarios-sincronizados'));

      toast.success('Configuración importada correctamente', {
        description: 'Los módulos y datos de tu cuenta se actualizaron en este equipo.',
      });
    } catch (error) {
      console.error('Error importando configuración de cliente:', error);
      toast.error('No se pudo leer el archivo. Verifica que sea el archivo enviado por tu proveedor.');
    } finally {
      setImportandoConfigCliente(false);
    }
  };

  /**
   * Reinicio limpio: no toca ningún dato, solo cierra y vuelve a abrir la
   * app. Pensado para que el cliente lo use por su cuenta cuando el sistema
   * se sienta lento o trabado, sin tener que llamar a soporte.
   */
  const handleReiniciarSistema = async () => {
    if (!confirm('Esto cerrará y volverá a abrir CODEC POS. No se pierde ningún dato. ¿Continuar?')) return;
    setReiniciandoApp(true);
    try {
      if (window.electron?.relaunch) {
        await window.electron.relaunch();
      } else {
        window.location.reload();
      }
    } finally {
      setReiniciandoApp(false);
    }
  };

  /**
   * Recuperación de emergencia con un clic: usa los respaldos automáticos
   * "blindados" que el sistema ya viene generando solo en segundo plano
   * (cada hora, al cerrar, y tras cada cierre de caja) — el cliente NO
   * necesita tener descargado ningún archivo propio para usar esto. Prueba
   * el respaldo más reciente y, si está dañado, retrocede automáticamente
   * al siguiente más antiguo. Pensado para cuando el desarrollador no está
   * disponible y el negocio necesita seguir operando ya mismo.
   */
  const handleRepararEmergencia = async () => {
    if (!confirm(
      '¿Reparar el sistema automáticamente?\n\n' +
      'Esto reemplazará los datos actuales por el respaldo automático más reciente disponible ' +
      '(el sistema los genera solo, sin que tengas que hacer nada). Úsalo solo si el sistema no ' +
      'está funcionando bien.\n\n¿Continuar?'
    )) return;

    setReparandoEmergencia(true);
    try {
      const resultado = await backupService.repairDatabase();
      if (resultado.success) {
        toast.success(resultado.restaurado
          ? 'Sistema reparado y restaurado correctamente. Reiniciando...'
          : 'Reparación completada. Reiniciando...');
      } else {
        toast.error(`No se pudo reparar: ${resultado.error || 'contacta a soporte técnico'}`);
      }
    } finally {
      setReparandoEmergencia(false);
    }
  };

  const handleResetSistemaEnCero = async () => {
    if (!esSuperUsuario) {
      toast.error('Solo el administrador puede ejecutar esta acción');
      return;
    }

    const primeraAlerta = window.confirm(
      '⚠️ ADVERTENCIA 1/2\n\nEsta acción reiniciará el sistema en 0 y eliminará datos operativos (ventas, productos, reportes y configuraciones).\n\n¿Deseas continuar?'
    );

    if (!primeraAlerta) {
      return;
    }

    const segundaAlerta = window.confirm(
      '⚠️ ADVERTENCIA FINAL 2/2\n\nConfirmas bajo tu consentimiento que deseas dejar el sistema en 0.\n\nEsta acción es irreversible.\n\n¿Ejecutar reseteo total ahora?'
    );

    if (!segundaAlerta) {
      return;
    }

    setReseteandoSistema(true);
    try {
      const resultado = await electronStore.resetearSistemaEnCero();
      if (resultado.exito) {
        toast.success(resultado.mensaje, {
          description: 'La aplicación se recargará para aplicar el estado inicial.'
        });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        toast.error(resultado.mensaje);
      }
    } catch (error) {
      toast.error('Ocurrió un error inesperado al resetear el sistema');
      console.error(error);
    } finally {
      setReseteandoSistema(false);
    }
  };

  return (
    <div className={`h-full overflow-y-auto p-6 ${darkMode ? 'bg-transparent' : 'bg-gray-50'}`}>
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Configuración del Sistema
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                CODEC POS v2.0 - Personaliza tu punto de venta
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 font-bold shadow-lg"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </motion.div>

        {/* 1️⃣ INFORMACIÓN BÁSICA */}
        <AccordionSection
          id="informacionBasica"
          title="Información Básica"
          description="Datos generales de tu empresa que aparecerán en facturas"
          icon={<Building className="w-6 h-6 text-blue-500" />}
          isOpen={sectionsOpen.informacionBasica}
          onToggle={() => toggleSection('informacionBasica')}
          darkMode={darkMode}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="razonSocial" className={darkMode ? 'text-gray-300' : ''}>
                Razón Social
              </Label>
              <Input
                id="razonSocial"
                value={config.razonSocial}
                onChange={(e) => handleChange('razonSocial', e.target.value)}
                placeholder="Ej: Mi Negocio Comercial S.A.S"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombreComercial" className={darkMode ? 'text-gray-300' : ''}>
                Nombre Comercial *
              </Label>
              <Input
                id="nombreComercial"
                value={config.nombreComercial}
                onChange={(e) => handleChange('nombreComercial', e.target.value)}
                placeholder="Ej: Mi Negocio"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nombreEmpresaCliente" className={darkMode ? 'text-gray-300' : ''}>
                Nombre en mensajes de WhatsApp <span className={`text-xs font-normal ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>(opcional)</span>
              </Label>
              <Input
                id="nombreEmpresaCliente"
                value={config.nombreEmpresaCliente}
                onChange={(e) => handleChange('nombreEmpresaCliente', e.target.value)}
                placeholder="Ej: TECHNOSTAR"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Nombre que aparece en los mensajes enviados a los clientes. Si se deja vacío, se usa el nombre por defecto del sistema.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nit" className={darkMode ? 'text-gray-300' : ''}>
                NIT *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="nit"
                  value={config.nit}
                  onChange={(e) => handleChange('nit', e.target.value.replace(/\D/g, ''))}
                  placeholder="900123456"
                  maxLength={10}
                  className={`flex-1 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                  required
                />
                <Input
                  value={config.digitoVerificacion}
                  onChange={(e) => handleChange('digitoVerificacion', e.target.value.replace(/\D/g, ''))}
                  placeholder="DV"
                  maxLength={1}
                  className={`w-16 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ciudad" className={darkMode ? 'text-gray-300' : ''}>
                Ciudad
              </Label>
              <Input
                id="ciudad"
                value={config.ciudad}
                onChange={(e) => handleChange('ciudad', e.target.value)}
                placeholder="Ej: Medellín"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="direccion" className={darkMode ? 'text-gray-300' : ''}>
                <MapPin className="w-4 h-4 inline mr-1" />
                Dirección
              </Label>
              <Input
                id="direccion"
                value={config.direccion}
                onChange={(e) => handleChange('direccion', e.target.value)}
                placeholder="Calle 123 #45-67"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono" className={darkMode ? 'text-gray-300' : ''}>
                <Phone className="w-4 h-4 inline mr-1" />
                Teléfono
              </Label>
              <Input
                id="telefono"
                value={config.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)}
                placeholder="(604) 123 4567"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className={darkMode ? 'text-gray-300' : ''}>
                <Mail className="w-4 h-4 inline mr-1" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={config.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="contacto@minegocio.com"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className={darkMode ? 'text-gray-300' : ''}>
                <ImageIcon className="w-4 h-4 inline mr-1" />
                Logo de la Empresa
              </Label>
              <div className={`text-xs mb-2 px-3 py-2 rounded-lg ${
                darkMode ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                ℹ️ Tu logo aparecerá en: <strong>Panel POS</strong>, <strong>Dashboard</strong> y <strong>Facturas Impresas</strong>
              </div>
              <div className={`border-2 border-dashed rounded-lg text-center transition-all ${ 
                darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-gray-300 bg-gray-50'
              }`}>
                <input
                  id="logo-upload-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />

                {config.logoUrl ? (
                  // Preview del logo cargado
                  <div className="p-6">
                    <div className="relative inline-block">
                      {/* Contenedor del logo con fondo */}
                      <div className={`relative rounded-2xl overflow-hidden shadow-xl ${
                        darkMode ? 'bg-white' : 'bg-gradient-to-br from-gray-50 to-gray-100'
                      }`} style={{ width: '200px', height: '200px' }}>
                        <img 
                          src={config.logoUrl} 
                          alt="Logo de la empresa"
                          className="w-full h-full object-contain p-4"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      
                      {/* Botones de acción */}
                      <div className="absolute -top-2 -right-2 flex gap-2">
                        <label
                          htmlFor="logo-upload-input"
                          className="w-10 h-10 cursor-pointer bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
                          title="Cambiar logo"
                        >
                          <Upload className="w-4 h-4" />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('¿Estás seguro de eliminar el logo?')) {
                              handleChange('logoUrl', '');
                              toast.success('Logo eliminado');
                            }
                          }}
                          className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
                          title="Eliminar logo"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className={`mt-4 space-y-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <p className="text-xs font-semibold text-green-500 flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" />
                        Logo configurado exitosamente
                      </p>
                      <p className="text-xs">
                        Visible en: Panel POS · Dashboard · Facturas
                      </p>
                    </div>
                  </div>
                ) : (
                  // Carga simple de logo
                  <div className="p-8 text-center">
                    <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center ${
                      darkMode ? 'shadow-lg shadow-blue-500/20' : 'shadow-xl shadow-blue-500/30'
                    }`}>
                      <Upload className="w-10 h-10 text-white" />
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Subir Logo de la Empresa
                    </h3>
                    <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Selecciona una imagen y se aplicará automáticamente en todo el sistema
                    </p>
                    <label htmlFor="logo-upload-input">
                      <Button
                        type="button"
                        asChild
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                      >
                        <span>
                          <Upload className="w-4 h-4 mr-2 inline" />
                          Seleccionar Logo
                        </span>
                      </Button>
                    </label>
                    <p className={`text-xs mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Formatos: PNG, JPG, WEBP • Tamaño máximo: 5MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 2️⃣ TIPO DE NEGOCIO */}
        <AccordionSection
          id="tipoNegocio"
          title="Tipo de Negocio"
          description="Activa funcionalidades específicas para tu tipo de negocio"
          icon={<Store className="w-6 h-6 text-rose-500" />}
          isOpen={sectionsOpen.tipoNegocio}
          onToggle={() => toggleSection('tipoNegocio')}
          darkMode={darkMode}
        >
          <ConfiguracionTipoNegocio />
        </AccordionSection>

        {/* 3️⃣ MENSAJES PERSONALIZADOS */}
        <AccordionSection
          id="mensajes"
          title="Mensajes Personalizados"
          description="Textos que aparecerán en las tirillas de venta"
          icon={<FileText className="w-6 h-6 text-indigo-500" />}
          isOpen={sectionsOpen.mensajes}
          onToggle={() => toggleSection('mensajes')}
          darkMode={darkMode}
        >
          <div className="space-y-4">
            {/* Mensaje Superior de Tirilla */}
            <div className="space-y-2">
              <Label htmlFor="mensajeTirillaArriba" className={darkMode ? 'text-gray-300' : ''}>
                <Receipt className="w-4 h-4 inline mr-2" />
                Mensaje Superior de la Tirilla
              </Label>
              <Input
                id="mensajeTirillaArriba"
                value={config.mensajeTirillaArriba || ''}
                onChange={(e) => handleChange('mensajeTirillaArriba', e.target.value)}
                placeholder="¡Bienvenido a nuestra tienda!"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Este mensaje aparecerá en la parte superior de cada factura
              </p>
            </div>

            {/* Eslogan */}
            <div className="space-y-2">
              <Label htmlFor="eslogan" className={darkMode ? 'text-gray-300' : ''}>
                <Sparkles className="w-4 h-4 inline mr-2" />
                Eslogan de tu Negocio
              </Label>
              <Input
                id="eslogan"
                value={config.eslogan}
                onChange={(e) => handleChange('eslogan', e.target.value)}
                placeholder="Tu tienda de confianza"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
            </div>

            {/* Mensaje Inferior de Tirilla */}
            <div className="space-y-2">
              <Label htmlFor="mensajeTirillaBajo" className={darkMode ? 'text-gray-300' : ''}>
                <Receipt className="w-4 h-4 inline mr-2" />
                Mensaje Inferior de la Tirilla
              </Label>
              <Input
                id="mensajeTirillaBajo"
                value={config.mensajeTirillaBajo || ''}
                onChange={(e) => handleChange('mensajeTirillaBajo', e.target.value)}
                placeholder="¡Gracias por su compra! Vuelva pronto"
                className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
              />
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Este mensaje aparecerá en la parte inferior de cada factura
              </p>
            </div>

            {/* Vista Previa */}
            <div className={`p-6 rounded-xl border-2 ${
              darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <h4 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Vista Previa de la Tirilla
              </h4>
              <div className="bg-white text-black p-4 rounded-lg font-mono text-xs space-y-2 max-w-sm mx-auto border-2 border-dashed border-gray-300">
                {config.mensajeTirillaArriba && (
                  <div className="text-center font-bold border-b pb-2 border-gray-300">
                    {config.mensajeTirillaArriba}
                  </div>
                )}
                <div className="text-center py-4 text-gray-500">
                  [Contenido de la factura]
                </div>
                {config.eslogan && (
                  <div className="text-center italic text-xs text-gray-600">
                    {config.eslogan}
                  </div>
                )}
                {config.mensajeTirillaBajo && (
                  <div className="text-center font-bold border-t pt-2 border-gray-300">
                    {config.mensajeTirillaBajo}
                  </div>
                )}
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 4️⃣ MACHINE ID Y LICENCIAS */}
        <AccordionSection
          id="machineId"
          title="Machine ID y Licencias"
          description="Identificador único de tu computadora para activar la licencia"
          icon={<Key className="w-6 h-6 text-cyan-500" />}
          isOpen={sectionsOpen.machineId}
          onToggle={() => toggleSection('machineId')}
          darkMode={darkMode}
        >
          <div className="space-y-4">
            {/* Advertencia de permisos de administrador */}
            {machineId.startsWith('CODEC-') && (
              <div className={`p-4 rounded-xl border-2 ${
                darkMode
                  ? 'bg-red-900/20 border-red-700/30'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-red-400' : 'text-red-900'}`}>
                      ⚠️ MachineID Temporal - Se requieren permisos de administrador
                    </h4>
                    <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      La aplicación está mostrando un <span className="font-bold">MachineID temporal</span> porque no se pudo acceder al UUID real del hardware. 
                      Para obtener tu UUID único y permanente, debes ejecutar CODEC POS con permisos de administrador.
                    </p>
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                      <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        📋 Cómo ejecutar con permisos de administrador:
                      </p>
                      <ol className={`text-xs space-y-1 list-decimal list-inside ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <li>Cierra completamente CODEC POS</li>
                        <li>Busca el icono de CODEC POS en tu escritorio o menú inicio</li>
                        <li>Click derecho → <span className="font-bold">"Ejecutar como administrador"</span></li>
                        <li>Acepta el mensaje de control de cuentas de usuario (UAC)</li>
                        <li>Vuelve a esta sección para ver tu UUID real</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Explicación del MachineID */}
            <div className={`p-4 rounded-xl border-2 ${
              darkMode
                ? 'bg-blue-900/20 border-blue-700/30'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    ¿Qué es el MachineID?
                  </h4>
                  <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    El <span className="font-bold">MachineID</span> es el identificador único de tu computadora. 
                    Funciona como la "huella digital" de este equipo y se usa para vincular tu licencia de CODEC POS 
                    a esta mquina específica, protegiendo así tu inversión contra piratería.
                  </p>
                </div>
              </div>
            </div>

            {/* MachineID Display */}
            <div className="space-y-3">
              <Label className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Tu MachineID Único:
              </Label>
              
              <div className={`relative p-6 rounded-xl border-2 ${
                darkMode
                  ? 'bg-slate-800 border-cyan-600/50'
                  : 'bg-white border-cyan-400'
              } shadow-lg`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      IDENTIFICADOR DE MÁQUINA
                    </p>
                    <p className={`text-xl font-bold font-mono tracking-wider ${
                      darkMode ? 'text-cyan-400' : 'text-cyan-600'
                    }`}>
                      {isLoadingMachineId ? 'Cargando...' : machineId}
                    </p>
                  </div>
                  
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(machineId);
                      toast.success('MachineID copiado al portapapeles', {
                        description: 'Envía este código al desarrollador para activar tu licencia'
                      });
                    }}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 font-bold px-6"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Copiar MachineID
                  </Button>
                </div>
              </div>
            </div>

            {/* Instrucciones */}
            <div className={`p-4 rounded-xl ${
              darkMode
                ? 'bg-amber-900/20 border-2 border-amber-700/30'
                : 'bg-amber-50 border-2 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-amber-400' : 'text-amber-900'}`}>
                    📋 ¿Cómo activar tu licencia?
                  </h4>
                  <ol className={`text-sm space-y-1 list-decimal list-inside ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <li>Copia tu <span className="font-bold">MachineID</span> haciendo clic en el botón de arriba</li>
                    <li>Envía el código al desarrollador por WhatsApp: <a href="https://wa.me/573238646844" target="_blank" rel="noopener noreferrer" className="font-bold text-green-500 hover:underline">+57 323 864 6844</a></li>
                    <li>El desarrollador generará tu clave de activación vinculada a este equipo</li>
                    <li>Ingresa la clave que te proporcionen en la sección de licencias</li>
                    <li>¡Listo! Tu licencia quedará activada solo para esta computadora</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Información adicional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg ${
                darkMode ? 'bg-slate-800/50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-5 h-5 text-green-500" />
                  <h5 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Protección Anti-Piratería
                  </h5>
                </div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Tu licencia solo funciona en esta computadora específica, protegiendo tu inversión
                </p>
              </div>

              <div className={`p-4 rounded-lg ${
                darkMode ? 'bg-slate-800/50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-blue-500" />
                  <h5 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Seguridad Garantizada
                  </h5>
                </div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Si cambias de computadora, contacta al desarrollador para transferir tu licencia
                </p>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 5️⃣ MARGEN DE GANANCIA AUTOMÁTICO */}
        <AccordionSection
          id="margenAutomatico"
          title="Margen de Ganancia Automático"
          description="Calcula automáticamente el precio de venta de tus productos"
          icon={<TrendingUp className="w-6 h-6 text-emerald-500" />}
          isOpen={sectionsOpen.margenAutomatico}
          onToggle={() => toggleSection('margenAutomatico')}
          darkMode={darkMode}
          gradient="from-emerald-900/20 to-green-900/20"
          borderColor="border-emerald-700/40"
        >
          <div className="space-y-6">
            {/* Switch para activar/desactivar Margen Automático */}
            <div className={`p-4 rounded-xl border-2 ${
              margenConfig.activo
                ? darkMode
                  ? 'bg-emerald-900/20 border-emerald-700/50'
                  : 'bg-emerald-50 border-emerald-300'
                : darkMode
                ? 'bg-slate-700/30 border-slate-600'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Cálculo Automático de Precios
                  </Label>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {margenConfig.activo 
                      ? '✅ Los precios de venta se calcularán automáticamente basándose en tu margen de ganancia' 
                      : '⚪ Los precios de venta se ingresarán manualmente para cada producto'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleMargenChange('activo', !margenConfig.activo)}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                    margenConfig.activo 
                      ? 'bg-emerald-600' 
                      : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      margenConfig.activo ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Configuración de Margen (solo visible si está activado) */}
            {margenConfig.activo && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="porcentajeMargen" className={`text-base font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Porcentaje de Ganancia (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="porcentajeMargen"
                      type="number"
                      min="0"
                      max="1000"
                      step="1"
                      value={margenConfig.porcentaje}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value >= 0) {
                          handleMargenChange('porcentaje', value);
                        }
                      }}
                      className={`pr-10 text-lg font-bold ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold ${
                      darkMode ? 'text-emerald-400' : 'text-emerald-600'
                    }`}>
                      %
                    </span>
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    💡 Ingresa el porcentaje de ganancia que deseas obtener sobre el costo de cada producto
                  </p>
                </div>

                {/* Ejemplo de Cálculo */}
                <div className={`p-5 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-600' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h4 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    🧮 Ejemplo de Cálculo Automático
                  </h4>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between items-center">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Costo del Producto:</span>
                      <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>$10,000</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        Margen ({margenConfig.porcentaje}%):
                      </span>
                      <span className={darkMode ? 'text-emerald-400' : 'text-emerald-600'}>
                        +${(10000 * (margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center pt-3 border-t-2 ${
                      darkMode ? 'border-emerald-600/30' : 'border-emerald-300'
                    }`}>
                      <span className={`font-bold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Precio de Venta:
                      </span>
                      <span className={`font-bold text-lg ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        ${(10000 * (1 + margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tabla de Ejemplos */}
                <div className={`p-5 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-emerald-900/10 border-emerald-700/30' 
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    📊 Tabla de Conversión Rápida
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b ${darkMode ? 'border-emerald-700/30' : 'border-emerald-300'}`}>
                          <th className={`text-left py-2 px-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Costo</th>
                          <th className={`text-left py-2 px-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Margen</th>
                          <th className={`text-left py-2 px-3 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>Precio Venta</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {[1000, 5000, 10000, 25000, 50000].map((costo) => (
                          <tr key={costo} className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                            <td className={`py-2 px-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              ${costo.toLocaleString('es-CO')}
                            </td>
                            <td className={`py-2 px-3 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              +${(costo * (margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                            </td>
                            <td className={`py-2 px-3 font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              ${(costo * (1 + margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Información sobre el Margen Automático */}
            <div className={`p-4 rounded-lg border ${
              darkMode 
                ? 'bg-blue-900/20 border-blue-700/30' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className={`font-semibold text-sm ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    ℹ️ ¿Cómo funciona?
                  </h4>
                  <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                    <li>• Cuando esté <span className="font-bold">activado</span>, al crear un producto solo ingresarás el <span className="font-bold">costo</span></li>
                    <li>• El sistema calculará automáticamente el <span className="font-bold">precio de venta</span> sumando tu margen de ganancia</li>
                    <li>• Puedes modificar el precio manualmente si necesitas un margen diferente para algún producto específico</li>
                    <li>• Esta configuración es <span className="font-bold">100% opcional</span> - puedes desactivarla cuando quieras</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 4️⃣ CONFIGURACIÓN DE IVA */}
        <AccordionSection
          id="iva"
          title="Configuración de IVA"
          description="Configura el IVA según los requisitos de tu negocio"
          icon={<DollarSign className="w-6 h-6 text-green-500" />}
          isOpen={sectionsOpen.iva}
          onToggle={() => toggleSection('iva')}
          darkMode={darkMode}
          gradient="from-green-900/20 to-emerald-900/20"
          borderColor="border-green-700/40"
        >
          <div className="space-y-6">
            {/* Switch para habilitar/deshabilitar IVA */}
            <div className={`p-4 rounded-xl border-2 ${
              config.ivaHabilitado
                ? darkMode
                  ? 'bg-green-900/20 border-green-700/50'
                  : 'bg-green-50 border-green-300'
                : darkMode
                ? 'bg-slate-700/30 border-slate-600'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Facturación con IVA
                  </Label>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {config.ivaHabilitado 
                      ? '✅ El IVA se calculará y mostrará en todas las facturas' 
                      : '⚪ El IVA no se mostrará en las facturas'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleChange('ivaHabilitado', !config.ivaHabilitado)}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                    config.ivaHabilitado 
                      ? 'bg-green-600' 
                      : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.ivaHabilitado ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Configuración de IVA (solo visible si está habilitado) */}
            {config.ivaHabilitado && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Porcentaje de IVA */}
                <div className="space-y-2">
                  <Label htmlFor="porcentajeIVA" className={darkMode ? 'text-gray-300' : ''}>
                    Porcentaje de IVA (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="porcentajeIVA"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={config.porcentajeIVA}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value >= 0 && value <= 100) {
                          handleChange('porcentajeIVA', value);
                        }
                      }}
                      className={`pr-10 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold ${
                      darkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      %
                    </span>
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    💡 En Colombia el IVA general es del 19%
                  </p>
                </div>

                {/* Régimen Fiscal */}
                <div className="space-y-2">
                  <Label htmlFor="regimenFiscal" className={darkMode ? 'text-gray-300' : ''}>
                    Régimen Fiscal
                  </Label>
                  <select
                    id="regimenFiscal"
                    value={config.regimenFiscal}
                    onChange={(e) => handleChange('regimenFiscal', e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${
                      darkMode 
                        ? 'bg-slate-700 border-slate-600 text-white' 
                        : 'bg-white border-gray-300'
                    } focus:outline-none focus:ring-2 focus:ring-green-500`}
                  >
                    <option value="simplificado">Régimen Simplificado</option>
                    <option value="comun">Régimen Común</option>
                    <option value="gran_contribuyente">Gran Contribuyente</option>
                  </select>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    📋 Selecciona tu régimen tributario
                  </p>
                </div>
              </div>
            )}

            {/* Ejemplo de Cálculo */}
            {config.ivaHabilitado && (
              <div className={`p-4 rounded-xl border-2 ${
                darkMode 
                  ? 'bg-slate-800/50 border-slate-600' 
                  : 'bg-white border-gray-200'
              }`}>
                <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                  💰 Ejemplo de Cálculo con IVA
                </h4>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Subtotal:</span>
                    <span className={darkMode ? 'text-white' : 'text-gray-900'}>$100,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                      IVA ({config.porcentajeIVA}%):
                    </span>
                    <span className={darkMode ? 'text-green-400' : 'text-green-600'}>
                      ${(100000 * (config.porcentajeIVA / 100)).toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className={`flex justify-between pt-2 border-t ${
                    darkMode ? 'border-slate-600' : 'border-gray-300'
                  }`}>
                    <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Total:
                    </span>
                    <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      ${(100000 + (100000 * (config.porcentajeIVA / 100))).toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Información sobre el IVA */}
            <div className={`p-4 rounded-lg border ${
              darkMode 
                ? 'bg-blue-900/20 border-blue-700/30' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className={`font-semibold text-sm ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    ℹ️ Información Importante
                  </h4>
                  <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                    <li>• El IVA se calculará automáticamente en todas las ventas</li>
                    <li>• Se mostrará desglosado en las facturas y tirillas</li>
                    <li>• Los reportes incluirán el total de IVA recaudado</li>
                    <li>• Puedes activar o desactivar esta función en cualquier momento</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 6️⃣ FACTURACIÓN ELECTRÓNICA */}
        <AccordionSection
          id="facturacionElectronica"
          title="Facturación Electrónica"
          description="Configuración para integración con DIAN"
          icon={<Receipt className="w-6 h-6 text-orange-500" />}
          isOpen={sectionsOpen.facturacionElectronica}
          onToggle={() => toggleSection('facturacionElectronica')}
          darkMode={darkMode}
          gradient="from-orange-900/20 to-amber-900/20"
          borderColor="border-orange-700/40"
        >
          <div className="space-y-6">
            {/* Switch para habilitar/deshabilitar Facturación Electrónica */}
            <div className={`p-4 rounded-xl border-2 shadow-[inset_0_2px_8px_rgba(0,0,0,0.35),0_10px_30px_rgba(0,0,0,0.25)] ${
              config.facturacionElectronicaHabilitada
                ? darkMode
                  ? 'bg-orange-900 border-orange-500'
                  : 'bg-orange-50 border-orange-300'
                : darkMode
                ? 'bg-slate-800 border-slate-500'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Facturación Electrónica (DIAN)
                  </Label>
                  <p className={`text-base mt-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    {config.facturacionElectronicaHabilitada 
                      ? '✅ Sistema listo para generar facturas electrónicas válidas ante la DIAN' 
                      : '⚪ Facturación tradicional - Configura aquí para activar facturación electrónica'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleChange('facturacionElectronicaHabilitada', !config.facturacionElectronicaHabilitada)}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                    config.facturacionElectronicaHabilitada 
                      ? 'bg-orange-600' 
                      : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      config.facturacionElectronicaHabilitada ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Configuración de Facturación Electrónica (solo visible si está habilitada) */}
            {config.facturacionElectronicaHabilitada && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="endpointApiUrl" className={darkMode ? 'text-white text-lg font-bold' : 'text-lg font-bold'}>
                      ENDPOINT_API_URL *
                    </Label>
                    <Input
                      id="endpointApiUrl"
                      value={config.endpointApiUrl}
                      onChange={(e) => handleChange('endpointApiUrl', e.target.value)}
                      placeholder="https://api.proveedor.com/facturacion"
                      className={darkMode ? 'bg-slate-900 border-slate-400 text-white text-lg' : 'text-lg'}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiKey" className={darkMode ? 'text-white text-lg font-bold' : 'text-lg font-bold'}>
                      API_KEY / TOKEN *
                    </Label>
                    <Input
                      id="apiKey"
                      value={config.apiKey}
                      onChange={(e) => handleChange('apiKey', e.target.value)}
                      placeholder="pk_live_xxx / token_xxx"
                      className={darkMode ? 'bg-slate-900 border-slate-400 text-white text-lg' : 'text-lg'}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiSecret" className={darkMode ? 'text-white text-lg font-bold' : 'text-lg font-bold'}>
                      API_SECRET
                    </Label>
                    <Input
                      id="apiSecret"
                      value={config.apiSecret}
                      onChange={(e) => handleChange('apiSecret', e.target.value)}
                      placeholder="secret_xxx"
                      className={darkMode ? 'bg-slate-900 border-slate-400 text-white text-lg' : 'text-lg'}
                    />
                  </div>

                  {/* Prefijo de Factura */}
                  <div className="space-y-2">
                    <Label htmlFor="prefijoFactura" className={darkMode ? 'text-gray-300' : ''}>
                      Prefijo de Factura *
                    </Label>
                    <Input
                      id="prefijoFactura"
                      value={config.prefijoFactura}
                      onChange={(e) => handleChange('prefijoFactura', e.target.value.toUpperCase())}
                      placeholder="FE"
                      maxLength={4}
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white uppercase' : 'uppercase'}
                      required
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Ej: FE, FVTA, POS (máx 4 caracteres)
                    </p>
                  </div>

                  {/* Consecutivo Inicial */}
                  <div className="space-y-2">
                    <Label htmlFor="consecutivoInicial" className={darkMode ? 'text-gray-300' : ''}>
                      Consecutivo Inicial *
                    </Label>
                    <Input
                      id="consecutivoInicial"
                      type="number"
                      min="1"
                      value={config.consecutivoInicial}
                      onChange={(e) => handleChange('consecutivoInicial', parseInt(e.target.value) || 1)}
                      placeholder="1"
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                      required
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Número desde el cual comenzará la numeración
                    </p>
                  </div>

                  {/* Tipo de Documento */}
                  <div className="space-y-2">
                    <Label htmlFor="tipoDocumento" className={darkMode ? 'text-gray-300' : ''}>
                      Tipo de Documento *
                    </Label>
                    <select
                      id="tipoDocumento"
                      value={config.tipoDocumento}
                      onChange={(e) => handleChange('tipoDocumento', e.target.value)}
                      className={`w-full px-3 py-2 rounded-md border ${
                        darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-orange-500`}
                    >
                      <option value="factura">Factura Electrónica de Venta</option>
                      <option value="factura_contingencia">Factura de Contingencia</option>
                      <option value="nota_debito">Nota Débito</option>
                      <option value="nota_credito">Nota Crédito</option>
                    </select>
                  </div>

                  {/* Clave Técnica de Resolución DIAN */}
                  <div className="space-y-2">
                    <Label htmlFor="claveResolucionDIAN" className={darkMode ? 'text-gray-300' : ''}>
                      Clave Técnica DIAN
                    </Label>
                    <Input
                      id="claveResolucionDIAN"
                      value={config.claveResolucionDIAN}
                      onChange={(e) => handleChange('claveResolucionDIAN', e.target.value)}
                      placeholder="18764035000002XXX..."
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Clave técnica de tu resolución DIAN
                    </p>
                  </div>

                  {/* Fecha de Resolución DIAN */}
                  <div className="space-y-2">
                    <Label htmlFor="fechaResolucionDIAN" className={darkMode ? 'text-gray-300' : ''}>
                      Fecha Resolución DIAN
                    </Label>
                    <Input
                      id="fechaResolucionDIAN"
                      type="date"
                      value={config.fechaResolucionDIAN}
                      onChange={(e) => handleChange('fechaResolucionDIAN', e.target.value)}
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                    />
                  </div>

                  {/* Rango Autorizado Desde */}
                  <div className="space-y-2">
                    <Label htmlFor="rangoAutorizadoDesde" className={darkMode ? 'text-gray-300' : ''}>
                      Rango Autorizado Desde
                    </Label>
                    <Input
                      id="rangoAutorizadoDesde"
                      type="number"
                      min="1"
                      value={config.rangoAutorizadoDesde}
                      onChange={(e) => handleChange('rangoAutorizadoDesde', parseInt(e.target.value) || 1)}
                      placeholder="1"
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                    />
                  </div>

                  {/* Rango Autorizado Hasta */}
                  <div className="space-y-2">
                    <Label htmlFor="rangoAutorizadoHasta" className={darkMode ? 'text-gray-300' : ''}>
                      Rango Autorizado Hasta
                    </Label>
                    <Input
                      id="rangoAutorizadoHasta"
                      type="number"
                      min="1"
                      value={config.rangoAutorizadoHasta}
                      onChange={(e) => handleChange('rangoAutorizadoHasta', parseInt(e.target.value) || 5000)}
                      placeholder="5000"
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                    />
                  </div>
                </div>

                {/* Ejemplo de Numeración */}
                <div className={`p-4 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-600' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                    📋 Ejemplo de Numeración de Facturas
                  </h4>
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Primera factura:</span>
                      <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {config.prefijoFactura || 'FE'}-{String(config.consecutivoInicial).padStart(6, '0')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Segunda factura:</span>
                      <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {config.prefijoFactura || 'FE'}-{String(config.consecutivoInicial + 1).padStart(6, '0')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Última autorizada:</span>
                      <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {config.prefijoFactura || 'FE'}-{String(config.rangoAutorizadoHasta).padStart(6, '0')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <Button
                    type="button"
                    onClick={handleGuardarYConectarFacturacion}
                    disabled={conectandoFacturacion}
                    className="bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white text-lg font-black shadow-[0_8px_0_rgba(6,78,59,1),0_16px_30px_rgba(16,185,129,0.45)]"
                  >
                    {conectandoFacturacion ? 'Conectando...' : 'Guardar y Conectar'}
                  </Button>
                  <div className={`px-4 py-3 rounded-xl border-2 text-base font-bold ${
                    config.ecosistemaFacturacionActivo
                      ? darkMode
                        ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : darkMode
                      ? 'bg-red-900 border-red-400 text-red-200'
                      : 'bg-red-50 border-red-300 text-red-700'
                  }`}>
                    Estado Ecosistema: {config.ecosistemaFacturacionActivo ? 'ACTIVO' : 'INACTIVO'}
                  </div>
                </div>
              </>
            )}

            {/* Información sobre Facturación Electrónica agnóstica */}
            <div className={`p-4 rounded-lg border ${
              darkMode 
                ? 'bg-blue-900 border-blue-500' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex gap-3">
                <Database className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className={`font-semibold text-sm ${darkMode ? 'text-blue-200' : 'text-blue-900'}`}>
                    🔌 Integración Universal Plug & Play
                  </h4>
                  <p className={`text-xs ${darkMode ? 'text-blue-100' : 'text-blue-800'}`}>
                    CODEC POS se conecta de forma agnóstica con cualquier proveedor de facturación electrónica
                    que exponga API HTTP.
                  </p>
                  <ul className={`text-xs space-y-1 mt-2 ${darkMode ? 'text-blue-100' : 'text-blue-800'}`}>
                    <li>• Generación automática de facturas electrónicas válidas ante la DIAN</li>
                    <li>• Envío de documentos electrónicos en tiempo real</li>
                    <li>• Sincronización de inventarios y ventas</li>
                    <li>• Reportes tributarios automáticos</li>
                  </ul>

                </div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 7️⃣ INTEGRACIONES */}
        <AccordionSection
          id="integraciones"
          title="Integraciones y Pasarelas de Pago"
          description="Conecta CODEC POS con Nequi, Bold, Wompi, Zapier, n8n, contabilidad y más"
          icon={<Webhook className="w-6 h-6 text-violet-500" />}
          isOpen={sectionsOpen.integraciones}
          onToggle={() => toggleSection('integraciones')}
          darkMode={darkMode}
          gradient="from-violet-900/20 to-purple-900/20"
          borderColor="border-violet-700/40"
        >
          <ConfiguracionIntegraciones />
        </AccordionSection>

        {/* 8️⃣ PLAN ACTUAL */}
        <AccordionSection
          id="plan"
          title="Plan Premium"
          description="Acceso completo a todas las funcionalidades profesionales"
          icon={<Crown className="w-6 h-6 text-amber-500" />}
          isOpen={sectionsOpen.plan}
          onToggle={() => toggleSection('plan')}
          darkMode={darkMode}
          gradient="from-amber-900/20 via-purple-900/20 to-amber-900/20"
          borderColor="border-amber-600/50"
        >
          <PlanSummaryCard />
        </AccordionSection>

        {/* 8️⃣.4 SINCRONIZACIÓN CON LA NUBE (Supabase) */}
        <AccordionSection
          id="sincronizacionNube"
          title="Sincronización con la Nube"
          description="Vincula esta caja con tu negocio en Supabase y monitorea el estado de sincronización"
          icon={<HardDrive className="w-6 h-6 text-cyan-500" />}
          isOpen={sectionsOpen.sincronizacionNube}
          onToggle={() => toggleSection('sincronizacionNube')}
          darkMode={darkMode}
          gradient="from-cyan-900/20 to-blue-900/20"
          borderColor="border-cyan-700/40"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VinculacionNubeCard />
            <SyncStatusCard />
          </div>
        </AccordionSection>

        {/* 8️⃣.5 RESPALDO Y RESTAURACIÓN DE DATOS */}
        <AccordionSection
          id="respaldoDatos"
          title="Respaldo y Restauración de Datos"
          description="Descarga un archivo de respaldo diario y restaura tu sistema con un clic si algo falla"
          icon={<HardDrive className="w-6 h-6 text-emerald-500" />}
          isOpen={sectionsOpen.respaldoDatos}
          onToggle={() => toggleSection('respaldoDatos')}
          darkMode={darkMode}
          gradient="from-emerald-900/20 to-teal-900/20"
          borderColor="border-emerald-700/40"
        >
          <div className="space-y-5">
            <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Descarga un archivo con toda la información de tu negocio (productos, ventas, usuarios).
                Guárdalo donde prefieras — USB, correo, la nube. Si algún día el sistema falla o pierde
                información, solo sube ese mismo archivo aquí y todo quedará restaurado en segundos.
              </p>
            </div>

            {/* Descarga manual */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleDescargarBackup}
                disabled={descargandoBackup}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 font-bold flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                {descargandoBackup ? 'Generando backup...' : 'Descargar Backup Ahora'}
              </Button>

              <Button
                onClick={() => inputArchivoBackupRef.current?.click()}
                disabled={restaurandoArchivo}
                variant="outline"
                className={`flex-1 font-bold ${darkMode ? 'border-emerald-600 text-emerald-400 hover:bg-emerald-900/20' : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'}`}
              >
                <Upload className="w-4 h-4 mr-2" />
                {restaurandoArchivo ? 'Restaurando...' : 'Subir Backup y Restaurar'}
              </Button>
              <input
                ref={inputArchivoBackupRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleArchivoSeleccionado}
              />
            </div>

            {/* Backup diario automático */}
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-white border-gray-200'}`}>
              <div>
                <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Backup diario automático</p>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Al activarlo, el sistema descarga un archivo de respaldo automáticamente la primera vez
                  que abras CODEC POS cada día.
                </p>
              </div>
              <Switch
                checked={backupDiarioHabilitado}
                onCheckedChange={handleToggleBackupDiario}
              />
            </div>

            <div className={`p-3 rounded-xl border text-xs ${darkMode ? 'bg-amber-900/20 border-amber-700/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              ⚠️ Restaurar un backup reemplaza TODOS los datos actuales por los del archivo. Úsalo solo si
              necesitas recuperar información perdida.
            </div>

            {/* Configuración de módulos enviada por el proveedor */}
            <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            <div>
              <p className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Configuración enviada por tu proveedor
              </p>
              <p className={`text-xs mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Si tu proveedor activó o desactivó módulos para tu cuenta, te habrá enviado un archivo de
                configuración (por WhatsApp, correo o USB). Súbelo aquí para aplicar el cambio en este equipo.
              </p>
              <Button
                onClick={() => inputConfigClienteRef.current?.click()}
                disabled={importandoConfigCliente}
                variant="outline"
                className={`font-bold ${darkMode ? 'border-purple-600 text-purple-400 hover:bg-purple-900/20' : 'border-purple-500 text-purple-700 hover:bg-purple-50'}`}
              >
                {importandoConfigCliente ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {importandoConfigCliente ? 'Importando...' : 'Importar Configuración'}
              </Button>
              <input
                ref={inputConfigClienteRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleArchivoConfigClienteSeleccionado}
              />
            </div>

            {/* Autoservicio: si el soporte técnico no está disponible */}
            <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            <div>
              <p className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Si el sistema no responde bien
              </p>
              <p className={`text-xs mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Usa estas opciones si el sistema falla y no puedes contactar a soporte técnico de inmediato.
                No necesitas tener ningún archivo guardado — el sistema genera respaldos automáticos por su
                cuenta (cada hora, al cerrar y tras cada cierre de caja) que estas opciones usan solas. 
                
                (Sistema Kevin)
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleReiniciarSistema}
                  disabled={reiniciandoApp}
                  variant="outline"
                  className={`flex-1 font-bold ${darkMode ? 'border-blue-600 text-blue-400 hover:bg-blue-900/20' : 'border-blue-500 text-blue-700 hover:bg-blue-50'}`}
                >
                  {reiniciandoApp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
                  Reiniciar Sistema
                </Button>
                <Button
                  onClick={handleRepararEmergencia}
                  
                  
                  
                  
                  disabled={reparandoEmergencia}
                  className="flex-1 font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  {reparandoEmergencia ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
                  Reparar Automáticamente
                </Button>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* 9️⃣ RESETEO / REINICIO DEL SISTEMA */}
        <AccordionSection
          id="reseteoSistema"
          title="Restauración del Sistema"
          description="Esta opción elimina toda la información del sistema POS"
          icon={<AlertCircle className="w-6 h-6 text-red-500" />}
          isOpen={sectionsOpen.reseteoSistema}
          onToggle={() => toggleSection('reseteoSistema')}
          darkMode={darkMode}
          gradient="from-red-900/20 to-rose-900/20"
          borderColor="border-red-700/40"
        >
          <div className="space-y-5">
            <div className={`p-4 rounded-xl border-2 ${
              darkMode ? 'bg-red-900/20 border-red-700/40' : 'bg-red-50 border-red-300'
            }`}>
              <h4 className={`font-bold mb-2 ${darkMode ? 'text-red-400' : 'text-red-700'}`}>
                ⚠️ Zona Crítica
              </h4>
              <p className={`text-sm ${darkMode ? 'text-red-200' : 'text-red-700'}`}>
                Este proceso eliminará los datos del sistema para dejarlo en estado inicial (0). Se requiere doble confirmación explícita.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-white border-gray-200'
            }`}>
              <ul className={`text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>• Solo puede ejecutarlo un usuario administrador.</li>
                <li>• Se muestran 2 alertas de advertencia antes de ejecutar.</li>
                <li>• La acción se hace únicamente bajo consentimiento del usuario.</li>
              </ul>
            </div>

            <Button
              onClick={handleResetSistemaEnCero}
              disabled={!esSuperUsuario || reseteandoSistema}
              className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 font-bold"
            >
              {reseteandoSistema ? 'Reseteando sistema...' : 'Ejecutar reseteo total a 0'}
            </Button>

            {!esSuperUsuario && (
              <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                Necesitas permisos de administrador para ejecutar esta acción.
              </p>
            )}
          </div>
        </AccordionSection>

        {/* 🔟 PERSONALIZACIÓN DEL ESPACIO DE TRABAJO */}
        <AccordionSection
          id="workspaceModules"
          title="Personalización del Espacio de Trabajo"
          description="Activa y desactiva módulos según el flujo real de tu negocio"
          icon={<Sparkles className="w-6 h-6 text-violet-500" />}
          isOpen={sectionsOpen.workspaceModules}
          onToggle={() => toggleSection('workspaceModules')}
          darkMode={darkMode}
          gradient="from-violet-900/20 to-indigo-900/20"
          borderColor="border-violet-700/40"
        >
          <div className="space-y-5">
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Optimiza tu flujo de trabajo ocultando los módulos que tu negocio no utiliza. Los cambios se guardan al presionar el botón Guardar Cambios.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {modulosWorkspaceDisponibles.map((modulo) => {
                const activo = modulosGlobalesConfig.modulosActivos.includes(modulo.id);

                return (
                  <div
                    key={modulo.id}
                    className={`rounded-xl border p-3 transition-all ${
                      activo
                        ? darkMode
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-emerald-200 bg-emerald-50'
                        : darkMode
                        ? 'border-slate-700 bg-slate-800/60'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{modulo.nombre}</p>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{modulo.descripcion}</p>
                      </div>
                      <Switch checked={activo} onCheckedChange={() => handleToggleModuloWorkspace(modulo.id)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${darkMode ? 'border-violet-500/40 bg-violet-900/20' : 'border-violet-200 bg-violet-50'}`}>
              <div>
                <p className={`text-sm font-black ${darkMode ? 'text-violet-200' : 'text-violet-800'}`}>Forzar visibilidad automática para todos los empleados</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-violet-300/80' : 'text-violet-700/80'}`}>
                  Al activarlo, los módulos encendidos se mostrarán automáticamente para todos los empleados, pasando a primer plano sobre sus restricciones individuales.
                </p>
              </div>
              <Switch
                checked={modulosGlobalesConfig.forceGlobalModules === true}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setShowConfirmForceGlobalModules(true);
                    return;
                  }
                  setForceGlobalModules(false);
                }}
              />
            </div>
          </div>
        </AccordionSection>

        {/* Footer - Desarrollado por Codec Studio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`mt-8 p-8 rounded-2xl border ${
            darkMode
              ? 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-700'
              : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
          }`}
        >
          {/* Header con Logo */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <CodecFavicon size={40} />
            <div>
              <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                CODEC STUDIO
              </h3>
              <p className={`text-xs font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                Sistema POS Profesional
              </p>
            </div>
          </div>

          {/* Información */}
          <div className="text-center space-y-2 mb-6">
            <p className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              CODEC POS v2.0 • La Mejor Solución para tu Negocio
            </p>

            {/* Enlaces de Contacto */}
            <div className="flex items-center justify-center gap-6 flex-wrap mt-4">
              {/* Página Web */}
              <a
                href="https://www.codecstudio.online/"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  darkMode
                    ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-semibold">codecstudio.online</span>
              </a>

              {/* WhatsApp */}
              <a
                href="https://wa.me/573238646844"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  darkMode
                    ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300'
                    : 'bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-xs font-semibold">+57 323 864 6844</span>
              </a>
            </div>
          </div>

          {/* Divisor */}
          <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'} my-6`} />

          {/* Versículo Bíblico */}
          <div className="text-center space-y-3">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
              darkMode
                ? 'bg-amber-500/10 border border-amber-500/20'
                : 'bg-amber-50 border border-amber-200'
            }`}>
              <span className="text-lg">✨</span>
              <p className={`text-xs font-bold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                Bendecido por Dios
              </p>
            </div>

            <p className={`text-sm italic max-w-2xl mx-auto leading-relaxed ${
              darkMode ? 'text-amber-300/80' : 'text-amber-700/80'
            }`}>
              "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo;<br />
              siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia."
            </p>
            <p className={`text-xs font-bold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
              — Isaías 41:10-12
            </p>
          </div>

          {/* Copyright */}
          <div className={`text-center mt-6 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              © 2024 Codec Studio. Todos los derechos reservados.
            </p>
          </div>
        </motion.div>
      </div>

      <Dialog open={showConfirmForceGlobalModules} onOpenChange={setShowConfirmForceGlobalModules}>
        <DialogContent className={darkMode ? 'bg-slate-900 border-slate-700 text-white' : ''}>
          <DialogHeader>
            <DialogTitle>Confirmar activación global</DialogTitle>
            <DialogDescription className={darkMode ? 'text-slate-300' : ''}>
              ¿Deseas que los módulos activos se gestionen desde aquí? Al aceptar, los módulos encendidos se mostrarán automáticamente para todos los empleados, pasando a primer plano sobre sus restricciones individuales.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmForceGlobalModules(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setForceGlobalModules(true);
                setShowConfirmForceGlobalModules(false);
              }}
            >
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}