import { useEffect, useState } from 'react';
import { CreditCard, Search, Loader2, X, ChevronRight } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { toast } from 'sonner';
import {
  listarCuentasCarteraMovil, registrarAbonoCarteraMovil, CuentaCarteraMovil,
} from '../lib/carteraMovilService';

const METODOS_ABONO = [
  { valor: 'efectivo', label: 'Efectivo' },
  { valor: 'nequi', label: 'Nequi' },
  { valor: 'daviplata', label: 'Daviplata' },
  { valor: 'bre_b', label: 'Bre-B' },
  { valor: 'transferencia', label: 'Transferencia' },
];

export default function CarteraPage() {
  const { empleado } = usePwaAuth();
  const [cuentas, setCuentas] = useState<CuentaCarteraMovil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<CuentaCarteraMovil | null>(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [metodoAbono, setMetodoAbono] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    if (!empleado) return;
    setCargando(true);
    const data = await listarCuentasCarteraMovil(empleado.cliente_id, true);
    setCuentas(data);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const filtradas = cuentas.filter((c) =>
    c.clienteCarteraNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.clienteCarteraDocumento || '').includes(busqueda) ||
    (c.clienteCarteraTelefono || '').includes(busqueda)
  );

  const totalPorCobrar = cuentas.reduce((acc, c) => acc + c.saldo, 0);

  const handleAbonar = async () => {
    if (!seleccionada || !empleado) return;
    const monto = Number(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (monto > seleccionada.saldo) {
      toast.error('El monto supera el saldo pendiente');
      return;
    }
    setEnviando(true);
    const resultado = await registrarAbonoCarteraMovil(
      seleccionada.id, monto, metodoAbono,
      empleado.nombre_completo || 'Cajero'
    );
    setEnviando(false);
    if (!resultado.ok) {
      toast.error('No se pudo registrar el abono', { description: resultado.error });
      return;
    }
    toast.success(`Abono de $${monto.toLocaleString('es-CO')} registrado`);
    setSeleccionada(null);
    setMontoAbono('');
    setMetodoAbono('efectivo');
    cargar();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-400" /> Cartera
        </h1>
        <p className="text-slate-400 text-sm">Clientes con saldo pendiente</p>
      </div>

      <div className="px-5 mb-4 bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Por cobrar</span>
        <span className="text-emerald-400 font-black text-lg">${totalPorCobrar.toLocaleString('es-CO')}</span>
      </div>

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente, teléfono o documento..."
          className="h-11 pl-9 bg-slate-900/70 border-slate-800 text-white"
        />
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando...</p>}
        {!cargando && filtradas.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin cuentas pendientes</p>
        )}
        {filtradas.map((c) => (
          <button
            key={c.id}
            onClick={() => setSeleccionada(c)}
            className="w-full bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center justify-between text-left"
          >
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{c.clienteCarteraNombre}</p>
              <p className="text-slate-500 text-xs">
                {c.estado === 'vencida' ? 'Vencida' : `Vence ${new Date(c.fechaVencimiento).toLocaleDateString('es-CO')}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`font-bold text-sm ${c.estado === 'vencida' ? 'text-red-400' : 'text-amber-400'}`}>
                ${c.saldo.toLocaleString('es-CO')}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </button>
        ))}
      </div>

      {seleccionada && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg truncate pr-4">{seleccionada.clienteCarteraNombre}</h2>
              <button onClick={() => setSeleccionada(null)} className="text-slate-400 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 space-y-4 pb-8">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <p className="text-slate-500 text-xs">Total</p>
                  <p className="text-white font-bold">${seleccionada.total.toLocaleString('es-CO')}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <p className="text-slate-500 text-xs">Saldo</p>
                  <p className="text-amber-400 font-bold">${seleccionada.saldo.toLocaleString('es-CO')}</p>
                </div>
              </div>

              {seleccionada.abonos.length > 0 && (
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Abonos</p>
                  <div className="space-y-1.5">
                    {seleccionada.abonos.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-sm bg-slate-900/60 rounded-lg px-3 py-2">
                        <span className="text-slate-400">{new Date(a.fecha).toLocaleDateString('es-CO')} · {a.metodoPago}</span>
                        <span className="text-white font-semibold">${a.monto.toLocaleString('es-CO')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 border-t border-slate-800 pt-4">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Registrar abono</p>
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Monto</Label>
                  <Input
                    type="number" inputMode="numeric" min={0}
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value)}
                    className="h-12 bg-slate-900 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Método</Label>
                  <select
                    value={metodoAbono}
                    onChange={(e) => setMetodoAbono(e.target.value)}
                    className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white"
                  >
                    {METODOS_ABONO.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
                  </select>
                </div>
                <Button onClick={handleAbonar} disabled={enviando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
                  {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {enviando ? 'Registrando...' : 'Registrar abono'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
