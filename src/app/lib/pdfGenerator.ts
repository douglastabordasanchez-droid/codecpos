/**
 * CODEC POS v2.0 - Generador de PDFs Profesionales
 * ✅ Facturas con diseño profesional
 * ✅ Reportes de ventas
 * ✅ Reportes de gastos
 * ✅ Compatible con logos y QR codes
 * ✅ Envío por WhatsApp y Email
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConfigEmpresa {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string;
  telefono: string;
  email: string;
  ciudad: string;
  logoUrl?: string;
}

interface Venta {
  numeroFactura: string;
  fecha: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
  }>;
  subtotal: number;
  iva: number;
  total: number;
  metodoPago: string;
  cajero: string;
  cliente?: string;
  mesa?: string;
  referencia_mesa?: string;
}

/**
 * Generar PDF de Factura Profesional
 */
export const generarFacturaPDF = async (venta: Venta, config: ConfigEmpresa): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // ==================== HEADER ====================
  
  // Logo (si existe)
  if (config.logoUrl) {
    try {
      // Detectar tipo de imagen
      let imageType = 'PNG';
      if (config.logoUrl.includes('data:image/jpeg') || config.logoUrl.includes('.jpg') || config.logoUrl.includes('.jpeg')) {
        imageType = 'JPEG';
      } else if (config.logoUrl.includes('data:image/png') || config.logoUrl.includes('.png')) {
        imageType = 'PNG';
      }
      
      doc.addImage(config.logoUrl, imageType, 15, yPos, 30, 30);
    } catch (error) {
      console.log('❌ No se pudo cargar el logo:', error);
      // Continuar sin logo
    }
  }

  // Información de la empresa
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(config.nombreComercial || 'CODEC POS', config.logoUrl ? 50 : 15, yPos + 5);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(config.razonSocial || '', config.logoUrl ? 50 : 15, yPos + 12);
  doc.text(`NIT: ${config.nit || 'N/A'}`, config.logoUrl ? 50 : 15, yPos + 18);
  doc.text(config.direccion || '', config.logoUrl ? 50 : 15, yPos + 24);
  doc.text(`Tel: ${config.telefono || 'N/A'}`, config.logoUrl ? 50 : 15, yPos + 30);

  // Cuadro de factura
  const boxX = pageWidth - 70;
  doc.setDrawColor(34, 197, 94); // Verde
  doc.setLineWidth(0.5);
  doc.rect(boxX, yPos, 55, 25);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA DE VENTA', boxX + 27.5, yPos + 7, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`No. ${venta.numeroFactura}`, boxX + 27.5, yPos + 13, { align: 'center' });
  
  try {
    const fechaFormateada = format(new Date(venta.fecha), 'dd MMM yyyy', { locale: es });
    doc.text(fechaFormateada, boxX + 27.5, yPos + 19, { align: 'center' });
  } catch {
    doc.text(venta.fecha.substring(0, 10), boxX + 27.5, yPos + 19, { align: 'center' });
  }

  yPos += 45;

  // ==================== UBICACIÓN MESA (si aplica) ====================
  const mesaDisplayPDF = venta.referencia_mesa
    || (venta.mesa && venta.mesa !== 'General' && venta.mesa !== 'general' ? venta.mesa : undefined);
  if (mesaDisplayPDF) {
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(15, yPos, pageWidth - 30, 12, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`UBICACIÓN: ${mesaDisplayPDF}`, pageWidth / 2, yPos + 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    yPos += 18;
  }

  // ==================== DATOS DEL CLIENTE ====================
  doc.setFillColor(241, 245, 249);
  doc.rect(15, yPos, pageWidth - 30, 15, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL CLIENTE', 20, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${venta.cliente || 'Consumidor Final'}`, 20, yPos + 10);
  doc.text(`Método de Pago: ${venta.metodoPago.toUpperCase()}`, 120, yPos + 10);

  yPos += 25;

  // ==================== TABLA DE PRODUCTOS ====================
  const tableData = venta.items.map(item => [
    item.cantidad.toString(),
    item.nombre,
    `$${item.precio.toLocaleString('es-CO')}`,
    `$${item.subtotal.toLocaleString('es-CO')}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Cant.', 'Descripción', 'Precio Unit.', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [34, 197, 94], // Verde
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { halign: 'left', cellWidth: 90 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
    },
    margin: { left: 15, right: 15 },
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  yPos = finalY + 10;

  // ==================== TOTALES ====================
  const totalesX = pageWidth - 70;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  
  // Subtotal
  doc.text('Subtotal:', totalesX, yPos);
  doc.text(`$${venta.subtotal.toLocaleString('es-CO')}`, totalesX + 50, yPos, { align: 'right' });
  
  yPos += 7;
  
  // IVA
  if (venta.iva > 0) {
    doc.text('IVA (19%):', totalesX, yPos);
    doc.text(`$${venta.iva.toLocaleString('es-CO')}`, totalesX + 50, yPos, { align: 'right' });
    yPos += 7;
  }
  
  // Línea separadora
  doc.setDrawColor(200, 200, 200);
  doc.line(totalesX, yPos, totalesX + 50, yPos);
  yPos += 7;
  
  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TOTAL:', totalesX, yPos);
  doc.text(`$${venta.total.toLocaleString('es-CO')}`, totalesX + 50, yPos, { align: 'right' });

  yPos += 15;

  // ==================== PIE DE PÁGINA ====================
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  
  const textoAgradecimiento = '¡Gracias por su compra!';
  const textoWeb = 'Powered by CODEC POS v2.0 - Sistema Profesional de Punto de Venta';
  
  doc.text(textoAgradecimiento, pageWidth / 2, yPos, { align: 'center' });
  doc.text(textoWeb, pageWidth / 2, yPos + 5, { align: 'center' });
  
  // Cajero
  doc.text(`Atendido por: ${venta.cajero}`, 15, yPos + 10);

  // Convertir a Blob
  const pdfBlob = doc.output('blob');
  return pdfBlob;
};

/**
 * Descargar PDF de factura
 */
export const descargarFacturaPDF = async (venta: Venta, config: ConfigEmpresa) => {
  try {
    const blob = await generarFacturaPDF(venta, config);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Factura_${venta.numeroFactura}_${format(new Date(venta.fecha), 'yyyyMMdd')}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generando PDF:', error);
    throw error;
  }
};

/**
 * Generar PDF de Reporte de Ventas
 */
export const generarReporteVentasPDF = async (
  ventas: Venta[],
  config: ConfigEmpresa,
  fechaInicio: string,
  fechaFin: string
): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE VENTAS', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(config.nombreComercial || 'CODEC POS', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 7;
  
  doc.setFontSize(10);
  doc.text(
    `Período: ${format(new Date(fechaInicio), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(fechaFin), 'dd/MM/yyyy', { locale: es })}`,
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );

  yPos += 15;

  // Estadísticas generales
  const totalVentas = ventas.length;
  const totalIngresos = ventas.reduce((sum, v) => sum + v.total, 0);
  const totalIVA = ventas.reduce((sum, v) => sum + v.iva, 0);
  
  doc.setFillColor(241, 245, 249);
  doc.rect(15, yPos, pageWidth - 30, 20, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total de Ventas: ${totalVentas}`, 20, yPos + 7);
  doc.text(`Total Ingresos: $${totalIngresos.toLocaleString('es-CO')}`, pageWidth / 2, yPos + 7, { align: 'center' });
  doc.text(`Total IVA: $${totalIVA.toLocaleString('es-CO')}`, pageWidth - 20, yPos + 7, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 20, yPos + 14);

  yPos += 30;

  // Tabla de ventas
  const tableData = ventas.map(v => [
    v.numeroFactura,
    format(new Date(v.fecha), 'dd/MM/yyyy', { locale: es }),
    format(new Date(v.fecha), 'HH:mm', { locale: es }),
    v.cajero,
    v.metodoPago.toUpperCase(),
    `$${v.subtotal.toLocaleString('es-CO')}`,
    `$${v.iva.toLocaleString('es-CO')}`,
    `$${v.total.toLocaleString('es-CO')}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Factura', 'Fecha', 'Hora', 'Cajero', 'Método Pago', 'Subtotal', 'IVA', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 30 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'left', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 30 },
      6: { halign: 'right', cellWidth: 25 },
      7: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 15, right: 15 },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('CODEC POS v2.0 - Sistema Profesional de Punto de Venta', pageWidth / 2, finalY, { align: 'center' });

  const pdfBlob = doc.output('blob');
  return pdfBlob;
};

/**
 * Descargar PDF de reporte de ventas
 */
export const descargarReporteVentasPDF = async (
  ventas: Venta[],
  config: ConfigEmpresa,
  fechaInicio: string,
  fechaFin: string
) => {
  const blob = await generarReporteVentasPDF(ventas, config, fechaInicio, fechaFin);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Reporte_Ventas_${format(new Date(fechaInicio), 'yyyyMMdd')}_${format(new Date(fechaFin), 'yyyyMMdd')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * 📱 Enviar factura por WhatsApp
 */
export const enviarFacturaPorWhatsApp = async (
  venta: Venta,
  config: ConfigEmpresa,
  numeroTelefono: string
) => {
  try {
    // Generar PDF
    const blob = await generarFacturaPDF(venta, config);
    
    // Descargar primero
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Factura_${venta.numeroFactura}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    
    // Preparar mensaje para WhatsApp
    const mensaje = `Hola! 👋\n\n` +
      `Te envío la factura de tu compra:\n\n` +
      `🧾 *Factura:* ${venta.numeroFactura}\n` +
      `📅 *Fecha:* ${format(new Date(venta.fecha), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}\n` +
      `💰 *Total:* $${venta.total.toLocaleString('es-CO')}\n` +
      `💳 *Método de pago:* ${venta.metodoPago.toUpperCase()}\n\n` +
      `Gracias por tu compra! 🙏\n\n` +
      `_${config.nombreComercial || 'CODEC POS'}_`;
    
    // Limpiar número de teléfono (solo dígitos)
    const numeroLimpio = numeroTelefono.replace(/\D/g, '');
    
    // Abrir WhatsApp Web
    const urlWhatsApp = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlWhatsApp, '_blank');
    
    return true;
  } catch (error) {
    console.error('Error enviando por WhatsApp:', error);
    throw error;
  }
};

/**
 * 📧 Enviar factura por Email
 */
export const enviarFacturaPorEmail = async (
  venta: Venta,
  config: ConfigEmpresa,
  emailDestinatario: string
) => {
  try {
    // Generar PDF
    const blob = await generarFacturaPDF(venta, config);
    
    // Descargar primero
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Factura_${venta.numeroFactura}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    
    // Preparar email
    const asunto = `Factura ${venta.numeroFactura} - ${config.nombreComercial || 'CODEC POS'}`;
    const cuerpo = `Estimado cliente,\n\n` +
      `Adjunto encontrarás tu factura de compra:\n\n` +
      `Factura: ${venta.numeroFactura}\n` +
      `Fecha: ${format(new Date(venta.fecha), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}\n` +
      `Total: $${venta.total.toLocaleString('es-CO')}\n` +
      `Método de pago: ${venta.metodoPago.toUpperCase()}\n\n` +
      `Gracias por tu compra!\n\n` +
      `${config.nombreComercial || 'CODEC POS'}\n` +
      `${config.telefono || ''}\n` +
      `${config.email || ''}`;
    
    // Abrir cliente de email
    const mailtoLink = `mailto:${emailDestinatario}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo + '\n\n(Por favor adjunta el archivo PDF que se descargó automáticamente)')}`;
    window.location.href = mailtoLink;
    
    return true;
  } catch (error) {
    console.error('Error enviando por email:', error);
    throw error;
  }
};