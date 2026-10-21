/**
 * Avisa al administrador del negocio cuando su numeración de facturación
 * electrónica vence en 15 días o menos (ver lib/dian/avisoNumeracion.ts).
 * Una vez al día por numeración, en Electron y en la web/celular. Solo
 * perfiles en producción: la numeración de pruebas no importa.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { obtenerPerfilFiscalActivo, listarResolucionesPerfil } from '../lib/supabase/fiscalProfileService';
import { numeracionesPorVencer, textoAvisoNumeracion } from '../lib/dian/avisoNumeracion';

const CLAVE = 'codecpos_aviso_numeracion_dian_';

export function useAvisoNumeracionDian(clienteId: string | null | undefined, esAdministrador: boolean) {
  useEffect(() => {
    if (!clienteId || !esAdministrador) return;
    let cancelado = false;

    (async () => {
      try {
        const perfil = await obtenerPerfilFiscalActivo(clienteId);
        if (!perfil?.id || perfil.ambiente !== 'produccion') return;
        const porVencer = numeracionesPorVencer(await listarResolucionesPerfil(perfil.id));
        const hoy = new Date().toISOString().slice(0, 10);
        for (const n of porVencer) {
          const clave = `${CLAVE}${n.id ?? n.prefijo}`;
          let yaAvisado = false;
          try { yaAvisado = localStorage.getItem(clave) === hoy; } catch { /* sin almacenamiento: se avisa igual */ }
          if (yaAvisado || cancelado) continue;
          toast.warning('Numeración de facturación electrónica por vencer', {
            description: `${textoAvisoNumeracion(n)} Pide una numeración nueva en el MUISCA de la DIAN (o pídesela a tu contador) y avísale a Codec Studio para asociarla.`,
            duration: 30000,
          });
          try { localStorage.setItem(clave, hoy); } catch { /* ignorar */ }
        }
      } catch {
        /* sin red o sin facturación: no hay nada que avisar */
      }
    })();

    return () => { cancelado = true; };
  }, [clienteId, esAdministrador]);
}
