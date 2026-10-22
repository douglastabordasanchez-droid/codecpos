/**
 * Lo que se le dice al cajero después de una devolución o anulación sobre
 * una venta con factura electrónica. Igual en Electron, la web y el celular.
 */
import { toast } from 'sonner';
import type { ResultadoNotaPorDevolucion } from './notaPorDevolucion';

export function avisarNotaPorDevolucion(r: ResultadoNotaPorDevolucion): void {
  if (r.estado === 'emitida') {
    toast.success(`Nota crédito ${r.numeroNota} emitida`, {
      description: r.estadoDian === 'accepted' ? 'Aprobada por la DIAN' : 'Se enviará a la DIAN en cuanto haya conexión',
    });
  } else if (r.estado === 'sin_numeracion') {
    toast.warning('Falta la numeración de notas crédito', { description: 'Emita la nota desde Facturación › Facturas de venta.' });
  } else if (r.estado === 'factura_no_aprobada') {
    toast.warning('La factura electrónica de esta venta aún no está aprobada', { description: 'Cuando la DIAN la apruebe, emita la nota crédito desde Facturación.' });
  } else if (r.estado === 'ya_anulada') {
    toast.info('La factura de esta venta ya estaba anulada', { description: `Tiene la nota crédito ${r.notas.join(', ')}. La devolución quedó registrada sin emitir otra nota.` });
  } else if (r.estado === 'tiquete_pos') {
    toast.info('Venta con tiquete POS electrónico', { description: 'La nota de ajuste del tiquete POS todavía no está disponible.' });
  } else if (r.estado === 'error') {
    toast.error('No se pudo emitir la nota crédito', { description: `${r.motivo} Emítala desde Facturación › Facturas de venta.` });
  }
}
