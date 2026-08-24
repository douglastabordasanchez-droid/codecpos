/**
 * CODEC POS v2.0 - Módulo de Gestión de Gastos y Caja Chica
 * ✅ Diseño moderno con Glassmorphism
 * ✅ Soporte completo modo claro/oscuro
 * ✅ Sincronización automática con Dashboard
 * ✅ 15 categorías específicas + 6 métodos de pago
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { useDebounce } from '../../hooks/useDebounce';
import { electronStore } from '../../lib/electronStore';
import { cajaDiariaService } from '../../lib/cajaDiariaService';
import { onGastoRegistrado } from '../../lib/integracionesService';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';
import { getConfiguredTicketWidthMm } from '../../lib/printerConfig';
import {
  DollarSign,
  Plus,
  Trash2,
  Edit,
  Filter,
  Download,
  TrendingUp,
  AlertCircle,
  ShoppingCart,
  Zap,
  Coffee,
  Car,
  Wrench,
  Receipt,
  Calendar,
  Search,
  X,
  Home,
  Utensils,
  Sparkles,
  Package,
  Users,
  Wifi,
  Smartphone,
  Briefcase,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  BarChart3,
  CreditCard,
  Wallet,
  Save,
  Printer,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { descargarReporteGastosExcel } from '../../lib/excelGenerator';
import { leerConfigEmpresaPDF, dibujarLogoPDF } from '../../services/exportarReportes';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface Gasto {
  id: string;
  fecha: string;
  descripcion: string;
  concepto: string;
  categoria: CategoriaGasto;
  monto: number;
  metodoPago: string;
  medio_pago?: string;
  medioPagoEgreso?: MedioPagoEgreso;
  comprobante?: string;
  registradoPor: string;
  registradoPorId?: string;
  sesionCajaId?: string;
  categoriaConcepto?: string;
  notas?: string;
}

type MedioPagoEgreso = 'efectivo' | 'nequi' | 'daviplata' | 'transferencia' | 'tarjeta' | 'tarjeta_banco';

type CategoriaGasto =
  | 'servicios_publicos'
  | 'arriendo'
  | 'aseo_limpieza'
  | 'implementos'
  | 'comida_alimentacion'
  | 'inventario'
  | 'nomina'
  | 'transporte'
  | 'internet_telefono'
  | 'seguridad'
  | 'mantenimiento'
  | 'impuestos'
  | 'marketing'
  | 'papeleria'
  | 'otros';

const CATEGORIAS_CONFIG = {
  servicios_publicos: { label: 'Servicios Públicos (Agua, Luz, Internet)', icon: Zap, color: '#3b82f6' },
  arriendo: { label: 'Arriendo / Alquiler de Local', icon: Home, color: '#8b5cf6' },
  aseo_limpieza: { label: 'Aseo y Limpieza', icon: Sparkles, color: '#06b6d4' },
  implementos: { label: 'Implementos de Aseo y Cafetería', icon: Wrench, color: '#f59e0b' },
  comida_alimentacion: { label: 'Alimentación', icon: Utensils, color: '#10b981' },
  inventario: { label: 'Pago a Proveedores / Mercancía', icon: ShoppingCart, color: '#22c55e' },
  nomina: { label: 'Nómina / Pago a Empleados', icon: Users, color: '#a855f7' },
  transporte: { label: 'Transporte', icon: Car, color: '#14b8a6' },
  internet_telefono: { label: 'Internet/Teléfono', icon: Wifi, color: '#6366f1' },
  seguridad: { label: 'Seguridad', icon: Briefcase, color: '#dc2626' },
  mantenimiento: { label: 'Mantenimiento / Reparaciones', icon: Wrench, color: '#ea580c' },
  impuestos: { label: 'Impuestos', icon: Receipt, color: '#ef4444' },
  marketing: { label: 'Marketing', icon: TrendingUp, color: '#ec4899' },
  papeleria: { label: 'Papelería y Utensilios de Oficina', icon: FileText, color: '#64748b' },
  otros: { label: 'Otro (Especificar)', icon: Coffee, color: '#78716c' },
};

// Fallback visual para categorías que no están en el set fijo de arriba —
// p. ej. categorías dinámicas creadas desde el módulo de Contabilidad.
// Sin esto, un gasto con una categoría personalizada rompía el render aquí.
const CATEGORIA_FALLBACK = { label: 'Otra Categoría', icon: Coffee, color: '#78716c' };
const configCategoria = (categoria: string) =>
  (CATEGORIAS_CONFIG as Record<string, { label: string; icon: any; color: string }>)[categoria] || CATEGORIA_FALLBACK;

const CATEGORIAS_MODAL_KEYS: CategoriaGasto[] = [
  'servicios_publicos',
  'implementos',
  'inventario',
  'arriendo',
  'nomina',
  'mantenimiento',
  'papeleria',
  'otros',
];

const METODOS_PAGO_CONFIG = {
  efectivo: { label: 'EFECTIVO', emoji: '💵', color: '#10b981' },
  nequi: { label: 'NEQUI', emoji: '📱', color: '#8b5cf6' },
  daviplata: { label: 'DAVIPLATA', emoji: '📲', color: '#7c3aed' },
  transferencia: { label: 'TRANSFERENCIA', emoji: '🔄', color: '#6366f1' },
  tarjeta: { label: 'TARJETA', emoji: '💳', color: '#3b82f6' },
  tarjeta_banco: { label: 'TARJETA', emoji: '💳', color: '#3b82f6' },
};

const normalizarMedioPagoEgreso = (metodoPago: string): MedioPagoEgreso => {
  const metodo = String(metodoPago || '').toLowerCase();
  if (metodo === 'efectivo') return 'efectivo';
  if (metodo === 'nequi') return 'nequi';
  if (metodo === 'daviplata') return 'daviplata';
  if (metodo === 'tarjeta' || metodo === 'cheque' || metodo === 'tarjeta_banco') return 'tarjeta';
  return 'transferencia';
};

const getFechaLocalISO = (date: Date = new Date()) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
};

export default function GastosPage() {
  const { usuarioActual } = useAuth();
  const { darkMode } = usePOS();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [gastosFiltrados, setGastosFiltrados] = useState<Gasto[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gastoEditando, setGastoEditando] = useState<Gasto | null>(null);
  const [busqueda, setBusqueda] = useState('');
  // 🚀 FIX rendimiento: el input sigue controlado por busqueda; el filtro
  // usa el valor debounced para no recorrer el arreglo en cada tecla.
  const busquedaDebounced = useDebounce(busqueda, 200);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaGasto | 'todas'>('todas');
  const [paginaGastos, setPaginaGastos] = useState(1);
  const GASTOS_POR_PAGINA = 50;
  const [vistaActual, setVistaActual] = useState<'lista' | 'graficas'>('lista');
  const [showConfirmarSesion, setShowConfirmarSesion] = useState(false);
  const [gastoPendiente, setGastoPendiente] = useState<Gasto | null>(null);
  const [sesionActivaGasto, setSesionActivaGasto] = useState<{ id: string; aperturaISO: string } | null>(null);

  // Formulario
  const [formData, setFormData] = useState({
    descripcion: '',
    categoria: '' as CategoriaGasto | '',
    conceptoOtro: '',
    monto: '',
    metodoPago: '' as MedioPagoEgreso | '',
    notas: '',
  });

  useEffect(() => {
    cargarGastos();

    // ☁️ Un gasto registrado desde la PWA llega acá vía syncService.ts
    // (pullGastosRemotos) — se refresca sin esperar a recargar la página.
    window.addEventListener('codecpos:gastos-sincronizados', cargarGastos);
    return () => window.removeEventListener('codecpos:gastos-sincronizados', cargarGastos);
  }, []);

  useEffect(() => {
    filtrarGastos();
  }, [gastos, busquedaDebounced, filtroCategoria]);

  useEffect(() => {
    setPaginaGastos(1);
  }, [busquedaDebounced, filtroCategoria]);

  const cargarGastos = () => {
    try {
      const gastosStr = localStorage.getItem('pos-gastos');
      if (gastosStr) {
        const gastosData = JSON.parse(gastosStr);
        setGastos(gastosData);
      }
    } catch (error) {
      console.error('Error cargando gastos:', error);
    }
  };

  const guardarGastos = async (nuevosGastos: Gasto[]) => {
    localStorage.setItem('pos-gastos', JSON.stringify(nuevosGastos));
    setGastos(nuevosGastos);
    
    // 🔄 ACTUALIZAR ESTADÍSTICAS DEL DASHBOARD
    try {
      await electronStore.calcularEstadisticasDelDia();
      console.log('📊 Dashboard actualizado - Gastos reflejados en utilidad neta');
    } catch (error) {
      console.error('Error actualizando dashboard:', error);
    }
  };

  const filtrarGastos = () => {
    let resultado = [...gastos];

    if (busquedaDebounced) {
      resultado = resultado.filter(
        (g) =>
          g.descripcion.toLowerCase().includes(busquedaDebounced.toLowerCase()) ||
          g.notas?.toLowerCase().includes(busquedaDebounced.toLowerCase())
      );
    }

    if (filtroCategoria !== 'todas') {
      resultado = resultado.filter((g) => g.categoria === filtroCategoria);
    }

    setGastosFiltrados(resultado);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const descripcionLimpia = formData.descripcion.trim();
    const montoNumerico = Number(formData.monto);

    const requiereConceptoOtro = formData.categoria === 'otros';
    const conceptoOtroLimpio = formData.conceptoOtro.trim();
    if (!descripcionLimpia || !formData.categoria || !formData.metodoPago || !montoNumerico || montoNumerico <= 0) {
      toast.error('Debes completar todos los campos obligatorios del egreso');
      return;
    }

    if (requiereConceptoOtro && !conceptoOtroLimpio) {
      toast.error('Debes especificar el concepto del gasto para la categoría "Otro"');
      return;
    }

    const nombreCajero = usuarioActual?.nombreCompleto || usuarioActual?.username || 'Desconocido';
    const categoriaConcepto = CATEGORIAS_CONFIG[formData.categoria as CategoriaGasto]?.label || formData.categoria;
    const concepto = requiereConceptoOtro ? conceptoOtroLimpio : categoriaConcepto;
    const medioPago = normalizarMedioPagoEgreso(formData.metodoPago);

    const gasto: Gasto = {
      id: gastoEditando?.id || `GASTO-${Date.now()}`,
      fecha: gastoEditando?.fecha || new Date().toISOString(),
      descripcion: descripcionLimpia,
      concepto,
      categoria: formData.categoria as CategoriaGasto,
      categoriaConcepto,
      monto: montoNumerico,
      metodoPago: medioPago,
      medio_pago: String(formData.metodoPago).toUpperCase(),
      medioPagoEgreso: medioPago,
      registradoPor: nombreCajero,
      registradoPorId: usuarioActual?.id,
      sesionCajaId: gastoEditando?.sesionCajaId,
      notas: formData.notas,
    };

    if (gastoEditando) {
      const nuevosGastos = gastos.map((g) => (g.id === gasto.id ? gasto : g));
      guardarGastos(nuevosGastos);
      toast.success('✅ Gasto actualizado correctamente');
    } else {
      const sesionActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, getFechaLocalISO());
      if (!sesionActiva) {
        toast.error('No hay sesión de caja abierta para registrar el egreso');
        return;
      }

      const gastoConSesion = {
        ...gasto,
        sesionCajaId: sesionActiva.id,
      };

      setGastoPendiente(gastoConSesion);
      setSesionActivaGasto({ id: sesionActiva.id, aperturaISO: sesionActiva.aperturaISO });
      setShowConfirmarSesion(true);
      return;
    }

    cerrarModal();
  };

  const confirmarRegistroGasto = () => {
    if (!gastoPendiente || !sesionActivaGasto) {
      toast.error('No se pudo confirmar el gasto. Intenta nuevamente.');
      setShowConfirmarSesion(false);
      return;
    }

    const gastoConfirmado: Gasto = {
      ...gastoPendiente,
      sesionCajaId: sesionActivaGasto.id,
    };

    guardarGastos([gastoConfirmado, ...gastos]);
    toast.success(`✅ Gasto registrado y vinculado a la sesión ${sesionActivaGasto.id}`);

    onGastoRegistrado({
      monto: gastoConfirmado.monto,
      categoria: gastoConfirmado.categoria,
      categoriaConcepto: gastoConfirmado.categoriaConcepto,
      descripcion: gastoConfirmado.descripcion,
      metodoPago: gastoConfirmado.metodoPago,
      medioPagoEgreso: gastoConfirmado.medioPagoEgreso,
      sesionCajaId: gastoConfirmado.sesionCajaId,
      registradoPor: gastoConfirmado.registradoPor,
      timestamp: gastoConfirmado.fecha,
    }).catch(() => {});

    setShowConfirmarSesion(false);
    setGastoPendiente(null);
    setSesionActivaGasto(null);
    cerrarModal();
  };

  const handleEliminar = (id: string) => {
    if (confirm('¿Está seguro de eliminar este gasto?')) {
      const nuevosGastos = gastos.filter((g) => g.id !== id);
      guardarGastos(nuevosGastos);
      toast.success('🗑️ Gasto eliminado - Dashboard actualizado');
    }
  };

  const abrirModal = (gasto?: Gasto) => {
    if (gasto) {
      setGastoEditando(gasto);
      setFormData({
        descripcion: gasto.descripcion,
        categoria: gasto.categoria,
        conceptoOtro: gasto.categoria === 'otros' ? (gasto.concepto || gasto.descripcion || '') : '',
        monto: gasto.monto.toString(),
        metodoPago: normalizarMedioPagoEgreso(gasto.metodoPago),
        notas: gasto.notas || '',
      });
    }
    setIsModalOpen(true);
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setGastoEditando(null);
    setFormData({
      descripcion: '',
      categoria: '',
      conceptoOtro: '',
      monto: '',
      metodoPago: '',
      notas: '',
    });
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const imprimirGasto = async (gasto: Gasto) => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = config.nombreComercial || 'MI NEGOCIO';
      const nit = config.nit ? `NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
      const telefono = config.telefono ? `Tel: ${config.telefono}` : '';
      const fechaGasto = format(new Date(gasto.fecha), "dd/MM/yyyy HH:mm", { locale: es });
      const medioPagoLabel = METODOS_PAGO_CONFIG[normalizarMedioPagoEgreso(gasto.metodoPago)]?.label || gasto.metodoPago;
      const sesionActiva = cajaDiariaService.getSesionActiva(usuarioActual?.id, getFechaLocalISO());
      const sesionCajaId = gasto.sesionCajaId || sesionActiva?.id || 'N/A';
      const printerName = getPrinterForSectionOrUndefined('gastos') || '';
      const silentMode = !!printerName;
      const widthMm = getConfiguredTicketWidthMm();

      // 🖨️ Tabla en vez de flexbox: los drivers de impresoras térmicas
      // "genéricas / solo texto" no interpretan flexbox — al imprimir,
      // aplanan el HTML a texto plano y el label y el valor quedan pegados
      // (ej. "Fecha:09/07/2026"). Una <table> con columnas de ancho fijo
      // (60%/40%) sobrevive esa conversión y mantiene el valor alineado
      // a la derecha, igual que se ve en la vista previa.
      const fila = (label: string, valor: string, bold = false) => `
        <tr>
          <td style="text-align:left;${bold ? 'font-weight:700;' : ''}">${escapeHtml(label)}</td>
          <td style="text-align:right;${bold ? 'font-weight:700;' : ''}">${escapeHtml(valor)}</td>
        </tr>`;

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comprobante de Egreso</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 4mm; color: #000; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    table.datos { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.datos col.label { width: 60%; }
    table.datos col.valor { width: 40%; }
    table.datos td { padding: 1px 0; vertical-align: top; }
    .label { font-weight: bold; }
    .total td { font-size: 15px; font-weight: bold; }
    .muted { color: #333; font-size: 11px; }
    .firma { margin-top: 22px; }
    .firma .linea { border-top: 1px solid #000; width: 100%; margin-top: 2px; }
    .firma .texto { text-align: center; font-size: 10px; margin-top: 3px; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-size:14px;font-weight:700;">${escapeHtml(empresa)}</div>
    ${nit ? `<div class="muted">${escapeHtml(nit)}</div>` : ''}
    ${telefono ? `<div class="muted">${escapeHtml(telefono)}</div>` : ''}
    <div style="margin-top:4px;font-weight:700;">COMPROBANTE DE GASTO</div>
  </div>
  <div class="line"></div>
  <table class="datos"><colgroup><col class="label"/><col class="valor"/></colgroup><tbody>
    ${fila('Fecha:', fechaGasto)}
    ${fila('Caja activa:', sesionCajaId)}
    ${fila('Cajero:', gasto.registradoPor || 'N/A')}
  </tbody></table>
  <div class="line"></div>
  <div><span class="label">Descripcion:</span><br/>${escapeHtml(gasto.descripcion)}</div>
  <div style="margin-top:4px;"><span class="label">Concepto:</span><br/>${escapeHtml(gasto.concepto || gasto.categoriaConcepto || gasto.descripcion)}</div>
  <div style="margin-top:4px;"><span class="label">Categoria:</span><br/>${escapeHtml(CATEGORIAS_CONFIG[gasto.categoria]?.label || gasto.categoria)}</div>
  <table class="datos" style="margin-top:6px;"><colgroup><col class="label"/><col class="valor"/></colgroup><tbody>
    ${fila('Medio pago:', medioPagoLabel)}
  </tbody></table>
  <table class="datos total" style="margin-top:8px;"><colgroup><col class="label"/><col class="valor"/></colgroup><tbody>
    ${fila('TOTAL EGRESO:', formatCurrency(gasto.monto), true)}
  </tbody></table>
  ${gasto.notas ? `<div style="margin-top:6px;"><span class="label">Notas:</span><br/>${escapeHtml(gasto.notas)}</div>` : ''}
  <div class="firma">
    <div class="linea"></div>
    <div class="texto">Firma de recibido / autorizado</div>
  </div>
  <div class="line"></div>
  <div class="center muted">Impresora: ${escapeHtml(printerName || 'Predeterminada del sistema')}</div>
  <div class="center muted" style="margin-top:4px;">CODEC POS v2.0</div>
</body>
</html>`;

      const el = (window as any).electron;
      if (el?.print?.printHtml) {
        await el.print.printHtml({ html, silent: silentMode, printerName, widthMm });
        toast.success(silentMode ? 'Comprobante de gasto enviado a impresora' : 'Abriendo diálogo de impresión...');
        return;
      }

      const ipc = (window as any).ipcRenderer ?? el?.ipcRenderer;
      if (ipc?.send) {
        ipc.send('print-ticket', { html, silent: silentMode, printerName });
        toast.success(silentMode ? 'Comprobante de gasto enviado a impresora' : 'Abriendo diálogo de impresión...');
        return;
      }

      const win = window.open('', '_blank', 'width=820,height=960');
      if (!win) {
        toast.error('Habilita las ventanas emergentes o configura la impresora de Gastos en Dispositivos');
        return;
      }

      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 600);
    } catch (error) {
      console.error('Error imprimiendo gasto:', error);
      toast.error('No se pudo imprimir el gasto');
    }
  };

  // 📄 Exportar gastos a PDF
  const exportarGastosPDF = () => {
    try {
      const { config, empresa, nit } = leerConfigEmpresaPDF();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const ahora = new Date();

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 35, 'F');
      dibujarLogoPDF(doc, config.logoUrl, W - 40, 5, 24, 24);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(empresa, 14, 15);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      if (nit) doc.text(nit, 14, 21);
      if (config.direccion) doc.text(config.direccion, 14, 26);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE GASTOS', 14, 32);
      doc.setTextColor(0, 0, 0);

      // Período
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, 14, 42);
      const totalGastosFiltrados = gastosFiltrados.reduce((s, g) => s + g.monto, 0);
      doc.text(`Total: $${totalGastosFiltrados.toLocaleString('es-CO')}  ·  ${gastosFiltrados.length} registros`, 14, 48);

      // Tabla
      autoTable(doc, {
        startY: 54,
        head: [['Fecha', 'Descripción', 'Categoría', 'Método Pago', 'Monto']],
        body: gastosFiltrados.map(g => [
          format(new Date(g.fecha), 'dd/MM/yyyy', { locale: es }),
          g.descripcion,
          CATEGORIAS_CONFIG[g.categoria as keyof typeof CATEGORIAS_CONFIG]?.label || g.categoria,
          g.metodoPago,
          `$${g.monto.toLocaleString('es-CO')}`,
        ]),
        foot: [['', '', '', 'TOTAL', `$${totalGastosFiltrados.toLocaleString('es-CO')}`]],
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 14, right: 14 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} — CODEC POS v2.0`, W / 2, 290, { align: 'center' });
      }

      doc.save(`Gastos-${format(ahora, 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF de gastos generado');
    } catch (error) {
      console.error('Error exportando PDF:', error);
      toast.error('Error al generar PDF');
    }
  };

  // 📊 Exportar gastos a Excel
  const exportarGastosExcel = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const nombreEmpresa = config.nombreComercial || 'CODEC POS';

      const gastosParaExportar = gastosFiltrados.map(g => ({
        id: g.id,
        fecha: g.fecha,
        descripcion: g.descripcion,
        categoria: CATEGORIAS_CONFIG[g.categoria as keyof typeof CATEGORIAS_CONFIG]?.label || g.categoria,
        monto: g.monto,
        metodoPago: g.metodoPago,
        registradoPor: g.registradoPor,
        notas: g.notas || '',
      }));

      const fechaInicio = gastosFiltrados.length > 0 
        ? gastosFiltrados[gastosFiltrados.length - 1].fecha 
        : new Date().toISOString();
      const fechaFin = gastosFiltrados.length > 0 
        ? gastosFiltrados[0].fecha 
        : new Date().toISOString();

      descargarReporteGastosExcel(gastosParaExportar, fechaInicio, fechaFin, nombreEmpresa);
      toast.success('📊 Reporte de gastos exportado a Excel');
    } catch (error) {
      console.error('Error exportando gastos:', error);
      toast.error('Error al exportar gastos');
    }
  };

  // Cálculos
  const totalGastos = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
  const promedioGasto = gastosFiltrados.length > 0 ? totalGastos / gastosFiltrados.length : 0;

  // 🚀 FIX rendimiento: la lista se renderizaba completa sin paginar.
  const totalPaginasGastos = Math.max(1, Math.ceil(gastosFiltrados.length / GASTOS_POR_PAGINA));
  const paginaGastosSegura = Math.min(paginaGastos, totalPaginasGastos);
  const gastosPagina = gastosFiltrados.slice((paginaGastosSegura - 1) * GASTOS_POR_PAGINA, paginaGastosSegura * GASTOS_POR_PAGINA);
  
  const gastosPorCategoria = Object.entries(
    gastosFiltrados.reduce((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] || 0) + g.monto;
      return acc;
    }, {} as Record<CategoriaGasto, number>)
  ).map(([categoria, monto]) => ({
    name: configCategoria(categoria).label,
    value: monto,
    color: configCategoria(categoria).color,
    categoria: categoria as CategoriaGasto,
  }));

  const gastosPorMetodo = Object.entries(
    gastosFiltrados.reduce((acc, g) => {
      acc[g.metodoPago] = (acc[g.metodoPago] || 0) + g.monto;
      return acc;
    }, {} as Record<string, number>)
  ).map(([metodo, monto]) => ({
    name: METODOS_PAGO_CONFIG[metodo as keyof typeof METODOS_PAGO_CONFIG]?.label || metodo,
    value: monto,
    emoji: METODOS_PAGO_CONFIG[metodo as keyof typeof METODOS_PAGO_CONFIG]?.emoji || '💰',
  }));

  const categoriaConMayorGasto = gastosPorCategoria.length > 0
    ? gastosPorCategoria.reduce((max, cat) => (cat.value > max.value ? cat : max))
    : null;

  return (
    <div className={`min-h-screen h-screen overflow-y-auto ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
    } p-6 scrollbar-thin ${
      darkMode ? 'scrollbar-thumb-emerald-500 scrollbar-track-slate-800' : 'scrollbar-thumb-emerald-600 scrollbar-track-gray-200'
    }`}>
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              💰 Gestión de Gastos
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Control de gastos operativos y sincronización con dashboard
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={exportarGastosPDF}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg"
              size="lg"
              disabled={gastosFiltrados.length === 0}
            >
              <FileText className="w-5 h-5 mr-2" />
              PDF
            </Button>
            <Button
              onClick={exportarGastosExcel}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg"
              size="lg"
              disabled={gastosFiltrados.length === 0}
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              Excel
            </Button>
            <Button
              onClick={() => abrirModal()}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30"
              size="lg"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nuevo Gasto
            </Button>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <Card className={`${
          darkMode 
            ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl' 
            : 'bg-white/80 border-gray-200 backdrop-blur-xl shadow-lg'
        }`}>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Búsqueda */}
              <div className="md:col-span-2 relative">
                <Search className={`absolute left-3 top-3 w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por descripción o notas..."
                  className={`pl-10 ${
                    darkMode 
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                  }`}
                />
              </div>

              {/* Filtro Categoría */}
              <Select
                value={filtroCategoria}
                onValueChange={(value) => setFiltroCategoria(value as CategoriaGasto | 'todas')}
              >
                <SelectTrigger className={`${
                  darkMode 
                    ? 'bg-slate-700/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}>
                  <SelectValue>
                    {filtroCategoria === 'todas' 
                      ? 'Todas las categorías' 
                      : CATEGORIAS_CONFIG[filtroCategoria].label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}>
                  <SelectItem value="todas" className={darkMode ? 'text-white hover:bg-slate-700' : 'text-gray-900 hover:bg-gray-100'}>
                    Todas las categorías
                  </SelectItem>
                  {Object.entries(CATEGORIAS_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem 
                        key={key} 
                        value={key}
                        className={darkMode ? 'text-white hover:bg-slate-700' : 'text-gray-900 hover:bg-gray-100'}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: config.color }} />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Vista Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={vistaActual === 'lista' ? 'default' : 'outline'}
                  onClick={() => setVistaActual('lista')}
                  className="flex-1"
                  size="sm"
                >
                  Lista
                </Button>
                <Button
                  variant={vistaActual === 'graficas' ? 'default' : 'outline'}
                  onClick={() => setVistaActual('graficas')}
                  className="flex-1"
                  size="sm"
                >
                  Gráficas
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Dashboard de Estadísticas */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
      >
        {/* Total Gastos */}
        <Card className={`${
          darkMode 
            ? 'bg-gradient-to-br from-red-500/20 to-red-600/20 border-red-500/30 backdrop-blur-xl' 
            : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 shadow-lg'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-2xl ${
                darkMode ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-red-500 to-red-600'
              } flex items-center justify-center shadow-lg`}>
                <DollarSign className="w-7 h-7 text-white" />
              </div>
              <Badge className={`${
                darkMode ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-100 text-red-700 border-red-300'
              }`}>
                {gastosFiltrados.length}
              </Badge>
            </div>
            <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
              TOTAL GASTOS
            </h3>
            <p className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {formatCurrency(totalGastos)}
            </p>
            <p className={`text-xs mt-2 flex items-center gap-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
              <ArrowDownRight className="w-4 h-4" />
              Egresos registrados
            </p>
          </CardContent>
        </Card>

        {/* Categoría Mayor */}
        <Card className={`${
          darkMode 
            ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-orange-500/30 backdrop-blur-xl' 
            : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 shadow-lg'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-2xl ${
                darkMode ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'
              } flex items-center justify-center shadow-lg`}>
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
            </div>
            <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
              MAYOR GASTO
            </h3>
            <p className={`text-2xl font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {categoriaConMayorGasto?.name || 'N/A'}
            </p>
            <p className={`text-lg font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
              {categoriaConMayorGasto ? formatCurrency(categoriaConMayorGasto.value) : '$0'}
            </p>
          </CardContent>
        </Card>

        {/* Promedio */}
        <Card className={`${
          darkMode 
            ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/30 backdrop-blur-xl' 
            : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 shadow-lg'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-2xl ${
                darkMode ? 'bg-gradient-to-br from-purple-500 to-purple-600' : 'bg-gradient-to-br from-purple-500 to-purple-600'
              } flex items-center justify-center shadow-lg`}>
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
            </div>
            <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
              PROMEDIO
            </h3>
            <p className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {formatCurrency(promedioGasto)}
            </p>
            <p className={`text-xs mt-2 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              Por registro
            </p>
          </CardContent>
        </Card>

        {/* Métodos de Pago */}
        <Card className={`${
          darkMode 
            ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30 backdrop-blur-xl' 
            : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-lg'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-2xl ${
                darkMode ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-blue-500 to-blue-600'
              } flex items-center justify-center shadow-lg`}>
                <CreditCard className="w-7 h-7 text-white" />
              </div>
            </div>
            <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              MÉTODOS PAGO
            </h3>
            <p className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {gastosPorMetodo.length}
            </p>
            <p className={`text-xs mt-2 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              Diferentes métodos
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Vista Lista */}
      {vistaActual === 'lista' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className={`${
            darkMode 
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl' 
              : 'bg-white/80 border-gray-200 backdrop-blur-xl shadow-lg'
          }`}>
            <CardHeader>
              <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                📋 Historial de Gastos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {gastosFiltrados.length > 0 ? (
                  gastosPagina.map((gasto, index) => {
                    const CatIcon = configCategoria(gasto.categoria).icon;
                    const catColor = configCategoria(gasto.categoria).color;
                    const metodoPago = METODOS_PAGO_CONFIG[normalizarMedioPagoEgreso(gasto.metodoPago) as keyof typeof METODOS_PAGO_CONFIG];

                    return (
                      <motion.div
                        key={gasto.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-lg ${
                          darkMode 
                            ? 'bg-slate-700/30 border-slate-600/30 hover:border-emerald-500/50 hover:bg-slate-700/50' 
                            : 'bg-white border-gray-200 hover:border-emerald-500/50 hover:shadow-emerald-100'
                        }`}
                      >
                        {/* Icono Categoría */}
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md"
                          style={{ backgroundColor: `${catColor}20` }}
                        >
                          <CatIcon className="w-7 h-7" style={{ color: catColor }} />
                        </div>

                        {/* Info Principal */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-lg mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {gasto.descripcion}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-xs ${
                              darkMode 
                                ? 'bg-slate-600/50 text-slate-300 border-slate-500' 
                                : 'bg-gray-100 text-gray-700 border-gray-300'
                            }`}>
                              {configCategoria(gasto.categoria).label}
                            </Badge>
                            {metodoPago && (
                              <Badge className={`text-xs ${
                                darkMode 
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {metodoPago.emoji} {metodoPago.label}
                              </Badge>
                            )}
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                              {format(new Date(gasto.fecha), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                            </p>
                          </div>
                          {gasto.notas && (
                            <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                              💬 {gasto.notas}
                            </p>
                          )}
                          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                            Concepto: {gasto.concepto || gasto.categoriaConcepto || gasto.descripcion}
                          </p>
                        </div>

                        {/* Monto */}
                        <div className="text-right">
                          <p className="text-2xl font-black text-red-500">
                            {formatCurrency(gasto.monto)}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                            {gasto.registradoPor}
                          </p>
                        </div>

                        {/* Acciones */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => imprimirGasto(gasto)}
                            className={`${
                              darkMode
                                ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => abrirModal(gasto)}
                            className={`${
                              darkMode 
                                ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' 
                                : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEliminar(gasto.id)}
                            className={`${
                              darkMode 
                                ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' 
                                : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="text-center py-16">
                    <AlertCircle className={`w-20 h-20 mx-auto mb-4 ${
                      darkMode ? 'text-slate-600' : 'text-gray-300'
                    }`} />
                    <p className={`text-lg mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      No hay gastos registrados
                    </p>
                    <Button
                      onClick={() => abrirModal()}
                      variant="outline"
                      className="mt-4"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Registrar Primer Gasto
                    </Button>
                  </div>
                )}
              </div>
              {totalPaginasGastos > 1 && (
                <div className={`flex items-center justify-between px-1 pt-4 mt-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Página {paginaGastosSegura} de {totalPaginasGastos} · {gastosFiltrados.length} gastos
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={paginaGastosSegura <= 1} onClick={() => setPaginaGastos((p) => Math.max(1, p - 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={paginaGastosSegura >= totalPaginasGastos} onClick={() => setPaginaGastos((p) => Math.min(totalPaginasGastos, p + 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Vista Gráficas */}
      {vistaActual === 'graficas' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Gráfica de Categorías */}
          <Card className={`${
            darkMode 
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl' 
              : 'bg-white/80 border-gray-200 backdrop-blur-xl shadow-lg'
          }`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                <PieChartIcon className="w-5 h-5" />
                Gastos por Categoría
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gastosPorCategoria.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gastosPorCategoria}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {gastosPorCategoria.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => formatCurrency(Number(value))}
                        contentStyle={{
                          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                          border: darkMode ? '1px solid #475569' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: darkMode ? '#fff' : '#000',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Desglose */}
                  <div className="mt-6 space-y-2">
                    {gastosPorCategoria
                      .sort((a, b) => b.value - a.value)
                      .map((cat, index) => {
                        const Icon = configCategoria(cat.categoria).icon;
                        const porcentaje = (cat.value / totalGastos) * 100;

                        return (
                          <div 
                            key={index} 
                            className={`flex items-center justify-between p-3 rounded-lg ${
                              darkMode ? 'bg-slate-700/30' : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: `${cat.color}20` }}
                              >
                                <Icon className="w-5 h-5" style={{ color: cat.color }} />
                              </div>
                              <div>
                                <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {cat.name}
                                </p>
                                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                  {porcentaje.toFixed(1)}% del total
                                </p>
                              </div>
                            </div>
                            <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {formatCurrency(cat.value)}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="h-[400px] flex items-center justify-center">
                  <p className={darkMode ? 'text-slate-500' : 'text-gray-400'}>
                    No hay datos para mostrar
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfica de Métodos de Pago */}
          <Card className={`${
            darkMode 
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl' 
              : 'bg-white/80 border-gray-200 backdrop-blur-xl shadow-lg'
          }`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                <Wallet className="w-5 h-5" />
                Gastos por Método de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gastosPorMetodo.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={gastosPorMetodo}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#475569' : '#e5e7eb'} />
                      <XAxis 
                        dataKey="name" 
                        stroke={darkMode ? '#94a3b8' : '#6b7280'}
                        tick={{ fill: darkMode ? '#94a3b8' : '#6b7280' }}
                      />
                      <YAxis 
                        stroke={darkMode ? '#94a3b8' : '#6b7280'}
                        tick={{ fill: darkMode ? '#94a3b8' : '#6b7280' }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        formatter={(value: any) => formatCurrency(Number(value))}
                        contentStyle={{
                          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                          border: darkMode ? '1px solid #475569' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: darkMode ? '#fff' : '#000',
                        }}
                      />
                      <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Lista de métodos */}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {gastosPorMetodo.map((metodo, index) => (
                      <div 
                        key={index}
                        className={`p-4 rounded-xl text-center ${
                          darkMode ? 'bg-slate-700/30' : 'bg-gray-50'
                        }`}
                      >
                        <div className="text-3xl mb-2">{metodo.emoji}</div>
                        <p className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {metodo.name}
                        </p>
                        <p className="text-emerald-500 font-bold">
                          {formatCurrency(metodo.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[400px] flex items-center justify-center">
                  <p className={darkMode ? 'text-slate-500' : 'text-gray-400'}>
                    No hay datos para mostrar
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Modal de Registro/Edición */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className={`max-w-2xl ${
          darkMode 
            ? 'bg-slate-800 border-slate-700 text-white' 
            : 'bg-white border-gray-200 text-gray-900'
        }`}>
          <DialogHeader>
            <DialogTitle className={`text-2xl flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {gastoEditando ? (
                <>
                  <Edit className="w-6 h-6 text-blue-500" />
                  Editar Gasto
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6 text-emerald-500" />
                  Registrar Nuevo Gasto
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Descripción */}
            <div>
              <Label htmlFor="descripcion" className={`text-sm font-semibold mb-2 block ${
                darkMode ? 'text-slate-200' : 'text-gray-700'
              }`}>
                Descripción del Gasto *
              </Label>
              <Input
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Ej: Pago de luz del mes de febrero"
                className={`${
                  darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                }`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Categoría */}
              <div>
                <Label htmlFor="categoria" className={`text-sm font-semibold mb-2 block ${
                  darkMode ? 'text-slate-200' : 'text-gray-700'
                }`}>
                  Categoría/Concepto del Gasto *
                </Label>
                <select
                  id="categoria"
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaGasto })}
                  className={`flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  required
                >
                  <option value="">Seleccionar concepto del gasto</option>
                  {CATEGORIAS_MODAL_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {CATEGORIAS_CONFIG[key].label}
                    </option>
                  ))}
                </select>

                {formData.categoria === 'otros' && (
                  <div className="mt-3">
                    <Label htmlFor="conceptoOtro" className={`text-sm font-semibold mb-2 block ${
                      darkMode ? 'text-slate-200' : 'text-gray-700'
                    }`}>
                      Especifique el Concepto del Gasto *
                    </Label>
                    <Input
                      id="conceptoOtro"
                      type="text"
                      value={formData.conceptoOtro}
                      onChange={(e) => setFormData({ ...formData, conceptoOtro: e.target.value })}
                      placeholder="Ej: Servicio técnico extraordinario"
                      className={`${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-400'
                          : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                      }`}
                      required
                    />
                  </div>
                )}
              </div>

              {/* Monto */}
              <div>
                <Label htmlFor="monto" className={`text-sm font-semibold mb-2 block ${
                  darkMode ? 'text-slate-200' : 'text-gray-700'
                }`}>
                  Monto *
                </Label>
                <div className="relative">
                  <span className={`absolute left-3 top-3 ${
                    darkMode ? 'text-slate-400' : 'text-gray-500'
                  }`}>$</span>
                  <Input
                    id="monto"
                    type="number"
                    value={formData.monto}
                    onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                    placeholder="0"
                    className={`pl-7 ${
                      darkMode 
                        ? 'bg-slate-700 border-slate-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    min="0"
                    step="1"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Método de Pago */}
            <div>
              <Label htmlFor="metodoPago" className={`text-sm font-semibold mb-2 block ${
                darkMode ? 'text-slate-200' : 'text-gray-700'
              }`}>
                Medio de Pago del Egreso *
              </Label>
              <select
                id="metodoPago"
                value={formData.metodoPago}
                onChange={(e) => setFormData({ ...formData, metodoPago: e.target.value as MedioPagoEgreso })}
                className={`flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
                required
              >
                <option value="">Seleccionar medio de pago del egreso</option>
                {(['efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta'] as const).map((key) => {
                  const config = METODOS_PAGO_CONFIG[key];
                  return (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Notas */}
            <div>
              <Label htmlFor="notas" className={`text-sm font-semibold mb-2 block ${
                darkMode ? 'text-slate-200' : 'text-gray-700'
              }`}>
                Notas Adicionales (Opcional)
              </Label>
              <textarea
                id="notas"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                className={`w-full h-24 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode 
                    ? 'bg-slate-700 border border-slate-600 text-white placeholder:text-slate-400' 
                    : 'bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400'
                }`}
                placeholder="Información adicional sobre este gasto..."
              />
            </div>

            <DialogFooter className="gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={cerrarModal}
                className={darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                {gastoEditando ? 'Actualizar' : 'Guardar'} Gasto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmarSesion} onOpenChange={setShowConfirmarSesion}>
        <DialogContent className={`${
          darkMode
            ? 'bg-slate-800 border-slate-700 text-white'
            : 'bg-white border-gray-200 text-gray-900'
        }`}>
          <DialogHeader>
            <DialogTitle className={`text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Confirmar Registro de Egreso
            </DialogTitle>
          </DialogHeader>

          <div className={`rounded-lg p-4 border ${darkMode ? 'border-slate-600 bg-slate-700/40' : 'border-gray-200 bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Este gasto quedará vinculado obligatoriamente a la sesión de caja activa:
            </p>
            <p className="font-bold break-all">Sesión: {sesionActivaGasto?.id || 'N/A'}</p>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              Apertura: {sesionActivaGasto?.aperturaISO
                ? format(new Date(sesionActivaGasto.aperturaISO), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
                : 'N/A'}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowConfirmarSesion(false);
                setGastoPendiente(null);
                setSesionActivaGasto(null);
              }}
              className={darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmarRegistroGasto}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
            >
              Confirmar y Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}