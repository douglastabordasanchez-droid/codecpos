/**
 * Proveedores — versión móvil (solo lectura).
 *
 * Datos publicados desde Electron (Configuración → Módulos en la App Web →
 * «Publicar datos ahora»). Sin historial de compras/pagos todavía — es
 * consulta rápida de contacto y saldo, para cuando el dueño está afuera y
 * necesita el teléfono del proveedor o cuánto le debe, sin llamar a la caja.
 */
import { useEffect, useState } from 'react';
import { Truck, Phone, Mail, Star, Loader2, Ban, Search } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ProveedorFila {
  id: string;
  nombre: string;
  nit: string | null;
  contacto_principal: string | null;
  telefono: string | null;
  email: string | null;
  categoria: string | null;
  saldo_pendiente: number;
  total_comprado: number;
  calificacion: number;
  activo: boolean;
  bloqueado: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export default function ProveedoresPage() {
  const { empleado } = usePwaAuth();
  const [proveedores, setProveedores] = useState<ProveedorFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }

    const cargar = () => {
      client
        .from('proveedores')
        .select('id, nombre, nit, contacto_principal, telefono, email, categoria, saldo_pendiente, total_comprado, calificacion, activo, bloqueado')
        .eq('cliente_id', empleado.cliente_id)
        .order('nombre')
        .then(({ data }) => {
          setProveedores((data as ProveedorFila[]) || []);
          setCargando(false);
        });
    };

    cargar();

    const canal = client
      .channel(`proveedores-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .subscribe();

    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id]);

  const filtrados = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const saldoTotal = proveedores.reduce((a, p) => a + Number(p.saldo_pendiente || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Proveedores</h1>
        <p className="text-slate-400 text-sm">{proveedores.length} proveedores · Saldo total {money(saldoTotal)}</p>
      </div>

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor"
          className="h-11 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
        />
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Truck className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Sin proveedores registrados</p>
        </div>
      ) : (
        <div className="px-5 space-y-2.5">
          {filtrados.map((p) => (
            <div key={p.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">{p.nombre}</p>
                  {p.categoria && <p className="text-slate-500 text-xs">{p.categoria}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.bloqueado ? (
                    <Ban className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < p.calificacion ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} />
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                {p.contacto_principal && <span>{p.contacto_principal}</span>}
                {p.telefono && (
                  <a href={`tel:${p.telefono}`} className="flex items-center gap-1 text-sky-400">
                    <Phone className="w-3 h-3" /> {p.telefono}
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-sky-400">
                    <Mail className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase font-semibold">Saldo pendiente</p>
                  <p className={`font-black text-sm ${p.saldo_pendiente > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{money(p.saldo_pendiente)}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-[10px] uppercase font-semibold">Total comprado</p>
                  <p className="text-white font-black text-sm">{money(p.total_comprado)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
