/**
 * Artes Gráficas — catálogo por escalas de cantidad (marcado/sin marcar) y
 * factura dinámica con abono. Módulo nativo de la nube (ver
 * artesGraficasService.ts): sin él, esta pantalla no puede funcionar, así
 * que si la instalación no está vinculada se pide vincular primero en vez
 * de mostrar una pantalla vacía o rota.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Cropper, { Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import {
  Palette, Plus, Loader2, X, Trash2, Pencil, ShoppingBag, Receipt,
  CloudOff, DollarSign, PackageCheck, Ban, Ruler, Download, Upload, Camera, Check, ImageOff,
} from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { isLinked, getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { getSupabaseClient } from '../../lib/supabase/config';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  ESCALAS_CANTIDAD,
  calcularPrecioUnitario,
  listarProductosArtesGraficas,
  guardarProductoArtesGraficas,
  eliminarProductoArtesGraficas,
  suscribirProductosArtesGraficas,
  listarOrdenesArtesGraficas,
  crearOrdenArtesGraficas,
  registrarPagoFinalOrdenArtesGraficas,
  marcarRetiradaOrdenArtesGraficas,
  cancelarOrdenArtesGraficas,
  suscribirOrdenesArtesGraficas,
  descargarPlantillaExcelArtesGraficas,
  importarProductosDesdeExcelArtesGraficas,
  type ArtesGraficasProducto,
  type ArtesGraficasProductoInput,
  type OrdenArtesGraficas,
  type ItemOrdenArtesGraficas,
  type TipoPagoArtesGraficas,
} from '../../lib/supabase/artesGraficasService';

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

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

const PRODUCTO_VACIO: ArtesGraficasProductoInput = {
  nombre: '', descripcion: '', categoria: '', foto_url: '', unidad: 'cm', activo: true,
  precio_marcado_10: 0, precio_marcado_20: 0, precio_marcado_30: 0, precio_marcado_40: 0,
  precio_marcado_50: 0, precio_marcado_100: 0, precio_marcado_1000: 0,
  precio_sin_marcar_10: 0, precio_sin_marcar_20: 0, precio_sin_marcar_30: 0, precio_sin_marcar_40: 0,
  precio_sin_marcar_50: 0, precio_sin_marcar_100: 0, precio_sin_marcar_1000: 0,
};

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#94a3b8' },
  abonado: { label: 'Abonado', color: '#f59e0b' },
  pagado: { label: 'Pagado', color: '#22c55e' },
  retirado: { label: 'Retirado', color: '#0ea5e9' },
  cancelado: { label: 'Cancelado', color: '#ef4444' },
};

type Vista = 'ordenes' | 'catalogo';

export default function ArtesGraficasPage() {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();
  const vinculado = isLinked();
  const clienteId = getLinkedClienteId();

  const [vista, setVista] = useState<Vista>('ordenes');
  const [productos, setProductos] = useState<ArtesGraficasProducto[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenArtesGraficas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoProducto, setEditandoProducto] = useState<ArtesGraficasProducto | 'nuevo' | null>(null);
  const [creandoOrden, setCreandoOrden] = useState(false);
  const [cobrandoOrden, setCobrandoOrden] = useState<OrdenArtesGraficas | null>(null);
  const [importando, setImportando] = useState(false);
  const inputExcelRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    if (!vinculado || !clienteId) { setCargando(false); return; }
    setCargando(true);
    try {
      const [p, o] = await Promise.all([listarProductosArtesGraficas(clienteId), listarOrdenesArtesGraficas(clienteId)]);
      setProductos(p);
      setOrdenes(o);
    } catch (e) {
      toast.error('No se pudo cargar Artes Gráficas', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vinculado, clienteId]);

  useEffect(() => {
    if (!vinculado || !clienteId) return;
    const d1 = suscribirProductosArtesGraficas(clienteId, cargar);
    const d2 = suscribirOrdenesArtesGraficas(clienteId, cargar);
    return () => { d1(); d2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinculado, clienteId]);

  const manejarSeleccionExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !clienteId) return;
    setImportando(true);
    try {
      const resultado = await importarProductosDesdeExcelArtesGraficas(clienteId, file);
      if (resultado.creados === 0 && resultado.actualizados === 0) {
        toast.error('No se importó ningún producto', { description: resultado.errores[0] });
      } else {
        toast.success(`Inventario importado: ${resultado.creados} nuevos, ${resultado.actualizados} actualizados`, {
          description: resultado.errores.length > 0 ? `${resultado.errores.length} fila(s) con problemas` : undefined,
        });
      }
      if (resultado.errores.length > 0) console.warn('[ArtesGraficas] Errores de importación:', resultado.errores);
      cargar();
    } catch (err) {
      toast.error('No se pudo importar el archivo', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setImportando(false);
    }
  };

  const activas = ordenes.filter((o) => !['retirado', 'cancelado'].includes(o.estado)).length;
  const porCobrar = ordenes.reduce((s, o) => s + o.saldo_pendiente, 0);

  const cardCls = darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200';
  const titleCls = darkMode ? 'text-white' : 'text-gray-900';
  const mutedCls = darkMode ? 'text-slate-400' : 'text-gray-600';

  if (!vinculado) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <Card className={cardCls}>
          <CardContent className="p-8 text-center">
            <CloudOff className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <p className={`font-bold ${titleCls}`}>Artes Gráficas necesita conexión con la nube</p>
            <p className={`text-sm mt-1 ${mutedCls}`}>
              A diferencia del resto del sistema, este módulo no guarda nada localmente — el catálogo y
              las facturas dinámicas viven directo en nuestra base de datos para que Electron y el celular vean
              siempre lo mismo. Vincula esta instalación desde Configuración → Vincular con la nube.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/25">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-black ${titleCls}`}>Artes Gráficas</h1>
            <p className={`text-sm ${mutedCls}`}>Catálogo por escalas y factura dinámica con abono</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={vista === 'ordenes' ? 'default' : 'outline'} onClick={() => setVista('ordenes')}>
            <Receipt className="w-4 h-4 mr-1.5" /> Órdenes
          </Button>
          <Button variant={vista === 'catalogo' ? 'default' : 'outline'} onClick={() => setVista('catalogo')}>
            <ShoppingBag className="w-4 h-4 mr-1.5" /> Catálogo
          </Button>
        </div>
      </div>

      {vista === 'ordenes' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className={cardCls}><CardContent className="p-4">
            <p className={`text-xs font-bold uppercase ${mutedCls}`}>Órdenes activas</p>
            <p className={`text-2xl font-black mt-1 ${titleCls}`}>{activas}</p>
          </CardContent></Card>
          <Card className={cardCls}><CardContent className="p-4">
            <p className={`text-xs font-bold uppercase ${mutedCls}`}>Por cobrar</p>
            <p className="text-2xl font-black mt-1 text-amber-500">{money(porCobrar)}</p>
          </CardContent></Card>
          <Card className={cardCls}><CardContent className="p-4 flex items-center">
            <Button className="w-full" onClick={() => setCreandoOrden(true)} disabled={productos.length === 0}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva orden dinámica
            </Button>
          </CardContent></Card>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16">
          <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />
          <span className={mutedCls}>Cargando…</span>
        </div>
      ) : vista === 'ordenes' ? (
        <>
          {productos.length === 0 && (
            <Card className={cardCls}><CardContent className="p-4 text-sm">
              <span className={mutedCls}>Primero crea al menos un producto en el </span>
              <button className="text-fuchsia-500 font-bold underline" onClick={() => setVista('catalogo')}>catálogo</button>.
            </CardContent></Card>
          )}
          <div className="space-y-2.5">
            {ordenes.length === 0 && !cargando && (
              <p className={`text-center py-10 text-sm ${mutedCls}`}>Sin órdenes todavía.</p>
            )}
            {ordenes.map((o) => {
              const info = ESTADO_INFO[o.estado] || ESTADO_INFO.pendiente;
              return (
                <Card key={o.id} className={cardCls}>
                  <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-bold text-sm ${titleCls}`}>{o.numero_orden}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${info.color}22`, color: info.color }}>
                          {info.label}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${mutedCls}`}>
                        {o.cliente_nombre || 'Sin cliente'} · {o.items.length} ítem(s) · {new Date(o.fecha_creacion).toLocaleDateString('es-CO')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black ${titleCls}`}>{money(o.total)}</p>
                      {o.saldo_pendiente > 0 && <p className="text-xs font-bold text-amber-500">Saldo {money(o.saldo_pendiente)}</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {o.saldo_pendiente > 0 && o.estado !== 'cancelado' && (
                        <Button size="sm" onClick={() => setCobrandoOrden(o)}>
                          <DollarSign className="w-3.5 h-3.5 mr-1" /> Cobrar
                        </Button>
                      )}
                      {o.saldo_pendiente <= 0 && o.estado === 'pagado' && (
                        <Button size="sm" variant="outline" onClick={async () => { await marcarRetiradaOrdenArtesGraficas(o); cargar(); toast.success('Marcada como retirada'); }}>
                          <PackageCheck className="w-3.5 h-3.5 mr-1" /> Retirado
                        </Button>
                      )}
                      {!['retirado', 'cancelado'].includes(o.estado) && (
                        <Button size="sm" variant="outline" className="text-red-500" onClick={async () => { await cancelarOrdenArtesGraficas(o); cargar(); toast.info('Orden cancelada'); }}>
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end gap-2 flex-wrap">
            <input ref={inputExcelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={manejarSeleccionExcel} />
            <Button variant="outline" onClick={descargarPlantillaExcelArtesGraficas}>
              <Download className="w-4 h-4 mr-1.5" /> Descargar plantilla
            </Button>
            <Button variant="outline" onClick={() => inputExcelRef.current?.click()} disabled={importando}>
              {importando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {importando ? 'Subiendo…' : 'Subir inventario (Excel)'}
            </Button>
            <Button onClick={() => setEditandoProducto('nuevo')}><Plus className="w-4 h-4 mr-1.5" /> Nuevo producto</Button>
          </div>
          <div className={`text-xs p-3 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800/50 text-slate-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
            Si el nombre del producto en el Excel ya existe en tu catálogo, se actualizan sus precios; si no existe, se crea nuevo.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {productos.length === 0 && (
              <p className={`text-center py-10 text-sm col-span-2 ${mutedCls}`}>Sin productos todavía.</p>
            )}
            {productos.map((p) => (
              <Card key={p.id} className={`${cardCls} overflow-hidden`}>
                <div className={`h-32 w-full flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-gray-100'}`}>
                  {p.foto_url ? (
                    <img src={p.foto_url} alt={p.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff className="w-8 h-8 text-slate-600" />
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className={`font-bold text-sm truncate ${titleCls}`}>{p.nombre}</p>
                      <p className={`text-xs truncate ${mutedCls}`}>{p.categoria || 'Sin categoría'} · <Ruler className="w-3 h-3 inline" /> {p.unidad}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditandoProducto(p)} className="p-1.5 rounded-lg hover:bg-slate-700/20"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                      <button onClick={async () => { await eliminarProductoArtesGraficas(p.id); cargar(); toast.success('Producto eliminado'); }} className="p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 text-xs">
                    <div>
                      <p className={`font-bold mb-1 ${mutedCls}`}>Marcado</p>
                      {ESCALAS_CANTIDAD.map((e) => (
                        <div key={e} className="flex justify-between"><span className={mutedCls}>x{e}</span><span className={titleCls}>{money(p[`precio_marcado_${e}` as keyof ArtesGraficasProducto] as number)}</span></div>
                      ))}
                    </div>
                    <div>
                      <p className={`font-bold mb-1 ${mutedCls}`}>Sin marcar</p>
                      {ESCALAS_CANTIDAD.map((e) => (
                        <div key={e} className="flex justify-between"><span className={mutedCls}>x{e}</span><span className={titleCls}>{money(p[`precio_sin_marcar_${e}` as keyof ArtesGraficasProducto] as number)}</span></div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {editandoProducto && clienteId && (
        <ModalProducto
          clienteId={clienteId}
          producto={editandoProducto === 'nuevo' ? null : editandoProducto}
          categoriasExistentes={[...new Set(productos.map((p) => p.categoria).filter(Boolean))] as string[]}
          onCerrar={() => setEditandoProducto(null)}
          onGuardado={() => { setEditandoProducto(null); cargar(); }}
        />
      )}

      {creandoOrden && clienteId && (
        <ModalNuevaOrden
          clienteId={clienteId}
          productos={productos}
          creadoPor={usuarioActual?.nombreCompleto || 'Sistema'}
          onCerrar={() => setCreandoOrden(false)}
          onCreada={() => { setCreandoOrden(false); cargar(); }}
        />
      )}

      {cobrandoOrden && (
        <ModalCobrarSaldo
          orden={cobrandoOrden}
          onCerrar={() => setCobrandoOrden(null)}
          onCobrado={() => { setCobrandoOrden(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ── Modal: crear/editar producto ────────────────────────────────────────────

function ModalProducto({
  clienteId, producto, categoriasExistentes, onCerrar, onGuardado,
}: {
  clienteId: string;
  producto: ArtesGraficasProducto | null;
  categoriasExistentes: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { darkMode } = usePOS();
  const [form, setForm] = useState<ArtesGraficasProductoInput>(
    producto ? { ...producto } : { ...PRODUCTO_VACIO }
  );
  const [guardando, setGuardando] = useState(false);
  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaRecorte, setAreaRecorte] = useState<Area | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ArtesGraficasProductoInput>(k: K, v: ArtesGraficasProductoInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

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
    setSubiendoFoto(true);
    try {
      const blobRecortado = await recortarImagen(imagenOriginal, areaRecorte);
      const blobComprimido = await imageCompression(blobRecortado as File, { maxSizeMB: 0.4, maxWidthOrHeight: 900, useWebWorker: true, initialQuality: 0.85 });
      const client = getSupabaseClient()!;
      const nombreArchivo = `${clienteId}/${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage.from('artes-graficas-fotos').upload(nombreArchivo, blobComprimido, { contentType: 'image/jpeg' });
      if (error) { toast.error('Error subiendo la foto', { description: error.message }); return; }
      const { data: pub } = client.storage.from('artes-graficas-fotos').getPublicUrl(nombreArchivo);
      set('foto_url', pub.publicUrl);
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
      await guardarProductoArtesGraficas(clienteId, form, producto?.id);
      toast.success('Producto guardado');
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
            <Button onClick={confirmarRecorte} disabled={subiendoFoto} className="flex-1 h-12 bg-gradient-to-r from-fuchsia-500 to-pink-600">
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
            {form.foto_url ? <img src={form.foto_url} alt="" className="w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-slate-500" />}
          </button>
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={seleccionarFoto} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Input value={form.categoria || ''} onChange={(e) => set('categoria', e.target.value)} list="ag-categorias" />
            <datalist id="ag-categorias">
              {categoriasExistentes.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidad de medida</Label>
            <select
              value={form.unidad}
              onChange={(e) => set('unidad', e.target.value as 'cm' | 'unidad')}
              className={`w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
            >
              <option value="cm">Centímetros (cm)</option>
              <option value="unidad">Unidad</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-fuchsia-500 mb-2">Marcado (con logo/diseño)</p>
            <div className="space-y-1.5">
              {ESCALAS_CANTIDAD.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <span className="text-xs w-14 shrink-0 text-slate-500">x {e}</span>
                  <Input type="number" inputMode="numeric" className="h-9"
                    value={form[`precio_marcado_${e}` as keyof ArtesGraficasProductoInput] as number}
                    onChange={(ev) => set(`precio_marcado_${e}` as keyof ArtesGraficasProductoInput, (Number(ev.target.value) || 0) as any)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Sin marcar (en blanco)</p>
            <div className="space-y-1.5">
              {ESCALAS_CANTIDAD.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <span className="text-xs w-14 shrink-0 text-slate-500">x {e}</span>
                  <Input type="number" inputMode="numeric" className="h-9"
                    value={form[`precio_sin_marcar_${e}` as keyof ArtesGraficasProductoInput] as number}
                    onChange={(ev) => set(`precio_sin_marcar_${e}` as keyof ArtesGraficasProductoInput, (Number(ev.target.value) || 0) as any)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button onClick={guardar} disabled={guardando} className="w-full mt-5">
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {guardando ? 'Guardando…' : 'Guardar producto'}
        </Button>
      </div>
    </div>
  );
}

// ── Modal: nueva orden dinámica ─────────────────────────────────────────────

function ModalNuevaOrden({
  clienteId, productos, creadoPor, onCerrar, onCreada,
}: {
  clienteId: string;
  productos: ArtesGraficasProducto[];
  creadoPor: string;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const { darkMode } = usePOS();
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [items, setItems] = useState<ItemOrdenArtesGraficas[]>([]);
  const [productoSel, setProductoSel] = useState(productos[0]?.id || '');
  const [marcado, setMarcado] = useState(true);
  const [cantidad, setCantidad] = useState('10');
  const [tipoPago, setTipoPago] = useState<TipoPagoArtesGraficas>('no_abono');
  const [abono, setAbono] = useState('');
  const [totalPersonalizado, setTotalPersonalizado] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);

  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const total = tipoPago === 'precio_personalizado' && totalPersonalizado !== ''
    ? Number(totalPersonalizado) || 0
    : subtotal;

  const agregarItem = () => {
    const producto = productos.find((p) => p.id === productoSel);
    const cant = Number(cantidad) || 0;
    if (!producto || cant <= 0) { toast.error('Elige un producto y una cantidad válida'); return; }
    const precioUnitario = calcularPrecioUnitario(producto, cant, marcado);
    setItems((prev) => [...prev, {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      marcado,
      cantidad: cant,
      unidad: producto.unidad,
      precio_unitario: precioUnitario,
      subtotal: precioUnitario * cant,
    }]);
    setCantidad('10');
  };

  const quitarItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const crear = async () => {
    if (!clienteNombre.trim()) { toast.error('El nombre del cliente es obligatorio'); return; }
    if (items.length === 0) { toast.error('Agrega al menos un ítem'); return; }
    if (tipoPago === 'abono' && (Number(abono) || 0) <= 0) { toast.error('Indica el monto del abono'); return; }
    setEnviando(true);
    try {
      await crearOrdenArtesGraficas(clienteId, {
        clienteNombre,
        clienteTelefono,
        items,
        tipoPago,
        totalPersonalizado: tipoPago === 'precio_personalizado' ? (Number(totalPersonalizado) || 0) : undefined,
        abono: tipoPago === 'abono' || tipoPago === 'precio_personalizado' ? (Number(abono) || 0) : undefined,
        metodoPago,
        creadoPor,
      });
      toast.success('Orden dinámica creada');
      onCreada();
    } catch (e) {
      toast.error('No se pudo crear la orden', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const inputCls = darkMode ? 'bg-slate-800 border-slate-700 text-white' : '';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl rounded-2xl p-6 max-h-[92vh] overflow-y-auto ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Nueva orden dinámica</h2>
          <button onClick={onCerrar}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-1"><Label className="text-xs">Cliente</Label><Input className={inputCls} value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Teléfono</Label><Input className={inputCls} value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} /></div>
        </div>

        <div className={`p-3 rounded-xl border mb-4 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
          <p className="text-xs font-bold text-fuchsia-500 mb-2">Agregar ítem</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={productoSel} onChange={(e) => setProductoSel(e.target.value)}
              className={`h-10 rounded-lg px-3 text-sm border col-span-2 ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-300'}`}>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <Input className={inputCls} type="number" inputMode="numeric" placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => setMarcado(true)} className={`flex-1 h-10 rounded-lg text-xs font-bold ${marcado ? 'bg-fuchsia-500 text-white' : darkMode ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-500'}`}>Marcado</button>
              <button onClick={() => setMarcado(false)} className={`flex-1 h-10 rounded-lg text-xs font-bold ${!marcado ? 'bg-fuchsia-500 text-white' : darkMode ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-500'}`}>Sin marcar</button>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={agregarItem}><Plus className="w-3.5 h-3.5 mr-1" /> Agregar al pedido</Button>
        </div>

        {items.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {items.map((it, i) => (
              <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                <span className={darkMode ? 'text-slate-200' : 'text-gray-700'}>
                  {it.producto_nombre} · {it.cantidad}{it.unidad} · {it.marcado ? 'marcado' : 'sin marcar'}
                </span>
                <span className="flex items-center gap-2">
                  <b className={darkMode ? 'text-white' : 'text-gray-900'}>{money(it.subtotal)}</b>
                  <button onClick={() => quitarItem(i)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <p className="text-xs font-bold text-fuchsia-500 mb-2">Layout de pago: Dinámico</p>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {([
              ['abono', 'Abono'], ['no_abono', 'No abono'], ['retiro', 'Retiro'], ['precio_personalizado', 'Precio personal.'],
            ] as [TipoPagoArtesGraficas, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTipoPago(val)}
                className={`h-11 rounded-lg text-[11px] font-bold ${tipoPago === val ? 'bg-fuchsia-500 text-white' : darkMode ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
          {tipoPago === 'precio_personalizado' && (
            <Input className={`${inputCls} mb-2`} type="number" inputMode="numeric" placeholder={`Total sugerido: ${subtotal}`} value={totalPersonalizado} onChange={(e) => setTotalPersonalizado(e.target.value)} />
          )}
          {(tipoPago === 'abono' || tipoPago === 'precio_personalizado') && (
            <Input className={`${inputCls} mb-2`} type="number" inputMode="numeric" placeholder="Monto del abono" value={abono} onChange={(e) => setAbono(e.target.value)} />
          )}
          {tipoPago !== 'no_abono' && (
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}
              className={`w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          )}
        </div>

        <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Total de la orden</span>
          <span className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{money(total)}</span>
        </div>

        <Button onClick={crear} disabled={enviando} className="w-full">
          {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {enviando ? 'Creando…' : 'Crear factura dinámica'}
        </Button>
      </div>
    </div>
  );
}

// ── Modal: cobrar saldo restante ────────────────────────────────────────────

function ModalCobrarSaldo({
  orden, onCerrar, onCobrado,
}: {
  orden: OrdenArtesGraficas;
  onCerrar: () => void;
  onCobrado: () => void;
}) {
  const { darkMode } = usePOS();
  const [monto, setMonto] = useState(String(orden.saldo_pendiente));
  const [metodo, setMetodo] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);

  const cobrar = async () => {
    const m = Number(monto) || 0;
    if (m <= 0) { toast.error('Ingresa un monto válido'); return; }
    setEnviando(true);
    try {
      await registrarPagoFinalOrdenArtesGraficas(orden, m, metodo);
      toast.success('Pago registrado');
      onCobrado();
    } catch (e) {
      toast.error('No se pudo registrar el pago', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-sm rounded-2xl p-6 ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Cobrar saldo</h2>
          <button onClick={onCerrar}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{orden.numero_orden} · Saldo pendiente {money(orden.saldo_pendiente)}</p>
        <div className="space-y-3">
          <Input type="number" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} className={darkMode ? 'bg-slate-800 border-slate-700 text-white h-14 text-2xl font-black' : 'h-14 text-2xl font-black'} />
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
            className={`w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}>
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
          <Button onClick={cobrar} disabled={enviando} className="w-full">
            {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {enviando ? 'Registrando…' : `Registrar pago de ${money(Number(monto) || 0)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
