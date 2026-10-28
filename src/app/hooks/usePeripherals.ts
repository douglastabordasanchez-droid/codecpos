import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useBasculaWeb } from '../../pwa/hooks/useBasculaWeb';
import {
  conectarBascula as conectarBascula_,
  desconectarBascula as desconectarBascula_,
  estadoBascula,
  tararBascula,
} from '../../pwa/lib/basculaWeb';

// Hook para Scanner de Códigos de Barras (USB HID)
// Los scanners envían caracteres muy rápido (< 50 ms entre teclas) y terminan con Enter.
// Un humano tipea más lento — si el intervalo supera SCANNER_CHAR_MS se descarta el buffer.
//
// IMPORTANTE: usa un ref interno para el callback, de modo que el listener se registra una
// sola vez (deps vacíos) y siempre llama a la versión más reciente de onScan.
// Esto evita el stale-closure cuando onScan captura estado React (e.g. lista de productos).
export function useBarcodeScanner(onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // siempre actualizado, sin re-registrar el listener

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;
    const SCANNER_CHAR_MS = 60;
    const MIN_CODE_LEN = 3;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

      const now = Date.now();

      if (e.key === 'Enter') {
        if (buffer.length >= MIN_CODE_LEN) {
          onScanRef.current(buffer);
        }
        buffer = '';
        lastKeyTime = 0;
        return;
      }

      if (e.key.length !== 1) return;

      const delta = now - lastKeyTime;

      if (lastKeyTime > 0 && delta > SCANNER_CHAR_MS) {
        buffer = '';
      }

      buffer += e.key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // sin deps: el listener se monta una vez y usa el ref para el callback
}

// Hook para Báscula por Puerto Serial (Web Serial API)
// Usa la misma báscula que la web (basculaWeb.ts): cualquier chip USB-serie o
// COM, velocidad y comando configurables, tara real y reconexión sola al
// volver a abrir la pantalla. No trae el peso: la caja solo se redibuja si la
// báscula se conecta o se desconecta (no con cada lectura); el peso lo muestran
// ModalPesaje y PesoEnVivo, que son pequeños.
export function useSerialScale() {
  const estado = useBasculaWeb((e) => ({ conectada: e.conectada }));

  const conectarBascula = async () => {
    try {
      await conectarBascula_();
      const { conectada, error } = estadoBascula();
      // Conectada pero sin peso: el puerto abrió, la báscula no responde.
      if (conectada && error) toast.warning('La báscula no está mandando el peso', { description: error });
      else if (conectada) toast.success('Báscula conectada correctamente');
    } catch (error: any) {
      console.error('Error conectando báscula:', error);
      toast.error('No se pudo conectar la báscula', {
        description: error?.message?.includes('Failed to open')
          ? 'El puerto está ocupado por otro programa o la báscula se desconectó.'
          : error?.message,
      });
    }
  };

  const desconectarBascula = async () => {
    await desconectarBascula_(false);
    toast.info('Báscula desconectada');
  };

  const tarar = () => {
    tararBascula();
    toast.success('Báscula tarada');
  };

  return {
    conectado: estado.conectada,
    conectarBascula,
    desconectarBascula,
    tarar
  };
}

