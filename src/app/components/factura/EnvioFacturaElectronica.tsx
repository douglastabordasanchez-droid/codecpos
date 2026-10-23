/**
 * «Enviar al cliente» debajo de la tirilla de la factura electrónica, en el
 * cobro de Electron, la web y el celular: WhatsApp, correo y PDF de la
 * factura DIAN (la misma representación gráfica del XML, no la tirilla normal).
 *
 * Correo: si el negocio conectó su correo (Configuración › Facturación), sale
 * desde allí con el ZIP de la DIAN y el PDF; si no, se abre el correo del
 * equipo con el PDF descargado para adjuntarlo.
 */
import { useEffect, useState } from 'react';
import { Download, Loader2, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { FacturaElectronicaDian } from '../../lib/dian/types';
import { correoNegocioConectado, enviarFacturaPorCorreoNegocio } from '../../lib/dian/correoFacturas';
import { descargarFacturaPDF, enviarFacturaPorEmail, enviarFacturaPorWhatsApp, type ConfigEmpresa, type Venta } from '../../lib/pdfGenerator';

interface Props {
  factura: FacturaElectronicaDian;
  /** Datos del PDF ya armados por la tirilla (null mientras carga). */
  datos: { venta: Venta; config: ConfigEmpresa } | null;
}

type Accion = 'whatsapp' | 'correo' | 'pdf';

export function EnvioFacturaElectronica({ factura, datos }: Props) {
  const [telefono, setTelefono] = useState(factura.adquirente.telefono || '');
  const [correo, setCorreo] = useState(factura.adquirente.email || '');
  const [correoPropio, setCorreoPropio] = useState(false);
  const [ocupado, setOcupado] = useState<Accion | null>(null);

  useEffect(() => {
    let vivo = true;
    correoNegocioConectado().then((c) => { if (vivo) setCorreoPropio(c); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const digitos = telefono.replace(/\D/g, '');
  // Un celular colombiano de 10 dígitos va con el indicativo 57.
  const numeroWhatsApp = digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  const ejecutar = async (accion: Accion, tarea: () => Promise<unknown>, exito?: string) => {
    if (ocupado) return;
    setOcupado(accion);
    try {
      await tarea();
      if (exito) toast.success(exito);
    } catch (e: any) {
      toast.error('No se pudo enviar la factura', { description: e?.message, duration: 12000 });
    } finally {
      setOcupado(null);
    }
  };

  const enviarWhatsApp = () => ejecutar('whatsapp', async () => {
    if (!datos) throw new Error('La factura aún se está armando');
    await enviarFacturaPorWhatsApp(datos.venta, datos.config, numeroWhatsApp);
  });

  const enviarCorreo = () => ejecutar('correo', async () => {
    if (correoPropio) {
      await enviarFacturaPorCorreoNegocio(factura, correo.trim());
      return;
    }
    if (!datos) throw new Error('La factura aún se está armando');
    await enviarFacturaPorEmail(datos.venta, datos.config, correo.trim());
  }, correoPropio ? `Factura ${factura.numeroFactura} enviada a ${correo.trim()}` : undefined);

  const bajarPdf = () => ejecutar('pdf', async () => {
    if (!datos) throw new Error('La factura aún se está armando');
    await descargarFacturaPDF(datos.venta, datos.config);
  });

  const campo = 'flex-1 min-w-0 h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm placeholder:text-slate-500';
  const icono = (accion: Accion, Icono: typeof Mail) => (ocupado === accion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icono className="w-4 h-4" />);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-3 space-y-2">
      <p className="text-white text-sm font-bold">Enviar al cliente</p>
      <div className="flex gap-2">
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Celular del cliente" aria-label="Celular para WhatsApp" className={campo} />
        <button
          onClick={enviarWhatsApp}
          disabled={!datos || digitos.length < 7 || !!ocupado}
          className="h-11 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
        >
          {icono('whatsapp', MessageCircle)} WhatsApp
        </button>
      </div>
      <div className="flex gap-2">
        <input value={correo} onChange={(e) => setCorreo(e.target.value)} inputMode="email" placeholder="Correo del cliente" aria-label="Correo del cliente" className={campo} />
        <button
          onClick={enviarCorreo}
          disabled={!correoValido || (!correoPropio && !datos) || !!ocupado}
          className="h-11 px-3 rounded-xl bg-sky-600 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
        >
          {icono('correo', Mail)} Correo
        </button>
      </div>
      <button
        onClick={bajarPdf}
        disabled={!datos || !!ocupado}
        className="w-full h-10 rounded-xl border border-slate-700 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {icono('pdf', Download)} Descargar PDF
      </button>
      <p className="text-slate-400 text-[11px]">
        {correoPropio
          ? 'El correo sale desde el correo del negocio con el PDF y el archivo de la DIAN.'
          : 'WhatsApp y correo: se descarga el PDF y se abre el mensaje para adjuntarlo.'}
      </p>
    </div>
  );
}
