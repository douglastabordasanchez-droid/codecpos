/**
 * Botones ReteFuente y ReteICA del cobro con factura electrónica, iguales en
 * Electron, la web y el celular. Si el comprador es agente de retención, el
 * cajero los activa y la factura informa las retenciones (la DIAN las recibe
 * en cac:WithholdingTaxTotal y el PDF las resta del total a pagar).
 *
 * Las tarifas salen de Facturación › Retenciones; si allí no hay, de las
 * últimas que se usaron en este equipo. Se pueden cambiar en el cobro.
 */
import { useEffect, useState } from 'react';
import { obtenerPerfilFiscalActivo } from '../../lib/supabase/fiscalProfileService';
import { calcularRetencionesElegidas, type RetencionesElegidas } from '../../lib/dian/retenciones';

export interface EstadoRetenciones {
  fuente: boolean;
  ica: boolean;
  /** Porcentaje de ReteFuente (2,5). */
  pctFuente: string;
  /** Tarifa de ReteICA por mil (11,04). */
  porMilIca: string;
}

const CLAVE_TARIFAS = 'codec_retenciones_tarifas';

function tarifasGuardadas(): { pctFuente?: string; porMilIca?: string } {
  try { return JSON.parse(localStorage.getItem(CLAVE_TARIFAS) || '{}'); } catch { return {}; }
}

export function retencionesIniciales(): EstadoRetenciones {
  const t = tarifasGuardadas();
  return { fuente: false, ica: false, pctFuente: t.pctFuente || '2.5', porMilIca: t.porMilIca || '' };
}

const numero = (v: string) => Number(String(v).replace(',', '.')) || 0;

function elegidas(estado: EstadoRetenciones): RetencionesElegidas {
  return {
    retefuentePorcentaje: estado.fuente ? numero(estado.pctFuente) || undefined : undefined,
    reteicaTarifaPorMil: estado.ica ? numero(estado.porMilIca) || undefined : undefined,
  };
}

/** Lo que va a emitirFacturaDianDirecto (vacío = sin retenciones). Recuerda
 * las tarifas usadas para el próximo cobro. */
export function retencionesParaEmitir(estado: EstadoRetenciones): RetencionesElegidas {
  if (estado.fuente || estado.ica) {
    try { localStorage.setItem(CLAVE_TARIFAS, JSON.stringify({ pctFuente: estado.pctFuente, porMilIca: estado.porMilIca })); } catch { /* sin almacenamiento */ }
  }
  return elegidas(estado);
}

/** Activa los botones según lo que dice Facturación › Clientes del comprador. */
export function retencionesDelCliente(estado: EstadoRetenciones, cliente: { agenteRetencionFuente?: boolean; agenteRetencionIca?: boolean } | null | undefined): EstadoRetenciones {
  return { ...estado, fuente: cliente?.agenteRetencionFuente === true, ica: cliente?.agenteRetencionIca === true };
}

interface Props {
  estado: EstadoRetenciones;
  onChange: (estado: EstadoRetenciones) => void;
  /** Valor de la venta antes de IVA: sobre él se calculan las retenciones. */
  base: number;
  /** Total de la factura, para mostrar cuánto paga el cliente. */
  total: number;
  oscuro?: boolean;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export function RetencionesCobro({ estado, onChange, base, total, oscuro = true }: Props) {
  // Tarifas de Facturación › Retenciones, una vez por cobro.
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    if (cargado) return;
    setCargado(true);
    obtenerPerfilFiscalActivo().then((perfil) => {
      const r = perfil?.retenciones;
      if (!r) return;
      const cambios: Partial<EstadoRetenciones> = {};
      if (Number(r.retefuentePorcentaje) > 0 && !tarifasGuardadas().pctFuente) cambios.pctFuente = String(r.retefuentePorcentaje);
      if (Number(r.reteicaTarifaPorMil) > 0 && !tarifasGuardadas().porMilIca) cambios.porMilIca = String(r.reteicaTarifaPorMil);
      if (Object.keys(cambios).length > 0) onChange({ ...estado, ...cambios });
    }).catch(() => { /* sin red: quedan las del equipo */ });
  }, [cargado, estado, onChange]);

  const retenciones = calcularRetencionesElegidas(elegidas(estado), base);
  const valor = (codigo: '06' | '07') => retenciones.find((r) => r.codigo === codigo)?.valor || 0;
  const totalRetenido = retenciones.reduce((s, r) => s + r.valor, 0);

  const boton = (activo: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
    activo
      ? 'bg-amber-500 border-amber-500 text-white'
      : oscuro ? 'bg-transparent border-slate-500 text-slate-300 hover:border-amber-400' : 'bg-white border-slate-300 text-slate-600 hover:border-amber-500'
  }`;
  const campo = `w-16 px-2 py-1 rounded-md text-xs text-right border ${oscuro ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`;
  const tenue = oscuro ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`mt-2 rounded-lg border p-2 space-y-2 ${oscuro ? 'border-slate-700' : 'border-slate-200'}`}>
      <p className={`text-[11px] ${tenue}`}>¿El cliente le retiene? Actívalo solo si es agente de retención.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={boton(estado.fuente)} onClick={() => onChange({ ...estado, fuente: !estado.fuente })}>ReteFuente</button>
        {estado.fuente && (
          <span className={`flex items-center gap-1 text-xs ${tenue}`}>
            <input value={estado.pctFuente} onChange={(e) => onChange({ ...estado, pctFuente: e.target.value })} inputMode="decimal" className={campo} aria-label="Porcentaje de ReteFuente" />
            % = <b className={oscuro ? 'text-white' : 'text-slate-900'}>{pesos(valor('06'))}</b>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={boton(estado.ica)} onClick={() => onChange({ ...estado, ica: !estado.ica })}>ReteICA</button>
        {estado.ica && (
          <span className={`flex items-center gap-1 text-xs ${tenue}`}>
            <input value={estado.porMilIca} onChange={(e) => onChange({ ...estado, porMilIca: e.target.value })} inputMode="decimal" placeholder="11,04" className={campo} aria-label="Tarifa de ReteICA por mil" />
            por mil = <b className={oscuro ? 'text-white' : 'text-slate-900'}>{pesos(valor('07'))}</b>
          </span>
        )}
      </div>
      {estado.ica && !numero(estado.porMilIca) && (
        <p className="text-[11px] text-amber-500">Escribe la tarifa de ReteICA por mil (te la da el contador).</p>
      )}
      {totalRetenido > 0 && (
        <p className={`text-xs ${tenue}`}>
          Base {pesos(base)}. El cliente paga <b className={oscuro ? 'text-emerald-400' : 'text-emerald-700'}>{pesos(total - totalRetenido)}</b> y le retiene {pesos(totalRetenido)}.
        </p>
      )}
    </div>
  );
}
