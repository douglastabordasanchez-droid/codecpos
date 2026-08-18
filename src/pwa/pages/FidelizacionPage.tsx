/**
 * Fidelización — versión móvil (consulta).
 *
 * Busca un cliente y muestra sus puntos/nivel — útil para resolver dudas
 * ("¿cuántos puntos tengo?") sin estar en la caja. Acumular/redimir puntos
 * sigue siendo exclusivo del cobro en Electron (necesita afectar la venta
 * real en el momento) — ver fidelizacionService.ts.
 */
import { useState } from 'react';
import { Search, Award, Loader2, UserCircle2 } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ClienteFila {
  nombre: string;
  documento: string | null;
  telefono: string | null;
  puntos: number;
  puntos_acumulados: number;
  nivel_fidelidad: string;
  total_compras: number;
  numero_compras: number;
}

const NIVEL_INFO: Record<string, { label: string; color: string }> = {
  bronce: { label: 'Bronce', color: 'from-amber-700 to-amber-900' },
  plata: { label: 'Plata', color: 'from-slate-400 to-slate-600' },
  oro: { label: 'Oro', color: 'from-amber-400 to-yellow-600' },
  platino: { label: 'Platino', color: 'from-cyan-300 to-sky-500' },
};

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export default function FidelizacionPage() {
  const { empleado } = usePwaAuth();
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ClienteFila[]>([]);
  const [buscado, setBuscado] = useState(false);

  const buscar = async () => {
    if (!empleado || !busqueda.trim()) return;
    setBuscando(true);
    setBuscado(true);
    const client = getSupabaseClient()!;
    const termino = busqueda.trim();
    const { data } = await client
      .from('clientes_fidelizacion')
      .select('nombre, documento, telefono, puntos, puntos_acumulados, nivel_fidelidad, total_compras, numero_compras')
      .eq('cliente_id', empleado.cliente_id)
      .or(`documento.eq.${termino},telefono.eq.${termino},nombre.ilike.%${termino}%`)
      .limit(10);
    setResultados((data as ClienteFila[]) || []);
    setBuscando(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Fidelización</h1>
        <p className="text-slate-400 text-sm">Consulta puntos de un cliente</p>
      </div>

      <div className="px-5 flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Nombre, documento o teléfono"
            className="h-11 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
          />
        </div>
        <Button onClick={buscar} disabled={buscando || !busqueda.trim()} className="h-11 bg-gradient-to-r from-amber-500 to-orange-600">
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
        </Button>
      </div>

      <div className="px-5 space-y-3">
        {buscado && !buscando && resultados.length === 0 && (
          <div className="text-center py-10">
            <UserCircle2 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Sin resultados</p>
          </div>
        )}

        {resultados.map((c, i) => {
          const nivel = NIVEL_INFO[c.nivel_fidelidad] || NIVEL_INFO.bronce;
          return (
            <div key={i} className={`bg-gradient-to-br ${nivel.color} rounded-2xl p-5 shadow-lg`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-white font-bold">{c.nombre}</p>
                  <p className="text-white/70 text-xs">{c.documento || c.telefono || ''}</p>
                </div>
                <span className="bg-white/20 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Award className="w-3 h-3" /> {nivel.label}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/70 text-xs">Puntos disponibles</p>
                  <p className="text-white text-3xl font-black">{c.puntos.toLocaleString('es-CO')}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/70 text-xs">Total comprado</p>
                  <p className="text-white font-bold">{money(c.total_compras)}</p>
                  <p className="text-white/60 text-[11px]">{c.numero_compras} compras</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
