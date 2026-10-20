/**
 * Alta de un negocio nuevo desde los paneles de Codec Studio: el Panel
 * Desarrollador del celular (/app/desarrollador, también la app Android) y el
 * Admin web (/admin/clientes). Los dos piden lo mismo y crean lo mismo: el
 * negocio, su credencial única de licencia (usuario + contraseña para
 * Electron y el celular), su licencia y sus módulos.
 */
import { getSupabaseClient } from './supabase/config';
import { crearClienteAdmin, type ClienteAdmin, type DuracionCliente, type PlanCliente } from './supabase/clientesAdminService';
import { MODULOS_CATALOGO, MODULOS_VENTA_APARTE, type ModuloPOS } from './permissions';

// Todo el catálogo excepto lo exclusivo de desarrollador (igual que
// Configuración en Electron).
export const MODULOS_DISPONIBLES = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador');
export const MODULOS_APARTE = MODULOS_DISPONIBLES.filter((m) => MODULOS_VENTA_APARTE.includes(m.id));

export const DURACIONES: { id: DuracionCliente; label: string }[] = [
  { id: '1_MES', label: '1 mes' },
  { id: '3_MESES', label: '3 meses' },
  { id: '1_ANO', label: '1 año' },
  { id: 'VITALICIA', label: 'Vitalicia' },
];

export const FORM_VACIO = {
  nombreNegocio: '', nit: '', contacto: '', telefono: '', email: '',
  usuario: '', contraseña: '', plan: 'BASICO' as PlanCliente, duracion: '1_ANO' as DuracionCliente,
};

export type FormNuevoNegocio = typeof FORM_VACIO;

export function modulosPorPlan(plan: PlanCliente): ModuloPOS[] {
  return MODULOS_DISPONIBLES
    .filter((m) => !MODULOS_VENTA_APARTE.includes(m.id))
    .filter((m) => (plan === 'PREMIUM' ? true : m.planRequerido === 'basico'))
    .map((m) => m.id);
}

export function calcularExpiracion(duracion: DuracionCliente): string | undefined {
  if (duracion === 'VITALICIA') return undefined;
  const dias = duracion === '1_MES' ? 30 : duracion === '3_MESES' ? 90 : 365;
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

/** Valida y crea el negocio. Lanza un Error con el mensaje para mostrar. */
export async function crearNegocioDesdePanel(form: FormNuevoNegocio, modulos: ModuloPOS[]): Promise<ClienteAdmin> {
  if (!form.nombreNegocio.trim()) throw new Error('El nombre del negocio es obligatorio');
  if (!form.usuario.trim() || form.usuario.trim().length < 4) throw new Error('El usuario debe tener al menos 4 caracteres');
  if (!form.contraseña.trim() || form.contraseña.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

  const usuario = form.usuario.trim();
  const client = getSupabaseClient();
  if (client) {
    const { data } = await client.from('usuarios_clientes').select('id').eq('username', usuario).limit(1);
    if (data && data.length > 0) throw new Error('Ese usuario ya existe');
  }

  return crearClienteAdmin({
    ...form,
    usuario,
    fechaActivacion: new Date().toISOString(),
    fechaExpiracion: calcularExpiracion(form.duracion),
    estado: 'ACTIVA',
    enPrueba: false,
    diasPruebaRestantes: 0,
    modulosActivos: modulos,
  });
}
