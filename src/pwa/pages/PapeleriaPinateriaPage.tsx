/**
 * Papelería y Piñatería — versión móvil.
 *
 * Solo lectura/consulta: la carga masiva de 15,000+ referencias es trabajo
 * de escritorio (ver PapeleriaPinateriaImporter.ts en Electron). Desde el
 * celular el equipo consulta stock, precio y filtra por temática o calibre
 * de globo directamente contra Supabase — mismo `productos` de siempre,
 * filtrado por `es_papeleria_pinateria`.
 */
import { useEffect, useMemo, useState } from 'react';
import { PartyPopper, Search, Ruler, Palette, Tag, PackageCheck, Loader2, X, ImageOff } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ProductoFila {
  id: string;
  codigo_barras: string | null;
  nombre: string;
  precio_venta: number;
  stock: number;
  categoria: string | null;
  categoria_especifica: string | null;
  tematica: string | null;
  calibre_globo: string | null;
  color_acabado: string | null;
  marca: string | null;
  foto_url: string | null;
}

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

export default function PapeleriaPinateriaPage() {
  const { empleado } = usePwaAuth();
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTematica, setFiltroTematica] = useState<string | null>(null);
  const [filtroCalibre, setFiltroCalibre] = useState<string | null>(null);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }
    setCargando(true);
    client
      .from('productos')
      .select('id, codigo_barras, nombre, precio_venta, stock, categoria, categoria_especifica, tematica, calibre_globo, color_acabado, marca, foto_url')
      .eq('cliente_id', empleado.cliente_id)
      .eq('es_papeleria_pinateria', true)
      .eq('activo', true)
      .order('nombre')
      .limit(1000)
      .then(({ data }) => { setProductos((data as ProductoFila[]) || []); setCargando(false); });
  }, [empleado?.cliente_id]);

  const tematicas = useMemo(() => [...new Set(productos.map((p) => p.tematica).filter(Boolean))] as string[], [productos]);
  const calibres = useMemo(() => [...new Set(productos.map((p) => p.calibre_globo).filter(Boolean))] as string[], [productos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (filtroTematica && p.tematica !== filtroTematica) return false;
      if (filtroCalibre && p.calibre_globo !== filtroCalibre) return false;
      if (!q) return true;
      return [p.codigo_barras, p.nombre, p.marca].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [productos, busqueda, filtroTematica, filtroCalibre]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
          <PartyPopper className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white text-xl font-black leading-tight">Papelería y Piñatería</h1>
          <p className="text-slate-400 text-sm">{productos.length} referencias</p>
        </div>
      </div>

      <div className="px-5 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, nombre, marca…"
            className="h-11 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600" />
        </div>
      </div>

      {(tematicas.length > 0 || calibres.length > 0) && (
        <div className="px-5 mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {tematicas.map((t) => (
            <button key={t} onClick={() => setFiltroTematica((v) => (v === t ? null : t))}
              className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold flex items-center gap-1 ${filtroTematica === t ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
              <Tag className="w-3 h-3" /> {t}
            </button>
          ))}
          {calibres.map((c) => (
            <button key={c} onClick={() => setFiltroCalibre((v) => (v === c ? null : c))}
              className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold flex items-center gap-1 ${filtroCalibre === c ? 'bg-rose-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
              <Ruler className="w-3 h-3" /> {c}
            </button>
          ))}
          {(filtroTematica || filtroCalibre) && (
            <button onClick={() => { setFiltroTematica(null); setFiltroCalibre(null); }} className="shrink-0 px-3 h-8 rounded-full text-xs font-bold bg-slate-800 text-slate-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      )}

      <div className="px-5 space-y-2">
        {cargando && (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
            <span className="text-slate-500 text-sm">Cargando…</span>
          </div>
        )}
        {!cargando && filtrados.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-10">
            {productos.length === 0 ? 'Sin referencias todavía — súbelas desde el computador.' : 'Ningún producto coincide con el filtro.'}
          </p>
        )}
        {filtrados.slice(0, 150).map((p) => (
          <div key={p.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-3.5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-950 flex items-center justify-center">
                {p.foto_url ? <img src={p.foto_url} alt={p.nombre} className="w-full h-full object-cover" /> : <ImageOff className="w-4 h-4 text-slate-700" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{p.nombre}</p>
                <p className="text-slate-500 text-xs truncate">{p.codigo_barras || 'Sin código'} · {p.categoria_especifica || p.categoria || 'Sin categoría'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-white font-black text-sm">{money(p.precio_venta)}</p>
                <p className={`text-xs flex items-center justify-end gap-1 ${p.stock <= 5 ? 'text-red-400' : 'text-slate-500'}`}><PackageCheck className="w-3 h-3" /> {p.stock}</p>
              </div>
            </div>
            {(p.calibre_globo || p.color_acabado || p.tematica || p.marca) && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {p.calibre_globo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">{p.calibre_globo}</span>}
                {p.color_acabado && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 flex items-center gap-1"><Palette className="w-2.5 h-2.5" />{p.color_acabado}</span>}
                {p.marca && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{p.marca}</span>}
                {p.tematica && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{p.tematica}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {filtrados.length > 150 && (
        <p className="text-slate-600 text-[11px] text-center pt-2">Mostrando 150 de {filtrados.length.toLocaleString('es-CO')} — usa el buscador para acotar.</p>
      )}
    </div>
  );
}
