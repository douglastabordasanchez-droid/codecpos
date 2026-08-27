import { memo, useRef, useState, useEffect } from 'react';
import { Printer, Download, MessageCircle, Mail, Send } from 'lucide-react';
import { Button } from '../ui/button';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import logoImage from '/logo.png';
import { printSaleReceipt } from '../../lib/thermalPrinter';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { enviarFacturaPorWhatsApp, enviarFacturaPorEmail } from '../../lib/pdfGenerator';
import { getCached } from '../../lib/cachedLocalStorage';

// bre_b no debe imprimirse como "BRE_B" (guion bajo feo en la tirilla) —
// el resto de métodos sí se ven bien con un simple toUpperCase().
function labelMetodoPagoTirilla(metodoPago: string): string {
  return metodoPago.toLowerCase() === 'bre_b' ? 'BRE-B' : metodoPago.toUpperCase();
}

interface ItemVenta {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

interface PagoMixto {
  metodo1: string;
  monto1: number;
  metodo2: string;
  monto2: number;
}

interface Venta {
  numeroFactura: string;
  items: ItemVenta[];
  total: number;
  subtotal?: number;
  iva?: number;
  porcentajeIVA?: number;
  metodoPago: string;
  efectivoRecibido?: number;
  cambio?: number;
  pagoMixto?: PagoMixto;
  fecha: string;
  cajero?: string;
  mesa?: string;
  referencia_mesa?: string;
  // Facturación electrónica
  cufe?: string;
  qrUrl?: string;
  folioElectronico?: string;
  facturaEstado?: 'SINCRONIZADA' | 'PENDIENTE_SINCRONIZAR' | 'LOCAL';
  contingencia?: boolean;
}

interface TicketReceiptProps {
  venta: Venta | null;
}

// Traduce el código guardado en Configuración (`regimenFiscal`) a un texto
// legible para el cliente en la factura impresa/PDF.
const REGIMEN_FISCAL_LABEL: Record<string, string> = {
  simplificado: 'Simplificado',
  comun: 'Común',
  gran_contribuyente: 'Gran Contribuyente',
};

function TicketReceiptComponent({ venta }: TicketReceiptProps) {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();
  const ticketRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<any>({});
  const [panelCompartir, setPanelCompartir] = useState<'whatsapp' | 'email' | null>(null);
  const [telefono, setTelefono] = useState('');
  const [emailDestino, setEmailDestino] = useState('');
  const [enviando, setEnviando] = useState<'whatsapp' | 'email' | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  // Cargar configuración SOLO UNA VEZ (sin interval pesado)
  useEffect(() => {
    // 🚀 FIX rendimiento: usa el caché compartido (cachedLocalStorage.ts) en
    // vez de un JSON.parse propio — si otra pantalla ya leyó 'codec_pos_config'
    // en este mismo ciclo y nada cambió, evita reparsear el mismo JSON.
    // Mismo dato, mismo shape; getCached se auto-invalida si el string crudo
    // cambia, así que no puede quedar desactualizado.
    const loadConfig = () => {
      setConfig(getCached('codec_pos_config', {}));
    };

    loadConfig();

    // Escuchar cambios en localStorage desde otros tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'codec_pos_config') {
        loadConfig();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // SIN interval - mejora crítica de rendimiento

  if (!venta) return null;

  const anchoTicket: 58 | 80 = Number(config?.anchoPapel || config?.anchoImpresora || config?.ticketWidth || config?.printerWidth) === 58 ? 58 : 80;

  // Cajero: usa el campo del objeto venta primero; cae al usuario autenticado como respaldo
  const cajeroDisplay = venta.cajero
    || usuarioActual?.nombreCompleto
    || usuarioActual?.username
    || 'Cajero';

  // Mesa: omite el valor genérico 'General', prioriza referencia_mesa de Panadería
  const mesaDisplay = venta.referencia_mesa
    || (venta.mesa && venta.mesa.toLowerCase() !== 'general' ? venta.mesa : null);

  const handlePrint = () => {
    // 🚀 Evita que un doble toque (muy común en pantallas táctiles de POS,
    // más aún si el usuario cree que no pasó nada mientras el spooler
    // trabaja) mande el mismo ticket dos veces a la impresora.
    if (imprimiendo) return;
    setImprimiendo(true);
    printSaleReceipt({
      numeroFactura: venta.numeroFactura,
      items: venta.items.map((item) => ({
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio: item.precio,
        subtotal: item.subtotal,
      })),
      subtotal: venta.subtotal,
      iva: venta.iva,
      porcentajeIVA: venta.porcentajeIVA,
      total: venta.total,
      metodoPago: venta.metodoPago,
      cambio: venta.cambio,
      efectivoRecibido: venta.efectivoRecibido,
      pagoMixto: venta.pagoMixto,
      fecha: venta.fecha,
      cajero: cajeroDisplay,
      mesa: venta.mesa,
      referencia_mesa: mesaDisplay ?? undefined,
      facturaElectronica: !!config.facturaElectronica,
      cufe: venta.cufe,
      folioElectronico: venta.folioElectronico,
      contingencia: venta.contingencia,
    }, {
      nombreComercial: config.nombreComercial,
      razonSocial: config.razonSocial,
      nit: config.nit,
      digitoVerificacion: config.digitoVerificacion,
      mensajeTirillaBajo: config.mensajeTirillaBajo,
      mensajeTirillaArriba: config.mensajeTirillaArriba,
      eslogan: config.eslogan,
      email: config.email,
      ciudad: config.ciudad,
    }, anchoTicket)
      .then((ok) => {
        if (ok) {
          toast.success('Factura enviada a impresora predeterminada');
          return;
        }
        toast.error('La impresora predeterminada no está conectada. Por favor, verifícala en el área de Dispositivos');
      })
      .catch(() => {
        toast.error('La impresora predeterminada no está conectada. Por favor, verifícala en el área de Dispositivos');
      })
      .finally(() => setImprimiendo(false));
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
    const empresa = config;
    const W = 80;
    let y = 8;
    const lineH = 5;

    const center = (text: string, fontSize = 9) => {
      doc.setFontSize(fontSize);
      doc.text(text, W / 2, y, { align: 'center' });
      y += lineH;
    };
    const left = (text: string, fontSize = 8) => {
      doc.setFontSize(fontSize);
      doc.text(text, 4, y);
      y += lineH;
    };
    const right = (label: string, value: string, fontSize = 8) => {
      doc.setFontSize(fontSize);
      doc.text(label, 4, y);
      doc.text(value, W - 4, y, { align: 'right' });
      y += lineH;
    };
    const separator = () => {
      doc.setLineWidth(0.2);
      doc.line(4, y, W - 4, y);
      y += 3;
    };

    // Logo
    if (empresa.logoUrl) {
      try {
        const ext = empresa.logoUrl.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(empresa.logoUrl, ext, W / 2 - 15, y, 30, 16);
        y += 19;
      } catch { /* skip logo if error */ }
    }

    // Encabezado empresa
    doc.setFont('helvetica', 'bold');
    center(empresa.nombreComercial || 'MI NEGOCIO', 11);
    doc.setFont('helvetica', 'normal');
    if (empresa.razonSocial && empresa.razonSocial !== empresa.nombreComercial) center(empresa.razonSocial, 8);
    if (empresa.nit) center(`NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`, 8);
    if (empresa.eslogan) { doc.setFont('helvetica', 'italic'); center(empresa.eslogan, 7); doc.setFont('helvetica', 'normal'); }
    if (empresa.direccion) center(empresa.direccion, 7);
    if (empresa.ciudad) center(empresa.ciudad, 7);
    if (empresa.telefono) center(`Tel: ${empresa.telefono}`, 7);
    if (empresa.email) center(empresa.email, 7);

    separator();
    if (empresa.regimenFiscal) { center(`Régimen ${REGIMEN_FISCAL_LABEL[empresa.regimenFiscal] || empresa.regimenFiscal}`, 7); y += 1; }

    // Tipo factura
    doc.setFont('helvetica', 'bold');
    center(empresa.facturaElectronica ? 'FACTURA ELECTRÓNICA DE VENTA' : 'FACTURA DE VENTA', 10);
    doc.setFont('helvetica', 'normal');
    center(`N° ${venta.numeroFactura}`, 9);
    if (mesaDisplay) center(`UBICACIÓN: ${mesaDisplay}`, 8);
    center(`Cajero: ${cajeroDisplay}`, 8);
    const fechaVentaLocal = new Date(venta.fecha);
    center(fechaVentaLocal.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }) + '  ' +
      fechaVentaLocal.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }), 8);

