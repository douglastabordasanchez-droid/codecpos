/**
 * Avisa dentro de Electron cuando la licencia del negocio (prueba o plan
 * pagado) está por vencer -- mismo mecanismo que ya usa la PWA
 * (PwaLayout.tsx): la tabla `avisos_licencia` la llena el backend
 * (`generar_avisos_licencia`, corre por pg_cron) 2 días y 1 día antes del vencimiento,
 * sin importar si la licencia es TRIAL o de pago. Aquí solo se entrega el
 * aviso pendiente y se marca como enviado para no repetirlo.
 *
 * El aviso trae un botón "Pagar ahora" que lleva a /planes (PlanVencidoPage)
 * -- así el dueño puede renovar en el momento en vez de tener que acordarse
 * de escribir por WhatsApp, y evita que el sistema llegue a bloquearse.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getSupabaseClient } from '../lib/supabase/config';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { tituloAvisoLicencia } from '../lib/bloqueoLicencia';

export function useAvisoLicencia() {
  const navigate = useNavigate();

  useEffect(() => {
    const clienteId = getLinkedClienteId();
    const client = getSupabaseClient();
    if (!clienteId || !client) return;

    const avisar = async () => {
      const { data } = await client
        .from('avisos_licencia')
        .select('id, tipo, programado_para')
        .eq('cliente_id', clienteId)
        .is('enviado_en', null)
        .lte('programado_para', new Date().toISOString())
        .order('programado_para', { ascending: false });
      const aviso = data?.[0];
      if (!aviso) return;
      toast.warning(tituloAvisoLicencia(aviso.tipo), {
        description: 'Renueva tu plan de Codec POS. Si no se recibe el pago, el sistema se pausa el día que vence.',
        duration: 20000,
        action: {
          label: 'Pagar ahora',
          onClick: () => navigate('/planes'),
        },
      });
      // Si se acumularon (equipo apagado), se muestra el más reciente y se dan todos por entregados.
      await client.from('avisos_licencia').update({ enviado_en: new Date().toISOString() }).in('id', (data ?? []).map((a) => a.id));
    };

    avisar();
    const canal = client
      .channel(`avisos-licencia-${clienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'avisos_licencia', filter: `cliente_id=eq.${clienteId}` },
        avisar
      )
      .subscribe();

    return () => { client.removeChannel(canal); };
  }, []);
}
