/**
 * Impresora integrada de la terminal POS Android (solo dentro del APK).
 *
 * Muestra lo que ve la terminal (impresoras USB internas, puertos serie) y
 * permite probar cada opción con un ticket corto. La que imprima se guarda
 * como la vía de esta terminal (impresoraAndroid.ts) y desde ahí salen las
 * tirillas, comandas y cierres.
 */
import { useCallback, useEffect, useState } from 'react';
import { Printer, RefreshCw, Check, Usb, Cable, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
  esAndroidNativo,
  leerConfigImpresoraAndroid,
  guardarConfigImpresoraAndroid,
  listarImpresorasAndroid,
  probarImpresoraAndroid,
  type ConfigImpresoraAndroid,
} from '../../lib/impresoraAndroid';

interface Opcion {
  clave: string;
  titulo: string;
  detalle: string;
  icono: typeof Usb;
  config: ConfigImpresoraAndroid;
}

function mismaOpcion(a: ConfigImpresoraAndroid, b: ConfigImpresoraAndroid): boolean {
  if (a.via !== b.via) return false;
  if (a.via === 'usb') return a.vendorId === b.vendorId && a.productId === b.productId;
  if (a.via === 'serie') return a.ruta === b.ruta;
  return a.ip === b.ip && (a.puerto || 9100) === (b.puerto || 9100);
}

export function ImpresoraTerminalAndroid({ oscuro }: { oscuro: boolean }) {
  const [modelo, setModelo] = useState('');
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [actual, setActual] = useState<ConfigImpresoraAndroid>(() => leerConfigImpresoraAndroid());
  const [buscando, setBuscando] = useState(false);
  const [probando, setProbando] = useState<string | null>(null);
  const [ip, setIp] = useState(actual.via === 'red' ? actual.ip || '' : '');

  const buscar = useCallback(async () => {
    setBuscando(true);
    try {
      const r = await listarImpresorasAndroid();
      setModelo(r.modelo);
      const lista: Opcion[] = [
        ...r.usb.map((u) => ({
          clave: `usb-${u.vendorId}-${u.productId}`,
          titulo: u.esImpresora ? `Impresora USB: ${u.nombre}` : `Dispositivo USB: ${u.nombre}`,
          detalle: `USB interno · ${u.vendorId.toString(16)}:${u.productId.toString(16)}`,
          icono: Usb,
          config: { via: 'usb' as const, vendorId: u.vendorId, productId: u.productId },
        })),
        ...r.serie.map((s) => ({
          clave: `serie-${s.ruta}`,
          titulo: `Puerto serie ${s.ruta.replace('/dev/', '')}`,
          detalle: s.escribible ? 'Puerto interno · con permiso' : 'Puerto interno · sin permiso de escritura',
          icono: Cable,
          config: { via: 'serie' as const, ruta: s.ruta },
        })),
      ];
      setOpciones(lista);
    } catch (e) {
      toast.error(`No se pudo revisar la impresora: ${(e as Error)?.message || e}`);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => { if (esAndroidNativo()) void buscar(); }, [buscar]);

  if (!esAndroidNativo()) return null;

  const probar = async (op: Opcion) => {
    setProbando(op.clave);
    try {
      await probarImpresoraAndroid(op.config, op.titulo);
      toast.success('Ticket de prueba enviado. Si salió en papel, toca «Usar esta».');
    } catch (e) {
      toast.error(`No imprimió por ${op.titulo}: ${(e as Error)?.message || e}`);
    } finally {
      setProbando(null);
    }
  };

  const usar = (op: Opcion) => {
    guardarConfigImpresoraAndroid(op.config);
    setActual(op.config);
    toast.success(`Listo: esta terminal imprime por ${op.titulo}.`);
  };

  const red: Opcion | null = ip.trim()
    ? { clave: 'red', titulo: `Impresora de red ${ip.trim()}`, detalle: 'Red local · puerto 9100', icono: Wifi, config: { via: 'red', ip: ip.trim(), puerto: 9100 } }
    : null;

  const tarjeta = oscuro ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
  const fila = oscuro ? 'bg-slate-900/60 border-slate-700' : 'bg-gray-50 border-gray-200';
  const texto = oscuro ? 'text-white' : 'text-gray-900';
  const suave = oscuro ? 'text-slate-400' : 'text-gray-500';

  const renderFila = (op: Opcion) => {
    const Icono = op.icono;
    const enUso = mismaOpcion(actual, op.config);
    return (
      <div key={op.clave} className={`flex items-center gap-3 rounded-2xl border p-3 ${fila}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enUso ? 'bg-emerald-500 text-white' : oscuro ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>
          {enUso ? <Check className="w-5 h-5" /> : <Icono className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm truncate ${texto}`}>{op.titulo}</p>
          <p className={`text-xs ${suave}`}>{enUso ? 'En uso en esta terminal' : op.detalle}</p>
        </div>
        <Button variant="outline" className="rounded-xl h-11 px-4" disabled={probando !== null} onClick={() => probar(op)}>
          {probando === op.clave ? 'Imprimiendo…' : 'Probar'}
        </Button>
        {!enUso && (
          <Button className="rounded-xl h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => usar(op)}>
            Usar esta
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className={`rounded-3xl border p-5 space-y-4 ${tarjeta}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${texto}`}>Impresora de la terminal</h2>
            <p className={`text-xs ${suave}`}>{modelo || 'Terminal Android'} · prueba cada opción y deja la que imprima</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl h-11" disabled={buscando} onClick={() => void buscar()}>
          <RefreshCw className={`w-4 h-4 mr-2 ${buscando ? 'animate-spin' : ''}`} />
          Buscar
        </Button>
      </div>

      <div className="space-y-2">
        {opciones.map(renderFila)}
        {!buscando && opciones.length === 0 && (
          <p className={`text-sm ${suave}`}>No se encontró impresora USB ni puertos serie. Si es de red, escribe su IP abajo.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className={`text-xs font-semibold ${suave}`}>Impresora de red (opcional)</p>
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          inputMode="decimal"
          placeholder="192.168.0.50"
          className={`w-full h-11 rounded-xl border px-3 text-sm ${oscuro ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
        />
        {red && renderFila(red)}
      </div>
    </div>
  );
}
