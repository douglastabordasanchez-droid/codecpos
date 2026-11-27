/**
 * Etiqueta de dónde se hizo una venta que no salió de la caja del PC.
 * Las del celular y la web llegan con terminal 'PWA'; desde la 0170 traen
 * `origen`. Las viejas sin origen se muestran como «Celular o web».
 */
export type OrigenVenta = 'celular' | 'web';

export function etiquetaOrigenVenta(terminalId: string | null | undefined, origen: string | null | undefined): string | null {
  if (origen === 'celular') return 'Celular';
  if (origen === 'web') return 'Web';
  if (terminalId === 'PWA') return 'Celular o web';
  return null;
}
