/**
 * Módulo de Facturación (electrónica) — pantalla principal, compartida por
 * la web y Electron. Es un módulo de pago aparte: quien lo monta ya comprobó
 * la licencia (ModuloPOS.FACTURACION_DIAN).
 *
 * Dos áreas:
 *   · Facturas de venta     — lo que el negocio emitió (tabla estilo Siigo).
 *   · Notas crédito y débito — las notas de ajuste y su detalle.
 *   · Recepción y causación — XML de proveedores, traído de Codec Document.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Receipt, Inbox, Settings2, Contact, FileMinus2, FilePlus2, Users, Package } from 'lucide-react';
import { listarPerfilesFiscales } from '../../lib/supabase/fiscalProfileService';
import type { FiscalProfile } from '../../lib/dian/types';
import { FacturasEmitidas } from './FacturasEmitidas';
import { NotasAjuste } from './NotasAjuste';
import { RecepcionCausacion } from './RecepcionCausacion';
import { CertificadoDigital } from './CertificadoDigital';
import { PruebaHabilitacion } from './PruebaHabilitacion';
import { ClientesFacturacion } from './ClientesFacturacion';
import { ConfiguracionRetenciones } from './ConfiguracionRetenciones';
import { ConfiguracionCorreo } from './ConfiguracionCorreo';
import { AsistenteConfiguracionDian } from '../settings/AsistenteConfiguracionDian';
import type { OperadorFacturacion } from './comunes';

export type DestinoFacturacion = 'vender' | 'terceros' | 'productos';

type Pestana = 'ventas' | 'notas' | 'clientes' | 'recepcion';

interface Props {
  clienteId: string;
  operador: OperadorFacturacion;
  soloLectura?: boolean;
  /** Lleva a otras pantallas de la app; cada plataforma tiene sus propias rutas. */
  onIr: (destino: DestinoFacturacion) => void;
}

// Las tarjetas de acceso de antes se volvieron una sola fila arriba, justo
// debajo del título: las pestañas del módulo y los atajos a otras pantallas
// (Crear factura, Terceros, Productos).
export function ModuloFacturacion({ clienteId, operador, soloLectura, onIr }: Props) {
  const [pestana, setPestana] = useState<Pestana>('ventas');
  const [perfil, setPerfil] = useState<FiscalProfile | null | undefined>(undefined);
  const [recarga, setRecarga] = useState(0);
  const [asistente, setAsistente] = useState(false);
  // Búsqueda con que se abre la pestaña de notas (al llegar desde una factura).
  const [busquedaNotas, setBusquedaNotas] = useState('');
  // Con correo conectado, Enviar manda la factura directo desde el servidor.
  const [correoConectado, setCorreoConectado] = useState(false);
  const verNotas = (texto = '') => { setBusquedaNotas(texto); setPestana('notas'); };

  useEffect(() => {
    let cancelado = false;
    listarPerfilesFiscales(clienteId)
      // El activo; si todavía no hay ninguno activo, el más reciente (en configuración).
      .then((perfiles) => { if (!cancelado) setPerfil(perfiles.find((p) => p.activo) || perfiles[0] || null); })
      .catch(() => { if (!cancelado) setPerfil(null); });
    return () => { cancelado = true; };
  }, [clienteId, recarga]);

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

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onIr('vender')}
          className="h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm"
          style={{ background: 'linear-gradient(90deg, #10B981, #059669)', color: '#FFFFFF' }}
        >
          <FilePlus2 className="w-4 h-4" /> Crear factura
        </button>
        {([
          ['ventas', 'Facturas de venta', Receipt],
          ['notas', 'Notas crédito y débito', FileMinus2],
          ['clientes', 'Clientes', Contact],
          ['recepcion', 'Documento soporte y compras', Inbox],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => (id === 'notas' ? verNotas() : setPestana(id))}
            className={`h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-2 ${
              pestana === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        {([
          ['terceros', 'Terceros', Users],
          ['productos', 'Productos y servicios', Package],
        ] as const).map(([destino, label, Icon]) => (
          <button
            key={destino}
            onClick={() => onIr(destino)}
            className="h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-2 bg-slate-800/80 text-slate-400 border border-slate-700"
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {perfil?.id && <CertificadoDigital clienteId={clienteId} perfilFiscalId={perfil.id} soloLectura={soloLectura} />}
      {perfil?.id && <ConfiguracionRetenciones perfil={perfil} soloLectura={soloLectura} onGuardado={() => setRecarga((n) => n + 1)} />}
      {perfil?.id && <ConfiguracionCorreo soloLectura={soloLectura} onCambio={(e) => setCorreoConectado(e.configurado)} />}
      {perfil?.id && perfil.activo && perfil.ambiente !== 'produccion' && !soloLectura && (
        <PruebaHabilitacion perfil={perfil} clienteId={clienteId} onTerminado={() => { setPestana('ventas'); setRecarga((n) => n + 1); }} />
      )}

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
        ? <FacturasEmitidas clienteId={clienteId} recarga={recarga} onVerNotas={verNotas} correoConectado={correoConectado} />
        : pestana === 'notas'
        ? <NotasAjuste key={busquedaNotas} clienteId={clienteId} recarga={recarga} textoInicial={busquedaNotas} />
        : pestana === 'clientes'
        ? <ClientesFacturacion clienteId={clienteId} soloLectura={soloLectura} />
        : <RecepcionCausacion clienteId={clienteId} operador={operador} nitPropio={perfil?.nit || ''} soloLectura={soloLectura} />}
    </div>
  );
}
