/**
 * Promociones — versión móvil (solo lectura).
 *
 * Datos publicados desde Electron (Configuración → Módulos en la App Web →
 * «Publicar datos ahora»). Aplicar promociones automáticamente al cobrar
 * desde el celular queda para una siguiente iteración — por ahora es una
 * vitrina para que el equipo sepa qué está vigente sin tener que preguntar.
 */
import { useEffect, useState } from 'react';
import { Tag, Package2, Loader2, Percent } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface PromocionFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  valor_descuento: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activa: boolean;
}

interface ComboFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_normal: number;
  precio_combo: number;
  activo: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

const TIPO_LABEL: Record<string, string> = {
  porcentaje: 'Descuento %',
  monto_fijo: 'Descuento fijo',
  '2x1': '2x1',
  '3x2': '3x2',
  combo: 'Combo',
  regalo_producto: 'Producto de regalo',
};

function estaVigente(p: { fecha_inicio: string | null; fecha_fin: string | null; activa?: boolean; activo?: boolean }): boolean {
  if (p.activa === false || p.activo === false) return false;
  const ahora = new Date();
  if (p.fecha_inicio && new Date(p.fecha_inicio) > ahora) return false;
  if (p.fecha_fin && new Date(p.fecha_fin) < ahora) return false;
  return true;
}

export default function PromocionesPage() {
  const { empleado } = usePwaAuth();
  const [promociones, setPromociones] = useState<PromocionFila[]>([]);
  const [combos, setCombos] = useState<ComboFila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }

    const cargar = () => {
      Promise.all([
        client.from('promociones').select('id, nombre, descripcion, tipo, valor_descuento, fecha_inicio, fecha_fin, activa')
          .eq('cliente_id', empleado.cliente_id).order('prioridad', { ascending: false }),
        client.from('combos').select('id, nombre, descripcion, precio_normal, precio_combo, activo')
          .eq('cliente_id', empleado.cliente_id),
      ]).then(([{ data: promosData }, { data: combosData }]) => {
        setPromociones((promosData as PromocionFila[]) || []);
        setCombos((combosData as ComboFila[]) || []);
        setCargando(false);
      });
    };

    cargar();

    // 📡 El dueño puede editar promociones/combos desde Electron mientras el
    // empleado tiene esta pantalla abierta — se refresca sola en vez de
    // esperar a que vuelva a entrar.
    const canal = client
      .channel(`promociones-combos-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promociones', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combos', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .subscribe();

    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id]);

  const promosVigentes = promociones.filter(estaVigente);
  const combosVigentes = combos.filter(estaVigente);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Promociones</h1>
        <p className="text-slate-400 text-sm">{promosVigentes.length + combosVigentes.length} activas ahora mismo</p>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : promosVigentes.length === 0 && combosVigentes.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Tag className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No hay promociones vigentes</p>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {promosVigentes.map((p) => (
            <div key={p.id} className="bg-gradient-to-br from-violet-500/15 to-fuchsia-600/10 border border-violet-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-white font-bold text-sm">{p.nombre}</p>
                <span className="text-violet-300 text-[10px] font-bold uppercase bg-violet-500/20 px-2 py-0.5 rounded-full shrink-0">
                  {TIPO_LABEL[p.tipo] || p.tipo}
                </span>
              </div>
              {p.descripcion && <p className="text-slate-400 text-xs mb-2">{p.descripcion}</p>}
              {p.valor_descuento != null && (
                <p className="text-emerald-400 font-black text-lg flex items-center gap-1">
                  <Percent className="w-4 h-4" />
                  {p.tipo === 'porcentaje' ? `${p.valor_descuento}%` : money(p.valor_descuento)}
                </p>
              )}
            </div>
          ))}

          {combosVigentes.map((c) => (
            <div key={c.id} className="bg-gradient-to-br from-amber-500/15 to-orange-600/10 border border-amber-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package2 className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-white font-bold text-sm">{c.nombre}</p>
              </div>
              {c.descripcion && <p className="text-slate-400 text-xs mb-2">{c.descripcion}</p>}
              <div className="flex items-baseline gap-2">
                <p className="text-emerald-400 font-black text-lg">{money(c.precio_combo)}</p>
                {c.precio_normal > c.precio_combo && (
                  <p className="text-slate-500 text-sm line-through">{money(c.precio_normal)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
