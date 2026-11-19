/**
 * Borrar las ventas guardadas EN ESTE EQUIPO (caja Electron o terminal Android).
 *
 * Para negocios que hicieron ventas de prueba antes de empezar a operar de
 * verdad (Tierra Colombiana, 2026-11-18): las ventas de la nube se limpian
 * aparte; esto deja en cero la copia local para que Ventas, Dashboard y el
 * cierre del equipo no las sigan mostrando.
 *
 * No toca la nube, ni productos, mesas, usuarios o configuración. Antes de
 * borrar descarga un respaldo JSON con todo lo que se va a eliminar.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { usePOS } from '../../contexts/POSContext';
import { dbManager, STORES } from '../../lib/indexedDB';
import { historicoService } from '../../lib/historicoService';

const CLAVES_LOCALES = ['pos-ventas-pendientes', 'pos-ventas-dia', 'pos-ventas', 'codecpos_devoluciones'];
const PALABRA = 'BORRAR';

function leerLista(clave: string): unknown[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function BorrarVentasEquipoCard() {
  const { darkMode } = usePOS();
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [sinSubir, setSinSubir] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);

  const contar = async () => {
    try {
      const ventas = await dbManager.getAllVentas();
      setCantidad(ventas.length);
      setSinSubir(ventas.filter((v: any) => !v.supabaseId).length + leerLista('pos-ventas-pendientes').length);
    } catch {
      setCantidad(0);
    }
  };

  useEffect(() => { void contar(); }, []);

  const borrar = async () => {
    if (texto.trim().toUpperCase() !== PALABRA) return;
    setBorrando(true);
    try {
      // 1) Respaldo de todo lo que se va a borrar, por si acaso.
      const ventas = await dbManager.getAllVentas();
      const respaldo = {
        fecha: new Date().toISOString(),
        ventas,
        ...Object.fromEntries(CLAVES_LOCALES.map((c) => [c, leerLista(c)])),
      };
      try {
        const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo-ventas-equipo-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch { /* sin descargas (terminal): se sigue igual */ }

      // 2) Borrar solo ventas y devoluciones de este equipo.
      await dbManager.clearStore(STORES.VENTAS);
      for (const clave of CLAVES_LOCALES) {
        try { localStorage.removeItem(clave); } catch { /* ignorar */ }
      }
      const historicas = await historicoService.limpiarVentasHistorico();
      try { await dbManager.addLog('borrar_ventas_equipo', `Borradas ${ventas.length} ventas locales y ${historicas} del histórico`); } catch { /* log no crítico */ }

      toast.success('Ventas de este equipo en cero', {
        description: `Se borraron ${ventas.length} venta(s). La nube no se tocó. La pantalla se recarga.`,
      });
      setAbierto(false);
      setTexto('');
      // Recargar para que Ventas, Dashboard y Cierre dejen de mostrarlas.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast.error('No se pudieron borrar las ventas', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBorrando(false);
    }
  };

  const texto1 = darkMode ? 'text-slate-300' : 'text-gray-700';
  const texto2 = darkMode ? 'text-slate-400' : 'text-gray-500';

  return (
    <Card className={darkMode ? 'bg-slate-800 border border-red-900/60' : 'bg-white border border-red-200'}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <Trash2 className="w-5 h-5 text-red-500" />
          Borrar las ventas de este equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-sm ${texto1}`}>
          Úsalo cuando las ventas guardadas aquí fueron de prueba y el negocio empieza a operar de verdad.
          Deja en cero Ventas, Dashboard y Cierre de este equipo.
        </p>
        <p className={`text-xs ${texto2}`}>
          No borra la nube, ni productos, mesas, usuarios o configuración. Antes de borrar se descarga un respaldo.
        </p>
        <p className={`text-sm font-semibold ${texto1}`}>
          Ventas guardadas en este equipo: {cantidad === null ? '…' : cantidad}
        </p>
        {sinSubir > 0 && (
          <p className="text-xs font-semibold text-amber-500">
            Ojo: {sinSubir} de esas ventas todavía no han subido a la nube. Si las borras se pierden del todo.
          </p>
        )}

        {!abierto ? (
          <Button
            variant="outline"
            onClick={() => { setAbierto(true); void contar(); }}
            disabled={cantidad === 0}
            className="w-full border-red-400 text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Borrar las ventas de este equipo
          </Button>
        ) : (
          <div className="space-y-2">
            <p className={`text-sm ${texto1}`}>
              Para confirmar escribe <span className="font-black text-red-500">{PALABRA}</span>:
            </p>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={PALABRA} autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setAbierto(false); setTexto(''); }} disabled={borrando}>
                Cancelar
              </Button>
              <Button
                onClick={() => void borrar()}
                disabled={borrando || texto.trim().toUpperCase() !== PALABRA}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {borrando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Borrar ventas
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
