/**
 * CODEC POS - Historial de devoluciones
 * Las devoluciones se hacen desde Ventas (botón de devolución de cada
 * factura, ver ModalDevolucionVenta.tsx); aquí se consultan y exportan.
 * Desarrollado por Codec Studio
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Calendar,
  Package,
  DollarSign,
  FileText,
  User,
  Clock,
  TrendingDown,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { leerConfigEmpresaPDF, dibujarLogoPDF } from '../../services/exportarReportes';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';

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

export default function DevolucionesPage({ onCerrar }: { onCerrar?: () => void } = {}) {
  const { darkMode } = usePOS();
  const activeTab = 'historial' as const;
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [filtroFecha, setFiltroFecha] = useState('');
  // 🚀 FIX rendimiento: la lista se renderizaba completa sin paginar.
  const [paginaDevoluciones, setPaginaDevoluciones] = useState(1);
  const DEVOLUCIONES_POR_PAGINA = 50;

  useEffect(() => {
    cargarDevoluciones();

    // ☁️ Una devolución registrada desde la PWA llega acá vía syncService.ts
    // (pullDevolucionesRemotas) — se refresca sin esperar a recargar.
    window.addEventListener('codecpos:devoluciones-sincronizadas', cargarDevoluciones);
    return () => window.removeEventListener('codecpos:devoluciones-sincronizadas', cargarDevoluciones);
  }, []);

  useEffect(() => {
    setPaginaDevoluciones(1);
  }, [filtroFecha]);

  const cargarDevoluciones = () => {
    const saved = localStorage.getItem('codecpos_devoluciones');
    if (saved) {
      setDevoluciones(JSON.parse(saved));
    }
  };

  const exportarPDF = () => {
    try {
      const { config, empresa, nit } = leerConfigEmpresaPDF();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const ahora = new Date();

      doc.setFillColor(234, 88, 12);
      doc.rect(0, 0, W, 32, 'F');
      dibujarLogoPDF(doc, config.logoUrl, W - 34, 4, 22, 22);
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

  const totalPaginasDevoluciones = Math.max(1, Math.ceil(devolucionesFiltradas.length / DEVOLUCIONES_POR_PAGINA));
  const paginaDevolucionesSegura = Math.min(paginaDevoluciones, totalPaginasDevoluciones);
  const devolucionesPagina = devolucionesFiltradas.slice(
    (paginaDevolucionesSegura - 1) * DEVOLUCIONES_POR_PAGINA,
    paginaDevolucionesSegura * DEVOLUCIONES_POR_PAGINA
  );

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
                Historial de devoluciones
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Para devolver una venta, usa el botón de devolución en su fila
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          {onCerrar && (
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          </div>
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

        {/* Contenido de Tabs */}
        <AnimatePresence mode="wait">
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
                  devolucionesPagina.map((devolucion) => (
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
              {totalPaginasDevoluciones > 1 && (
                <div className={`flex items-center justify-between px-1 pt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p className="text-xs">
                    Página {paginaDevolucionesSegura} de {totalPaginasDevoluciones} · {devolucionesFiltradas.length} devoluciones
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={paginaDevolucionesSegura <= 1} onClick={() => setPaginaDevoluciones((p) => Math.max(1, p - 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={paginaDevolucionesSegura >= totalPaginasDevoluciones} onClick={() => setPaginaDevoluciones((p) => Math.min(totalPaginasDevoluciones, p + 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}