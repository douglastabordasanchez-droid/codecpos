/**
 * Reportes — versión móvil.
 *
 * Reutiliza los mismos generadores de PDF/Excel que Electron
 * (pdfGenerator.ts / excelGenerator.ts, sin dependencias de IPC) sobre los
 * datos que ya están en Supabase (ventas, venta_items, gastos) — sin
 * necesidad de sync nueva.
 */
import { useEffect, useState } from 'react';
import { FileText, FileSpreadsheet, Loader2, Receipt, Wallet, Calendar } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { descargarReporteVentasPDF } from '../../app/lib/pdfGenerator';
import { descargarReporteVentasExcel, generarReporteGastosExcel } from '../../app/lib/excelGenerator';

type TipoReporte = 'ventas' | 'gastos';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}
function formatoFechaInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportesPage() {
  const { empleado } = usePwaAuth();
  const [tipo, setTipo] = useState<TipoReporte>('ventas');
  const [desde, setDesde] = useState(() => formatoFechaInput(new Date(inicioDeHoy().getTime() - 6 * 24 * 60 * 60 * 1000)));
  const [hasta, setHasta] = useState(() => formatoFechaInput(inicioDeHoy()));
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState<'pdf' | 'excel' | null>(null);
  const [resumen, setResumen] = useState({ cantidad: 0, total: 0 });
  const [nombreNegocio, setNombreNegocio] = useState('Mi Negocio');

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      const client = getSupabaseClient();
      if (!client) { setCargando(false); return; }

      const inicio = new Date(`${desde}T00:00:00`);
      const fin = new Date(new Date(`${hasta}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);

      const [{ data: negocio }, { data }] = await Promise.all([
        client.from('clientes_pos').select('nombre_negocio').eq('id', empleado.cliente_id).maybeSingle(),
        tipo === 'ventas'
          ? client.from('ventas').select('id, total').eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
              .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString())
          : client.from('gastos').select('id, monto').eq('cliente_id', empleado.cliente_id)
              .gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString()),
      ]);

      if (cancelado) return;
      setNombreNegocio((negocio as { nombre_negocio: string } | null)?.nombre_negocio || 'Mi Negocio');
      const filas = (data as { id: string; total?: number; monto?: number }[]) || [];
      setResumen({
        cantidad: filas.length,
        total: filas.reduce((a, f) => a + Number(f.total ?? f.monto ?? 0), 0),
      });
      setCargando(false);
    };

    cargar();
    return () => { cancelado = true; };
  }, [empleado?.cliente_id, tipo, desde, hasta]);

  const generarPDF = async () => {
    if (!empleado) return;
    setGenerando('pdf');
    try {
      const client = getSupabaseClient()!;
      const inicio = new Date(`${desde}T00:00:00`);
      const fin = new Date(new Date(`${hasta}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);

      if (tipo === 'ventas') {
        const { data: ventasData } = await client
          .from('ventas')
          .select('id, numero, created_at, total, metodo_pago, cajero_nombre')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString())
          .order('created_at', { ascending: true });

        const ventas = ventasData || [];
        const ventaIds = ventas.map((v: any) => v.id);
        const { data: itemsData } = ventaIds.length
          ? await client.from('venta_items').select('venta_id, nombre, cantidad, precio_unitario, subtotal').in('venta_id', ventaIds)
          : { data: [] };
        const itemsPorVenta = new Map<string, any[]>();
        for (const it of itemsData || []) {
          const lista = itemsPorVenta.get(it.venta_id) || [];
          lista.push({ nombre: it.nombre || 'Producto', cantidad: Number(it.cantidad), precio: Number(it.precio_unitario), subtotal: Number(it.subtotal ?? it.cantidad * it.precio_unitario) });
          itemsPorVenta.set(it.venta_id, lista);
        }

        const ventasParaPDF = ventas.map((v: any) => ({
          numeroFactura: v.numero ? String(v.numero) : v.id.slice(0, 8),
          fecha: v.created_at,
          items: itemsPorVenta.get(v.id) || [],
          subtotal: Number(v.total),
          iva: 0,
          total: Number(v.total),
          metodoPago: v.metodo_pago || 'No especificado',
          cajero: v.cajero_nombre || 'N/A',
        }));

        await descargarReporteVentasPDF(
          ventasParaPDF,
          { nombreComercial: nombreNegocio, razonSocial: nombreNegocio, nit: '', direccion: '', telefono: '', email: '', ciudad: '' },
          desde,
          hasta
        );
      }
      // Gastos: solo Excel (no hay generador de PDF de gastos en el sistema todavía).
    } catch (e) {
      console.error(e);
    } finally {
      setGenerando(null);
    }
  };

  const generarExcel = async () => {
    if (!empleado) return;
    setGenerando('excel');
    try {
      const client = getSupabaseClient()!;
      const inicio = new Date(`${desde}T00:00:00`);
      const fin = new Date(new Date(`${hasta}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);

      if (tipo === 'ventas') {
        const { data: ventasData } = await client
          .from('ventas')
          .select('id, numero, created_at, total, metodo_pago, cajero_nombre')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString())
          .order('created_at', { ascending: true });
        const ventas = ventasData || [];
        const ventasParaExcel = ventas.map((v: any) => ({
          numeroFactura: v.numero ? String(v.numero) : v.id.slice(0, 8),
          fecha: v.created_at,
          items: [],
          subtotal: Number(v.total),
          iva: 0,
          total: Number(v.total),
          metodoPago: v.metodo_pago || 'No especificado',
          cajero: v.cajero_nombre || 'N/A',
        }));
        descargarReporteVentasExcel(ventasParaExcel, desde, hasta, nombreNegocio);
      } else {
        const { data: gastosData } = await client
          .from('gastos')
          .select('id, fecha, descripcion, categoria, monto, medio_pago, registrado_por_nombre, notas')
          .eq('cliente_id', empleado.cliente_id)
          .gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString())
          .order('fecha', { ascending: true });
        const gastosParaExcel = (gastosData || []).map((g: any) => ({
          id: g.id,
          fecha: g.fecha,
          descripcion: g.descripcion,
          categoria: g.categoria,
          monto: Number(g.monto),
          metodoPago: g.medio_pago || 'efectivo',
          registradoPor: g.registrado_por_nombre || 'N/A',
          notas: g.notas || undefined,
        }));
        const blob = generarReporteGastosExcel(gastosParaExcel, desde, hasta, nombreNegocio);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reporte_Gastos_${desde}_${hasta}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerando(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Reportes</h1>
        <p className="text-slate-400 text-sm">Exporta ventas o gastos por rango de fechas</p>
      </div>

      <div className="px-5 flex gap-2 mb-5">
        <button
          onClick={() => setTipo('ventas')}
          className={`flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${tipo === 'ventas' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'}`}
        >
          <Receipt className="w-4 h-4" /> Ventas
        </button>
        <button
          onClick={() => setTipo('gastos')}
          className={`flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${tipo === 'gastos' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'}`}
        >
          <Wallet className="w-4 h-4" /> Gastos
        </button>
      </div>

      <div className="px-5 flex items-center gap-2 mb-5">
        <div className="flex-1 flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-xl px-2.5 h-11">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="bg-transparent text-white text-xs w-full outline-none" />
        </div>
        <span className="text-slate-600 text-xs">a</span>
        <div className="flex-1 flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-xl px-2.5 h-11">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input type="date" value={hasta} min={desde} max={formatoFechaInput(inicioDeHoy())} onChange={(e) => setHasta(e.target.value)} className="bg-transparent text-white text-xs w-full outline-none" />
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          {cargando ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{tipo === 'ventas' ? 'Ventas en el rango' : 'Gastos en el rango'}</p>
                <p className="text-white text-2xl font-black mt-1">{resumen.cantidad}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Total</p>
                <p className={`text-2xl font-black mt-1 ${tipo === 'ventas' ? 'text-emerald-400' : 'text-red-400'}`}>{money(resumen.total)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 space-y-3">
        {tipo === 'ventas' && (
          <Button onClick={generarPDF} disabled={!!generando || resumen.cantidad === 0} className="w-full h-12 bg-gradient-to-r from-red-500 to-rose-600">
            {generando === 'pdf' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Descargar PDF
          </Button>
        )}
        <Button onClick={generarExcel} disabled={!!generando || resumen.cantidad === 0} variant="outline" className="w-full h-12 border-emerald-700 text-emerald-400 bg-slate-900/50">
          {generando === 'excel' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
          Descargar Excel
        </Button>
        {resumen.cantidad === 0 && !cargando && (
          <p className="text-slate-500 text-xs text-center">No hay {tipo} en el rango seleccionado.</p>
        )}
      </div>
    </div>
  );
}
