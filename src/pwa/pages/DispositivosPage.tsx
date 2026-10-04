/**
 * Dispositivos — web y celular: impresora térmica, cajón monedero y lector
 * de código de barras de ESTE equipo. La impresión y el cajón usan los mismos
 * comandos que Electron (ver impresoraWeb.ts).
 */
import { useEffect, useState } from 'react';
import { Printer, Usb, Bluetooth, Cable, MonitorSmartphone, Inbox, ScanBarcode, Loader2, Trash2, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  obtenerDispositivos, guardarDispositivos, elegirImpresora, olvidarImpresora, imprimirPrueba, abrirCajon,
  soporte, tieneImpresoraDirecta, EVENTO_DISPOSITIVOS, type TipoConexion,
} from '../lib/impresoraWeb';
import { esIphone } from '../lib/pushPagos';

const tarjeta = 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5';

function Interruptor({ activo, onClick, etiqueta }: { activo: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onClick}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${activo ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <span className={`absolute top-1 w-5 h-5 rounded-full transition-all ${activo ? 'left-6' : 'left-1'}`} style={{ background: '#ffffff' }} />
    </button>
  );
}

const NOMBRE_TIPO: Record<TipoConexion, string> = { usb: 'USB', serial: 'Puerto serie', bluetooth: 'Bluetooth', sistema: 'Impresora del sistema' };

