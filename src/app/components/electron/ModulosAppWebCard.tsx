/**
 * Panel de control de la app web/celular, desde Electron.
 *
 * El dueño enciende aquí los módulos que quiere ver en su teléfono (y en el de
 * su equipo). Escribe en `clientes_pos.modulos_web` vía el RPC
 * `actualizar_modulos_web`; la PWA lee esa lista y la cruza con la licencia y
 * con los permisos individuales de cada empleado — ver useModulosActivos.
 *
 * Solo se pueden encender módulos que (a) el negocio tiene licenciados y
 * (b) ya tienen pantalla real en la PWA. Los que aún no se han portado se
 * listan igual, apagados y marcados «Próximamente», para que el dueño sepa
 * qué falta en vez de encontrarse un interruptor que no hace nada.
 */
import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Loader2, Save, RefreshCw, CloudOff, Wrench, Coffee } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { usePOS } from '../../contexts/POSContext';
import { MODULOS_CATALOGO, ModuloPOS } from '../../lib/permissions';
import { isLinked } from '../../lib/supabase/tenantLink';
import {
  MODULOS_DISPONIBLES_EN_WEB,
  estaDisponibleEnWeb,
  guardarModulosWeb,
  obtenerEstadoModulosWeb,
} from '../../lib/supabase/modulosWebService';
import { sincronizarPanaderiaDesdeLocal } from '../../lib/supabase/panaderiaSyncService';
import { pushOrdenesTaller } from '../../lib/supabase/tallerSyncService';
import { tallerService } from '../../services/tallerService';

