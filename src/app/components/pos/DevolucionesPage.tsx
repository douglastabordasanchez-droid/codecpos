/**
 * CODEC POS - Sistema de Devoluciones
 * Gestión completa de devoluciones con actualización de inventario
 * Desarrollado por Codec Studio
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Search,
  Calendar,
  Package,
  DollarSign,
  FileText,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Clock,
  TrendingDown,
  RotateCcw,
  Trash2,
  Plus,
  Minus,
  Receipt,
  Download,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { dispararEvento } from '../../lib/webhookService';
import { toast } from 'sonner';
import { electronStore } from '../../lib/electronStore';

interface VentaItem {
  id: string;
  codigo?: string;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  costo?: number;
  categoria?: string;
}

interface Venta {
  id: string;
  numero?: number;
  numeroFactura?: string;
  fecha: string;
  items: VentaItem[];
  total: number;
  metodoPago: string;
  cajero: string;
  cajeroId?: string;
}

interface Devolucion {
  id: string;
  ventaId: string;
  numeroFactura: string;
  fecha: string;
  items: {
    productoId: string;
    nombre: string;
    cantidadDevuelta: number;
    precioUnitario: number;
    subtotal: number;
    motivo: string;
  }[];
  totalDevolucion: number;
  metodoPago: string;
  procesadoPor: string;
  observaciones: string;
  estado: 'completada' | 'pendiente' | 'rechazada';
}

export default function DevolucionesPage() {
  const { darkMode, triggerRefresh } = usePOS();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'nueva' | 'historial'>('nueva');
  const [searchFactura, setSearchFactura] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null);
  const [itemsDevolucion, setItemsDevolucion] = useState<{
    [key: string]: {
      cantidad: number;
      motivo: string;
    };
  }>({});
  const [observaciones, setObservaciones] = useState('');
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [filtroFecha, setFiltroFecha] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loadingVentas, setLoadingVentas] = useState(true);

  useEffect(() => {
    cargarDevoluciones();
    cargarVentas();
  }, []);

  const cargarDevoluciones = () => {
    const saved = localStorage.getItem('codecpos_devoluciones');
    if (saved) {
      setDevoluciones(JSON.parse(saved));
    }
  };

  const cargarVentas = async () => {
    setLoadingVentas(true);
    try {
      const ventasDB = await electronStore.obtenerTodasLasVentas();
      const ventasMapeadas: Venta[] = ventasDB.map(venta => ({
        id: venta.id,
        numero: venta.numero,
        numeroFactura: venta.id,
        fecha: venta.fecha,
        items: venta.items.map(item => ({
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio || item.precioVenta || 0,
          subtotal: item.subtotal || (item.precio || 0) * item.cantidad,
          costo: item.costo || item.precioCompra || 0,
          categoria: item.categoria,
        })),
        total: venta.total,
        metodoPago: venta.metodoPago,
        cajero: venta.cajero,
        cajeroId: venta.cajeroId,
      }));
      setVentas(ventasMapeadas);
    } catch (error) {
      console.error('Error cargando ventas:', error);
      toast.error('Error al cargar el historial de ventas');
    } finally {
      setLoadingVentas(false);
    }
  };

  const buscarFactura = () => {
    if (!searchFactura.trim()) {
      toast.error('Ingresa un número de factura');
      return;
    }

    const venta = ventas.find(
      (v) => v.numeroFactura.toLowerCase() === searchFactura.toLowerCase()
    );

    if (!venta) {
      toast.error('Factura no encontrada', {
        description: `No se encontró la factura ${searchFactura}`,
      });
      return;
    }

    // Verificar si ya tiene devolución completa
    const devolucionExistente = devoluciones.filter(d => d.ventaId === venta.id);
    if (devolucionExistente.length > 0) {
      toast.warning('Esta factura ya tiene devoluciones registradas', {
        description: 'Puedes hacer devoluciones parciales adicionales',
      });
    }

    setVentaSeleccionada(venta);
    setItemsDevolucion({});
    setObservaciones('');
    toast.success('Factura encontrada', {
      description: `Total: $${venta.total.toLocaleString('es-CO')}`,
    });
  };

  const actualizarCantidadDevolucion = (itemId: string, cantidad: number) => {
    const item = ventaSeleccionada?.items.find((i) => i.id === itemId);
    if (!item) return;

    if (cantidad < 0 || cantidad > item.cantidad) {
      toast.error('Cantidad inválida', {
        description: `Máximo ${item.cantidad} unidades disponibles`,
      });
      return;
    }

    if (cantidad === 0) {
      const newItems = { ...itemsDevolucion };
      delete newItems[itemId];
      setItemsDevolucion(newItems);
    } else {
      setItemsDevolucion((prev) => ({
        ...prev,
        [itemId]: {
          cantidad,
          motivo: prev[itemId]?.motivo || '',
        },
      }));
    }
  };

  const actualizarMotivo = (itemId: string, motivo: string) => {
    if (!itemsDevolucion[itemId]) return;

    setItemsDevolucion((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        motivo,
      },
    }));
  };

  const calcularTotalDevolucion = () => {
    if (!ventaSeleccionada) return 0;

    return Object.entries(itemsDevolucion).reduce((total, [itemId, data]) => {
      const item = ventaSeleccionada.items.find((i) => i.id === itemId);
      if (!item) return total;
      return total + item.precio * data.cantidad;
    }, 0);
  };

  const procesarDevolucion = async () => {
    if (!ventaSeleccionada) {
      toast.error('No hay venta seleccionada');
      return;
    }

    if (Object.keys(itemsDevolucion).length === 0) {
      toast.error('Selecciona al menos un producto para devolver');
      return;
    }

    // Validar que todos los items tengan motivo
    for (const [itemId, data] of Object.entries(itemsDevolucion)) {
      if (!data.motivo.trim()) {
        const item = ventaSeleccionada.items.find((i) => i.id === itemId);
        toast.error('Falta motivo de devolución', {
          description: `Especifica el motivo para ${item?.nombre}`,
        });
        return;
      }
    }

    setProcessing(true);

    try {
      // Crear registro de devolución
      const nuevaDevolucion: Devolucion = {
        id: `DEV${Date.now()}`,
        ventaId: ventaSeleccionada.id,
        numeroFactura: ventaSeleccionada.numeroFactura!,
        fecha: new Date().toISOString(),
        items: Object.entries(itemsDevolucion).map(([itemId, data]) => {
          const item = ventaSeleccionada.items.find((i) => i.id === itemId)!;
          return {
            productoId: itemId,
            nombre: item.nombre,
            cantidadDevuelta: data.cantidad,
            precioUnitario: item.precio,
            subtotal: item.precio * data.cantidad,
            motivo: data.motivo,
          };
        }),
        totalDevolucion: calcularTotalDevolucion(),
        metodoPago: ventaSeleccionada.metodoPago,
        procesadoPor: user?.username || user?.nombreCompleto || 'Usuario Actual',
        observaciones: observaciones,
        estado: 'completada',
      };

      // Guardar devolución de forma atómica (devolución + inventario + estado venta)
      const esDevolucionTotal =
        ventaSeleccionada.items.length > 0 &&
        ventaSeleccionada.items.every((item) => {
          const itemDevuelto = itemsDevolucion[item.id];
          return !!itemDevuelto && itemDevuelto.cantidad === item.cantidad;
        });

      await electronStore.registrarDevolucionAtomica({
        devolucion: {
          ...nuevaDevolucion,
          items: nuevaDevolucion.items.map((i) => ({
            productoId: i.productoId,
            cantidadDevuelta: i.cantidadDevuelta,
            precioUnitario: i.precioUnitario,
            subtotal: i.subtotal,
          })),
        },
        // ✅ Solo marcar la venta completa como devuelta cuando realmente
        // se devolvieron todos los ítems en su totalidad.
        marcarVentaComoDevuelta: esDevolucionTotal,
      });

      const nuevasDevoluciones = [...devoluciones, nuevaDevolucion];
      // 💾 Persistir en localStorage para que sobrevivan recargas
      localStorage.setItem('codecpos_devoluciones', JSON.stringify(nuevasDevoluciones));
      setDevoluciones(nuevasDevoluciones);

      // Actualizar estadísticas
      const stats = JSON.parse(localStorage.getItem('codecpos_stats') || '{}');
      stats.totalDevoluciones = (stats.totalDevoluciones || 0) + 1;
      stats.montoDevoluciones = (stats.montoDevoluciones || 0) + nuevaDevolucion.totalDevolucion;
      localStorage.setItem('codecpos_stats', JSON.stringify(stats));

      // Limpiar formulario
      setVentaSeleccionada(null);
      setItemsDevolucion({});
      setObservaciones('');
      setSearchFactura('');

      // Notificar éxito
      toast.success('Devolución procesada exitosamente', {
        description: `Total devuelto: $${nuevaDevolucion.totalDevolucion.toLocaleString('es-CO')}`,
      });

      // 🔔 Notificar webhooks
      dispararEvento('devolucion_registrada', {
        monto: nuevaDevolucion.totalDevolucion,
        motivo: nuevaDevolucion.items.map(i => i.motivo).filter(Boolean).join(', ') || 'No especificado',
        factura: nuevaDevolucion.ventaId,
        cajero: user?.nombreCompleto || user?.username || 'Cajero',
        items: nuevaDevolucion.items?.length || 0,
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      // Trigger refresh para actualizar otros componentes
      triggerRefresh();

      // Cambiar a tab de historial
      setActiveTab('historial');
    } catch (error) {
      console.error('Error procesando devolución:', error);
      toast.error('Error al procesar la devolución');
    } finally {
      setProcessing(false);
    }
  };

  const cancelarDevolucion = () => {
    setVentaSeleccionada(null);
    setItemsDevolucion({});
    setObservaciones('');
    setSearchFactura('');
    toast.info('Devolución cancelada');
  };

  const exportarPDF = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';
      const nit = config.nit ? `NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const ahora = new Date();

      doc.setFillColor(234, 88, 12);
      doc.rect(0, 0, W, 32, 'F');
      if (config.logoUrl) {
        try {
          const ext = config.logoUrl.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(config.logoUrl, ext, W - 34, 4, 22, 22);
        } catch { /* skip */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(empresa, 14, 12);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      if (nit) doc.text(nit, 14, 18);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE DEVOLUCIONES', 14, 27);
      doc.setTextColor(0, 0, 0);

      let y = 38;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, 14, y);
      y += 5;
      doc.text(
        `Total devoluciones: ${devolucionesFiltradas.length} · Monto total: $${devolucionesFiltradas.reduce((s, d) => s + d.totalDevolucion, 0).toLocaleString('es-CO')}`,
        14, y,
      );
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['Factura', 'Fecha', 'Items', 'Total', 'Método Pago', 'Procesado por', 'Estado']],
        body: devolucionesFiltradas.map(d => [
          d.numeroFactura,
          new Date(d.fecha).toLocaleDateString('es-CO'),
          d.items.map(i => `${i.cantidadDevuelta}x ${i.nombre}`).join(', ').substring(0, 40),
          `$${d.totalDevolucion.toLocaleString('es-CO')}`,
          d.metodoPago,
          d.procesadoPor,
          d.estado.charAt(0).toUpperCase() + d.estado.slice(1),
        ]),
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [255, 247, 237] },
        columnStyles: { 3: { halign: 'right' }, 6: { halign: 'center' } },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} — CODEC POS v2.0`, W / 2, 290, { align: 'center' });
      }

      doc.save(`Devoluciones-${ahora.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF de devoluciones generado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar PDF');
    }
  };

  const devolucionesFiltradas = devoluciones
    .filter((dev) => {
      if (filtroFecha) {
        const devFecha = new Date(dev.fecha).toLocaleDateString('es-CO');
        const filtro = new Date(filtroFecha).toLocaleDateString('es-CO');
        return devFecha === filtro;
      }
      return true;
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Estadísticas
  const statsHoy = devoluciones.filter(
    (d) => new Date(d.fecha).toDateString() === new Date().toDateString()
  );
  const totalDevolucionesHoy = statsHoy.length;
  const montoDevolucionesHoy = statsHoy.reduce((sum, d) => sum + d.totalDevolucion, 0);
  const totalDevoluciones = devoluciones.length;
  const montoTotalDevoluciones = devoluciones.reduce((sum, d) => sum + d.totalDevolucion, 0);

  return (
    <div className={`h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-orange-500 scrollbar-track-transparent ${darkMode ? 'bg-transparent' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between sticky top-0 z-10 pb-4"
          style={{ backgroundColor: darkMode ? '#0f172a' : '#f9fafb' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
              <RotateCcw className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Sistema de Devoluciones
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Gestión y control de devoluciones de productos
              </p>
            </div>
          </div>
          <button
            onClick={exportarPDF}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm'
            }`}
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </motion.div>

        {/* Estadísticas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Hoy
                  </p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {totalDevolucionesHoy}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Monto Hoy
                  </p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    ${montoDevolucionesHoy.toLocaleString('es-CO')}
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total
                  </p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {totalDevoluciones}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Monto Total
                  </p>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    ${montoTotalDevoluciones.toLocaleString('es-CO')}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('nueva')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'nueva'
                  ? darkMode
                    ? 'text-orange-400 border-b-2 border-orange-400'
                    : 'text-orange-600 border-b-2 border-orange-600'
                  : darkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Nueva Devolución
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'historial'
                  ? darkMode
                    ? 'text-orange-400 border-b-2 border-orange-400'
                    : 'text-orange-600 border-b-2 border-orange-600'
                  : darkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Historial
              {devoluciones.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {devoluciones.length}
                </span>
              )}
            </button>
          </div>
        </motion.div>

        {/* Contenido de Tabs */}
        <AnimatePresence mode="wait">
          {activeTab === 'nueva' && (
            <motion.div
              key="nueva"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Buscar Factura */}
              <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
                <CardHeader>
                  <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                    Buscar Factura
                  </CardTitle>
                  <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                    Ingresa el número de factura para procesar la devolución
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingVentas && (
                    <div className={`flex items-center gap-2 text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      Cargando historial de ventas...
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="Ej: FAC001234"
                        value={searchFactura}
                        onChange={(e) => setSearchFactura(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !loadingVentas && buscarFactura()}
                        disabled={loadingVentas}
                        className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                      />
                    </div>
                    <Button
                      onClick={buscarFactura}
                      disabled={loadingVentas}
                      className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:opacity-50"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Buscar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Detalles de la Venta */}
              {ventaSeleccionada && (
                <Card className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} shadow-xl`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                          Factura {ventaSeleccionada.numeroFactura}
                        </CardTitle>
                        <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                          {new Date(ventaSeleccionada.fecha).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })} · Cajero: {ventaSeleccionada.cajero}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Total Original
                        </p>
                        <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          ${ventaSeleccionada.total.toLocaleString('es-CO')}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Productos */}
                    <div className="space-y-3">
                      {ventaSeleccionada.items.map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border-2 ${
                            itemsDevolucion[item.id]
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                              : darkMode
                              ? 'border-slate-600 bg-slate-700/50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {item.nombre}
                              </h4>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Cantidad original: {item.cantidad} × ${item.precio.toLocaleString('es-CO')} = $
                                {item.subtotal.toLocaleString('es-CO')}
                              </p>
                            </div>
                          </div>

                          {/* Controles de devolución */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className={darkMode ? 'text-gray-300' : ''}>
                                Cantidad a devolver
                              </Label>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    actualizarCantidadDevolucion(
                                      item.id,
                                      (itemsDevolucion[item.id]?.cantidad || 0) - 1
                                    )
                                  }
                                  disabled={!itemsDevolucion[item.id] || itemsDevolucion[item.id].cantidad <= 0}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.cantidad}
                                  value={itemsDevolucion[item.id]?.cantidad || 0}
                                  onChange={(e) =>
                                    actualizarCantidadDevolucion(item.id, parseInt(e.target.value) || 0)
                                  }
                                  className={`text-center ${
                                    darkMode ? 'bg-slate-600 border-slate-500 text-white' : ''
                                  }`}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    actualizarCantidadDevolucion(
                                      item.id,
                                      (itemsDevolucion[item.id]?.cantidad || 0) + 1
                                    )
                                  }
                                  disabled={
                                    itemsDevolucion[item.id]?.cantidad >= item.cantidad
                                  }
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => actualizarCantidadDevolucion(item.id, item.cantidad)}
                                  className="bg-orange-600 hover:bg-orange-700"
                                >
                                  Todo
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className={darkMode ? 'text-gray-300' : ''}>
                                Motivo de devolución *
                              </Label>
                              <select
                                value={itemsDevolucion[item.id]?.motivo || ''}
                                onChange={(e) => actualizarMotivo(item.id, e.target.value)}
                                disabled={!itemsDevolucion[item.id]}
                                className={`w-full px-3 py-2 rounded-md border ${
                                  darkMode
                                    ? 'bg-slate-600 border-slate-500 text-white'
                                    : 'bg-white border-gray-300'
                                } disabled:opacity-50`}
                              >
                                <option value="">Seleccionar motivo</option>
                                <option value="producto_defectuoso">Producto defectuoso</option>
                                <option value="equivocacion">Equivocación en la compra</option>
                                <option value="producto_vencido">Producto vencido</option>
                                <option value="no_satisface">No satisface expectativas</option>
                                <option value="otro">Otro</option>
                              </select>
                            </div>
                          </div>

                          {itemsDevolucion[item.id] && (
                            <div className="mt-3 pt-3 border-t border-gray-300 dark:border-slate-600">
                              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                Subtotal devolución: $
                                {(item.precio * itemsDevolucion[item.id].cantidad).toLocaleString('es-CO')}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Observaciones */}
                    {Object.keys(itemsDevolucion).length > 0 && (
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Observaciones adicionales (opcional)
                        </Label>
                        <Textarea
                          value={observaciones}
                          onChange={(e) => setObservaciones(e.target.value)}
                          placeholder="Escribe cualquier observación adicional sobre la devolución..."
                          rows={3}
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>
                    )}

                    {/* Total de devolución */}
                    {Object.keys(itemsDevolucion).length > 0 && (
                      <div
                        className={`p-6 rounded-xl ${
                          darkMode
                            ? 'bg-gradient-to-br from-orange-900/30 to-red-900/30 border-2 border-orange-700/50'
                            : 'bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                              Total a devolver
                            </p>
                            <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              ${calcularTotalDevolucion().toLocaleString('es-CO')}
                            </p>
                          </div>
                          <Receipt className="w-12 h-12 text-orange-500" />
                        </div>
                      </div>
                    )}

                    {/* Botones de acción */}
                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={cancelarDevolucion}
                        variant="outline"
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancelar
                      </Button>
                      <Button
                        onClick={procesarDevolucion}
                        disabled={Object.keys(itemsDevolucion).length === 0 || processing}
                        className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                      >
                        {processing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Procesar Devolución
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'historial' && (
            <motion.div
              key="historial"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Filtros */}
              <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Calendar className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    <Input
                      type="date"
                      value={filtroFecha}
                      onChange={(e) => setFiltroFecha(e.target.value)}
                      className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                    />
                    {filtroFecha && (
                      <Button variant="outline" onClick={() => setFiltroFecha('')}>
                        Limpiar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Lista de devoluciones */}
              <div className="space-y-4">
                {devolucionesFiltradas.length === 0 ? (
                  <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
                    <CardContent className="p-12 text-center">
                      <ShoppingBag className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                      <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        No hay devoluciones registradas
                      </h3>
                      <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        Las devoluciones procesadas aparecerán aquí
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  devolucionesFiltradas.map((devolucion) => (
                    <Card
                      key={devolucion.id}
                      className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} shadow-lg`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {devolucion.numeroFactura}
                            </h3>
                            <div className="flex items-center gap-3 mt-1">
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <Clock className="w-4 h-4" />
                                {new Date(devolucion.fecha).toLocaleString('es-CO')}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <User className="w-4 h-4" />
                                {devolucion.procesadoPor}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold text-orange-600`}>
                              ${devolucion.totalDevolucion.toLocaleString('es-CO')}
                            </p>
                            <span
                              className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                                devolucion.estado === 'completada'
                                  ? 'bg-green-100 text-green-800'
                                  : devolucion.estado === 'pendiente'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {devolucion.estado === 'completada' && '✓ Completada'}
                              {devolucion.estado === 'pendiente' && '⏳ Pendiente'}
                              {devolucion.estado === 'rechazada' && '✗ Rechazada'}
                            </span>
                          </div>
                        </div>

                        {/* Items devueltos */}
                        <div className="space-y-2">
                          {devolucion.items.map((item, index) => (
                            <div
                              key={index}
                              className={`p-3 rounded-lg ${
                                darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                    {item.nombre}
                                  </p>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Cantidad: {item.cantidadDevuelta} × ${item.precioUnitario.toLocaleString('es-CO')}
                                  </p>
                                  <p className={`text-xs mt-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                                    Motivo: {(item.motivo || 'sin_motivo').replace(/_/g, ' ')}
                                  </p>
                                </div>
                                <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  ${item.subtotal.toLocaleString('es-CO')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {devolucion.observaciones && (
                          <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-blue-50'}`}>
                            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              <strong>Observaciones:</strong> {devolucion.observaciones}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}