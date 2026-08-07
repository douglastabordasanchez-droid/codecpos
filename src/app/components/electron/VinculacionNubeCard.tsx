/**
 * Vincula esta instalación de Electron con un negocio en Supabase, requisito
 * para que el motor de sincronización (syncService) pueda escribir bajo RLS.
 * Usa las credenciales de licencia YA existentes (usuarios_clientes) como
 * prueba de propiedad del negocio — ver src/app/lib/supabase/tenantLink.ts.
 */
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, Link2, Unlink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';
import {
  ClienteDisponible,
  desvincularNegocio,
  getLinkedClienteId,
  isLinked,
  listarClientesDisponibles,
  vincularNegocio,
} from '../../lib/supabase/tenantLink';

export function VinculacionNubeCard() {
  const { darkMode } = usePOS();
  const [clientes, setClientes] = useState<ClienteDisponible[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [usuarioLicencia, setUsuarioLicencia] = useState('');
  const [passwordLicencia, setPasswordLicencia] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [linked, setLinked] = useState(isLinked());
  const [clienteIdActual, setClienteIdActual] = useState(getLinkedClienteId());

  useEffect(() => {
    listarClientesDisponibles().then(setClientes);
  }, []);

  const nombreNegocioActual = clientes.find((c) => c.id === clienteIdActual)?.nombre_negocio;

  const handleVincular = async () => {
    if (!clienteSeleccionado || !usuarioLicencia || !passwordLicencia) {
      toast.error('Completa negocio, usuario y contraseña de licencia');
      return;
    }
    setVinculando(true);
    try {
      const resultado = await vincularNegocio(clienteSeleccionado, usuarioLicencia, passwordLicencia);
      if (resultado.ok) {
        toast.success('Instalación vinculada correctamente');
        setLinked(true);
        setClienteIdActual(clienteSeleccionado);
        setPasswordLicencia('');
      } else {
        toast.error('No se pudo vincular', { description: resultado.error });
      }
    } catch (error) {
      // 🛡️ vincularNegocio ya no debería lanzar (tiene su propio try/catch),
      // pero esto es una segunda red de seguridad: sin ella, cualquier
      // excepción inesperada dejaba el botón pegado en "Vinculando..." para
      // siempre, sin ningún mensaje visible.
      toast.error('No se pudo vincular', { description: error instanceof Error ? error.message : 'Error inesperado' });
    } finally {
      setVinculando(false);
    }
  };

  const handleDesvincular = () => {
    desvincularNegocio();
    setLinked(false);
    setClienteIdActual(null);
    toast.success('Instalación desvinculada');
  };

  return (
    <Card className={darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {linked ? <Cloud className="w-5 h-5 text-emerald-500" /> : <CloudOff className="w-5 h-5 text-slate-500" />}
          Vinculación con Supabase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {linked ? (
          <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${darkMode ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-300'}`}>
            <div>
              <p className={`text-sm font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                Vinculada a {nombreNegocioActual || 'este negocio'}
              </p>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Los productos y ventas de esta caja se sincronizan con la nube.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDesvincular}>
              <Unlink className="w-4 h-4 mr-2" />
              Desvincular
            </Button>
          </div>
        ) : (
          <>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              Vincula esta caja con tu negocio usando el mismo usuario y contraseña de licencia que ya usas.
            </p>

            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Negocio</Label>
              <select
                value={clienteSeleccionado}
                onChange={(e) => setClienteSeleccionado(e.target.value)}
                className={`w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              >
                <option value="">Selecciona tu negocio...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre_negocio}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Usuario de licencia</Label>
              <Input value={usuarioLicencia} onChange={(e) => setUsuarioLicencia(e.target.value)} placeholder="Usuario de licencia" />
            </div>

            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Contraseña de licencia</Label>
              <Input type="password" value={passwordLicencia} onChange={(e) => setPasswordLicencia(e.target.value)} placeholder="Contraseña de licencia" />
            </div>

            <Button onClick={handleVincular} disabled={vinculando} className="w-full">
              {vinculando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {vinculando ? 'Vinculando...' : 'Vincular esta instalación'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
