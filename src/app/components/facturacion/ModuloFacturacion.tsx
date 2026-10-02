/**
 * Módulo de Facturación (electrónica) — pantalla principal, compartida por
 * la web y Electron. Es un módulo de pago aparte: quien lo monta ya comprobó
 * la licencia (ModuloPOS.FACTURACION_DIAN).
 *
 * Dos áreas:
 *   · Facturas de venta     — lo que el negocio emitió (tabla estilo Siigo).
 *   · Recepción y causación — XML de proveedores, traído de Codec Document.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilePlus2, FileClock, FileInput, Users, Package, ShieldCheck, ShieldAlert, Receipt, Inbox, Settings2 } from 'lucide-react';
import { listarPerfilesFiscales } from '../../lib/supabase/fiscalProfileService';
import type { FiscalProfile } from '../../lib/dian/types';
import { FacturasEmitidas } from './FacturasEmitidas';
import { RecepcionCausacion } from './RecepcionCausacion';
import { CertificadoDigital } from './CertificadoDigital';
import { PruebaHabilitacion } from './PruebaHabilitacion';
import { AsistenteConfiguracionDian } from '../settings/AsistenteConfiguracionDian';
import type { OperadorFacturacion } from './comunes';

export type DestinoFacturacion = 'vender' | 'terceros' | 'productos';

type Pestana = 'ventas' | 'recepcion';

interface Props {
  clienteId: string;
  operador: OperadorFacturacion;
  soloLectura?: boolean;
  /** Lleva a otras pantallas de la app; cada plataforma tiene sus propias rutas. */
  onIr: (destino: DestinoFacturacion) => void;
}

export function ModuloFacturacion({ clienteId, operador, soloLectura, onIr }: Props) {
  const [pestana, setPestana] = useState<Pestana>('ventas');
  const [perfil, setPerfil] = useState<FiscalProfile | null | undefined>(undefined);
  const [recarga, setRecarga] = useState(0);
  const [asistente, setAsistente] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarPerfilesFiscales(clienteId)
      // El activo; si todavía no hay ninguno activo, el más reciente (en configuración).
      .then((perfiles) => { if (!cancelado) setPerfil(perfiles.find((p) => p.activo) || perfiles[0] || null); })
      .catch(() => { if (!cancelado) setPerfil(null); });
    return () => { cancelado = true; };
  }, [clienteId, recarga]);

  const accesos = [
    {
      Icon: FilePlus2, titulo: 'Crear factura electrónica', detalle: 'Se emite y firma al cobrar una venta',
      accion: () => onIr('vender'),
    },
    {
      Icon: FileClock, titulo: 'Eventos en factura', detalle: 'Notas crédito y débito',
      accion: () => {
        setPestana('ventas');
        toast.info('Elige una factura aprobada', { description: 'En la columna Acciones, usa el botón de nota de ajuste para emitir una nota crédito o débito.' });
      },
    },
    {
      Icon: FileInput, titulo: 'Documento soporte', detalle: 'Sube y causa XML de compras',
      accion: () => setPestana('recepcion'),
    },
    { Icon: Users, titulo: 'Terceros', detalle: 'Proveedores del negocio', accion: () => onIr('terceros') },
    { Icon: Package, titulo: 'Productos / Servicios', detalle: 'Catálogo e inventario', accion: () => onIr('productos') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Facturación</h1>
          <p className="text-slate-400 text-sm">Facturación electrónica DIAN: ventas emitidas y compras recibidas</p>
        </div>
        {perfil !== undefined && (
          <div className="flex items-center gap-2 bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl px-3 py-2 max-w-md">
            {perfil ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-white text-xs font-bold truncate max-w-[220px]">{perfil.nombreORazonSocial}</p>
                  <p className="text-slate-500 text-[11px]">
                    NIT {perfil.nit || '—'} · {!perfil.activo ? 'En configuración — termina el asistente' : perfil.ambiente === 'produccion' ? 'Producción' : 'Habilitación (pruebas)'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-slate-400 text-xs">Sin perfil fiscal: configura los datos del negocio y su numeración DIAN.</p>
              </>
            )}
            {!soloLectura && (
              <button onClick={() => setAsistente(true)} className="h-8 px-2.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 shrink-0">
                <Settings2 className="w-3.5 h-3.5" /> {perfil ? 'Configurar' : 'Crear perfil'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {accesos.map(({ Icon, titulo, detalle, accion }) => (
          <button
            key={titulo}
            onClick={accion}
            className="text-left bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center mb-3">
              <Icon className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-white text-sm font-bold leading-tight">{titulo}</p>
            <p className="text-slate-500 text-xs mt-0.5">{detalle}</p>
          </button>
        ))}
      </div>

      {perfil?.id && <CertificadoDigital clienteId={clienteId} perfilFiscalId={perfil.id} soloLectura={soloLectura} />}
      {perfil?.id && perfil.activo && perfil.ambiente !== 'produccion' && !soloLectura && (
        <PruebaHabilitacion perfil={perfil} clienteId={clienteId} onTerminado={() => { setPestana('ventas'); setRecarga((n) => n + 1); }} />
      )}

      <div className="flex gap-2">
        {([
          ['ventas', 'Facturas de venta', Receipt],
          ['recepcion', 'Recepción y causación', Inbox],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-2 ${
              pestana === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {asistente && (
        <AsistenteConfiguracionDian
          clienteId={clienteId}
          perfilExistente={perfil || null}
          // El asistente tiene sus dos temas; se le pasa el que esté activo
          // (tanto la web como Electron marcan <html class="dark">).
          darkMode={document.documentElement.classList.contains('dark')}
          onClose={() => { setAsistente(false); setRecarga((n) => n + 1); }}
          onGuardado={() => { setAsistente(false); setRecarga((n) => n + 1); }}
        />
      )}

      {pestana === 'ventas'
        ? <FacturasEmitidas clienteId={clienteId} recarga={recarga} />
        : <RecepcionCausacion clienteId={clienteId} operador={operador} nitPropio={perfil?.nit || ''} soloLectura={soloLectura} />}
    </div>
  );
}
