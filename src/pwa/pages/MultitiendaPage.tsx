/**
 * Multi-Tienda — versión móvil (directorio, solo lectura).
 *
 * Muestra el directorio de sucursales (nombre, dirección, teléfono). El
 * stock por tienda y las transferencias entre sucursales siguen siendo
 * exclusivos de Electron — ver migración 0030 sobre por qué no se tocó el
 * modelo de `productos` compartido para esta primera versión.
 */
import { useEffect, useState } from 'react';
import { Store, Phone, MapPin, Loader2, Crown } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface TiendaFila {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  emoji: string | null;
  color: string | null;
  activo: boolean;
  es_principal: boolean;
}

export default function MultitiendaPage() {
  const { empleado } = usePwaAuth();
  const [tiendas, setTiendas] = useState<TiendaFila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }

    const cargar = () => {
      client
        .from('tiendas')
        .select('id, nombre, direccion, telefono, emoji, color, activo, es_principal')
        .eq('cliente_id', empleado.cliente_id)
        .eq('activo', true)
        .order('es_principal', { ascending: false })
        .then(({ data }) => {
          setTiendas((data as TiendaFila[]) || []);
          setCargando(false);
        });
    };

    cargar();

    const canal = client
      .channel(`tiendas-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiendas', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .subscribe();

    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Multi-Tienda</h1>
        <p className="text-slate-400 text-sm">{tiendas.length} sucursales</p>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : tiendas.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Store className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Sin sucursales registradas</p>
        </div>
      ) : (
        <div className="px-5 space-y-2.5">
          {tiendas.map((t) => (
            <div key={t.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${t.color || '#f59e0b'}33` }}
                  >
                    {t.emoji || '🏪'}
                  </div>
                  <p className="text-white font-bold text-sm truncate">{t.nombre}</p>
                </div>
                {t.es_principal && (
                  <span className="shrink-0 bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Principal
                  </span>
                )}
              </div>
              {t.direccion && (
                <p className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {t.direccion}
                </p>
              )}
              {t.telefono && (
                <a href={`tel:${t.telefono}`} className="text-sky-400 text-xs flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {t.telefono}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
