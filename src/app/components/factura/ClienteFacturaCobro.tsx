/**
 * Datos del comprador en el cobro con factura electrónica, iguales en
 * Electron, la web y el celular:
 *   · Buscador por nombre, NIT o cédula en Facturación › Clientes.
 *   · Cédula o NIT (empresa), con el dígito de verificación calculado.
 *   · Aviso si el NIT viene con el DV pegado (8300515738), el error que
 *     dejó mal la DBM1507.
 *   · Si no existe, «Cliente nuevo»: queda guardado al cobrar.
 * Sin documento, la factura sale a consumidor final.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, UserCheck, UserPlus, Loader2, AlertTriangle } from 'lucide-react';
import { buscarClienteFactura, type ClienteFacturaGuardado } from '../../lib/dian/clientesFactura';
import { sugerirClientesFacturacion, type ClienteFacturacion } from '../../lib/supabase/clientesFacturacionService';
import { conClienteConocido, dvDe, nitConDvPegado, numeroDocumento, type DatosClienteCobro } from '../../lib/dian/clienteCobro';

interface Props {
  clienteId: string | null | undefined;
  datos: DatosClienteCobro;
  onChange: (datos: DatosClienteCobro) => void;
  /** Cliente de la base elegido o reconocido (para las retenciones). null = nuevo. */
  onReconocido?: (cliente: ClienteFacturaGuardado | null) => void;
  oscuro?: boolean;
}

const aGuardado = (c: ClienteFacturacion): ClienteFacturaGuardado => ({
  documento: c.digitoVerificacion ? `${c.numeroDocumento}-${c.digitoVerificacion}` : c.numeroDocumento,
  nombre: c.nombre,
  email: c.email,
  telefono: c.telefono,
  direccion: c.direccion,
  tipoDocumento: c.tipoDocumento,
  agenteRetencionFuente: c.agenteRetencionFuente,
  agenteRetencionIca: c.agenteRetencionIca,
});

