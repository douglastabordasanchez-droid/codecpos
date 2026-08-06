import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Store, Save, Loader2, Layers, Crown, Zap } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { MODULOS_CATALOGO } from '../../app/lib/permissions';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';

interface NegocioForm {
  nombre_negocio: string;
  nit: string;
  contacto: string;
  telefono: string;
  email: string;
  plan: string;
}

export default function ConfiguracionPage() {
  const { empleado } = usePwaAuth();
  const { tieneModulo, cargando: cargandoModulos } = useModulosActivos();
  const [form, setForm] = useState<NegocioForm | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const puedeVer = empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  useEffect(() => {
    if (!empleado || !puedeVer) return;
    const client = getSupabaseClient();
    if (!client) {
      setCargando(false);
      return;
    }
    client
      .from('clientes_pos')
      .select('nombre_negocio, nit, contacto, telefono, email, plan')
      .eq('id', empleado.cliente_id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as NegocioForm | null;
        setForm({
          nombre_negocio: row?.nombre_negocio || '',
          nit: row?.nit || '',
          contacto: row?.contacto || '',
          telefono: row?.telefono || '',
          email: row?.email || '',
          plan: row?.plan || 'BASICO',
        });
        setCargando(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id, puedeVer]);

  const handleGuardar = async () => {
    if (!empleado || !form) return;
    setGuardando(true);
    setMensaje(null);
    const client = getSupabaseClient();
    const { error } = await client!
      .from('clientes_pos')
      .update({
        nombre_negocio: form.nombre_negocio,
        nit: form.nit,
        contacto: form.contacto,
        telefono: form.telefono,
        email: form.email,
      })
      .eq('id', empleado.cliente_id);
    setGuardando(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } else {
      setMensaje({ tipo: 'ok', texto: 'Cambios guardados' });
    }
  };

  if (!empleado) return null;
  if (!puedeVer) return <Navigate to="/" replace />;

  const modulosVisibles = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador');
  const modulosActivosInfo = modulosVisibles.filter((m) => tieneModulo(m.id));

  return (
    <div className="min-h-screen bg-orange-50 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-slate-900 text-xl font-black">Configuración</h1>
        <p className="text-slate-400 text-sm">Datos del negocio y módulos activos</p>
      </div>

      {cargando || !form ? (
        <p className="text-slate-500 text-sm text-center py-12">Cargando...</p>
      ) : (
        <>
          <div className="px-5 space-y-4">
            <div className="bg-white border border-orange-100 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-amber-500" />
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Datos del negocio</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs">Nombre comercial</Label>
                <Input
                  value={form.nombre_negocio}
                  onChange={(e) => setForm({ ...form, nombre_negocio: e.target.value })}
                  className="h-12 bg-orange-50 border-orange-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs">NIT</Label>
                <Input
                  value={form.nit}
                  onChange={(e) => setForm({ ...form, nit: e.target.value })}
                  className="h-12 bg-orange-50 border-orange-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs">Contacto</Label>
                <Input
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                  className="h-12 bg-orange-50 border-orange-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs">Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="h-12 bg-orange-50 border-orange-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-600 text-xs">Correo</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-12 bg-orange-50 border-orange-200 text-slate-900"
                />
              </div>

              {mensaje && (
                <p className={`text-sm ${mensaje.tipo === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{mensaje.texto}</p>
              )}

              <Button onClick={handleGuardar} disabled={guardando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>

            <div className="bg-white border border-orange-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                {form.plan === 'PREMIUM' ? (
                  <Crown className="w-4 h-4 text-amber-500" />
                ) : (
                  <Zap className="w-4 h-4 text-sky-600" />
                )}
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">
                  Plan {form.plan === 'PREMIUM' ? 'Premium' : 'Básico'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="text-slate-900 text-sm font-semibold">
                  {cargandoModulos ? 'Cargando módulos...' : `${modulosActivosInfo.length} de ${modulosVisibles.length} módulos activos`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {modulosActivosInfo.map((m) => (
                  <span key={m.id} className="text-xs px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                    {m.icono} {m.nombre}
                  </span>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-3">
                Los módulos se gestionan desde el Panel Desarrollador de Codec Studio. Contáctalos para activar o desactivar alguno.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
