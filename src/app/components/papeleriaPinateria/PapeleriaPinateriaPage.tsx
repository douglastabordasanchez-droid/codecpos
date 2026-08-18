/**
 * Papelería y Piñatería (Fiestas, Dulcería y Juguetería) — hub del módulo.
 *
 * A propósito NO es un catálogo aparte: lee y escribe el MISMO
 * `pos-productos` que usa toda la caja, filtrando por `esPapeleriaPinateria`.
 * Así un globo cargado aquí aparece de inmediato en el punto de venta normal,
 * sin pasos extra — ver PapeleriaPinateriaImporter.ts para el porqué de esta
 * decisión de arquitectura.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Cropper, { Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import {
  PartyPopper, Download, Upload, Loader2, Search, Ruler, Palette, Tag,
  PackageCheck, AlertTriangle, X, Plus, Camera, Check, ImageOff, Pencil, Trash2,
} from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getSupabaseClient } from '../../lib/supabase/config';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import {
  PLANTILLAS_PAPELERIA,
  descargarPlantillaPapeleria,
  descargarTodasLasPlantillasPapeleria,
  type TipoPlantillaPapeleria,
} from '../../lib/importers/papeleriaPinateriaTemplates';
import {
  importarPapeleriaPinateriaDesdeExcel,
  type ProgresoImportacion,
} from '../../lib/importers/PapeleriaPinateriaImporter';
import { desactivarProductoEnNube } from '../../lib/syncService';

interface ProductoLocal {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo?: number;
  stock: number;
  minStock?: number;
  categoria?: string;
  categoriaEspecifica?: string;
  tematica?: string;
  calibreGlobo?: string;
  colorAcabado?: string;
  marca?: string;
  unidadesPorBolsa?: number;
  ventaPorUnidad?: boolean;
  esDulceria?: boolean;
  permitirFraccion?: boolean;
  lote?: string;
  fechaVencimiento?: string;
  imagenUrl?: string;
  activo?: boolean;
  esPapeleriaPinateria?: boolean;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

async function recortarImagen(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9));
}

const PRODUCTO_VACIO: ProductoLocal = {
  id: '', codigo: '', nombre: '', precio: 0, costo: 0, stock: 0, minStock: 5,
  categoriaEspecifica: '', esPapeleriaPinateria: true, activo: true, ventaPorUnidad: true,
};

/** Guarda (crea o edita) un producto directo en `pos-productos` — disponible al instante en caja — y lo sube best-effort a Supabase, igual que hace el importador por lotes. */
async function guardarProductoLocal(p: ProductoLocal): Promise<void> {
  let lista: any[];
  try {
    lista = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    if (!Array.isArray(lista)) lista = [];
  } catch {
    lista = [];
  }
  const idx = lista.findIndex((x) => x.id === p.id);
  if (idx >= 0) lista[idx] = { ...lista[idx], ...p };
  else lista.push(p);
  localStorage.setItem('pos-productos', JSON.stringify(lista));

  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;
  try {
    await client.from('productos').upsert({
      cliente_id: clienteId,
      local_id: p.id,
      codigo_barras: p.codigo || null,
      nombre: p.nombre,
      categoria: p.categoriaEspecifica || p.categoria || null,
      precio_venta: p.precio ?? 0,
      costo: p.costo ?? 0,
      stock: p.stock ?? 0,
      stock_minimo: p.minStock ?? null,
      foto_url: p.imagenUrl || null,
      activo: p.activo !== false,
      es_papeleria_pinateria: true,
      categoria_especifica: p.categoriaEspecifica || null,
      tematica: p.tematica || null,
      calibre_globo: p.calibreGlobo || null,
      color_acabado: p.colorAcabado || null,
      marca: p.marca || null,
      es_dulceria: !!p.esDulceria,
      permitir_fraccion: !!p.permitirFraccion,
      unidades_por_bolsa: p.unidadesPorBolsa ?? null,
      venta_por_unidad: p.ventaPorUnidad !== false,
      lote: p.lote || null,
      fecha_vencimiento: p.fechaVencimiento || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cliente_id,local_id' });
  } catch (e) {
    console.warn('[PapeleriaPinateria] No se pudo subir a la nube todavía, quedó en cola local:', e);
  }
}

async function eliminarProductoLocal(id: string): Promise<void> {
  let lista: any[];
  try {
    lista = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    if (!Array.isArray(lista)) return;
  } catch { return; }
  localStorage.setItem('pos-productos', JSON.stringify(lista.filter((x) => x.id !== id)));
  await desactivarProductoEnNube(id);
}

function cargarProductosPapeleria(): ProductoLocal[] {
  try {
    const raw = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((p: ProductoLocal) => p?.esPapeleriaPinateria && p.activo !== false);
  } catch {
    return [];
  }
}

export default function PapeleriaPinateriaPage() {
  const { darkMode } = usePOS();
  const [productos, setProductos] = useState<ProductoLocal[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTematica, setFiltroTematica] = useState<string | null>(null);
  const [filtroCalibre, setFiltroCalibre] = useState<string | null>(null);
  const [tipoImport, setTipoImport] = useState<TipoPlantillaPapeleria>('globos_decoracion');
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoImportacion | null>(null);
  const [editando, setEditando] = useState<ProductoLocal | 'nuevo' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recargar = () => setProductos(cargarProductosPapeleria());
  useEffect(() => { recargar(); }, []);

  const tematicas = useMemo(
    () => [...new Set(productos.map((p) => p.tematica).filter(Boolean))] as string[],
    [productos]
  );
  const calibres = useMemo(
    () => [...new Set(productos.map((p) => p.calibreGlobo).filter(Boolean))] as string[],
    [productos]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (filtroTematica && p.tematica !== filtroTematica) return false;
      if (filtroCalibre && p.calibreGlobo !== filtroCalibre) return false;
      if (!q) return true;
      return [p.codigo, p.nombre, p.categoriaEspecifica, p.marca].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [productos, busqueda, filtroTematica, filtroCalibre]);

  const categoriasExistentes = useMemo(
    () => [...new Set(productos.map((p) => p.categoriaEspecifica).filter(Boolean))] as string[],
    [productos]
  );

  const manejarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportando(true);
    setProgreso(null);
    try {
      const resultado = await importarPapeleriaPinateriaDesdeExcel(file, tipoImport, (p) => setProgreso(p));
      toast.success(`Importación completa: ${resultado.creados} nuevos, ${resultado.actualizados} actualizados`, {
        description: resultado.errores.length > 0 ? `${resultado.errores.length} advertencia(s) — revisa el detalle abajo` : `${resultado.total} referencias procesadas`,
      });
      recargar();
    } catch (err) {
      toast.error('No se pudo importar el archivo', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setImportando(false);
    }
  };

  const cardCls = darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200';
  const titleCls = darkMode ? 'text-white' : 'text-gray-900';
  const mutedCls = darkMode ? 'text-slate-400' : 'text-gray-600';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
            <PartyPopper className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-black ${titleCls}`}>Papelería y Piñatería</h1>
            <p className={`text-sm ${mutedCls}`}>Fiestas, dulcería y juguetería · {productos.length} referencias activas</p>
          </div>
        </div>
        <Button onClick={() => setEditando('nuevo')}><Plus className="w-4 h-4 mr-1.5" /> Nuevo producto</Button>
      </div>

      {/* ── Plantillas ── */}
      <Card className={cardCls}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className={`font-bold text-sm ${titleCls}`}>Plantillas de carga masiva</p>
            <Button variant="outline" size="sm" onClick={descargarTodasLasPlantillasPapeleria}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar las 5
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PLANTILLAS_PAPELERIA.map((p) => (
              <div key={p.tipo} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-900/40' : 'border-gray-200 bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${titleCls}`}>{p.titulo}</p>
                  <p className={`text-[11px] truncate ${mutedCls}`}>{p.descripcion}</p>
                </div>
                <button onClick={() => descargarPlantillaPapeleria(p.tipo)} className="shrink-0 p-2 rounded-lg hover:bg-rose-500/10">
                  <Download className="w-3.5 h-3.5 text-rose-500" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Carga masiva ── */}
      <Card className={cardCls}>
        <CardContent className="p-4">
          <p className={`font-bold text-sm mb-3 ${titleCls}`}>Subir inventario</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={tipoImport}
              onChange={(e) => setTipoImport(e.target.value as TipoPlantillaPapeleria)}
              className={`h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
            >
              {PLANTILLAS_PAPELERIA.map((p) => <option key={p.tipo} value={p.tipo}>{p.titulo}</option>)}
            </select>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={manejarArchivo} />
            <Button onClick={() => inputRef.current?.click()} disabled={importando}>
              {importando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {importando ? 'Importando…' : 'Elegir archivo e importar'}
            </Button>
          </div>

          {progreso && (
            <div className="space-y-2">
              <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-600 transition-all"
                  style={{ width: `${Math.min(100, (progreso.loteActual / progreso.totalLotes) * 100)}%` }}
                />
              </div>
              <p className={`text-xs ${mutedCls}`}>
                Lote {progreso.loteActual}/{progreso.totalLotes} completado — {progreso.procesados.toLocaleString('es-CO')} de {progreso.total.toLocaleString('es-CO')} referencias procesadas
                {' · '}<span className="text-emerald-500 font-bold">{progreso.creados} nuevas</span>
                {' · '}<span className="text-sky-500 font-bold">{progreso.actualizados} actualizadas</span>
              </p>
              {progreso.errores.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-500 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {progreso.errores.length} advertencia(s)
                  </summary>
                  <ul className={`mt-1.5 space-y-0.5 max-h-32 overflow-y-auto ${mutedCls}`}>
                    {progreso.errores.slice(0, 50).map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          <p className={`text-[11px] mt-3 ${mutedCls}`}>
            Cada lote de hasta 300 referencias queda disponible en caja de inmediato. Si no hay internet en el momento
            de subir, quedan en cola y se sincronizan solas apenas vuelva la conexión.
          </p>
        </CardContent>
      </Card>

      {/* ── Catálogo ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, nombre, marca…" className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
        </div>
        {tematicas.length > 0 && (
          <select value={filtroTematica || ''} onChange={(e) => setFiltroTematica(e.target.value || null)}
            className={`h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}>
            <option value="">Todas las temáticas</option>
            {tematicas.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {calibres.length > 0 && (
          <select value={filtroCalibre || ''} onChange={(e) => setFiltroCalibre(e.target.value || null)}
            className={`h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}>
            <option value="">Todos los calibres</option>
            {calibres.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(filtroTematica || filtroCalibre) && (
          <button onClick={() => { setFiltroTematica(null); setFiltroCalibre(null); }} className="text-xs text-rose-500 font-bold flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {filtrados.length === 0 && (
          <p className={`text-sm text-center py-10 col-span-full ${mutedCls}`}>
            {productos.length === 0 ? 'Sin referencias todavía — descarga una plantilla y sube tu inventario.' : 'Ningún producto coincide con el filtro.'}
          </p>
        )}
        {filtrados.slice(0, 150).map((p) => (
          <Card key={p.id} className={`${cardCls} overflow-hidden`}>
            <div className={`h-28 w-full flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-gray-100'}`}>
              {p.imagenUrl ? (
                <img src={p.imagenUrl} alt={p.nombre} className="w-full h-full object-cover" />
              ) : (
                <ImageOff className="w-7 h-7 text-slate-600" />
              )}
            </div>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-1">
                <p className={`font-bold text-sm truncate ${titleCls}`}>{p.nombre}</p>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => setEditando(p)} className="p-1 rounded hover:bg-slate-700/20"><Pencil className="w-3 h-3 text-slate-400" /></button>
                  <button onClick={async () => { await eliminarProductoLocal(p.id); recargar(); toast.success('Producto eliminado'); }} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3 h-3 text-red-400" /></button>
                </div>
              </div>
              <p className={`text-xs truncate ${mutedCls}`}>{p.codigo} · {p.categoriaEspecifica || p.categoria}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {p.calibreGlobo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 flex items-center gap-1"><Ruler className="w-2.5 h-2.5" />{p.calibreGlobo}</span>}
                {p.colorAcabado && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 flex items-center gap-1"><Palette className="w-2.5 h-2.5" />{p.colorAcabado}</span>}
                {p.tematica && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 flex items-center gap-1"><Tag className="w-2.5 h-2.5" />{p.tematica}</span>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-sm font-black ${titleCls}`}>${Math.round(p.precio).toLocaleString('es-CO')}</span>
                <span className={`text-xs flex items-center gap-1 ${p.stock <= 5 ? 'text-red-500' : mutedCls}`}><PackageCheck className="w-3 h-3" /> {p.stock}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {filtrados.length > 150 && (
        <p className={`text-xs text-center ${mutedCls}`}>Mostrando 150 de {filtrados.length.toLocaleString('es-CO')} — usa el buscador para acotar.</p>
      )}

      {editando && (
        <ModalProductoPapeleria
          producto={editando === 'nuevo' ? null : editando}
          categoriasExistentes={categoriasExistentes}
          tematicasExistentes={tematicas}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); recargar(); }}
        />
      )}
    </div>
  );
}

// ── Modal: crear/editar producto (uno solo, con foto) ───────────────────────

function ModalProductoPapeleria({
  producto, categoriasExistentes, tematicasExistentes, onCerrar, onGuardado,
}: {
  producto: ProductoLocal | null;
  categoriasExistentes: string[];
  tematicasExistentes: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { darkMode } = usePOS();
  const [form, setForm] = useState<ProductoLocal>(
    producto ? { ...producto } : { ...PRODUCTO_VACIO, id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  );
  const [guardando, setGuardando] = useState(false);
  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaRecorte, setAreaRecorte] = useState<Area | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ProductoLocal>(k: K, v: ProductoLocal[K]) => setForm((f) => ({ ...f, [k]: v }));

  const seleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagenOriginal(reader.result as string);
    reader.readAsDataURL(file);
  };

  const confirmarRecorte = async () => {
    if (!imagenOriginal || !areaRecorte) return;
    const clienteId = getLinkedClienteId();
    if (!clienteId) { toast.error('Vincula esta instalación con la nube primero'); return; }
    setSubiendoFoto(true);
    try {
      const blobRecortado = await recortarImagen(imagenOriginal, areaRecorte);
      const blobComprimido = await imageCompression(blobRecortado as File, { maxSizeMB: 0.4, maxWidthOrHeight: 900, useWebWorker: true, initialQuality: 0.85 });
      const client = getSupabaseClient()!;
      const nombreArchivo = `${clienteId}/${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage.from('productos-fotos').upload(nombreArchivo, blobComprimido, { contentType: 'image/jpeg' });
      if (error) { toast.error('Error subiendo la foto', { description: error.message }); return; }
      const { data: pub } = client.storage.from('productos-fotos').getPublicUrl(nombreArchivo);
      set('imagenUrl', pub.publicUrl);
      setImagenOriginal(null);
      toast.success('Foto lista');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setGuardando(true);
    try {
      const codigo = form.codigo.trim() || `PP-${Date.now().toString(36).toUpperCase()}`;
      await guardarProductoLocal({ ...form, codigo });
      toast.success(producto ? 'Producto actualizado' : 'Producto creado');
      onGuardado();
    } catch (e) {
      toast.error('No se pudo guardar', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  if (imagenOriginal) {
    return (
      <div className="fixed inset-0 bg-black z-[60] flex flex-col">
        <div className="relative flex-1">
          <Cropper image={imagenOriginal} crop={crop} zoom={zoom} aspect={1} showGrid={false}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area) => setAreaRecorte(area)} />
        </div>
        <div className="p-5 space-y-3 bg-slate-950 shrink-0">
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImagenOriginal(null)} className="flex-1 h-12 border-slate-700 text-slate-300 bg-slate-900">Cancelar</Button>
            <Button onClick={confirmarRecorte} disabled={subiendoFoto} className="flex-1 h-12 bg-gradient-to-r from-rose-500 to-pink-600">
              {subiendoFoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {subiendoFoto ? 'Subiendo...' : 'Usar foto'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{producto ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onCerrar}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="flex justify-center mb-4">
          <button type="button" onClick={() => fotoInputRef.current?.click()}
            className="w-24 h-24 rounded-2xl bg-slate-900/70 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
            {form.imagenUrl ? <img src={form.imagenUrl} alt="" className="w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-slate-500" />}
          </button>
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={seleccionarFoto} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Código</Label>
            <Input value={form.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="Se genera solo si lo dejas vacío" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Input value={form.categoriaEspecifica || ''} onChange={(e) => set('categoriaEspecifica', e.target.value)} list="pp-categorias" />
            <datalist id="pp-categorias">{categoriasExistentes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Precio de venta</Label>
            <Input type="number" inputMode="numeric" value={form.precio} onChange={(e) => set('precio', Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Costo</Label>
            <Input type="number" inputMode="numeric" value={form.costo || 0} onChange={(e) => set('costo', Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stock</Label>
            <Input type="number" inputMode="numeric" value={form.stock} onChange={(e) => set('stock', Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stock mínimo</Label>
            <Input type="number" inputMode="numeric" value={form.minStock || 0} onChange={(e) => set('minStock', Number(e.target.value) || 0)} />
          </div>
        </div>

        <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-rose-400' : 'text-rose-600'}`}>Atributos del sector (opcionales)</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-1">
            <Label className="text-xs">Calibre de globo</Label>
            <Input value={form.calibreGlobo || ''} onChange={(e) => set('calibreGlobo', e.target.value)} placeholder="R-12, 260…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color / acabado</Label>
            <Input value={form.colorAcabado || ''} onChange={(e) => set('colorAcabado', e.target.value)} placeholder="Neón, Satín…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Marca</Label>
            <Input value={form.marca || ''} onChange={(e) => set('marca', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Temática</Label>
            <Input value={form.tematica || ''} onChange={(e) => set('tematica', e.target.value)} list="pp-tematicas" placeholder="Marvel, Princesas…" />
            <datalist id="pp-tematicas">{tematicasExistentes.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidades por bolsa</Label>
            <Input type="number" inputMode="numeric" value={form.unidadesPorBolsa || ''} onChange={(e) => set('unidadesPorBolsa', Number(e.target.value) || undefined)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lote</Label>
            <Input value={form.lote || ''} onChange={(e) => set('lote', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha de vencimiento</Label>
            <Input type="date" value={form.fechaVencimiento || ''} onChange={(e) => set('fechaVencimiento', e.target.value)} />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={form.ventaPorUnidad !== false} onChange={(e) => set('ventaPorUnidad', e.target.checked)} /> Venta por unidad
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={!!form.esDulceria} onChange={(e) => set('esDulceria', e.target.checked)} /> Es dulcería
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={!!form.permitirFraccion} onChange={(e) => set('permitirFraccion', e.target.checked)} /> Permite fracción
            </label>
          </div>
        </div>

        <Button onClick={guardar} disabled={guardando} className="w-full">
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {guardando ? 'Guardando…' : 'Guardar producto'}
        </Button>
      </div>
    </div>
  );
}
