import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, Loader2, Clock, History, ChevronDown } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface Desglose {
  efectivo: number;
  tarjeta: number;
  nequi: number;
  daviplata: number;
  transferencia: number;
  rappi: number;
  mixto: number;
  otro: number;
}

type DesglosePropinas = Record<keyof Desglose, number>;

const DESGLOSE_VACIO: Desglose = { efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, rappi: 0, mixto: 0, otro: 0 };

const METODOS_LABEL: Record<keyof Desglose, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata',
  transferencia: 'Transferencia', rappi: 'Rappi', mixto: 'Mixto', otro: 'Otro',
};

const PROPINA_VACIA: DesglosePropinas = { efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, rappi: 0, mixto: 0, otro: 0 };

/** Mismo desglose que ya calcula y guarda Electron (ver syncService.ts → `detalle.desglose`) — así el historial se lee igual en las dos plataformas. */
function calcularDesglose(ventas: { total: number; metodo_pago: string | null }[]): Desglose {
  const d = { ...DESGLOSE_VACIO };
  for (const v of ventas) {
    const metodo = String(v.metodo_pago || '').toLowerCase();
    const monto = Number(v.total) || 0;
    if (metodo in d) d[metodo as keyof Desglose] += monto;
    else d.otro += monto;
  }
  return d;
}

function calcularPropinas(ventas: { propina?: number; metodo_pago: string | null }[]): DesglosePropinas {
  const propinas = { ...PROPINA_VACIA };
  for (const venta of ventas) {
    const metodo = String(venta.metodo_pago || '').toLowerCase();
    const valor = Number(venta.propina) || 0;
    if (metodo in propinas) propinas[metodo as keyof Desglose] += valor;
    else propinas.otro += valor;
  }
  return propinas;
}

interface CierreFila {
  id: string;
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  monto_apertura: number;
  monto_cierre: number;
  ventas_total: number;
  diferencia: number;
  detalle: { desglose?: Partial<Desglose>; propinas?: Partial<DesglosePropinas> } | null;
}