    if (empresa.claveResolucionDIAN) {
      center(`Resolución DIAN: ${empresa.claveResolucionDIAN}`, 7);
      if (empresa.rangoAutorizadoDesde && empresa.rangoAutorizadoHasta)
        center(`Rango: ${empresa.prefijoFactura || ''}${empresa.rangoAutorizadoDesde} al ${empresa.prefijoFactura || ''}${empresa.rangoAutorizadoHasta}`, 7);
    }

    separator();

    // Encabezado columnas
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('CANT  DESCRIPCIÓN', 4, y);
    doc.text('VALOR', W - 4, y, { align: 'right' });
    y += lineH;
    doc.setFont('helvetica', 'normal');
    separator();

    // Items
    venta.items.forEach(item => {
      doc.setFontSize(8);
      doc.text(`${item.cantidad}x  ${item.nombre}`, 4, y, { maxWidth: 55 });
      doc.text(`$${item.subtotal.toLocaleString('es-CO')}`, W - 4, y, { align: 'right' });
      y += lineH;
      doc.setFontSize(7);
      doc.text(`    $${item.precio.toLocaleString('es-CO')} c/u`, 4, y);
      y += lineH - 1;
    });

    separator();

    // Totales
    if (venta.subtotal && venta.iva) {
      right('Subtotal:', `$${venta.subtotal.toLocaleString('es-CO')}`);
      right(`IVA (${venta.porcentajeIVA || 19}%):`, `$${venta.iva.toLocaleString('es-CO')}`);
      separator();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    right('TOTAL:', `$${venta.total.toLocaleString('es-CO')}`);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    left(`Método de pago: ${labelMetodoPagoTirilla(venta.metodoPago)}`);

    if (venta.metodoPago.toLowerCase() === 'efectivo') {
      right('Efectivo recibido:', `$${(venta.efectivoRecibido || 0).toLocaleString('es-CO')}`);
      doc.setFont('helvetica', 'bold');
      right('Cambio:', `$${(venta.cambio || 0).toLocaleString('es-CO')}`);
      doc.setFont('helvetica', 'normal');
    } else if (venta.metodoPago.toLowerCase() === 'mixto' && venta.pagoMixto) {
      right(`${venta.pagoMixto.metodo1}:`, `$${venta.pagoMixto.monto1.toLocaleString('es-CO')}`);
      right(`${venta.pagoMixto.metodo2}:`, `$${venta.pagoMixto.monto2.toLocaleString('es-CO')}`);
      if ((venta.cambio || 0) > 0) { doc.setFont('helvetica', 'bold'); right('Cambio:', `$${(venta.cambio || 0).toLocaleString('es-CO')}`); doc.setFont('helvetica', 'normal'); }
    }

    separator();

    // Footer mensajes
    doc.setFont('helvetica', 'bold');
    if (empresa.mensajeTirillaArriba) center(empresa.mensajeTirillaArriba, 8);
    doc.setFont('helvetica', 'italic');
    if (empresa.mensajeTirilla) center(empresa.mensajeTirilla, 8);
    doc.setFont('helvetica', 'bold');
    if (empresa.mensajeTirillaBajo) center(empresa.mensajeTirillaBajo, 8);
    doc.setFont('helvetica', 'normal');

    // CUFE para factura electrónica
    if (empresa.facturaElectronica && (venta as any).cufe) {
      separator();
      doc.setFontSize(7);
      center('Este documento es una representación', 7);
      center('impresa de una FACTURA ELECTRÓNICA', 7);
      center('generada y validada por la DIAN', 7);
      y += 2;
      doc.setFontSize(6);
      doc.text('CUFE:', 4, y); y += 4;
      const cufeLines = doc.splitTextToSize((venta as any).cufe, W - 8);
      cufeLines.forEach((line: string) => { doc.text(line, 4, y); y += 3.5; });
    }

    // Pie de marca — igual al que se ve en pantalla (bloque final del ticket
    // HTML más abajo), para que el PDF descargado no sea un resumen distinto
    // de lo que el cajero ya vio antes de generarlo.
    separator();
    doc.setFont('helvetica', 'bold');
    center('CODEC POS v2.0', 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    center(`Software POS - Facturación ${empresa.facturaElectronica ? 'Electrónica' : 'Tradicional'}`, 7);
    y += 1;
    center('Desarrollado por Codec Studio', 7);
    center('Diseño de software personalizado', 7);
    center('Bogotá, Colombia', 7);
    y += 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    center('Tel: 3238646844', 8);
    doc.setFont('helvetica', 'normal');

    // Ajustar alto del documento según contenido
    const totalPages = doc.getNumberOfPages();
    if (totalPages === 1) {
      // trim PDF height to content
    }

    doc.save(`Factura-${venta.numeroFactura}.pdf`);
    toast.success('PDF generado', { description: `Factura ${venta.numeroFactura}` });
  };

  /** Datos compartidos por WhatsApp/Correo — usa el generador de factura "de página completa", más legible para el cliente que el ticket angosto de 80mm. */
  function datosParaCompartir() {
    return {
      venta: {
        numeroFactura: venta!.numeroFactura,
        fecha: venta!.fecha,
        items: venta!.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, subtotal: i.subtotal })),
        subtotal: venta!.subtotal ?? venta!.total,
        iva: venta!.iva ?? 0,
        total: venta!.total,
        metodoPago: venta!.metodoPago,
        cajero: cajeroDisplay,
        mesa: venta!.mesa,
        referencia_mesa: mesaDisplay ?? undefined,
      },
      config: {
        nombreComercial: config.nombreComercial || 'CODEC POS',
        razonSocial: config.razonSocial || '',
        nit: config.nit || '',
        direccion: config.direccion || '',
        telefono: config.telefono || '',
        email: config.email || '',
        ciudad: config.ciudad || '',
      },
    };
  }

  const handleWhatsApp = async () => {
    if (!telefono.trim()) { toast.error('Ingresa el número de WhatsApp del cliente'); return; }
    setEnviando('whatsapp');
    try {
      const { venta: v, config: c } = datosParaCompartir();
      await enviarFacturaPorWhatsApp(v, c, telefono.trim());
      toast.success('PDF descargado — WhatsApp se abrió con el mensaje listo, solo adjunta el archivo');
      setPanelCompartir(null);
    } catch {
      toast.error('No se pudo preparar el envío por WhatsApp');
    } finally {
      setEnviando(null);
    }
  };

  const handleEmail = async () => {
    if (!emailDestino.trim()) { toast.error('Ingresa el correo del cliente'); return; }
    setEnviando('email');
    try {
      const { venta: v, config: c } = datosParaCompartir();
      await enviarFacturaPorEmail(v, c, emailDestino.trim());
      toast.success('PDF descargado — tu cliente de correo se abrió con el mensaje listo, solo adjunta el archivo');
      setPanelCompartir(null);
    } catch {
      toast.error('No se pudo preparar el envío por correo');
    } finally {
      setEnviando(null);
    }
  };

  const fechaVenta = new Date(venta.fecha);

  return (
    <>
      {/* El recibo usa clases genéricas (.center, .right, .bold, .line,
          .double-line, .item-table, .spacing) que ningún stylesheet global
          define — sin esto se veía sin separadores, sin negritas y sin
          alinear, sea cual sea el tema activo. Se define aquí, scopeada a
          .ticket, para no depender del orden de carga de otros CSS.
          Los colores llevan !important porque src/styles/theme.css fuerza
          `.dark body td/th/span { color: #e5e7eb }` con más especificidad
          que un simple ".ticket td" — sin esto el texto de las columnas
          quedaba gris clarísimo, casi invisible, sobre el fondo blanco del
          recibo (un recibo impreso no debe seguir el tema oscuro de la app). */}
      <style>{`
        .ticket, .ticket * { color: #000 !important; }
        .ticket .center { text-align: center; }
        .ticket .right { text-align: right; }
        .ticket .bold { font-weight: 700; }
        .ticket .spacing { margin: 8px 0; }
        .ticket .line { border-top: 1px dashed #333; margin: 8px 0; height: 0; }
        .ticket .double-line { border-top: 2px solid #000; margin: 10px 0; height: 0; }
        .ticket .item-table { width: 100%; border-collapse: collapse; }
        .ticket .item-table td { padding: 3px 0; vertical-align: top; }
      `}</style>
      {/* Ticket Content */}
      <div
        ref={ticketRef}
        className={`ticket p-6 rounded-2xl border-2 font-mono text-sm ${
          darkMode 
            ? 'bg-white text-black border-slate-600' 
            : 'bg-white text-black border-gray-300'
        }`}
        style={{ fontFamily: 'Courier New, monospace' }}
      >
        {/* Logo de la empresa */}
        <div className="center spacing">
          <img
            src={config.logoUrl || logoImage}
            alt="Logo"
            style={{
              maxWidth: '120px',
              maxHeight: '80px',
              margin: '0 auto',
              display: 'block'
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Encabezado Empresa */}
        <div className="center spacing">
          <div className="bold" style={{ fontSize: '16px' }}>
            {config.nombreComercial || 'MI NEGOCIO'}
          </div>
          <div style={{ fontSize: '11px' }}>
            {config.razonSocial || 'Nombre Empresa S.A.S'}
          </div>
          {config.nit && (
            <div>NIT: {config.nit}{config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}</div>
          )}
          {config.eslogan && (
            <div style={{ fontSize: '10px', marginTop: '4px' }}>
              {config.eslogan}
            </div>
          )}
        </div>

        <div className="line"></div>

        {/* Información de contacto */}
        <div className="spacing" style={{ fontSize: '11px' }}>
          {config.direccion && <div>{config.direccion}</div>}
          {config.ciudad && <div>{config.ciudad} - {config.departamento}</div>}
          {config.telefono && <div>Tel: {config.telefono}</div>}
          {config.email && <div>{config.email}</div>}
        </div>

        {config.regimenFiscal && (
          <>
            <div className="line"></div>
            <div className="center spacing" style={{ fontSize: '10px' }}>
              <div>Régimen {REGIMEN_FISCAL_LABEL[config.regimenFiscal] || config.regimenFiscal}</div>
            </div>
          </>
        )}

        <div className="double-line"></div>

        {/* Información de la Factura */}
        <div className="center bold spacing" style={{ fontSize: '14px' }}>
          {config.facturaElectronica ? 'FACTURA ELECTRÓNICA' : 'FACTURA DE VENTA'}
        </div>

        <div className="spacing">
          <div className="center bold">N° {venta.numeroFactura}</div>
          {mesaDisplay && (
            <div style={{ fontWeight: 'bold', textAlign: 'center', background: '#1e293b', color: '#fff', padding: '3px 6px', borderRadius: 4, margin: '4px 0' }}>
              UBICACIÓN: {mesaDisplay}
            </div>
          )}
          <div>Cajero: {cajeroDisplay}</div>
          <div>Fecha: {fechaVenta.toLocaleDateString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })}</div>
          <div>Hora: {fechaVenta.toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}</div>
        </div>

        {config.claveResolucionDIAN && (
          <div className="spacing" style={{ fontSize: '10px' }}>
            <div>Resolución DIAN: {config.claveResolucionDIAN}</div>
            {config.fechaResolucionDIAN && (
              <div>Fecha: {new Date(config.fechaResolucionDIAN).toLocaleDateString('es-CO')}</div>
            )}
            {config.rangoAutorizadoDesde && config.rangoAutorizadoHasta && (
              <div>Rango: {config.prefijoFactura}{config.rangoAutorizadoDesde} al {config.prefijoFactura}{config.rangoAutorizadoHasta}</div>
            )}
          </div>
        )}

        <div className="double-line"></div>

        {/* Items de la venta */}
        <div className="spacing">
          <table className="item-table">
            <thead>
              <tr className="bold">
                <td>CANT</td>
                <td>DESCRIPCIÓN</td>
                <td className="right">VALOR</td>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.cantidad}</td>
                  <td style={{ fontSize: '11px' }}>
                    {item.nombre}
                    <br />
                    <span style={{ fontSize: '10px' }}>
                      ${item.precio.toLocaleString('es-CO')} c/u
                    </span>
                  </td>
                  <td className="right">${item.subtotal.toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="double-line"></div>

        {/* Totales */}
        <div className="spacing">
          <table style={{ width: '100%' }}>
            <tbody>
              {/* Mostrar subtotal e IVA si están disponibles */}
              {venta.subtotal && venta.iva && (
                <>
                  <tr>
                    <td>Subtotal:</td>
                    <td className="right">${venta.subtotal.toLocaleString('es-CO')}</td>
                  </tr>
                  <tr>
                    <td>IVA ({venta.porcentajeIVA || 19}%):</td>
                    <td className="right">${venta.iva.toLocaleString('es-CO')}</td>
                  </tr>
                  <tr><td colSpan={2}><div className="line"></div></td></tr>
                </>
              )}
              <tr className="bold" style={{ fontSize: '15px' }}>
                <td>TOTAL:</td>
                <td className="right">${venta.total.toLocaleString('es-CO')}</td>
              </tr>
              <tr>
                <td>Método de Pago:</td>
                <td className="right">{labelMetodoPagoTirilla(venta.metodoPago)}</td>
              </tr>
              {venta.metodoPago.toLowerCase() === 'efectivo' && (
                <>
                  <tr>
                    <td>Efectivo recibido:</td>
                    <td className="right">${(venta.efectivoRecibido || 0).toLocaleString('es-CO')}</td>
                  </tr>
                  <tr className="bold">
                    <td>Cambio:</td>
                    <td className="right">${(venta.cambio || 0).toLocaleString('es-CO')}</td>
                  </tr>
                </>
              )}
              {venta.metodoPago.toLowerCase() === 'mixto' && venta.pagoMixto && (
                <>
                  <tr>
                    <td style={{ textTransform: 'capitalize' }}>{venta.pagoMixto.metodo1}:</td>
                    <td className="right">${venta.pagoMixto.monto1.toLocaleString('es-CO')}</td>
                  </tr>
                  <tr>
                    <td style={{ textTransform: 'capitalize' }}>{venta.pagoMixto.metodo2}:</td>
                    <td className="right">${venta.pagoMixto.monto2.toLocaleString('es-CO')}</td>
                  </tr>
                  {(venta.cambio || 0) > 0 && (
                    <tr className="bold">
                      <td>Cambio:</td>
                      <td className="right">${(venta.cambio || 0).toLocaleString('es-CO')}</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="double-line"></div>

        {/* Footer */}
        <div className="center spacing" style={{ fontSize: '11px' }}>
          {config.mensajeTirillaArriba && (
            <div className="bold" style={{ marginBottom: '8px' }}>{config.mensajeTirillaArriba}</div>
          )}
          
          {config.eslogan && (
            <div style={{ fontStyle: 'italic', marginBottom: '8px' }}>{config.eslogan}</div>
          )}
          
          {config.mensajeTirillaBajo && (
            <div className="bold">{config.mensajeTirillaBajo}</div>
          )}
          
          {config.facturaElectronica && (
            <div style={{ marginTop: '12px', fontSize: '9px' }}>
              {venta.contingencia && (
                <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: '4px' }}>
                  ⚠️ DOCUMENTO EN CONTINGENCIA — Pendiente de sincronización DIAN
                </div>
              )}
              {!venta.contingencia && venta.facturaEstado === 'SINCRONIZADA' && (
                <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '4px' }}>
                  ✓ Factura Electrónica Válida — Sincronizada con DIAN
                </div>
              )}
              <div>Este documento es una representación</div>
              <div>impresa de una factura electrónica</div>
              <div>generada y validada por la DIAN</div>
              {venta.folioElectronico && (
                <div style={{ marginTop: '4px' }}>Folio: {venta.folioElectronico}</div>
              )}
              {venta.cufe && (
                <div style={{ marginTop: '6px', wordBreak: 'break-all', fontSize: '8px' }}>
                  <div style={{ fontWeight: 'bold' }}>CUFE:</div>
                  <div>{venta.cufe}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="line"></div>

        <div className="center" style={{ fontSize: '9px', marginTop: '8px' }}>
          <div className="bold" style={{ fontSize: '10px', marginBottom: '4px' }}>
            CODEC POS v2.0
          </div>
          <div style={{ marginBottom: '2px' }}>
            Software POS - Facturación {config.facturaElectronica ? 'Electrónica' : 'Tradicional'}
          </div>
          <div className="line" style={{ margin: '6px 0', opacity: 0.3 }}></div>
          <div style={{ marginBottom: '2px' }}>
            Desarrollado por Codec Studio
          </div>
          <div style={{ marginBottom: '2px' }}>
            Diseño de software personalizado
          </div>
          <div style={{ marginBottom: '2px' }}>
            Bogotá, Colombia
          </div>
          <div className="bold" style={{ fontSize: '11px', marginTop: '3px' }}>
            📞 3238646844
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button
          onClick={handlePrint}
          disabled={imprimiendo}
          className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-60"
        >
          {imprimiendo
            ? <div className="w-5 h-5 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Printer className="w-5 h-5 mr-2" />
          }
          {imprimiendo ? 'Imprimiendo…' : 'Imprimir'}
        </Button>
        
        <Button
          onClick={handleDownloadPDF}
          className="rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
        >
          <Download className="w-5 h-5 mr-2" />
          Descargar
        </Button>
      </div>

      {/* Compartir */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Button
          onClick={() => setPanelCompartir(panelCompartir === 'whatsapp' ? null : 'whatsapp')}
          variant="outline"
          className={`rounded-2xl ${panelCompartir === 'whatsapp' ? 'border-emerald-500' : ''}`}
        >
          <MessageCircle className="w-5 h-5 mr-2 text-emerald-500" />
          WhatsApp
        </Button>
        <Button
          onClick={() => setPanelCompartir(panelCompartir === 'email' ? null : 'email')}
          variant="outline"
          className={`rounded-2xl ${panelCompartir === 'email' ? 'border-sky-500' : ''}`}
        >
          <Mail className="w-5 h-5 mr-2 text-sky-500" />
          Correo
        </Button>
      </div>

      {panelCompartir === 'whatsapp' && (
        <div className="flex gap-2 mt-3">
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="300 000 0000"
            className={`flex-1 min-w-0 h-11 rounded-xl px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-gray-300'}`}
          />
          <button
            onClick={handleWhatsApp}
            disabled={enviando === 'whatsapp'}
            className="shrink-0 w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center disabled:opacity-60"
          >
            {enviando === 'whatsapp' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
      )}

      {panelCompartir === 'email' && (
        <div className="flex gap-2 mt-3">
          <input
            type="email"
            value={emailDestino}
            onChange={(e) => setEmailDestino(e.target.value)}
            placeholder="cliente@correo.com"
            className={`flex-1 min-w-0 h-11 rounded-xl px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-gray-300'}`}
          />
          <button
            onClick={handleEmail}
            disabled={enviando === 'email'}
            className="shrink-0 w-11 h-11 rounded-xl bg-sky-600 flex items-center justify-center disabled:opacity-60"
          >
            {enviando === 'email' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
      )}

      {panelCompartir && (
        <p className={`text-[10px] leading-snug mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          El PDF se descarga automáticamente y {panelCompartir === 'whatsapp' ? 'WhatsApp' : 'tu correo'} se abre con el mensaje listo — solo falta adjuntar el archivo descargado.
        </p>
      )}
    </>
  );
}

// Memoizado: la venta ya facturada no cambia mientras el modal está abierto,
// así que evita re-renderizar el recibo completo (tabla de ítems, PDF/print
// handlers) cuando el padre (POSPageNew) re-renderiza por otro motivo.
export const TicketReceipt = memo(TicketReceiptComponent);
