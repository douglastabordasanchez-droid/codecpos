/**
 * Piezas compartidas del módulo de Facturación.
 *
 * El módulo vive en src/app/components/facturacion y se monta igual desde la
 * web (src/pwa/pages/FacturacionPage.tsx) y desde Electron
 * (src/app/pages/FacturacionElectronicaPage.tsx). Por eso usa SOLO la paleta
 * slate oscura que la PWA ya repinta en modo claro (src/pwa/theme.css): una
 * clase fuera de esa paleta se vería bien en Electron y rota en la web clara.
 */
import { CheckCircle2, Clock, FileText, Send, ShieldAlert, ShieldOff, XCircle } from 'lucide-react';
import type { EstadoDocumentoDian } from '../../lib/dian/types';
import type { TipoDocumento } from '../../lib/dian/recepcion/types';

export const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/** 'YYYY-MM-DD' → '02 oct 2026' sin pasar por UTC (una fecha sola no tiene zona). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${m[3]} ${meses[Number(m[2]) - 1]} ${m[1]}`;
}

/** Estado DIAN como lo ve el dueño: tres resultados claros y los intermedios. */
export const ESTADO_DIAN_UI: Record<EstadoDocumentoDian, { label: string; className: string; Icon: typeof Clock }> = {
  draft: { label: 'Borrador', className: 'bg-slate-500/15 text-slate-400', Icon: FileText },
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-400', Icon: Clock },
  signing: { label: 'Firmando', className: 'bg-sky-500/15 text-sky-400', Icon: Clock },
  sent: { label: 'Enviada', className: 'bg-sky-500/15 text-sky-400', Icon: Send },
  accepted: { label: 'Aprobado', className: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
  rejected: { label: 'Rechazado', className: 'bg-red-500/15 text-red-400', Icon: XCircle },
  error: { label: 'Error', className: 'bg-red-500/15 text-red-400', Icon: ShieldAlert },
  contingency: { label: 'Pendiente (contingencia)', className: 'bg-amber-500/15 text-amber-400', Icon: Clock },
  cancelled: { label: 'Anulada', className: 'bg-slate-500/15 text-slate-500', Icon: ShieldOff },
};

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  factura: 'Factura',
  nota_credito: 'Nota crédito',
  nota_debito: 'Nota débito',
  documento_equivalente: 'Doc. equivalente',
  documento_soporte: 'Doc. soporte',
  nomina: 'Nómina',
  evento: 'Evento',
  desconocido: 'Sin identificar',
};

export function descargarTexto(contenido: string, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Quién opera el módulo. `id` es el uuid de `empleados` en la web; en
 * Electron el usuario es local y no tiene fila allá, así que va null. */
export interface OperadorFacturacion {
  id: string | null;
  nombre: string;
}