const TERMINAL_ID = 'PWA';

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function CierreCajaPage() {
  const { empleado } = usePwaAuth();
  const [cierreAbierto, setCierreAbierto] = useState<CierreFila | null | undefined>(undefined);
  const [historial, setHistorial] = useState<CierreFila[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  const [montoApertura, setMontoApertura] = useState('');
  const [montoCierre, setMontoCierre] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desglosePreview, setDesglosePreview] = useState<Desglose | null>(null);
  const [propinasPreview, setPropinasPreview] = useState<DesglosePropinas | null>(null);
  const [cierreExpandido, setCierreExpandido] = useState<string | null>(null);

  const cargar = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;

    const { data: abierto } = await client
      .from('cierres_caja')
      .select('id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia, detalle')
      .eq('cliente_id', empleado.cliente_id)
      .eq('terminal_id', TERMINAL_ID)
      .is('fecha_cierre', null)
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCierreAbierto((abierto as CierreFila | null) || null);

    setCargandoHistorial(true);
    const { data: hist } = await client
      .from('cierres_caja')
      .select('id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia, detalle')
      .eq('cliente_id', empleado.cliente_id)
      .not('fecha_cierre', 'is', null)
      .order('fecha_cierre', { ascending: false })
      .limit(15);
    setHistorial((hist as CierreFila[]) || []);
    setCargandoHistorial(false);
  };

  // Vista previa del desglose por método de pago mientras la caja está
  // abierta — mismo desglose que Electron muestra antes de confirmar el
  // cierre (ModalCierreCaja.tsx), para que el cajero vea lo mismo.
  useEffect(() => {
    if (!empleado || !cierreAbierto) { setDesglosePreview(null); return; }
    const client = getSupabaseClient();
    if (!client) return;
    let cancelado = false;
    client
      .from('ventas')
      .select('total, propina, metodo_pago')
      .eq('cliente_id', empleado.cliente_id)
      .eq('estado', 'completada')
      .gte('created_at', cierreAbierto.fecha_apertura || new Date().toISOString())
      .then(({ data }) => {
        if (!cancelado) {
          setDesglosePreview(calcularDesglose((data as any[]) || []));
          setPropinasPreview(calcularPropinas((data as any[]) || []));
        }
      });
    return () => { cancelado = true; };
  }, [empleado?.cliente_id, cierreAbierto?.id, cierreAbierto?.fecha_apertura]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const handleAbrir = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado) return;
    const monto = Number(montoApertura) || 0;
    setProcesando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const { error: insertError } = await client.from('cierres_caja').insert({
      cliente_id: empleado.cliente_id,
      terminal_id: TERMINAL_ID,
      empleado_id: empleado.id,
      fecha_apertura: new Date().toISOString(),
      monto_apertura: monto,
    });
    setProcesando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMontoApertura('');
    cargar();
  };

  const handleCerrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado || !cierreAbierto) return;
    setProcesando(true);
    setError(null);
    const client = getSupabaseClient()!;

    const { data: ventas } = await client
      .from('ventas')
      .select('total, propina, metodo_pago')
      .eq('cliente_id', empleado.cliente_id)
      .eq('estado', 'completada')
      .gte('created_at', cierreAbierto.fecha_apertura || new Date().toISOString());

    const ventasLista = ventas || [];
    const ventasTotal = ventasLista.reduce((s: number, v: any) => s + Number(v.total), 0);
    const desglose = calcularDesglose(ventasLista as any[]);
    const propinas = calcularPropinas(ventasLista as any[]);
    const montoContado = Number(montoCierre) || 0;
    const esperado = cierreAbierto.monto_apertura + ventasTotal;
    const diferencia = montoContado - esperado;

    const { error: updateError } = await client
      .from('cierres_caja')
      .update({
        fecha_cierre: new Date().toISOString(),
        monto_cierre: montoContado,
        ventas_total: ventasTotal,
        diferencia,
        // Mismo shape que usa Electron (detalle.desglose) — ver syncService.ts.
        detalle: { desglose, propinas },
      })
      .eq('id', cierreAbierto.id);

    setProcesando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMontoCierre('');
    cargar();
  };

  if (cierreAbierto === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Caja</h1>
        <p className="text-slate-400 text-sm">Apertura y cierre desde el celular</p>
      </div>

      <div className="px-5 mb-6">
        {!cierreAbierto ? (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleAbrir}
            className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja cerrada</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Monto de apertura (base)</Label>
              <Input
                type="number" inputMode="numeric" required autoFocus
                value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)}
                placeholder="0"
                className="h-14 text-2xl font-bold bg-slate-950/60 border-slate-700 text-white"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={procesando} className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600">
              {procesando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {procesando ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </motion.form>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCerrar}
            className="bg-slate-900/70 backdrop-blur border border-amber-800/40 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja abierta</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              Desde {cierreAbierto.fecha_apertura ? new Date(cierreAbierto.fecha_apertura).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            <p className="text-slate-400 text-sm">Base de apertura: <span className="text-white font-bold">${cierreAbierto.monto_apertura.toLocaleString('es-CO')}</span></p>

            {desglosePreview && (
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">Ventas por método de pago</p>
                <div className="space-y-1">
                  {(Object.keys(DESGLOSE_VACIO) as (keyof Desglose)[])
                    .filter((m) => desglosePreview[m] > 0)
                    .map((m) => (
                      <div key={m} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{METODOS_LABEL[m]}</span>
                        <span className="text-white font-bold">${desglosePreview[m].toLocaleString('es-CO')}</span>
                      </div>
                    ))}
                  {Object.values(desglosePreview).every((v) => v === 0) && (
                    <p className="text-slate-600 text-xs">Sin ventas todavía en este turno.</p>
                  )}
                </div>
              </div>
            )}
            {propinasPreview && (
              <div className="bg-slate-950/50 border border-amber-900/40 rounded-xl p-3">
                <p className="text-amber-400 text-[10px] font-bold uppercase tracking-wide mb-2">Propinas por método de pago</p>
                <div className="space-y-1">
                  {(Object.keys(PROPINA_VACIA) as (keyof Desglose)[]).filter((m) => propinasPreview[m] > 0).map((m) => (
                    <div key={m} className="flex items-center justify-between text-xs"><span className="text-slate-400">{METODOS_LABEL[m]}</span><span className="text-amber-300 font-bold">${propinasPreview[m].toLocaleString('es-CO')}</span></div>
                  ))}
                  {Object.values(propinasPreview).every((v) => v === 0) && <p className="text-slate-600 text-xs">Sin propinas en este turno.</p>}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Monto contado al cerrar</Label>
              <Input
                type="number" inputMode="numeric" required autoFocus
                value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)}
                placeholder="0"
                className="h-14 text-2xl font-bold bg-slate-950/60 border-slate-700 text-white"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={procesando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
              {procesando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {procesando ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </motion.form>
        )}
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Historial de cierres</h2>
        </div>
        <div className="space-y-2">
          {cargandoHistorial && <p className="text-slate-500 text-sm text-center py-4">Cargando...</p>}
          {!cargandoHistorial && historial.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Sin cierres registrados</p>
          )}
          {historial.map((c, i) => {
            const desglose = c.detalle?.desglose;
            const propinas = c.detalle?.propinas;
            const totalPropinas = Object.values(propinas || {}).reduce((total, valor) => total + Number(valor || 0), 0);
            const tieneDesglose = desglose && Object.values(desglose).some((v) => Number(v) > 0);
            const expandido = cierreExpandido === c.id;
            return (
              <motion.div
                key={c.id}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3"
              >
                <button
                  type="button"
                  onClick={() => tieneDesglose && setCierreExpandido(expandido ? null : c.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white font-semibold text-sm">
                      {c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                    <span className={`text-xs font-bold ${Math.abs(c.diferencia) < 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {c.diferencia >= 0 ? '+' : ''}{c.diferencia.toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-slate-500 text-xs">
                      Ventas: ${c.ventas_total.toLocaleString('es-CO')} · Propinas: ${totalPropinas.toLocaleString('es-CO')} · Contado: ${c.monto_cierre.toLocaleString('es-CO')}
                    </p>
                    {tieneDesglose && (
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-600 shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </button>

                {expandido && desglose && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-1">
                    {(Object.keys(DESGLOSE_VACIO) as (keyof Desglose)[])
                      .filter((m) => Number(desglose[m]) > 0)
                      .map((m) => (
                        <div key={m} className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">{METODOS_LABEL[m]}</span>
                          <span className="text-white font-semibold">${Number(desglose[m]).toLocaleString('es-CO')}</span>
                        </div>
                      ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