export default function DispositivosPage() {
  const [cfg, setCfg] = useState(obtenerDispositivos);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [codigoLeido, setCodigoLeido] = useState('');

  useEffect(() => {
    const actualizar = () => setCfg(obtenerDispositivos());
    window.addEventListener(EVENTO_DISPOSITIVOS, actualizar);
    return () => window.removeEventListener(EVENTO_DISPOSITIVOS, actualizar);
  }, []);

  const ejecutar = async (clave: string, accion: () => Promise<unknown>, ok?: string) => {
    setOcupado(clave);
    try {
      await accion();
      if (ok) toast.success(ok);
    } catch (e: any) {
      if (e?.name === 'NotFoundError' || /cancel|No device selected|User cancelled/i.test(String(e?.message))) { /* cerró el selector */ }
      else toast.error(e?.message || 'No se pudo completar');
    }
    setOcupado(null);
  };

  const conexiones: Array<{ tipo: TipoConexion; icono: typeof Usb; titulo: string; detalle: string; disponible: boolean }> = [
    { tipo: 'usb', icono: Usb, titulo: 'USB', detalle: 'Impresora conectada por cable (en celular Android, con adaptador OTG).', disponible: soporte.usb() },
    { tipo: 'bluetooth', icono: Bluetooth, titulo: 'Bluetooth', detalle: 'Impresoras térmicas portátiles.', disponible: soporte.bluetooth() },
    { tipo: 'serial', icono: Cable, titulo: 'Puerto serie', detalle: 'Impresoras por puerto COM o USB serie (computador).', disponible: soporte.serial() },
    { tipo: 'sistema', icono: MonitorSmartphone, titulo: 'Impresora del sistema', detalle: esIphone() ? 'AirPrint o la impresora que tengas en el iPhone.' : 'Cualquier impresora instalada, con el diálogo de impresión.', disponible: true },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-28">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-2xl font-black">Dispositivos</h1>
        <p className="text-slate-400 text-sm">Impresora, cajón monedero y lector de este equipo</p>
      </div>

      <div className="px-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Impresora */}
        <div className={`${tarjeta} space-y-4 lg:row-span-2`}>
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Impresora de tickets</span>
          </div>

          {cfg.impresora.tipo ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{cfg.impresora.nombre}</p>
                <p className="text-slate-400 text-xs">{NOMBRE_TIPO[cfg.impresora.tipo]} · papel de {cfg.impresora.ancho} mm</p>
              </div>
              <button onClick={() => { olvidarImpresora(); toast('Impresora desconectada de este equipo'); }} className="p-2 rounded-lg text-slate-400 hover:text-red-400" title="Olvidar impresora">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Elige cómo está conectada la impresora:</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {conexiones.map(({ tipo, icono: Icono, titulo, detalle, disponible }) => (
              <button
                key={tipo}
                disabled={!disponible || ocupado !== null}
                onClick={() => ejecutar(tipo, () => elegirImpresora(tipo), `Impresora ${NOMBRE_TIPO[tipo]} lista`)}
                className={`text-left rounded-xl p-3 border transition-colors disabled:opacity-40 ${cfg.impresora.tipo === tipo ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}
              >
                <p className="text-white text-sm font-semibold flex items-center gap-2">
                  {ocupado === tipo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icono className="w-4 h-4 text-amber-400" />} {titulo}
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">{disponible ? detalle : 'Este navegador no lo permite. Usa Chrome o Edge.'}</p>
              </button>
            ))}
          </div>

          <div>
            <p className="text-slate-400 text-xs mb-1.5">Ancho del papel</p>
            <div className="flex gap-2">
              {([58, 80] as const).map((a) => (
                <button key={a} onClick={() => setCfg(guardarDispositivos({ impresora: { ...cfg.impresora, ancho: a } }))}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold ${cfg.impresora.ancho === a ? 'bg-amber-500 text-slate-950' : 'bg-slate-950 border border-slate-800 text-slate-400'}`}>
                  {a} mm
                </button>
              ))}
            </div>
          </div>

          {cfg.impresora.tipo === 'serial' && (
            <div>
              <p className="text-slate-400 text-xs mb-1.5">Velocidad del puerto (baudios)</p>
              <select
                value={cfg.impresora.serial?.baudRate || 9600}
                onChange={(e) => setCfg(guardarDispositivos({ impresora: { ...cfg.impresora, serial: { ...cfg.impresora.serial, baudRate: Number(e.target.value) } } }))}
                className="w-full h-10 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm px-3"
              >
                {[9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-semibold">Imprimir al terminar cada venta</p>
              <p className="text-slate-500 text-xs">Sale el ticket solo, sin tocar nada.</p>
            </div>
            <Interruptor activo={cfg.imprimirAlVender} etiqueta="Imprimir al vender" onClick={() => setCfg(guardarDispositivos({ imprimirAlVender: !cfg.imprimirAlVender }))} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-white text-sm font-semibold">Copias por venta</p>
            <div className="flex items-center gap-2">
              {[1, 2].map((n) => (
                <button key={n} onClick={() => setCfg(guardarDispositivos({ copias: n }))}
                  className={`w-10 h-9 rounded-lg text-sm font-bold ${cfg.copias === n ? 'bg-amber-500 text-slate-950' : 'bg-slate-950 border border-slate-800 text-slate-400'}`}>{n}</button>
              ))}
            </div>
          </div>

          <button
            disabled={!cfg.impresora.tipo || ocupado !== null}
            onClick={() => ejecutar('prueba', () => imprimirPrueba(), 'Prueba enviada a la impresora')}
            className="w-full h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {ocupado === 'prueba' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir prueba
          </button>

          <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-3 text-[11px] text-slate-400 space-y-1">
            <p className="flex items-center gap-1.5 text-slate-300 font-semibold"><Info className="w-3.5 h-3.5" /> Si la impresora USB no aparece en Windows</p>
            <p>Windows a veces la reserva para su propio controlador. Usa <b>Impresora del sistema</b> (funciona siempre) o, para imprimir directo y abrir el cajón, instala el controlador WinUSB con la herramienta Zadig.</p>
            {esIphone() && <p>En iPhone solo se puede imprimir con el diálogo del sistema (AirPrint); el cajón monedero se abre desde Electron o un computador.</p>}
          </div>
        </div>

        {/* Cajón */}
        <div className={`${tarjeta} space-y-4`}>
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Cajón monedero</span>
          </div>
          <p className="text-slate-500 text-xs">El cajón se conecta a la impresora (cable RJ11) y se abre con ella. Necesita impresora por USB, Bluetooth o puerto serie.</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-white text-sm font-semibold">Abrir al cobrar en efectivo</p>
            <Interruptor activo={cfg.cajon.abrirConEfectivo} etiqueta="Abrir con efectivo" onClick={() => setCfg(guardarDispositivos({ cajon: { ...cfg.cajon, abrirConEfectivo: !cfg.cajon.abrirConEfectivo } }))} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-white text-sm font-semibold">Abrir en todas las ventas</p>
            <Interruptor activo={cfg.cajon.abrirSiempre} etiqueta="Abrir siempre" onClick={() => setCfg(guardarDispositivos({ cajon: { ...cfg.cajon, abrirSiempre: !cfg.cajon.abrirSiempre } }))} />
          </div>
          <button
            disabled={!tieneImpresoraDirecta() || ocupado !== null}
            onClick={() => ejecutar('cajon', async () => { if (!(await abrirCajon())) throw new Error('El cajón no respondió'); }, 'Cajón abierto')}
            className="w-full h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {ocupado === 'cajon' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />} Probar cajón
          </button>
        </div>

        {/* Lector */}
        <div className={`${tarjeta} space-y-3`}>
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Lector de código de barras</span>
          </div>
          <p className="text-slate-500 text-xs">
            Los lectores USB o Bluetooth funcionan solos: en Vender basta con escanear, sin tocar el buscador. En el celular también puedes usar la cámara.
          </p>
          <input
            value={codigoLeido}
            onChange={(e) => setCodigoLeido(e.target.value)}
            placeholder="Toca aquí y escanea un código para probar"
            className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm"
          />
          {codigoLeido && <p className="text-emerald-400 text-xs">El lector funciona: leyó «{codigoLeido}».</p>}
        </div>
      </div>
    </div>
  );
}
