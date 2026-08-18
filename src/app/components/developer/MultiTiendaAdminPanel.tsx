/**
 * CODEC POS v2.0 — Panel Desarrollador > Multi-Tienda
 * Vincula varias instalaciones/licencias (cliente_id) independientes bajo un
 * mismo dueño real, para que ese dueño vea (solo lectura) las métricas de
 * todas sus tiendas desde un único login en la PWA. Ver migración
 * 0045_multi_tienda_acceso_lectura.sql y multiTiendaAdminService.ts para el
 * diseño de seguridad completo (solo lectura, aditivo, nunca escritura
 * cruzada entre tiendas).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Store, Plus, Trash2, RefreshCw, ArrowRight, Info } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { listarClientesAdmin, type ClienteAdmin } from '../../lib/supabase/clientesAdminService';
import {
  listarVinculosMultiTienda,
  crearVinculoMultiTienda,
  eliminarVinculoMultiTienda,
  type VinculoMultiTienda,
} from '../../lib/supabase/multiTiendaAdminService';

export function MultiTiendaAdminPanel() {
  const { darkMode } = usePOS();
  const [clientes, setClientes] = useState<ClienteAdmin[]>([]);
  const [vinculos, setVinculos] = useState<VinculoMultiTienda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [propietarioSel, setPropietarioSel] = useState('');
  const [tiendaSel, setTiendaSel] = useState('');
  const [creando, setCreando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const [c, v] = await Promise.all([listarClientesAdmin(), listarVinculosMultiTienda()]);
      setClientes(c);
      setVinculos(v);
    } catch (e: any) {
      toast.error('No se pudo cargar', { description: e?.message });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const vinculosPorPropietario = useMemo(() => {
    const mapa = new Map<string, VinculoMultiTienda[]>();
    for (const v of vinculos) {
      if (!mapa.has(v.clienteIdPropietario)) mapa.set(v.clienteIdPropietario, []);
      mapa.get(v.clienteIdPropietario)!.push(v);
    }
    return mapa;
  }, [vinculos]);

  const handleVincular = async () => {
    if (!propietarioSel || !tiendaSel) { toast.error('Elige negocio dueño y tienda a vincular'); return; }
    if (propietarioSel === tiendaSel) { toast.error('No puedes vincular un negocio consigo mismo'); return; }
    setCreando(true);
    try {
      await crearVinculoMultiTienda(propietarioSel, tiendaSel);
      toast.success('Tienda vinculada');
      setTiendaSel('');
      await cargar();
    } catch (e: any) {
      toast.error('No se pudo vincular', { description: e?.message });
    } finally {
      setCreando(false);
    }
  };

  const handleEliminar = async (id: string) => {
    setEliminandoId(id);
    try {
      await eliminarVinculoMultiTienda(id);
      toast.success('Vínculo eliminado');
      await cargar();
    } catch (e: any) {
      toast.error('No se pudo eliminar', { description: e?.message });
    } finally {
      setEliminandoId(null);
    }
  };

  const cardCls = darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white border border-gray-200';
  const selectCls = `h-11 px-3 rounded-xl border text-sm w-full ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cardCls}>
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Vincular tiendas (multi-negocio)</h3>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Un dueño con varias instalaciones (ej. 6 piñaterías, cada una su propia licencia) podrá
                  elegir cuál tienda ver desde su celular, con un solo login. Es de <b>solo lectura</b> —
                  nunca da permiso para operar o modificar la tienda vinculada.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Negocio dueño (quien va a ver)</label>
                <select value={propietarioSel} onChange={(e) => setPropietarioSel(e.target.value)} className={selectCls}>
                  <option value="">Selecciona…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombreNegocio}</option>)}
                </select>
              </div>
              <ArrowRight className={`w-5 h-5 shrink-0 mb-3 hidden sm:block ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
              <div className="flex-1">
                <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Tienda a vincular (la que va a poder ver)</label>
                <select value={tiendaSel} onChange={(e) => setTiendaSel(e.target.value)} className={selectCls}>
                  <option value="">Selecciona…</option>
                  {clientes.filter((c) => c.id !== propietarioSel).map((c) => <option key={c.id} value={c.id}>{c.nombreNegocio}</option>)}
                </select>
              </div>
              <Button onClick={handleVincular} disabled={creando || !propietarioSel || !tiendaSel} className="h-11 shrink-0">
                {creando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Vincular
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className={cardCls}>
          <CardContent className="p-5">
            <h3 className={`font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Vínculos activos</h3>

            {cargando ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <RefreshCw className={`w-4 h-4 animate-spin ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Cargando…</span>
              </div>
            ) : vinculosPorPropietario.size === 0 ? (
              <div className={`flex items-center gap-2 py-6 justify-center text-sm ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                <Info className="w-4 h-4" />
                Todavía no hay ninguna tienda vinculada.
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(vinculosPorPropietario.entries()).map(([propietarioId, links]) => (
                  <div key={propietarioId} className={`rounded-xl border p-3 ${darkMode ? 'border-white/10 bg-white/[0.02]' : 'border-gray-200 bg-gray-50'}`}>
                    <p className={`text-sm font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{links[0].nombrePropietario}</p>
                    <div className="space-y-1.5">
                      {links.map((v) => (
                        <div key={v.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${darkMode ? 'bg-white/5' : 'bg-white'}`}>
                          <span className={darkMode ? 'text-slate-300' : 'text-gray-700'}>{v.nombreTienda}</span>
                          <button
                            onClick={() => handleEliminar(v.id)}
                            disabled={eliminandoId === v.id}
                            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-500/20 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}
                          >
                            {eliminandoId === v.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