export function ClienteFacturaCobro({ clienteId, datos, onChange, onReconocido, oscuro = true }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<ClienteFacturacion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [estado, setEstado] = useState<'conocido' | 'nuevo' | null>(null);
  const ultimoDocumento = useRef('');

  // Sugerencias mientras escribe (nombre, NIT o cédula).
  useEffect(() => {
    const texto = busqueda.trim();
    if (!clienteId || texto.length < 2) { setSugerencias([]); return; }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(() => {
      sugerirClientesFacturacion(clienteId, texto)
        .then((r) => { if (!cancelado) setSugerencias(r); })
        .catch(() => { if (!cancelado) setSugerencias([]); })
        .finally(() => { if (!cancelado) setBuscando(false); });
    }, 250);
    return () => { cancelado = true; clearTimeout(t); };
  }, [busqueda, clienteId]);

  // Al limpiar el documento (venta nueva) se olvida el estado anterior.
  useEffect(() => {
    if (!numeroDocumento(datos.documento)) { setEstado(null); ultimoDocumento.current = ''; }
  }, [datos.documento]);

  function elegir(c: ClienteFacturacion) {
    const guardado = aGuardado(c);
    ultimoDocumento.current = c.numeroDocumento;
    onChange(conClienteConocido(datos, guardado, true));
    onReconocido?.(guardado);
    setEstado('conocido');
    setBusqueda('');
    setSugerencias([]);
  }

  async function reconocerDocumento() {
    const numero = numeroDocumento(datos.documento);
    if (numero.length < 5 || numero === ultimoDocumento.current) return;
    ultimoDocumento.current = numero;
    const encontrado = await buscarClienteFactura(clienteId, numero).catch(() => null);
    if (ultimoDocumento.current !== numero) return;
    if (encontrado) {
      onChange(conClienteConocido(datos, encontrado, false));
      setEstado('conocido');
    } else {
      setEstado('nuevo');
    }
    onReconocido?.(encontrado);
  }

  const dvPegado = nitConDvPegado(datos);
  const dv = dvDe(datos);
  const hayDocumento = numeroDocumento(datos.documento).length > 0;

  const campo = `w-full h-10 px-3 rounded-lg text-sm border ${oscuro ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`;
  const tenue = oscuro ? 'text-slate-400' : 'text-slate-500';
  const tipoBoton = (activo: boolean) => `flex-1 h-9 rounded-lg text-xs font-bold border ${
    activo ? 'bg-amber-500 border-amber-500 text-slate-950' : oscuro ? 'bg-transparent border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-600'
  }`;

  return (
    <div className="space-y-2">
      {/* Buscador en la base de clientes */}
      <div className="relative">
        <Search className={`w-4 h-4 absolute left-3 top-3 ${tenue}`} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && sugerencias[0]) { e.preventDefault(); elegir(sugerencias[0]); } }}
          placeholder="Buscar cliente por nombre, NIT o cédula"
          className={`${campo} pl-9`}
        />
        {buscando && <Loader2 className={`w-4 h-4 absolute right-3 top-3 animate-spin ${tenue}`} />}
        {sugerencias.length > 0 && (
          <div className={`absolute z-30 left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden ${oscuro ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            {sugerencias.map((c) => (
              <button
                key={c.id || c.numeroDocumento}
                type="button"
                onClick={() => elegir(c)}
                className={`w-full text-left px-3 py-2 text-sm border-t first:border-t-0 ${oscuro ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-100 hover:bg-slate-50'}`}
              >
                <span className={`block font-semibold truncate ${oscuro ? 'text-white' : 'text-slate-900'}`}>{c.nombre}</span>
                <span className={`block text-xs ${tenue}`}>
                  {c.tipoDocumento === '31' ? 'NIT' : 'CC'} {c.numeroDocumento}{c.digitoVerificacion ? `-${c.digitoVerificacion}` : ''}{c.email ? ` · ${c.email}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" className={tipoBoton(datos.tipo !== '31')} onClick={() => onChange({ ...datos, tipo: '13' })}>Cédula (persona)</button>
        <button type="button" className={tipoBoton(datos.tipo === '31')} onClick={() => onChange({ ...datos, tipo: '31' })}>NIT (empresa)</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <input
            value={datos.documento}
            onChange={(e) => { setEstado(null); onChange({ ...datos, documento: e.target.value }); }}
            onBlur={() => { void reconocerDocumento(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void reconocerDocumento(); } }}
            placeholder={datos.tipo === '31' ? 'NIT sin dígito de verificación' : 'Número de cédula'}
            inputMode="numeric"
            className={`${campo} ${dv ? 'pr-12' : ''}`}
          />
          {dv && <span className={`absolute right-3 top-2.5 text-sm font-bold ${tenue}`} title="Dígito de verificación (calculado)">-{dv}</span>}
        </div>
        <input
          value={datos.nombre}
          onChange={(e) => onChange({ ...datos, nombre: e.target.value })}
          placeholder={datos.tipo === '31' ? 'Razón social' : 'Nombre completo'}
          className={campo}
        />
      </div>

      {dvPegado && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-500 flex-1 min-w-[160px]">
            Parece que el NIT trae el dígito de verificación pegado. ¿Es {dvPegado}-{datos.documento.replace(/\D/g, '').slice(9)}?
          </span>
          <button
            type="button"
            onClick={() => { setEstado(null); onChange({ ...datos, tipo: '31', documento: dvPegado }); }}
            className="h-8 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
          >
            Corregir
          </button>
        </div>
      )}

      {hayDocumento && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={datos.email}
            onChange={(e) => onChange({ ...datos, email: e.target.value })}
            placeholder="Correo (para enviarle la factura)"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            className={campo}
          />
          <input
            value={datos.telefono}
            onChange={(e) => onChange({ ...datos, telefono: e.target.value })}
            placeholder="Teléfono (opcional)"
            inputMode="tel"
            className={campo}
          />
          <input
            value={datos.direccion}
            onChange={(e) => onChange({ ...datos, direccion: e.target.value })}
            placeholder="Dirección (opcional)"
            className={`${campo} sm:col-span-2`}
          />
        </div>
      )}

      {!hayDocumento ? (
        <p className={`text-[11px] ${tenue}`}>Sin cédula ni NIT, la factura sale a nombre de consumidor final.</p>
      ) : estado === 'conocido' ? (
        <p className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Cliente conocido: sus datos se llenaron solos. Revísalos antes de cobrar.</p>
      ) : estado === 'nuevo' ? (
        <p className="text-[11px] font-semibold text-amber-500 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Cliente nuevo: queda guardado en Facturación › Clientes al cobrar.</p>
      ) : null}
    </div>
  );
}
