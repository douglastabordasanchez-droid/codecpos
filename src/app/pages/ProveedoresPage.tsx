/**
 * 🏢 PÁGINA DE GESTIÓN DE PROVEEDORES
 * Dashboard profesional con glassmorphism y scroll
 * CODEC POS v2.0 - Sistema completo de proveedores
 */

import React, { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, Star, Phone, Mail, MapPin,
  TrendingUp, DollarSign, Calendar, CreditCard, AlertTriangle,
  Edit, Trash2, Ban, CheckCircle, Award, Sparkles, Package,
  FileText,
} from 'lucide-react';
import {
  Proveedor,
  listarProveedores,
  obtenerEstadisticas,
  actualizarProveedor,
  eliminarProveedor,
  toggleBloqueoProveedor,
} from '../lib/proveedoresService';
import { ModalProveedor } from '../components/modals/ModalProveedor';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [provs, stats] = await Promise.all([
        listarProveedores(),
        obtenerEstadisticas(),
      ]);
      setProveedores(provs);
      setEstadisticas(stats);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleEditar = (prov: Proveedor) => {
    setProveedorEditar(prov);
    setModalOpen(true);
  };

  const handleEliminar = async (id: string, nombre: string) => {
    if (confirm(`¿Eliminar el proveedor "${nombre}"?`)) {
      try {
        await eliminarProveedor(id);
        toast.success('🗑️ Proveedor eliminado');
        cargarDatos();
      } catch (error) {
        toast.error('Error al eliminar');
      }
    }
  };

  const handleBloquear = async (id: string, bloqueado: boolean, nombre: string) => {
    const motivo = bloqueado ? undefined : prompt('Motivo del bloqueo:');
    if (bloqueado || motivo) {
      try {
        await toggleBloqueoProveedor(id, motivo);
        toast.success(bloqueado ? `✅ ${nombre} desbloqueado` : `🚫 ${nombre} bloqueado`);
        cargarDatos();
      } catch (error) {
        toast.error('Error al actualizar');
      }
    }
  };

  const proveedoresFiltrados = proveedores.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.nit.includes(busqueda) ||
      p.ciudad.toLowerCase().includes(busqueda.toLowerCase());
    
    const matchCategoria = filtroCategoria === 'todas' || p.categoria === filtroCategoria;
    
    return matchBusqueda && matchCategoria;
  });

  const categorias = Array.from(new Set(proveedores.map(p => p.categoria))).sort();

  const exportarPDF = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = config.nombreComercial || 'MI NEGOCIO';
      const nit = config.nit ? `NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = 297;
      const ahora = new Date();

      // Header
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, W, 32, 'F');
      if (config.logoUrl) {
        try {
          const ext = config.logoUrl.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(config.logoUrl, ext, W - 42, 4, 22, 22);
        } catch { /* skip */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(empresa, 14, 13);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      if (nit) doc.text(nit, 14, 19);
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text('DIRECTORIO DE PROVEEDORES', 14, 28);
      doc.setTextColor(0, 0, 0);

      // Resumen
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, 14, 40);
      if (estadisticas) {
        doc.text(`Total: ${estadisticas.totalProveedores} proveedores · Activos: ${estadisticas.proveedoresActivos} · Saldo pendiente: $${(estadisticas.saldoPendienteTotal || 0).toLocaleString('es-CO')}`, 14, 46);
      }

      autoTable(doc, {
        startY: 52,
        head: [['Proveedor', 'NIT', 'Categoría', 'Ciudad', 'Teléfono', 'Email', 'Saldo Pendiente', 'Estado']],
        body: proveedoresFiltrados.map(p => [
          p.nombre,
          p.nit,
          p.categoria,
          p.ciudad,
          p.telefono,
          p.email,
          `$${(p.saldoPendiente || 0).toLocaleString('es-CO')}`,
          p.bloqueado ? 'Bloqueado' : 'Activo',
        ]),
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [239, 246, 255] },
        columnStyles: {
          6: { halign: 'right' },
          7: { halign: 'center' },
        },
        didDrawCell: (data) => {
          if (data.column.index === 7 && data.section === 'body') {
            const val = data.cell.raw as string;
            if (val === 'Bloqueado') {
              doc.setTextColor(220, 38, 38);
            } else {
              doc.setTextColor(22, 163, 74);
            }
          }
        },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} — CODEC POS v2.0`, W / 2, 200, { align: 'center' });
      }

      doc.save(`Proveedores-${ahora.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF de proveedores generado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar PDF');
    }
  };

  return (
    <div className="h-screen overflow-y-auto p-6 space-y-6">
      
      {/* Header Premium */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm animate-pulse">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                  Gestión de Proveedores
                  <Sparkles className="w-8 h-8 text-yellow-300 animate-bounce" />
                </h1>
                <p className="text-white/80 text-lg mt-1">
                  Administra tus proveedores, compras y pagos
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={exportarPDF}
              className="bg-white/20 hover:bg-white/30 text-white px-5 py-3 rounded-xl font-semibold transition-all shadow-lg flex items-center gap-2 backdrop-blur-sm border border-white/20"
            >
              <FileText className="w-5 h-5" />
              PDF
            </button>
            <button
              onClick={() => {
                setProveedorEditar(null);
                setModalOpen(true);
              }}
              className="bg-white text-blue-600 hover:bg-white/90 px-6 py-3 rounded-xl font-bold transition-all shadow-xl flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuevo Proveedor
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Proveedores */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-3 rounded-xl shadow-lg">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {estadisticas.totalProveedores}
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Total Proveedores
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full font-bold">
                  {estadisticas.proveedoresActivos} Activos
                </span>
              </div>
            </div>
          </div>

          {/* Saldo Pendiente */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-red-500 to-orange-500 p-3 rounded-xl shadow-lg">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                ${(estadisticas.saldoTotalPendiente / 1000000).toFixed(1)}M
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Saldo Pendiente
              </div>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Por pagar a proveedores
              </div>
            </div>
          </div>

          {/* Compras Este Mes */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-500 p-3 rounded-xl shadow-lg">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                ${(estadisticas.montoComprasEsteMes / 1000000).toFixed(1)}M
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Compras Este Mes
              </div>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {estadisticas.comprasEsteMes} pedidos realizados
              </div>
            </div>
          </div>

          {/* Proveedor Principal */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-3 rounded-xl shadow-lg">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white mb-1 truncate">
                {estadisticas.proveedorMasComprado?.nombre || 'N/A'}
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Proveedor Principal
              </div>
              {estadisticas.proveedorMasComprado && (
                <div className="mt-3 text-xs text-green-600 dark:text-green-400 font-bold">
                  ${(estadisticas.proveedorMasComprado.monto / 1000).toFixed(0)}K comprados
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, NIT o ciudad..."
            className="w-full pl-12 pr-4 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-2 border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white font-medium"
          />
        </div>

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="px-5 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-2 border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white font-bold"
        >
          <option value="todas">Todas las Categorías</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Grid de Proveedores */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-semibold">Cargando proveedores...</p>
        </div>
      ) : proveedoresFiltrados.length === 0 ? (
        <div className="text-center py-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border-2 border-dashed border-gray-300 dark:border-slate-600">
          <Building2 className="w-20 h-20 mx-auto text-gray-400 mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            No hay proveedores
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {busqueda ? 'No se encontraron resultados' : 'Crea tu primer proveedor para comenzar'}
          </p>
          {!busqueda && (
            <button
              onClick={() => {
                setProveedorEditar(null);
                setModalOpen(true);
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Crear Primer Proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {proveedoresFiltrados.map((prov) => (
            <div
              key={prov.id}
              className={`group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-xl border-2 transition-all hover:scale-105 ${
                prov.bloqueado
                  ? 'border-red-300 dark:border-red-700/50 opacity-75'
                  : prov.activo
                  ? 'border-blue-300 dark:border-blue-700/50'
                  : 'border-gray-200 dark:border-slate-700 opacity-75'
              }`}
            >
              {/* Badge de estado */}
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                {prov.bloqueado && (
                  <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                    <Ban className="w-3 h-3" />
                    BLOQUEADO
                  </span>
                )}
                {prov.activo && !prov.bloqueado && (
                  <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                    <CheckCircle className="w-3 h-3" />
                    ACTIVO
                  </span>
                )}
              </div>

              {/* Header */}
              <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-6 text-white relative">
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-5xl">
                      {prov.categoria === 'Abarrotes' ? '🛒' :
                       prov.categoria === 'Bebidas' ? '🥤' :
                       prov.categoria === 'Aseo' ? '🧼' :
                       prov.categoria === 'Lácteos' ? '🥛' :
                       prov.categoria === 'Carnes' ? '🥩' :
                       prov.categoria === 'Frutas y Verduras' ? '🥬' :
                       prov.categoria === 'Panadería' ? '🍞' :
                       prov.categoria === 'Snacks' ? '🍿' : '📦'}
                    </div>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < prov.calificacion
                              ? 'text-yellow-300 fill-yellow-300'
                              : 'text-white/30'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-1">{prov.nombre}</h3>
                  <p className="text-white/80 text-sm">{prov.razonSocial || 'Sin razón social'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                      {prov.tipoDocumento}: {prov.nit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contenido */}
              <div className="p-6 space-y-4">
                {/* Información de contacto */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Phone className="w-4 h-4" />
                    <span className="font-semibold">{prov.telefono}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Mail className="w-4 h-4" />
                    <span className="text-xs truncate">{prov.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs">{prov.ciudad}, {prov.pais}</span>
                  </div>
                </div>

                {/* Estadísticas financieras */}
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total Comprado</div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      ${(prov.totalComprado / 1000).toFixed(0)}K
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Saldo Pendiente</div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                      ${(prov.saldoPendiente / 1000).toFixed(0)}K
                    </div>
                  </div>
                </div>

                {/* Condiciones comerciales */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-slate-700">
                  <div className="text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Crédito:</span>
                    <span className="ml-1 font-bold text-gray-900 dark:text-white">{prov.diasCredito} días</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Descuento:</span>
                    <span className="ml-1 font-bold text-green-600 dark:text-green-400">{prov.descuentoHabitual}%</span>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-full">
                    {prov.categoria}
                  </span>
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full">
                    {prov.totalPedidos} Pedidos
                  </span>
                </div>
              </div>

              {/* Acciones */}
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={() => handleEditar(prov)}
                  className="flex-1 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => handleBloquear(prov.id, prov.bloqueado, prov.nombre)}
                  className={`px-4 py-2 rounded-xl font-bold transition-all ${
                    prov.bloqueado
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEliminar(prov.id, prov.nombre)}
                  className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-slate-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <ModalProveedor
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setProveedorEditar(null);
        }}
        onSuccess={() => {
          cargarDatos();
          setProveedorEditar(null);
        }}
        proveedorEditar={proveedorEditar}
      />
    </div>
  );
}
