/**
 * Entrega de la factura ya validada por la DIAN al cliente final —
 * desacoplado por completo de la facturación en sí: primero debe existir
 * una FacturaElectronicaDian en estado 'accepted', después se entrega.
 *
 *   DIAN → Factura validada → DeliveryService ├── WhatsApp └── Email
 *
 * Sin credenciales de una API de WhatsApp Business configuradas, se usa el
 * mismo mecanismo ya probado en esta app (src/pwa/lib/compartirFactura.ts):
 * abrir wa.me con el mensaje precargado — cero configuración, funciona hoy.
 * Cuando el negocio configure una API real (Meta Cloud API, Twilio, etc.),
 * basta con implementar otra clase que cumpla la misma interfaz — el resto
 * del sistema no cambia.
 */

import type { FacturaElectronicaDian } from './types';

export interface InvoiceDeliveryProvider {
  sendWhatsApp(invoice: FacturaElectronicaDian, destination: string): Promise<void>;
  sendEmail(invoice: FacturaElectronicaDian, destination: string): Promise<void>;
}

/** Entrega manual sin credenciales: abre WhatsApp Web / el cliente de correo
 * por defecto con el mensaje precargado. El usuario adjunta el PDF/XML a
 * mano. Es el proveedor por defecto — siempre funciona, sin configuración. */
export class ManualDeliveryProvider implements InvoiceDeliveryProvider {
  async sendWhatsApp(invoice: FacturaElectronicaDian, destination: string): Promise<void> {
    const mensaje = encodeURIComponent(
      `Factura electrónica ${invoice.numeroFactura} · Total: $${invoice.total.toLocaleString('es-CO')}` +
      (invoice.cufe ? `\nCUFE: ${invoice.cufe}` : '')
    );
    const numero = destination.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${numero}?text=${mensaje}`, '_blank');
  }

  async sendEmail(invoice: FacturaElectronicaDian, destination: string): Promise<void> {
    const asunto = encodeURIComponent(`Factura electrónica ${invoice.numeroFactura}`);
    const cuerpo = encodeURIComponent(
      `Adjunto la factura electrónica ${invoice.numeroFactura} por $${invoice.total.toLocaleString('es-CO')}.` +
      (invoice.cufe ? `\nCUFE: ${invoice.cufe}` : '')
    );
    window.open(`mailto:${destination}?subject=${asunto}&body=${cuerpo}`, '_blank');
  }
}

/**
 * ⚠️ CONFIGURACIÓN PENDIENTE — proveedor real de WhatsApp Business API.
 * No hay credenciales configuradas todavía (Meta Cloud API, Twilio u otro).
 * Cuando el negocio las tenga, completar apiUrl/token aquí — la interfaz ya
 * está lista, el resto del sistema no necesita cambios.
 */
export class WhatsAppApiDeliveryProvider implements InvoiceDeliveryProvider {
  constructor(private readonly config: { apiUrl?: string; token?: string } = {}) {}

  async sendWhatsApp(_invoice: FacturaElectronicaDian, _destination: string): Promise<void> {
    if (!this.config.apiUrl || !this.config.token) {
      throw new Error('WhatsApp Business API no configurada — faltan apiUrl y token. Ver Configuración → Facturación Electrónica.');
    }
    throw new Error('Envío automático por WhatsApp Business API pendiente de implementar una vez haya credenciales reales.');
  }

  async sendEmail(): Promise<void> {
    throw new Error('Este proveedor es solo para WhatsApp — usar un InvoiceDeliveryProvider de correo aparte.');
  }
}
