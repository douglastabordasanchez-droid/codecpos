import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Send, Pencil, Plus, ScanLine, Loader2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { enviarCodigoEscaneado } from '../../app/lib/supabase/scanBroadcast';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ProductoEncontrado {
  id: string;
  nombre: string;
  precio_venta: number;
  stock: number;
  foto_url: string | null;
}

export default function EscanerPage() {
  const navigate = useNavigate();
  const { empleado } = usePwaAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [producto, setProducto] = useState<ProductoEncontrado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  const buscarProducto = async (codigoEscaneado: string) => {
    setBuscando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, precio_venta, stock, foto_url')
      .eq('cliente_id', empleado!.cliente_id)
      .eq('codigo_barras', codigoEscaneado)
      .maybeSingle();
    setProducto(data as ProductoEncontrado | null);
    setBuscando(false);
  };

  const iniciarEscaneo = () => {
    if (!videoRef.current) return;
    setErrorCamara(null);
    const reader = new BrowserMultiFormatReader();
    // 🐛 FIX: decodeFromVideoDevice(undefined, ...) deja que el navegador
    // elija CUALQUIER cámara disponible sin preferencia — en varios Android
    // (y en varios navegadores) eso termina abriendo la cámara FRONTAL en
    // vez de la trasera, así que el usuario ve su propia cara en vez del
    // código de barras y percibe "la cámara no funciona". decodeFromConstraints
    // permite pedir explícitamente la cámara trasera (facingMode:
    // 'environment'), con 'ideal' para que igual funcione en equipos con una
    // sola cámara (ej. laptops) en vez de fallar duro si no hay trasera.
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _err, controls) => {
          controlsRef.current = controls;
          if (result) {
            controls.stop();
            const texto = result.getText();
            setCodigo(texto);
            buscarProducto(texto);
          }
        }
      )
      .catch((e) => {
        // NotAllowedError = permiso de cámara denegado por el usuario/navegador;
        // el mensaje nativo del navegador no siempre deja claro qué hacer.
        if (e?.name === 'NotAllowedError') {
          setErrorCamara('Permiso de cámara denegado. Actívalo en los ajustes del navegador/app para este sitio y vuelve a intentar.');
        } else if (e?.name === 'NotFoundError') {
          setErrorCamara('No se encontró ninguna cámara en este dispositivo.');
        } else {
          setErrorCamara(e?.message || 'No se pudo acceder a la cámara');
        }
      });
  };

  useEffect(() => {
    iniciarEscaneo();
    return () => controlsRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const escanearOtro = () => {
    setCodigo(null);
    setProducto(null);
    setErrorCamara(null);
    iniciarEscaneo();
  };

  const handleEnviarACaja = async () => {
    if (!codigo || !empleado) return;
    setEnviando(true);
    const ok = await enviarCodigoEscaneado(empleado.cliente_id, codigo);
    setEnviando(false);
    if (ok) {
      toast.success('Enviado a la caja activa');
    } else {
      toast.error('No se pudo enviar — revisa tu conexión');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Escáner</h1>
        <p className="text-slate-400 text-sm">Busca, edita o envía un producto a la caja por código de barras</p>
      </div>

      {!codigo && (
        <div className="px-5">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-1/3 border-2 border-amber-400/70 rounded-xl" />
            </div>
          </div>
          {errorCamara && (
            <div className="mt-4 text-center">
              <p className="text-red-400 text-sm mb-3">{errorCamara}</p>
              <Button variant="outline" onClick={iniciarEscaneo} className="border-slate-700 bg-slate-900/50 text-slate-300">
                Reintentar
              </Button>
            </div>
          )}
        </div>
      )}

      {codigo && (
        <div className="px-5 space-y-4">
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 text-center shadow-sm">
            <ScanLine className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <p className="text-slate-400 text-xs">Código escaneado</p>
            <p className="text-white font-mono font-bold text-lg">{codigo}</p>
          </div>

          {buscando && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            </div>
          )}

          {!buscando && producto && (
            <div className="bg-slate-900/70 backdrop-blur border border-emerald-800/50 rounded-2xl p-5 space-y-3 shadow-sm">
              <p className="text-white font-bold">{producto.nombre}</p>
              <p className="text-slate-400 text-sm">
                ${producto.precio_venta.toLocaleString('es-CO')} · Stock: {producto.stock}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleEnviarACaja}
                  disabled={enviando}
                  className="h-12 bg-gradient-to-r from-emerald-500 to-emerald-600"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar a caja
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/inventario/${producto.id}`)}
                  className="h-12 border-slate-700 bg-slate-900/50 text-slate-300"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </div>
            </div>
          )}

          {!buscando && !producto && (
            <div className="bg-slate-900/70 backdrop-blur border border-amber-800/40 rounded-2xl p-5 space-y-3 text-center shadow-sm">
              <p className="text-white font-semibold">No existe un producto con este código</p>
              <Button
                onClick={() => navigate('/inventario/nuevo', { state: { codigoBarras: codigo } })}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear producto
              </Button>
            </div>
          )}

          <Button variant="outline" onClick={escanearOtro} className="w-full h-12 border-slate-700 bg-slate-900/50 text-slate-300">
            Escanear otro código
          </Button>
        </div>
      )}
    </div>
  );
}