export function ModulosAppWebCard() {
  const { darkMode } = usePOS();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenciados, setLicenciados] = useState<ModuloPOS[]>([]);
  const [seleccion, setSeleccion] = useState<Set<ModuloPOS>>(new Set());
  const [sucio, setSucio] = useState(false);

  const vinculado = isLinked();

  const cargar = useCallback(async () => {
    if (!vinculado) { setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      const estado = await obtenerEstadoModulosWeb();
      if (!estado) {
        setError('No se encontró el negocio vinculado en la nube.');
        return;
      }
      setLicenciados(estado.licenciados);
      // null = todavía no eligió → se asume todo lo licenciado que ya existe
      // en la PWA, que es el comportamiento que la app tenía hasta ahora.
      const base = estado.web ?? estado.licenciados.filter(estaDisponibleEnWeb);
      setSeleccion(new Set(base));
      setSucio(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error consultando los módulos');
    } finally {
      setCargando(false);
    }
  }, [vinculado]);

  useEffect(() => { cargar(); }, [cargar]);

  const toggle = (modulo: ModuloPOS) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo); else next.add(modulo);
      return next;
    });
    setSucio(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarModulosWeb([...seleccion]);
      setSucio(false);
      toast.success('Módulos de la app actualizados', {
        description: 'Los celulares del equipo lo verán en menos de un minuto.',
      });
    } catch (e) {
      toast.error('No se pudieron guardar los módulos', {
        description: e instanceof Error ? e.message : 'Error inesperado',
      });
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Encender el interruptor hace visible el módulo, pero el celular necesita
   * además los DATOS: taller vive en IndexedDB y panadería en localStorage,
   * ambos solo en este equipo. Esto los publica en la nube.
   */
  const sincronizarDatos = async () => {
    setSincronizando(true);
    try {
      const resumen: string[] = [];

      if (seleccion.has(ModuloPOS.PANADERIA_ONCES)) {
        const r = await sincronizarPanaderiaDesdeLocal();
        resumen.push(`Panadería: ${r.categorias} categorías, ${r.productos} productos, ${r.mesas} mesas`);
      }

      if (seleccion.has(ModuloPOS.TALLER_REPARACIONES)) {
        await tallerService.init();
        const ordenes = await tallerService.obtenerTodasOrdenes();
        const n = await pushOrdenesTaller(ordenes);
        resumen.push(`Taller: ${n} órdenes`);
      }

      if (resumen.length === 0) {
        toast.info('Nada que sincronizar', {
          description: 'Activa Panadería o Taller para publicar sus datos en la nube.',
        });
      } else {
        toast.success('Datos publicados en la nube', { description: resumen.join(' · ') });
      }
    } catch (e) {
      toast.error('Error sincronizando', {
        description: e instanceof Error ? e.message : 'Error inesperado',
      });
    } finally {
      setSincronizando(false);
    }
  };

  const cardCls = darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200';
  const titleCls = darkMode ? 'text-white' : 'text-gray-900';
  const mutedCls = darkMode ? 'text-slate-400' : 'text-gray-600';

  if (!vinculado) {
    return (
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${titleCls}`}>
            <Smartphone className="w-5 h-5 text-slate-500" />
            Módulos en la App Web / Celular
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`p-4 rounded-xl border-2 border-dashed flex items-start gap-3 ${
            darkMode ? 'border-slate-600 bg-slate-900/40' : 'border-gray-300 bg-gray-50'
          }`}>
            <CloudOff className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className={`text-sm ${mutedCls}`}>
              Vincula primero esta instalación con tu negocio (tarjeta de al lado). Sin vinculación
              no hay a qué app móvil enviarle los módulos.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Se listan los módulos que el negocio tiene licenciados, con los que ya
  // existen en la PWA primero.
  const listado = MODULOS_CATALOGO
    .filter((m) => m.categoria !== 'desarrollador' && licenciados.includes(m.id))
    .sort((a, b) => Number(estaDisponibleEnWeb(b.id)) - Number(estaDisponibleEnWeb(a.id)));

  const activosCount = [...seleccion].filter(estaDisponibleEnWeb).length;
  const necesitaDatos = seleccion.has(ModuloPOS.PANADERIA_ONCES) || seleccion.has(ModuloPOS.TALLER_REPARACIONES);

  return (
    <Card className={cardCls}>
      <CardHeader>
        <CardTitle className={`flex items-center justify-between gap-2 ${titleCls}`}>
          <span className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-violet-500" />
            Módulos en la App Web / Celular
          </span>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-100 text-violet-700'
          }`}>
            {activosCount} activo{activosCount === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className={`text-sm ${mutedCls}`}>
          Elige qué módulos aparecen en la app del celular. Cada empleado verá, de estos, solo los
          que su permiso individual le conceda.
        </p>

        {cargando ? (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
            <span className={`text-sm ${mutedCls}`}>Consultando tu licencia…</span>
          </div>
        ) : error ? (
          <div className={`p-3 rounded-xl text-sm ${darkMode ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
            {error}
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={cargar}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Reintentar
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {listado.map((modulo) => {
                const disponible = estaDisponibleEnWeb(modulo.id);
                const activo = seleccion.has(modulo.id);
                return (
                  <div
                    key={modulo.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                      !disponible
                        ? darkMode ? 'border-slate-700 bg-slate-900/40 opacity-60' : 'border-gray-200 bg-gray-50 opacity-70'
                        : activo
                        ? darkMode ? 'border-violet-500/50 bg-violet-500/10' : 'border-violet-200 bg-violet-50'
                        : darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="text-lg shrink-0">{modulo.icono}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${titleCls}`}>{modulo.nombre}</p>
                      <p className={`text-xs truncate ${mutedCls}`}>
                        {disponible ? modulo.descripcion : 'Aún no disponible en la app móvil'}
                      </p>
                    </div>
                    {disponible ? (
                      <Switch checked={activo} onCheckedChange={() => toggle(modulo.id)} />
                    ) : (
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                        darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-500'
                      }`}>
                        Próximamente
                      </span>
                    )}
                  </div>
                );
              })}

              {listado.length === 0 && (
                <p className={`text-sm text-center py-6 ${mutedCls}`}>
                  Tu licencia todavía no tiene módulos asignados.
                </p>
              )}
            </div>

            <Button onClick={guardar} disabled={guardando || !sucio} className="w-full">
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {guardando ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Sin cambios pendientes'}
            </Button>

            {necesitaDatos && (
              <div className={`p-3 rounded-xl border ${
                darkMode ? 'border-cyan-700/40 bg-cyan-900/15' : 'border-cyan-200 bg-cyan-50'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {seleccion.has(ModuloPOS.TALLER_REPARACIONES) && <Wrench className="w-3.5 h-3.5 text-cyan-500" />}
                  {seleccion.has(ModuloPOS.PANADERIA_ONCES) && <Coffee className="w-3.5 h-3.5 text-amber-500" />}
                  <p className={`text-xs font-bold ${darkMode ? 'text-cyan-300' : 'text-cyan-800'}`}>
                    Publicar los datos de este equipo
                  </p>
                </div>
                <p className={`text-xs mb-2.5 ${mutedCls}`}>
                  Taller y Panadería guardan su información solo en este computador. Súbela una vez
                  para que el celular tenga qué mostrar; de ahí en adelante se mantiene sola.
                </p>
                <Button variant="outline" size="sm" className="w-full" onClick={sincronizarDatos} disabled={sincronizando}>
                  {sincronizando ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                  {sincronizando ? 'Publicando…' : 'Publicar datos ahora'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