// Hook para Impresora Térmica ESC/POS
export function useThermalPrinter() {
  const [impresora, setImpresora] = useState<any>(null);
  const [conectado, setConectado] = useState(false);

  const conectarImpresora = async () => {
    try {
      if (!('serial' in navigator)) {
        toast.error('Tu navegador no soporta Web Serial API. Usa Chrome o Edge.');
        return;
      }

      const port = await (navigator as any).serial.requestPort();
      await port.open({ 
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      setImpresora(port);
      setConectado(true);
      toast.success('Impresora conectada correctamente');
    } catch (error) {
      console.error('Error conectando impresora:', error);
      toast.error('No se pudo conectar la impresora');
    }
  };

  const desconectarImpresora = async () => {
    if (impresora) {
      try {
        await impresora.close();
        setImpresora(null);
        setConectado(false);
        toast.info('Impresora desconectada');
      } catch (error) {
        console.error('Error desconectando impresora:', error);
      }
    }
  };

  const imprimirTicket = async (ticketData: any) => {
    if (!impresora) {
      toast.error('Impresora no conectada');
      return;
    }

    try {
      const writer = impresora.writable.getWriter();

      // Comandos ESC/POS
      const ESC = 0x1B;
      const GS = 0x1D;
      
      // Inicializar impresora
      await writer.write(new Uint8Array([ESC, 0x40]));
      
      // Alinear al centro
      await writer.write(new Uint8Array([ESC, 0x61, 0x01]));
      
      // Texto en negrita
      await writer.write(new Uint8Array([ESC, 0x45, 0x01]));
      
      // Enviar texto
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(ticketData.header + '\n'));
      
      // Desactivar negrita
      await writer.write(new Uint8Array([ESC, 0x45, 0x00]));
      
      // Alinear a la izquierda
      await writer.write(new Uint8Array([ESC, 0x61, 0x00]));
      
      // Contenido del ticket
      await writer.write(encoder.encode(ticketData.content));
      
      // Cortar papel
      await writer.write(new Uint8Array([GS, 0x56, 0x00]));
      
      writer.releaseLock();
      toast.success('Ticket impreso correctamente');
    } catch (error) {
      console.error('Error imprimiendo ticket:', error);
      toast.error('Error al imprimir el ticket');
    }
  };

  return {
    conectado,
    conectarImpresora,
    desconectarImpresora,
    imprimirTicket
  };
}

// Hook para Cajón Monedero (conectado a impresora)
export function useCashDrawer(impresora: any) {
  const [conectado, setConectado] = useState(false);

  // Verificar si el cajón está disponible (depende de la impresora)
  useEffect(() => {
    const estaConectado = Boolean(impresora?.conectado);
    setConectado(estaConectado);
  }, [impresora?.conectado]);

  const abrirCajon = async () => {
    if (!impresora || !impresora.conectado) {
      toast.error('Impresora no conectada (el cajón se abre a través de la impresora)');
      return;
    }

    try {
      const writer = impresora.writable.getWriter();
      
      // Comando ESC/POS para abrir cajón (Pin 2)
      // Decimal: 27, 112, 0, 25, 250
      // Hex: 1B 70 00 19 FA
      const ESC = 0x1B;
      await writer.write(new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xFA]));
      
      writer.releaseLock();
      toast.success('🔓 Cajón monedero abierto', { 
        description: 'Recibe el efectivo del cliente',
        duration: 3000 
      });
    } catch (error) {
      console.error('Error abriendo cajón:', error);
      toast.error('Error al abrir el cajón monedero');
    }
  };

  return { 
    conectado, 
    abrirCajon 
  };
}

// Hook para Display Cliente (Pantalla secundaria o Puerto Serial)
export function useCustomerDisplay() {
  const [display, setDisplay] = useState<SerialPort | null>(null);
  const [conectado, setConectado] = useState(false);

  const conectarDisplay = async () => {
    try {
      if (!('serial' in navigator)) {
        toast.error('Tu navegador no soporta Web Serial API. Usa Chrome o Edge.');
        return;
      }

      const port = await (navigator as any).serial.requestPort();
      await port.open({ 
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      setDisplay(port);
      setConectado(true);
      toast.success('Display de cliente conectado');
    } catch (error) {
      console.error('Error conectando display:', error);
      toast.error('No se pudo conectar el display');
    }
  };

  const mostrarTotal = async (total: number) => {
    if (!display) return;

    try {
      const writer = display.writable.getWriter();
      const encoder = new TextEncoder();
      
      // Limpiar display (depende del modelo)
      await writer.write(new Uint8Array([0x0C]));
      
      // Mostrar total
      await writer.write(encoder.encode(`TOTAL: $${total.toLocaleString('es-CO')}\n`));
      
      writer.releaseLock();
    } catch (error) {
      console.error('Error mostrando en display:', error);
    }
  };

  return {
    conectado,
    conectarDisplay,
    mostrarTotal
  };
}