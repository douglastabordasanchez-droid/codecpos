
/**
 * CODEC POS v2.0 - Módulo de Ventas (CLEAN ARCHITECTURE)
 * Conectado directamente a Electron Store (IndexedDB)
 * Sin dependencia de localStorage o fetch externo
 * Actualización en tiempo real con listeners
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Receipt,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Clock,
  Filter,
  Download,
  Eye,
  CreditCard,
  Package,
  User,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Mail,
  Send,
  MessageCircle,
  Copy,
  Printer,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { toast } from 'sonner';
import { electronStore, Venta } from '../../lib/electronStore';
import { useDebounce } from '../../hooks/useDebounce';
import { usePOS } from '../../contexts/POSContext';
import { PremiumButton } from '../licencia/PremiumFeature';
import { descargarReporteVentasPDF, descargarFacturaPDF, enviarFacturaPorWhatsApp, enviarFacturaPorEmail } from '../../lib/pdfGenerator';
import { descargarReporteVentasExcel } from '../../lib/excelGenerator';
import ModalImprimirFactura from './ModalImprimirFactura';

type FiltroFecha = 'hoy' | 'ayer' | 'semana' | 'mes' | 'todos' | 'personalizado';
type OrdenVentas = 'fecha_desc' | 'fecha_asc' | 'total_desc';

const VENTAS_POR_PAGINA = 50;

export default function VentasPage() {
  const { darkMode } = usePOS();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('hoy');
  const [searchTerm, setSearchTerm] = useState('');
  // 🚀 FIX rendimiento: filtro pesado usa el valor debounced; el input
  // sigue controlado por searchTerm para no perder fluidez al escribir.
  const debouncedSearchTerm = useDebounce(searchTerm, 200);
  const [ordenVentas, setOrdenVentas] = useState<OrdenVentas>('fecha_desc');
  const [fechaInicioPersonalizada, setFechaInicioPersonalizada] = useState('');
  const [fechaFinPersonalizada, setFechaFinPersonalizada] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null);
  const [ventaParaImprimir, setVentaParaImprimir] = useState<Venta | null>(null);
  const [paginaActual, setPaginaActual] = useState(1);

  // 🔄 Cargar ventas desde ElectronStore
  const cargarVentas = async () => {
    try {
      setLoading(true);
      const ventasData = await electronStore.obtenerVentas();

      // ✅ Asegurar que todos los números son numéricos
      const ventasNormalizadas = ventasData.map(venta => ({
        ...venta,
        total: Number(venta.total) || 0,
        subtotal: Number(venta.subtotal) || 0,
        descuento: Number(venta.descuento) || 0,
        items: venta.items.map(item => ({
          ...item,
          cantidad: Number(item.cantidad) || 0,
          precio: Number(item.precio) || 0,
          subtotal: Number(item.subtotal) || 0,
          costo: Number(item.costo) || 0,
        })),
      }));

      setVentas(ventasNormalizadas);
    } catch (error) {
      console.error('❌ Error cargando ventas:', error);
      toast.error('Error al cargar las ventas');
    } finally {
      setLoading(false);
    }
  };

  // 📊 Filtrar + ordenar — derivado con useMemo en vez de estado propio +
  // efecto: evita recalcular sobre TODO el historial y re-renderizar en cada
  // tecla del buscador; solo se recalcula cuando alguna dependencia cambia.
  const ventasFiltradas = useMemo(() => {
    let resultado = ventas;

    // Filtro por fecha
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const hace7dias = new Date(hoy);
    hace7dias.setDate(hace7dias.getDate() - 7);
    const hace30dias = new Date(hoy);
    hace30dias.setDate(hace30dias.getDate() - 30);

    resultado = resultado.filter(venta => {
      const fechaVenta = new Date(venta.fecha);

      switch (filtroFecha) {
        case 'hoy':
          return fechaVenta >= hoy;
        case 'ayer':
          return fechaVenta >= ayer && fechaVenta < hoy;
        case 'semana':
          return fechaVenta >= hace7dias;
        case 'mes':
          return fechaVenta >= hace30dias;
        case 'todos':
        default:
          return true;
      }
    });

    if (filtroFecha === 'personalizado') {
      resultado = resultado.filter(venta => {
        const fechaVenta = new Date(venta.fecha);
        const inicio = fechaInicioPersonalizada ? new Date(`${fechaInicioPersonalizada}T00:00:00`) : null;
        const fin = fechaFinPersonalizada ? new Date(`${fechaFinPersonalizada}T23:59:59`) : null;

        if (inicio && fechaVenta < inicio) return false;
        if (fin && fechaVenta > fin) return false;
        return true;
      });
    }

    // Filtro por búsqueda
    if (debouncedSearchTerm.trim()) {
      const termino = debouncedSearchTerm.toLowerCase();
      resultado = resultado.filter(venta =>
        venta.id.toLowerCase().includes(termino) ||
        venta.cajero.toLowerCase().includes(termino) ||
        String((venta as any).mesa || '').toLowerCase().includes(termino) ||
        venta.items.some(item => item.nombre.toLowerCase().includes(termino))
      );
    }

    resultado = [...resultado].sort((a, b) => {
      if (ordenVentas === 'total_desc') {
        return Number(b.total) - Number(a.total);
      }

      if (ordenVentas === 'fecha_asc') {
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      }

      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

    return resultado;
  }, [ventas, filtroFecha, debouncedSearchTerm, ordenVentas, fechaInicioPersonalizada, fechaFinPersonalizada]);

  // Volver a la página 1 cuando cambia cualquier filtro
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroFecha, searchTerm, ordenVentas, fechaInicioPersonalizada, fechaFinPersonalizada]);

  const totalPaginas = Math.max(1, Math.ceil(ventasFiltradas.length / VENTAS_POR_PAGINA));
  const ventasPaginadas = useMemo(
    () => ventasFiltradas.slice((paginaActual - 1) * VENTAS_POR_PAGINA, paginaActual * VENTAS_POR_PAGINA),
    [ventasFiltradas, paginaActual]
  );
  const irAPagina = useCallback((pagina: number) => {
    setPaginaActual(prev => Math.max(1, Math.min(pagina, totalPaginas)) || prev);
  }, [totalPaginas]);

  // 🎯 Efecto inicial y listener en tiempo real
  useEffect(() => {
    cargarVentas();

    // 📡 Escuchar nuevas ventas en tiempo real
    const handleVentaNueva = (_nuevaVenta: Venta) => {
      cargarVentas();
    };

    electronStore.onVentaNueva(handleVentaNueva);

    // ☁️ syncService.ts ya baja las ventas hechas desde la PWA a IndexedDB y
    // dispara este evento — pero antes nadie lo escuchaba, así que una venta
    // móvil solo aparecía acá tras recargar. Se refresca igual que una venta
    // nueva local.
    window.addEventListener('codecpos:ventas-sincronizadas', handleVentaNueva as EventListener);

    return () => {
      electronStore.offVentaNueva(handleVentaNueva);
      window.removeEventListener('codecpos:ventas-sincronizadas', handleVentaNueva as EventListener);
    };
  }, []);

  // 📊 Calcular estadísticas — memoizado junto con ventasFiltradas para no
  // recorrer el historial filtrado de nuevo en cada render (antes corría
  // aunque el filtro no hubiera cambiado, ej. al escribir en otro campo).
  const { totalVentas, totalIngresos, promedioVenta, ventasPorMetodo } = useMemo(() => {
    const totalVentas = ventasFiltradas.length;
    const totalIngresos = ventasFiltradas.reduce((sum, v) => sum + Number(v.total), 0);
    const promedioVenta = totalVentas > 0 ? totalIngresos / totalVentas : 0;
    const ventasPorMetodo = ventasFiltradas.reduce((acc, venta) => {
      acc[venta.metodoPago] = (acc[venta.metodoPago] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { totalVentas, totalIngresos, promedioVenta, ventasPorMetodo };
  }, [ventasFiltradas]);

  // 💾 Exportar a CSV
  const exportarCSV = () => {
    const headers = ['Fecha', 'Factura', 'Cajero', 'Mesa', 'Total', 'Método de Pago', 'Items'];
    const rows = ventasFiltradas.map(venta => [
      format(new Date(venta.fecha), 'dd/MM/yyyy HH:mm', { locale: es }),
      venta.id,
      venta.cajero,
      (venta as any).mesa || 'General',
      venta.total.toString(),
      venta.metodoPago,
      venta.items.length.toString(),
    ]);

    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ventas_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    link.click();
    
    toast.success('Reporte exportado correctamente');
  };

  // 📄 Exportar a PDF
  const exportarPDF = async () => {
    try {
      // Validación: verificar que hay ventas para exportar
      if (ventasFiltradas.length === 0) {
        toast.error('⚠️ No hay ventas para exportar con los filtros actuales', {
          description: `Cambia el filtro de fecha. Total disponible: ${ventas.length} ventas`
        });
        return;
      }

      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = {
        nombreComercial: config.nombreComercial || 'CODEC POS',
        razonSocial: config.razonSocial || '',
        nit: config.nit || '',
        direccion: config.direccion || '',
        telefono: config.telefono || '',
        email: config.email || '',
        ciudad: config.ciudad || '',
        logoUrl: config.logoUrl || '',
      };

      const ventasParaPDF = ventasFiltradas.map(v => ({
        numeroFactura: v.numeroFactura || v.id,
        fecha: v.fecha,
        items: v.items.map(i => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio,
          subtotal: i.subtotal,
        })),
        subtotal: v.subtotal || 0,
        iva: v.iva || 0,
        total: v.total,
        metodoPago: v.metodoPago,
        cajero: v.cajero,
        cliente: 'Consumidor Final',
      }));

      const fechaInicio = ventasFiltradas.length > 0 
        ? ventasFiltradas[ventasFiltradas.length - 1].fecha 
        : new Date().toISOString();
      const fechaFin = ventasFiltradas.length > 0 
        ? ventasFiltradas[0].fecha 
        : new Date().toISOString();

      await descargarReporteVentasPDF(ventasParaPDF, empresa, fechaInicio, fechaFin);
      toast.success(`📄 Reporte PDF descargado: ${ventasFiltradas.length} ventas`);
    } catch (error) {
      console.error('Error generando PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  // 📊 Exportar a Excel
  const exportarExcel = async () => {
    try {
      // Validación: verificar que hay ventas para exportar
      if (ventasFiltradas.length === 0) {
        toast.error('⚠️ No hay ventas para exportar con los filtros actuales', {
          description: `Cambia el filtro de fecha. Total disponible: ${ventas.length} ventas`
        });
        return;
      }

      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const nombreEmpresa = config.nombreComercial || 'CODEC POS';

      const ventasParaExcel = ventasFiltradas.map(v => ({
        numeroFactura: v.numeroFactura || v.id,
        fecha: v.fecha,
        items: v.items.map(i => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio,
          subtotal: i.subtotal,
        })),
        subtotal: v.subtotal || 0,
        iva: v.iva || 0,
        total: v.total,
        metodoPago: v.metodoPago,
        cajero: v.cajero,
        cliente: 'Consumidor Final',
      }));

      const fechaInicio = ventasFiltradas.length > 0 
        ? ventasFiltradas[ventasFiltradas.length - 1].fecha 
        : new Date().toISOString();
      const fechaFin = ventasFiltradas.length > 0 
        ? ventasFiltradas[0].fecha 
        : new Date().toISOString();

      descargarReporteVentasExcel(ventasParaExcel, fechaInicio, fechaFin, nombreEmpresa);
      toast.success(`📊 Reporte Excel descargado: ${ventasFiltradas.length} ventas`);
    } catch (error) {
      console.error('Error generando Excel:', error);
      toast.error('Error al generar el Excel');
    }
  };

  // 📄 Descargar factura individual como PDF
  const descargarFacturaIndividual = async (venta: Venta) => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = {
        nombreComercial: config.nombreComercial || 'CODEC POS',
        razonSocial: config.razonSocial || '',
        nit: config.nit || '',
        direccion: config.direccion || '',
        telefono: config.telefono || '',
        email: config.email || '',
        ciudad: config.ciudad || '',
        logoUrl: config.logoUrl || '',
      };

      const ventaPDF = {
        numeroFactura: venta.numeroFactura || venta.id,
        fecha: venta.fecha,
        items: venta.items.map(i => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio,
          subtotal: i.subtotal,
        })),
        subtotal: venta.subtotal || 0,
        iva: venta.iva || 0,
        total: venta.total,
        metodoPago: venta.metodoPago,
        cajero: venta.cajero,
        cliente: 'Consumidor Final',
      };

      await descargarFacturaPDF(ventaPDF, empresa);
      toast.success(`📄 Factura ${venta.numeroFactura || venta.id} descargada`);
    } catch (error) {
      console.error('Error descargando factura:', error);
      toast.error('Error al descargar la factura');
    }
  };

  // 🖨️ Abrir modal de impresión de factura
  const imprimirFactura = (venta: Venta) => setVentaParaImprimir(venta);

  // 🎨 Formatear moneda
  const formatCurrency = (value: number): string => {
    return `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // 📋 Copiar número de factura
  const copiarNumeroFactura = async (numeroFactura: string) => {
    try {
      const numeroFacturaLimpio = numeroFactura.replace(/\s+/g, '').trim();
      await navigator.clipboard.writeText(numeroFacturaLimpio);
      toast.success(`Factura ${numeroFacturaLimpio} copiada al portapapeles`);
    } catch (error) {
      console.error('Error copiando factura:', error);
      toast.error('No se pudo copiar el número de factura');
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode 
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'
      }`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className={`w-16 h-16 border-4 border-t-transparent rounded-full mx-auto mb-4 ${
              darkMode ? 'border-emerald-500' : 'border-purple-600'
            }`}
          />
          <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Cargando ventas...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-y-auto p-6 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'
    }`}>
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-center justify-between"
      >
        <div>
          <h1 className={`text-4xl font-bold mb-2 flex items-center gap-3 ${
            darkMode ? 'text-white' : 'text-slate-900'
          }`}>
            <Receipt className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
            Historial de Ventas
          </h1>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
            Gestión y análisis de todas las transacciones
          </p>
        </div>
        <Button
          onClick={cargarVentas}
          className={`${
            darkMode
              ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
              : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg'
          }`}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className={`${
            darkMode
              ? 'bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-500/20'
              : 'bg-white border-purple-200 shadow-lg shadow-purple-100'
          } hover:scale-105 transition-transform`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium mb-1 ${
                    darkMode ? 'text-purple-300' : 'text-purple-600'
                  }`}>Total Ventas</p>
                  <p className={`text-2xl lg:text-3xl font-black truncate ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>{totalVentas}</p>
                </div>
                <ShoppingCart className={`w-12 h-12 opacity-50 ${
                  darkMode ? 'text-purple-400' : 'text-purple-500'
                }`} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className={`${
            darkMode
              ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border-emerald-500/20'
              : 'bg-white border-emerald-200 shadow-lg shadow-emerald-100'
          } hover:scale-105 transition-transform`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium mb-1 ${
                    darkMode ? 'text-emerald-300' : 'text-emerald-600'
                  }`}>Ingresos Totales</p>
                  <p className={`text-xl lg:text-2xl font-black truncate ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>{formatCurrency(totalIngresos)}</p>
                </div>
                <DollarSign className={`w-12 h-12 opacity-50 ${
                  darkMode ? 'text-emerald-400' : 'text-emerald-600'
                }`} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className={`${
            darkMode
              ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/20'
              : 'bg-white border-blue-200 shadow-lg shadow-blue-100'
          } hover:scale-105 transition-transform`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium mb-1 ${
                    darkMode ? 'text-blue-300' : 'text-blue-600'
                  }`}>Promedio Venta</p>
                  <p className={`text-xl lg:text-2xl font-black truncate ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>{formatCurrency(promedioVenta)}</p>
                </div>
                <TrendingUp className={`w-12 h-12 opacity-50 ${
                  darkMode ? 'text-blue-400' : 'text-blue-600'
                }`} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Card className={`${
            darkMode
              ? 'bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-amber-500/20'
              : 'bg-white border-amber-200 shadow-lg shadow-amber-100'
          } hover:scale-105 transition-transform`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium mb-1 ${
                    darkMode ? 'text-amber-300' : 'text-amber-600'
                  }`}>Efectivo</p>
                  <p className={`text-2xl lg:text-3xl font-black truncate ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>{ventasPorMetodo['efectivo'] || 0}</p>
                </div>
                <DollarSign className={`w-12 h-12 opacity-50 ${
                  darkMode ? 'text-amber-400' : 'text-amber-600'
                }`} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filtros y Reportes */}
      <Card className={`mb-6 ${
        darkMode
          ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700 backdrop-blur-sm'
          : 'bg-white border-slate-100 shadow-sm'
      }`}>
        <CardContent className="p-6">
          {/* Header de Reportes */}
          <div className={`mb-6 pb-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-xl font-bold flex items-center gap-2 ${
                  darkMode ? 'text-white' : 'text-slate-900'
                }`}>
                  <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                  Reportes y Exportación
                </h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Filtra y exporta las ventas en múltiples formatos
                </p>
              </div>
              
              {/* Indicador de ventas disponibles */}
              <div className={`px-6 py-3 rounded-xl border-2 ${
                darkMode 
                  ? 'bg-slate-700/50 border-slate-600' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="text-center">
                  <p className={`text-xs font-semibold ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Ventas en Base de Datos
                  </p>
                  <p className={`text-3xl font-black ${
                    darkMode ? 'text-emerald-400' : 'text-emerald-600'
                  }`}>
                    {ventas.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Filtros de Fecha */}
            <div className="space-y-3">
              <label className={`text-sm font-semibold mb-2 flex items-center gap-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                <Filter className="w-4 h-4" />
                Filtrar por Período
              </label>
              
              <div className="grid grid-cols-3 gap-2">
                {(['hoy', 'ayer', 'semana'] as FiltroFecha[]).map(filtro => (
                  <Button
                    key={filtro}
                    onClick={() => setFiltroFecha(filtro)}
                    variant={filtroFecha === filtro ? 'default' : 'outline'}
                    className={`text-xs ${
                      filtroFecha === filtro
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold shadow-lg'
                        : darkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    size="sm"
                  >
                    {filtro === 'hoy' ? '📅 Hoy' : filtro === 'ayer' ? '📆 Ayer' : '📊 Semana'}
                  </Button>
                ))}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {(['mes', 'todos'] as FiltroFecha[]).map(filtro => (
                  <Button
                    key={filtro}
                    onClick={() => setFiltroFecha(filtro)}
                    variant={filtroFecha === filtro ? 'default' : 'outline'}
                    className={`text-xs ${
                      filtroFecha === filtro
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold shadow-lg'
                        : darkMode
                          ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    size="sm"
                  >
                    {filtro === 'mes' ? '📈 Mes' : '🗂️ Todas'}
                  </Button>
                ))}
              </div>

              <Button
                onClick={() => setFiltroFecha('personalizado')}
                variant={filtroFecha === 'personalizado' ? 'default' : 'outline'}
                className={`w-full text-xs ${
                  filtroFecha === 'personalizado'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold shadow-lg'
                    : darkMode
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
                size="sm"
              >
                🧩 Personalizado
              </Button>

              {filtroFecha === 'personalizado' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={fechaInicioPersonalizada}
                    onChange={(e) => setFechaInicioPersonalizada(e.target.value)}
                    className={`${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-slate-900'
                    } text-xs`}
                  />
                  <Input
                    type="date"
                    value={fechaFinPersonalizada}
                    onChange={(e) => setFechaFinPersonalizada(e.target.value)}
                    className={`${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-slate-900'
                    } text-xs`}
                  />
                </div>
              )}

              {/* Indicador de filtrado */}
              <div className={`mt-3 p-3 rounded-lg border ${
                ventasFiltradas.length === 0
                  ? darkMode 
                    ? 'bg-red-900/20 border-red-700/30 text-red-400' 
                    : 'bg-red-50 border-red-200 text-red-700'
                  : darkMode 
                    ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <p className="text-xs font-semibold">
                  {ventasFiltradas.length === 0 
                    ? `⚠️ Sin ventas en "${filtroFecha}"` 
                    : `✅ ${ventasFiltradas.length} ventas filtradas`}
                </p>
              </div>
            </div>

            {/* Búsqueda */}
            <div className="space-y-3">
              <label className={`text-sm font-semibold ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                🔍 Buscar en Ventas
              </label>
              <Input
                type="text"
                placeholder="Factura, cajero o producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${
                  darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-400' 
                    : 'bg-white border-gray-300 text-slate-900'
                }`}
              />

              <div className="space-y-2">
                <label className={`text-xs font-semibold ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  ↕️ Ordenar ventas
                </label>
                <select
                  value={ordenVentas}
                  onChange={(e) => setOrdenVentas(e.target.value as OrdenVentas)}
                  className={`w-full h-10 rounded-md px-3 text-sm border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-slate-900'
                  }`}
                >
                  <option value="total_desc">Mayor a menor (Total)</option>
                  <option value="fecha_asc">Fecha más antigua → más nueva</option>
                  <option value="fecha_desc">Fecha más nueva → más antigua</option>
                </select>
              </div>
              
              {/* Resumen de exportación */}
              <div className={`p-4 rounded-lg border-2 ${
                darkMode 
                  ? 'bg-blue-900/20 border-blue-700/30' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-xs font-semibold mb-2 ${
                  darkMode ? 'text-blue-400' : 'text-blue-900'
                }`}>
                  📊 Resumen de Exportación:
                </p>
                <ul className={`text-xs space-y-1 ${
                  darkMode ? 'text-blue-300' : 'text-blue-800'
                }`}>
                  <li>• Ventas a exportar: <span className="font-bold">{ventasFiltradas.length}</span></li>
                  <li>• Total ingresos: <span className="font-bold">{formatCurrency(totalIngresos)}</span></li>
                  <li>• Filtro activo: <span className="font-bold capitalize">{filtroFecha}</span></li>
                  <li>• Orden: <span className="font-bold">
                    {ordenVentas === 'total_desc'
                      ? 'Mayor a menor (total)'
                      : ordenVentas === 'fecha_asc'
                        ? 'Fecha antigua a nueva'
                        : 'Fecha nueva a antigua'}
                  </span></li>
                </ul>
              </div>
            </div>

            {/* Botones de Exportación */}
            <div className="space-y-3">
              <label className={`text-sm font-semibold ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                💾 Exportar Reporte
              </label>
              
              <div className="space-y-2">
                <Button
                  onClick={exportarPDF}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={ventasFiltradas.length === 0}
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Descargar PDF
                </Button>
                
                <PremiumButton
                  feature="reportes_avanzados"
                  onClick={exportarExcel}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={ventasFiltradas.length === 0}
                >
                  <FileSpreadsheet className="w-5 h-5 mr-2" />
                  Descargar Excel
                </PremiumButton>
                
                <Button
                  onClick={exportarCSV}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={ventasFiltradas.length === 0}
                >
                  <Download className="w-5 h-5 mr-2" />
                  Descargar CSV
                </Button>
              </div>

              {/* Ayuda */}
              {ventasFiltradas.length === 0 && (
                <div className={`p-3 rounded-lg border ${
                  darkMode 
                    ? 'bg-amber-900/20 border-amber-700/30' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className={`text-xs font-semibold ${
                    darkMode ? 'text-amber-400' : 'text-amber-900'
                  }`}>
                    💡 Tip: Cambia el filtro a "Todas" para ver el historial completo
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Ventas */}
      <Card className={`${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-100 shadow-sm'}`}>
        <CardContent className="p-0">
          <div className="overflow-x-auto pb-4">
            <table className="w-full">
              <thead className={darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}>
                <tr>
                  <th className={`px-6 py-4 text-left font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Factura</th>
                  <th className={`px-6 py-4 text-left font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Fecha y Hora</th>
                  <th className={`px-6 py-4 text-left font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Cajero</th>
                  <th className={`px-6 py-4 text-left font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Items</th>
                  <th className={`px-6 py-4 text-left font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Método</th>
                  <th className={`px-6 py-4 text-right font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Total</th>
                  <th className={`px-6 py-4 text-center font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Estado</th>
                  <th className={`px-6 py-4 text-center font-semibold text-sm min-w-[140px] ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
                <AnimatePresence mode="popLayout">
                  {ventasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Package className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                        <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No hay ventas para mostrar</p>
                        <p className={`text-sm mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Las ventas aparecerán aquí automáticamente'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    ventasPaginadas.map((venta, index) => (
                      <motion.tr
                        key={venta.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className={`${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80'} transition-colors`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-purple-400" />
                            <span className={`font-mono font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{venta.id}</span>
                            <button
                              onClick={() => copiarNumeroFactura(venta.id)}
                              className={`h-5 w-5 inline-flex items-center justify-center rounded-sm border transition-all ${
                                darkMode
                                  ? 'border-slate-500/60 text-slate-300 hover:text-white hover:border-slate-300 hover:bg-slate-700/70'
                                  : 'border-slate-300 text-slate-400 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-100'
                              }`}
                              title="Copiar número de factura"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              {format(new Date(venta.fecha), 'dd/MM/yyyy', { locale: es })}
                            </div>
                            <div className={`flex items-center gap-2 text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                              <Clock className="w-3 h-3" />
                              {format(new Date(venta.fecha), 'HH:mm:ss', { locale: es })}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{venta.cajero}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{venta.items.length} productos</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            venta.metodoPago === 'efectivo' ? 'bg-emerald-500/20 text-emerald-600' :
                            venta.metodoPago === 'tarjeta' ? 'bg-blue-500/20 text-blue-600' :
                            venta.metodoPago === 'nequi' ? 'bg-purple-500/20 text-purple-600' :
                            venta.metodoPago === 'daviplata' ? 'bg-red-500/20 text-red-600' :
                            venta.metodoPago === 'transferencia' ? 'bg-cyan-500/20 text-cyan-600' :
                            venta.metodoPago === 'rappi' ? 'bg-orange-500/20 text-orange-600' :
                            venta.metodoPago === 'cartera' ? 'bg-orange-600/20 text-orange-700' :
                            'bg-amber-500/20 text-amber-600'
                          }`}>
                            {venta.metodoPago.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(venta.total)}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {venta.sincronizado ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className={`w-5 h-5 mx-auto ${darkMode ? 'text-slate-500' : 'text-slate-300'}`} />
                          )}
                        </td>
                        <td className="px-4 py-4 text-center min-w-[140px]">
                          <div className="flex gap-2 justify-center flex-nowrap">
                            <Button
                              onClick={() => setVentaSeleccionada(venta)}
                              size="sm"
                              variant="outline"
                              className="border-purple-500 text-purple-500 hover:bg-purple-500/10"
                              title="Ver detalles"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => descargarFacturaIndividual(venta)}
                              size="sm"
                              variant="outline"
                              className="border-red-500 text-red-500 hover:bg-red-500/10"
                              title="Descargar PDF"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => imprimirFactura(venta)}
                              size="sm"
                              variant="outline"
                              className="border-green-500 text-green-600 hover:bg-green-500/10"
                              title="Imprimir factura"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between py-2">
          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {ventasFiltradas.length} ventas · Página {paginaActual} de {totalPaginas}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => irAPagina(1)}
              disabled={paginaActual === 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >«</button>
            <button
              onClick={() => irAPagina(paginaActual - 1)}
              disabled={paginaActual === 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >‹</button>

            {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
              const offset = Math.max(0, Math.min(paginaActual - 3, totalPaginas - 5));
              const pagina = i + 1 + offset;
              return (
                <button
                  key={pagina}
                  onClick={() => irAPagina(pagina)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    pagina === paginaActual
                      ? 'bg-blue-600 text-white shadow-md'
                      : darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >{pagina}</button>
              );
            })}

            <button
              onClick={() => irAPagina(paginaActual + 1)}
              disabled={paginaActual === totalPaginas}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >›</button>
            <button
              onClick={() => irAPagina(totalPaginas)}
              disabled={paginaActual === totalPaginas}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >»</button>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Venta */}
      <AnimatePresence>
        {ventaSeleccionada && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setVentaSeleccionada(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-800 rounded-2xl max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">Detalle de Venta</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Factura</p>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-bold">{ventaSeleccionada.id}</p>
                      <button
                        onClick={() => copiarNumeroFactura(ventaSeleccionada.id)}
                        className="h-5 w-5 inline-flex items-center justify-center rounded-sm border border-slate-500/60 text-slate-300 hover:text-white hover:border-slate-300 hover:bg-slate-700/70 transition-all"
                        title="Copiar número de factura"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Cajero</p>
                    <p className="text-white font-bold">{ventaSeleccionada.cajero}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Fecha</p>
                    <p className="text-white font-bold">
                      {format(new Date(ventaSeleccionada.fecha), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Método de Pago</p>
                    <p className="text-white font-bold">{ventaSeleccionada.metodoPago.toUpperCase()}</p>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <h3 className="text-white font-bold mb-4">Productos</h3>
                  {ventaSeleccionada.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0">
                      <div>
                        <p className="text-white font-medium">{item.nombre}</p>
                        <p className="text-slate-400 text-sm">
                          {item.cantidad} x {formatCurrency(item.precio)}
                        </p>
                      </div>
                      <p className="text-white font-bold">{formatCurrency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 pt-4 space-y-2">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(ventaSeleccionada.subtotal)}</span>
                  </div>
                  {ventaSeleccionada.descuento > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>Descuento:</span>
                      <span>-{formatCurrency(ventaSeleccionada.descuento)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white text-xl font-bold">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(ventaSeleccionada.total)}</span>
                  </div>
                </div>

                <Button
                  onClick={() => setVentaSeleccionada(null)}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  Cerrar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Impresión de Factura */}
      <ModalImprimirFactura
        open={!!ventaParaImprimir}
        venta={ventaParaImprimir}
        onClose={() => setVentaParaImprimir(null)}
        darkMode={darkMode}
      />
    </div>
  );
}
