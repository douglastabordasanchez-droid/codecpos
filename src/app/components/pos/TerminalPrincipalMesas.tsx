/**
 * Aviso de terminal principal en el salón de Alimentos y Bebidas y diálogo
 * para marcar este equipo como principal (migración 0147).
 */
import { useState } from 'react';
import { MonitorSmartphone, Crown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { nombreSugeridoEsteEquipo, type RolMesas, type TerminalPrincipal } from '../../lib/supabase/terminalPrincipalService';

interface Props {
  rol: RolMesas;
  principal: TerminalPrincipal | null;
  mesasEsteEquipo: number;
  puedeAdministrar: boolean;
  oscuro: boolean;
  onMarcar: (nombre: string) => Promise<void>;
}

export function TerminalPrincipalMesas({ rol, principal, mesasEsteEquipo, puedeAdministrar, oscuro, onMarcar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(() => nombreSugeridoEsteEquipo());
  const [guardando, setGuardando] = useState(false);

  const estilos = {
    principal: oscuro ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
    copia: oscuro ? 'border-blue-500/40 bg-blue-900/20 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800',
    sin_principal: oscuro ? 'border-amber-500/40 bg-amber-900/20 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900',
  }[rol];

  const texto = {
    principal: 'Esta es la terminal principal. Sus mesas son las que ven todos los equipos y celulares.',
    copia: `Las mesas vienen de la terminal principal${principal?.nombre ? `: ${principal.nombre}` : ''}. Se crean y se borran allá.`,
    sin_principal: 'No hay terminal principal. Si tienes varias cajas, marca una para que todas vean las mismas mesas en el mismo orden.',
  }[rol];

  const confirmar = async () => {
    setGuardando(true);
    try { await onMarcar(nombre); setAbierto(false); } catch { /* el aviso ya se mostró */ } finally { setGuardando(false); }
  };

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${estilos}`}>
        {rol === 'principal' ? <Crown className="w-5 h-5 shrink-0" /> : <MonitorSmartphone className="w-5 h-5 shrink-0" />}
        <p className="text-sm font-semibold flex-1 min-w-[200px]">{texto}</p>
        {rol !== 'principal' && puedeAdministrar && (
          <Button variant="outline" className="h-10 rounded-xl text-sm font-semibold" onClick={() => setAbierto(true)}>
            Hacer esta la principal
          </Button>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={(v) => !guardando && setAbierto(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hacer esta la terminal principal</DialogTitle>
            <DialogDescription>
              Las {mesasEsteEquipo} mesas de este equipo pasan a ser las de todo el negocio: las demás cajas, tablets y
              celulares las verán igual y en el mismo orden. Las mesas de la nube que este equipo no tenga se quitan,
              menos las que tengan una cuenta abierta.
              {rol === 'copia' && principal?.nombre ? ` Hoy la principal es ${principal.nombre}; dejará de serlo.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Nombre de esta terminal</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Caja principal" className="h-11" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={guardando || !nombre.trim()} onClick={() => void confirmar()}>
              {guardando ? 'Guardando…' : 'Sí, hacerla principal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
