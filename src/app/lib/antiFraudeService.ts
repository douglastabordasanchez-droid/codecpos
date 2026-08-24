/**
 * Sistema Anti-Fraude para CodecPOS v2.0
 * Gestiona confirmaciones de pagos digitales (Nequi/Daviplata)
 * y notifica a Jessica cuando el dinero llega a la cuenta de Eduardo
 */

import { dbManager, STORES } from './indexedDB';
import { storeEvents } from './electronStore';

export interface ConfirmacionPago {
  id: string;
  ventaId: string; // FAC000007
  metodoPago: 'nequi' | 'daviplata' | 'transferencia' | 'bancolombia';
  monto: number;
  numeroTransaccion?: string;
  estado: 'pendiente' | 'confirmado' | 'rechazado';
  timestamp: number;
  confirmedAt?: number;
  cuentaDestino?: string;
  mensajeExterno?: string; // Mensaje del ping externo
}

/**
 * Servicio de Anti-Fraude
 */
class AntiFraudeService {
  private escuchaActiva: boolean = false;
  private intervalId?: NodeJS.Timeout;

  /**
   * Registrar una transacción pendiente de confirmación
   */
  async registrarTransaccionPendiente(
    ventaId: string,
    metodoPago: 'nequi' | 'daviplata' | 'transferencia' | 'bancolombia',
    monto: number
  ): Promise<string> {
    const db = await dbManager.ensureDB();
    
    const confirmacion: ConfirmacionPago = {
      id: `CONF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ventaId,
      metodoPago,
      monto,
      estado: 'pendiente',
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIRMACIONES_PAGO], 'readwrite');
      const store = transaction.objectStore(STORES.CONFIRMACIONES_PAGO);
      const request = store.add(confirmacion);

      request.onsuccess = () => {
        console.log(`🔐 Anti-Fraude: Transacción ${ventaId} registrada como PENDIENTE`);
        storeEvents.emit('antifraude:pendiente', confirmacion);
        resolve(confirmacion.id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Confirmar una transacción (llamado por ping externo o manual)
   */
  async confirmarTransaccion(
    ventaId: string,
    numeroTransaccion?: string,
    mensajeExterno?: string
  ): Promise<void> {
    const db = await dbManager.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIRMACIONES_PAGO], 'readwrite');
      const store = transaction.objectStore(STORES.CONFIRMACIONES_PAGO);
      const index = store.index('ventaId');
      const request = index.get(ventaId);

      request.onsuccess = () => {
        const confirmacion = request.result as ConfirmacionPago;
        if (confirmacion) {
          const actualizada: ConfirmacionPago = {
            ...confirmacion,
            estado: 'confirmado',
            confirmedAt: Date.now(),
            numeroTransaccion,
            mensajeExterno
          };

          const updateRequest = store.put(actualizada);
          updateRequest.onsuccess = () => {
            console.log(`✅ Anti-Fraude: Transacción ${ventaId} CONFIRMADA`);
            
            // Emitir notificación sonora y visual
            storeEvents.emit('antifraude:confirmado', actualizada);
            this.notificarCajera(actualizada);
            
            resolve();
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error(`Transacción ${ventaId} no encontrada`));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Notificar a Jessica con sonido y alerta visual
   */
  private notificarCajera(confirmacion: ConfirmacionPago): void {
    // Sonido de notificación
    this.reproducirSonido();

    // Emitir evento para Toast notification
    const mensaje = `💰 ¡Pago confirmado! ${confirmacion.metodoPago.toUpperCase()} - $${confirmacion.monto.toLocaleString('es-CO')}`;
    
    storeEvents.emit('notificacion:mostrar', {
      tipo: 'success',
      titulo: '✅ Dinero Recibido',
      mensaje,
      ventaId: confirmacion.ventaId,
      duracion: 10000 // 10 segundos
    });
  }

  /**
   * Reproducir sonido de notificación
   */
  private reproducirSonido(): void {
    try {
      // Crear AudioContext para sonido de notificación
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = 800; // Frecuencia agradable
      gainNode.gain.value = 0.3; // Volumen moderado

      oscillator.start();
      setTimeout(() => oscillator.stop(), 200); // Beep corto
      
      // Segundo beep
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 1000;
        gain2.gain.value = 0.3;
        osc2.start();
        setTimeout(() => osc2.stop(), 200);
      }, 250);
    } catch (error) {
      console.warn('No se pudo reproducir sonido de notificación:', error);
    }
  }

  /**
   * Obtener transacciones pendientes
   */
  async obtenerTransaccionesPendientes(): Promise<ConfirmacionPago[]> {
    const db = await dbManager.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIRMACIONES_PAGO], 'readonly');
      const store = transaction.objectStore(STORES.CONFIRMACIONES_PAGO);
      const request = store.getAll();

      request.onsuccess = () => {
        const todas = request.result as ConfirmacionPago[];
        const pendientes = todas.filter(t => t.estado === 'pendiente');
        resolve(pendientes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener historial de confirmaciones
   */
  async obtenerHistorialConfirmaciones(dias: number = 7): Promise<ConfirmacionPago[]> {
    const db = await dbManager.ensureDB();
    const hace7Dias = Date.now() - (dias * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIRMACIONES_PAGO], 'readonly');
      const store = transaction.objectStore(STORES.CONFIRMACIONES_PAGO);
      const index = store.index('timestamp');
      const range = IDBKeyRange.lowerBound(hace7Dias);
      const request = index.getAll(range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Iniciar escucha de pings externos (preparado para App Espejo)
   */
  iniciarEscucha(): void {
    if (this.escuchaActiva) return;

    console.log('🔊 Anti-Fraude: Sistema de escucha activado');
    this.escuchaActiva = true;

    // Simular polling de endpoint local (preparado para integración futura)
    this.intervalId = setInterval(async () => {
      try {
        // Aquí se conectará la App Espejo del dueño
        const response = await fetch('http://localhost:3001/confirmaciones-pendientes', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => null);

        if (response && response.ok) {
          const confirmaciones = await response.json();
          for (const conf of confirmaciones) {
            await this.confirmarTransaccion(
              conf.ventaId,
              conf.numeroTransaccion,
              conf.mensaje
            );
          }
        }
      } catch (error) {
        // Silencioso: el servidor puede no estar activo
      }
    }, 5000); // Cada 5 segundos
  }

  /**
   * Detener escucha
   */
  detenerEscucha(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.escuchaActiva = false;
    console.log('🔇 Anti-Fraude: Sistema de escucha desactivado');
  }

  /**
   * Rechazar una transacción
   */
  async rechazarTransaccion(ventaId: string, motivo?: string): Promise<void> {
    const db = await dbManager.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIRMACIONES_PAGO], 'readwrite');
      const store = transaction.objectStore(STORES.CONFIRMACIONES_PAGO);
      const index = store.index('ventaId');
      const request = index.get(ventaId);

      request.onsuccess = () => {
        const confirmacion = request.result as ConfirmacionPago;
        if (confirmacion) {
          const actualizada: ConfirmacionPago = {
            ...confirmacion,
            estado: 'rechazado',
            mensajeExterno: motivo
          };

          const updateRequest = store.put(actualizada);
          updateRequest.onsuccess = () => {
            console.log(`❌ Anti-Fraude: Transacción ${ventaId} RECHAZADA`);
            storeEvents.emit('antifraude:rechazado', actualizada);
            resolve();
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error(`Transacción ${ventaId} no encontrada`));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Exportar instancia singleton
export const antiFraudeService = new AntiFraudeService();
