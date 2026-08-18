import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import Cropper, { Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { Camera, ImagePlus, Loader2, Save, Trash2, X, Check, Plus } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const UNIDADES = ['unidad', 'kg', 'g', 'lb', 'l', 'ml', 'paquete'];
const MAX_FOTOS = 6;

interface FormState {
  nombre: string;
  codigo_barras: string;
  categoria: string;
  precio_venta: string;
  costo: string;
  stock: string;
  stock_minimo: string;
  unidad: string;
  iva: string;
  fotos: string[];
}

const VACIO: FormState = {
  nombre: '', codigo_barras: '', categoria: '', precio_venta: '', costo: '',
  stock: '', stock_minimo: '', unidad: 'unidad', iva: '0', fotos: [],
};

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
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92));
}

/** Sube un blob ya listo (recortado o no) y devuelve su URL pública. */
async function subirFotoProducto(clienteId: string, blob: Blob): Promise<string> {
  const client = getSupabaseClient()!;
  const nombreArchivo = `${clienteId}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from('productos-fotos').upload(nombreArchivo, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  const { data: pub } = client.storage.from('productos-fotos').getPublicUrl(nombreArchivo);
  return pub.publicUrl;
}

export default function ProductoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { empleado } = usePwaAuth();
  const esNuevo = id === 'nuevo';

  const [form, setForm] = useState<FormState>(VACIO);
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [categoriasExistentes, setCategoriasExistentes] = useState<string[]>([]);
  const [categoriaNueva, setCategoriaNueva] = useState(false);

  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaRecorte, setAreaRecorte] = useState<Area | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const camaraInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);

  // 📷 Cámara: cada foto se recorta antes de subir — la primera define la portada.
  useEffect(() => {
    if (esNuevo) {
      const codigoPrellenado = (location.state as { codigoBarras?: string } | null)?.codigoBarras;
      if (codigoPrellenado) setForm((f) => ({ ...f, codigo_barras: codigoPrellenado }));
      return;
    }
    const client = getSupabaseClient();
    client!
      .from('productos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const fotos: string[] = Array.isArray(data.fotos_urls) && data.fotos_urls.length > 0
            ? data.fotos_urls
            : (data.foto_url ? [data.foto_url] : []);
          setForm({
            nombre: data.nombre || '',
            codigo_barras: data.codigo_barras || '',
            categoria: data.categoria || '',
            precio_venta: String(data.precio_venta ?? ''),
            costo: String(data.costo ?? ''),
            stock: String(data.stock ?? ''),
            stock_minimo: String(data.stock_minimo ?? ''),
            unidad: data.unidad || 'unidad',
            iva: String(data.iva ?? '0'),
            fotos,
          });
        }
        setCargando(false);
      });
  }, [id, esNuevo]);

  // 🔗 Categorías: se leen del MISMO inventario que administra Electron —
  // no una lista aparte — así el vendedor elige de lo que el negocio ya usa
  // en vez de escribir variantes del mismo nombre ("Dulces"/"dulceria"...).
  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    client
      ?.from('productos')
      .select('categoria')
      .eq('cliente_id', empleado.cliente_id)
      .not('categoria', 'is', null)
      .limit(3000)
      .then(({ data }) => {
        const unicas = [...new Set((data || []).map((r: { categoria: string }) => r.categoria).filter(Boolean))] as string[];
        unicas.sort((a, b) => a.localeCompare(b));
        setCategoriasExistentes(unicas);
      });
  }, [empleado?.cliente_id]);

  const handleSeleccionarCamara = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagenOriginal(reader.result as string);
    reader.readAsDataURL(file);
  };

  const confirmarRecorte = async () => {
    if (!imagenOriginal || !areaRecorte || !empleado) return;
    setSubiendoFoto(true);
    try {
      const blobRecortado = await recortarImagen(imagenOriginal, areaRecorte);
      const blobComprimido = await imageCompression(blobRecortado as File, {
        maxSizeMB: 0.4, maxWidthOrHeight: 800, useWebWorker: true, initialQuality: 0.8,
      });
      const url = await subirFotoProducto(empleado.cliente_id, blobComprimido);
      setForm((f) => ({ ...f, fotos: [...f.fotos, url].slice(0, MAX_FOTOS) }));
      setImagenOriginal(null);
      toast.success('Foto agregada');
    } catch (e) {
      toast.error('Error subiendo la foto', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSubiendoFoto(false);
    }
  };

  // 🖼️ Galería: selección múltiple, sin recorte uno por uno (con hasta 6
  // fotos sería tedioso) — se comprimen y suben tal cual, respetando el cupo.
  const handleSeleccionarGaleria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0 || !empleado) return;
    const cupo = MAX_FOTOS - form.fotos.length;
    if (cupo <= 0) { toast.error(`Ya tienes el máximo de ${MAX_FOTOS} fotos`); return; }
    const aSubir = files.slice(0, cupo);
    setSubiendoFoto(true);
    try {
      const urls: string[] = [];
      for (const file of aSubir) {
        const comprimido = await imageCompression(file, { maxSizeMB: 0.4, maxWidthOrHeight: 800, useWebWorker: true, initialQuality: 0.8 });
        urls.push(await subirFotoProducto(empleado.cliente_id, comprimido));
      }
      setForm((f) => ({ ...f, fotos: [...f.fotos, ...urls].slice(0, MAX_FOTOS) }));
      toast.success(`${urls.length} foto(s) agregada(s)`);
      if (files.length > cupo) toast.info(`Solo se subieron ${cupo} — llegaste al máximo de ${MAX_FOTOS}`);
    } catch (e) {
      toast.error('Error subiendo fotos', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSubiendoFoto(false);
    }
  };

  const quitarFoto = (idx: number) => setForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== idx) }));

  const handleGuardar = async () => {
    if (!empleado) return;
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setGuardando(true);
    const client = getSupabaseClient()!;
    const payload = {
      cliente_id: empleado.cliente_id,
      nombre: form.nombre.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      categoria: form.categoria.trim() || null,
      precio_venta: Number(form.precio_venta) || 0,
      costo: Number(form.costo) || 0,
      stock: Number(form.stock) || 0,
      stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : null,
      unidad: form.unidad,
      iva: Number(form.iva) || 0,
      foto_url: form.fotos[0] || null,
      fotos_urls: form.fotos.length > 0 ? form.fotos : null,
      updated_by: empleado.id,
    };

    const { error } = esNuevo
      ? await client.from('productos').insert(payload)
      : await client.from('productos').update(payload).eq('id', id);

    setGuardando(false);

    if (error) {
      toast.error('No se pudo guardar', { description: error.message });
      return;
    }

    toast.success(esNuevo ? 'Producto creado' : 'Producto actualizado');
    navigate('/inventario', { replace: true });
  };

  const handleDesactivar = async () => {
    if (esNuevo) return;
    const client = getSupabaseClient()!;
    const { error } = await client.from('productos').update({ activo: false }).eq('id', id);
    if (error) {
      toast.error('No se pudo desactivar', { description: error.message });
      return;
    }
    toast.success('Producto desactivado');
    navigate('/inventario', { replace: true });
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">{esNuevo ? 'Nuevo producto' : 'Editar producto'}</h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Fotos — hasta 6, portada = la primera */}
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Fotos ({form.fotos.length}/{MAX_FOTOS})</Label>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {form.fotos.map((url, i) => (
              <div key={url + i} className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-slate-800">
                <img src={url} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-slate-950 text-[8px] font-black text-center py-0.5">PORTADA</span>
                )}
                <button
                  type="button"
                  onClick={() => quitarFoto(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {form.fotos.length < MAX_FOTOS && (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => camaraInputRef.current?.click()}
                  disabled={subiendoFoto}
                  className="w-20 h-20 rounded-xl bg-slate-900/70 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                >
                  {subiendoFoto ? <Loader2 className="w-5 h-5 text-slate-500 animate-spin" /> : <Camera className="w-5 h-5 text-slate-500" />}
                  <span className="text-[9px] text-slate-500 font-semibold">Cámara</span>
                </button>
                <button
                  type="button"
                  onClick={() => galeriaInputRef.current?.click()}
                  disabled={subiendoFoto}
                  className="w-20 h-20 rounded-xl bg-slate-900/70 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                >
                  <ImagePlus className="w-5 h-5 text-slate-500" />
                  <span className="text-[9px] text-slate-500 font-semibold">Galería</span>
                </button>
              </div>
            )}
          </div>
          <input ref={camaraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleSeleccionarCamara} />
          <input ref={galeriaInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSeleccionarGaleria} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Nombre</Label>
          <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Código de barras</Label>
          <Input value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white font-mono" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-slate-400 text-xs">Categoría</Label>
            {categoriasExistentes.length > 0 && (
              <button type="button" onClick={() => setCategoriaNueva((v) => !v)} className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
                <Plus className="w-3 h-3" /> {categoriaNueva ? 'Elegir existente' : 'Nueva categoría'}
              </button>
            )}
          </div>
          {categoriasExistentes.length === 0 || categoriaNueva ? (
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Escribe la categoría" className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          ) : (
            <select
              value={categoriasExistentes.includes(form.categoria) ? form.categoria : ''}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900/70 border border-slate-800 text-white"
            >
              <option value="">Sin categoría</option>
              {categoriasExistentes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <p className="text-slate-600 text-[10px]">
            Estas son las categorías que ya usa tu inventario en el computador — elige una o crea una nueva.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Precio de venta</Label>
            <Input type="number" inputMode="numeric" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Costo</Label>
            <Input type="number" inputMode="numeric" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Stock</Label>
            <Input type="number" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Stock mínimo</Label>
            <Input type="number" inputMode="numeric" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Unidad</Label>
            <select
              value={form.unidad}
              onChange={(e) => setForm({ ...form, unidad: e.target.value })}
              className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900/70 border border-slate-800 text-white"
            >
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">IVA %</Label>
            <Input type="number" inputMode="numeric" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
          </div>
        </div>

        <Button onClick={handleGuardar} disabled={guardando} className="w-full h-14 text-base bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
          {guardando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>

        {!esNuevo && (
          <Button onClick={handleDesactivar} variant="outline" className="w-full h-12 border-slate-700 bg-slate-900/50 text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4 mr-2" />
            Desactivar producto
          </Button>
        )}
      </div>

      {/* Modal de recorte (solo para la cámara) */}
      {imagenOriginal && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="relative flex-1">
            <Cropper
              image={imagenOriginal}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, areaPixeles) => setAreaRecorte(areaPixeles)}
            />
          </div>
          <div className="p-4 bg-slate-950 flex gap-3">
            <Button
              variant="outline"
              onClick={() => setImagenOriginal(null)}
              className="flex-1 h-12 border-slate-700 text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={confirmarRecorte}
              disabled={subiendoFoto}
              className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600"
            >
              {subiendoFoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {subiendoFoto ? 'Subiendo...' : 'Usar foto'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
