import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import Cropper, { Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { Camera, Loader2, Save, Trash2, X, Check } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const UNIDADES = ['unidad', 'kg', 'g', 'lb', 'l', 'ml', 'paquete'];

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
  foto_url: string;
}

const VACIO: FormState = {
  nombre: '', codigo_barras: '', categoria: '', precio_venta: '', costo: '',
  stock: '', stock_minimo: '', unidad: 'unidad', iva: '0', foto_url: '',
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

export default function ProductoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { empleado } = usePwaAuth();
  const esNuevo = id === 'nuevo';

  const [form, setForm] = useState<FormState>(VACIO);
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);

  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaRecorte, setAreaRecorte] = useState<Area | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            foto_url: data.foto_url || '',
          });
        }
        setCargando(false);
      });
  }, [id, esNuevo]);

  const handleSeleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
        maxSizeMB: 0.4,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        initialQuality: 0.8,
      });

      const client = getSupabaseClient()!;
      const nombreArchivo = `${empleado.cliente_id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage
        .from('productos-fotos')
        .upload(nombreArchivo, blobComprimido, { contentType: 'image/jpeg' });

      if (uploadError) {
        toast.error('Error subiendo la foto', { description: uploadError.message });
        return;
      }

      const { data: pub } = client.storage.from('productos-fotos').getPublicUrl(nombreArchivo);
      setForm((f) => ({ ...f, foto_url: pub.publicUrl }));
      setImagenOriginal(null);
      toast.success('Foto lista');
    } finally {
      setSubiendoFoto(false);
    }
  };

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
      foto_url: form.foto_url || null,
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
        {/* Foto */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-28 h-28 rounded-2xl bg-slate-900/70 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden"
          >
            {form.foto_url ? (
              <img src={form.foto_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-7 h-7 text-slate-600" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleSeleccionarFoto}
          />
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
          <Label className="text-slate-400 text-xs">Categoría</Label>
          <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="h-12 bg-slate-900/70 border-slate-800 text-white" />
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

      {/* Modal de recorte */}
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
