/**
 * Modo de facturación electrónica con el que trabaja ESTE equipo (Electron).
 *
 * `modoFacturacionElectronica` se guarda solo en este computador
 * (codec_pos_config). Un negocio con el módulo Facturación DIAN contratado
 * que estrenaba equipo (o lo configuró desde otro) quedaba en 'ninguna': la
 * barra decía «DIAN conectada» pero la caja no preguntaba «¿Factura
 * electrónica para esta venta?». Ahora, si en este equipo no se eligió un
 * proveedor externo, el módulo contratado basta para facturar con DIAN directo.
 */
import { ModuloPOS, esModuloActivoGlobal } from '../permissions';

export type ModoFacturacion = 'ninguna' | 'proveedor_externo' | 'dian_directo';

export function modoFacturacionEfectivo(config: { modoFacturacionElectronica?: string } | null | undefined): ModoFacturacion {
  const m = config?.modoFacturacionElectronica;
  if (m === 'proveedor_externo' || m === 'dian_directo') return m;
  return esModuloActivoGlobal(ModuloPOS.FACTURACION_DIAN) ? 'dian_directo' : 'ninguna';
}
