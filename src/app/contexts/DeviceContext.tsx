/**
 * DeviceContext — Estado global de periféricos detectados.
 * Proporciona detección en tiempo real vía USB y persistencia de defaults por rol.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { deviceManager, type DispositivoDetectado } from '../lib/deviceManager';
import {
  getAllDefaults,
  getDefaultForTipo,
  setDefaultForTipo,
  type TipoDispositivo,
  type DeviceRoleAssignment,
} from '../lib/deviceRoles';

interface DeviceContextValue {
  devices: DispositivoDetectado[];
  scanning: boolean;
  newDeviceIds: Set<string>;
  scan: () => Promise<void>;
  getDefault: (tipo: TipoDispositivo) => DeviceRoleAssignment | null;
  setDefault: (tipo: TipoDispositivo, device: DispositivoDetectado | null) => void;
  setUserType: (deviceId: string, tipo: TipoDispositivo) => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<DispositivoDetectado[]>([]);
  const [scanning, setScanning] = useState(false);
  const [newDeviceIds, setNewDeviceIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_defaults, setDefaults] = useState(() => getAllDefaults());

  const knownIds = useRef(new Set<string>());
  const initialScanDone = useRef(false);

  const markNewDevices = useCallback((devs: DispositivoDetectado[]) => {
    if (!initialScanDone.current) return;
    const added = devs.filter(d => !knownIds.current.has(d.id));
    if (added.length === 0) return;
    added.forEach(d => {
      knownIds.current.add(d.id);
      setNewDeviceIds(prev => new Set([...prev, d.id]));
      setTimeout(() => {
        setNewDeviceIds(prev => { const n = new Set(prev); n.delete(d.id); return n; });
      }, 30_000);
    });
  }, []);

  useEffect(() => {
    const unsub = deviceManager.subscribe((devs) => {
      markNewDevices(devs);
      setDevices(devs);
    });

    // 🛡️ FIX: el escaneo inicial de hardware (USB/seriales/impresoras) se
    // difiere un instante para no competir con el primer render de la
    // pantalla de login por CPU/IPC — antes corría de inmediato al montar
    // la app (login incluido) y en equipos con enumeración USB lenta dejaba
    // el formulario visible pero sin responder al teclado por varios
    // segundos. El escaneo real de dispositivos no es urgente en el login.
    const timer = setTimeout(() => {
      setScanning(true);
      deviceManager.scanDevices(true).then((result) => {
        knownIds.current = new Set(result.map(d => d.id));
        initialScanDone.current = true;
        setScanning(false);
      });
    }, 800);

    const cleanupElectron = deviceManager.initElectronEvents({
      onConnect: (payload) => {
        toast.info(`USB conectado (${payload.vendorId}:${payload.productId}) — detectando periférico...`, {
          duration: 3000,
        });
      },
      onDisconnect: (payload) => {
        toast.warning(`USB desconectado (${payload.vendorId}:${payload.productId})`, {
          duration: 2500,
        });
        deviceManager.scanDevices(true);
      },
      onListUpdated: () => {
        setScanning(true);
        deviceManager.scanDevices(true).finally(() => setScanning(false));
      },
    });

    return () => {
      clearTimeout(timer);
      unsub();
      cleanupElectron?.();
    };
  }, [markNewDevices]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      await deviceManager.scanDevices();
    } finally {
      setScanning(false);
    }
  }, []);

  const getDefault = useCallback((tipo: TipoDispositivo) => {
    return getDefaultForTipo(tipo);
  }, []);

  const setDefault = useCallback((tipo: TipoDispositivo, device: DispositivoDetectado | null) => {
    const assignment = device
      ? { deviceId: device.id, nombre: device.nombre, puerto: device.puerto }
      : null;
    setDefaultForTipo(tipo, assignment);
    setDefaults(getAllDefaults());
    if (device) {
      toast.success(`${device.nombre} establecido como predeterminado para ${tipo}`);
    }
  }, []);

  const setUserType = useCallback((deviceId: string, tipo: TipoDispositivo) => {
    deviceManager.setUserTypeOverride(deviceId, tipo);
  }, []);

  return (
    <DeviceContext.Provider value={{ devices, scanning, newDeviceIds, scan, getDefault, setDefault, setUserType }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevices debe usarse dentro de <DeviceProvider>');
  return ctx;
}
