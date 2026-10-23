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
import { Download, Loader2, Mail, MessageCircle, Send } from 'lucide-react';
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

  // Colores fijos (style): el tema claro de la web y la app repinta las
  // clases slate y text-white, y el panel quedaba gris sobre gris.
  const COLOR = { whatsapp: '#25D366', correo: '#2563EB', pdf: 'linear-gradient(90deg, #F59E0B, #EA580C)' };
  const campo = 'flex-1 min-w-0 h-11 px-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400';
  const estiloCampo = { background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A' };
  const boton = 'h-11 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shrink-0 shadow-sm transition-opacity disabled:opacity-45';
  const icono = (accion: Accion, Icono: typeof Mail) => (ocupado === accion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icono className="w-4 h-4" />);

  return (
    <div className="rounded-2xl p-4 space-y-3 shadow-md" style={{ background: '#FFFFFF', border: '1px solid #A7F3D0' }}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#D1FAE5', color: '#047857' }}>
          <Send className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: '#0F172A' }}>Enviar al cliente</p>
          <p className="text-[11px] leading-tight" style={{ color: '#64748B' }}>Factura {factura.numeroFactura} con CUFE y QR</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Celular del cliente" aria-label="Celular para WhatsApp" className={campo} style={estiloCampo} />
        <button
          onClick={enviarWhatsApp}
          disabled={!datos || digitos.length < 7 || !!ocupado}
          className={boton}
          style={{ background: COLOR.whatsapp, color: '#FFFFFF' }}
        >
          {icono('whatsapp', MessageCircle)} WhatsApp
        </button>
      </div>
      <div className="flex gap-2">
        <input value={correo} onChange={(e) => setCorreo(e.target.value)} inputMode="email" placeholder="Correo del cliente" aria-label="Correo del cliente" className={campo} style={estiloCampo} />
        <button
          onClick={enviarCorreo}
          disabled={!correoValido || (!correoPropio && !datos) || !!ocupado}
          className={boton}
          style={{ background: COLOR.correo, color: '#FFFFFF' }}
        >
          {icono('correo', Mail)} Correo
        </button>
      </div>
      <button
        onClick={bajarPdf}
        disabled={!datos || !!ocupado}
        className={`${boton} w-full`}
        style={{ background: COLOR.pdf, color: '#FFFFFF' }}
      >
        {icono('pdf', Download)} Descargar PDF
      </button>
      <p className="text-[11px] leading-snug" style={{ color: '#64748B' }}>
        {correoPropio
          ? 'El correo sale desde el correo del negocio con el PDF y el archivo de la DIAN.'
          : 'WhatsApp y correo: se descarga el PDF y se abre el mensaje para adjuntarlo.'}
      </p>
    </div>
  );
}
