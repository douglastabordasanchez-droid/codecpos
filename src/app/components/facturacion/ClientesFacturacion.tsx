/**
 * Facturación › Clientes: la base de clientes del negocio para la factura
 * electrónica. Se carga a mano o con Excel y la usan Electron, la web y el
 * celular: al escribir la cédula o el NIT en el cobro se llena lo demás, y si
 * el cliente es agente de retención la factura lleva sus retenciones.
 *
 * Solo paleta slate (ver comunes.ts): se ve igual en Electron y en la web clara.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';
import {
  TIPOS_DOCUMENTO_CLIENTE, eliminarClienteFacturacion, guardarClienteFacturacion, importarClientesFacturacion,
  listarClientesFacturacion, type ClienteFacturacion,
} from '../../lib/supabase/clientesFacturacionService';
import { digitoVerificacionNit } from '../../lib/dian/ublComun';

interface Props {
  clienteId: string;
  soloLectura?: boolean;
}

const VACIO: ClienteFacturacion = {
  tipoDocumento: '13', numeroDocumento: '', nombre: '', agenteRetencionFuente: false, agenteRetencionIca: false,
};

const COLUMNAS_EXCEL = ['Tipo documento', 'Número documento', 'DV', 'Nombre o razón social', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'Agente retención fuente', 'Agente ReteICA'];

const esSi = (v: unknown) => /^(s[ií]|x|1|true|verdadero)$/i.test(String(v ?? '').trim());

/** "NIT", "31", "Cédula de ciudadanía" → código DIAN. */
function tipoDesdeTexto(v: unknown): string {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return '13';
  const porCodigo = TIPOS_DOCUMENTO_CLIENTE.find((x) => x.codigo === t);
  if (porCodigo) return porCodigo.codigo;
  if (t.includes('nit')) return '31';
  if (t.includes('extranj')) return '22';
  if (t.includes('pasaporte')) return '41';
  if (t.includes('tarjeta')) return '12';
  return '13';
}

const nombreTipo = (codigo: string) => TIPOS_DOCUMENTO_CLIENTE.find((t) => t.codigo === codigo)?.nombre || codigo;

export function ClientesFacturacion({ clienteId, soloLectura }: Props) {
  const [clientes, setClientes] = useState<ClienteFacturacion[] | null>(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ClienteFacturacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargar = () => {
    setError('');
    listarClientesFacturacion(clienteId)
      .then(setClientes)
      .catch((e) => { setClientes([]); setError(e?.message || 'No se pudieron cargar los clientes'); });
  };
  useEffect(cargar, [clienteId]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes || [];
    return (clientes || []).filter((c) => c.nombre.toLowerCase().includes(q) || c.numeroDocumento.includes(q.replace(/[.\s-]/g, '')));
  }, [clientes, busqueda]);

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    try {
      const c = editando.tipoDocumento === '31' && !editando.digitoVerificacion && !editando.numeroDocumento.includes('-')
        ? { ...editando, digitoVerificacion: digitoVerificacionNit(editando.numeroDocumento.replace(/\D/g, '')) }
        : editando;
      await guardarClienteFacturacion(clienteId, c);
      toast.success(editando.id ? 'Cliente actualizado' : 'Cliente guardado');
      setEditando(null);
      cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c: ClienteFacturacion) {
    if (!c.id || !window.confirm(`¿Eliminar a ${c.nombre} de la base de clientes? Sus facturas no se borran.`)) return;
    try {
      await eliminarClienteFacturacion(c.id);
      toast.success('Cliente eliminado');
      cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar');
    }
  }

  async function descargarPlantilla() {
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.aoa_to_sheet([
      COLUMNAS_EXCEL,
      ['NIT', '860018862', '1', 'Empresa de ejemplo S.A.S.', 'compras@empresa.com', '6012325448', 'Cr 16 A 28 B 33', 'Bogotá', 'Sí', 'Sí'],
      ['Cédula', '1022925002', '', 'Cliente de ejemplo', '', '3200000000', '', 'Bogotá', 'No', 'No'],
    ]);
    hoja['!cols'] = COLUMNAS_EXCEL.map((c) => ({ wch: Math.max(14, c.length + 2) }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Clientes');
    XLSX.writeFile(libro, 'Plantilla clientes facturacion.xlsx');
  }

  async function importar(archivo: File) {
    setImportando(true);
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.read(await archivo.arrayBuffer());
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[libro.SheetNames[0]], { defval: '' });
      // Encabezados sin tildes ni mayúsculas, para aceptar archivos hechos a mano.
      const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
      const valor = (fila: Record<string, unknown>, ...nombres: string[]) => {
        const buscadas = nombres.map(clave);
        const k = Object.keys(fila).find((x) => buscadas.some((b) => clave(x).startsWith(b)));
        return k ? String(fila[k] ?? '').trim() : '';
      };
      const leidos: ClienteFacturacion[] = filas.map((f) => ({
        tipoDocumento: tipoDesdeTexto(valor(f, 'tipo')),
        numeroDocumento: valor(f, 'numero', 'documento', 'nit', 'cedula'),
        digitoVerificacion: valor(f, 'dv', 'digito') || undefined,
        nombre: valor(f, 'nombre', 'razon'),
        email: valor(f, 'correo', 'email') || undefined,
        telefono: valor(f, 'telefono', 'celular') || undefined,
        direccion: valor(f, 'direccion') || undefined,
        ciudad: valor(f, 'ciudad', 'municipio') || undefined,
        agenteRetencionFuente: esSi(valor(f, 'agenteretencionfuente', 'retefuente', 'retencionfuente')),
        agenteRetencionIca: esSi(valor(f, 'agentereteica', 'reteica')),
      })).filter((c) => c.numeroDocumento && c.nombre);
      if (leidos.length === 0) {
        toast.error('El archivo no tiene clientes', { description: 'Use la plantilla: necesita al menos número de documento y nombre.' });
        return;
      }
      const n = await importarClientesFacturacion(clienteId, leidos);
      toast.success(`${n} clientes cargados`, { description: 'Los que ya existían se actualizaron.' });
      cargar();
    } catch (e: any) {
      toast.error('No se pudo leer el archivo', { description: e?.message });
    } finally {
      setImportando(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  }

  const campo = 'w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o NIT"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900/70 border border-slate-800 text-white text-sm"
          />
        </div>
        {!soloLectura && (
          <>
            <button onClick={() => setEditando({ ...VACIO })} className="h-11 px-4 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nuevo cliente
            </button>
            <button onClick={() => archivoRef.current?.click()} disabled={importando} className="h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Cargar Excel
            </button>
            <button onClick={descargarPlantilla} className="h-11 px-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-2" title="Plantilla de Excel">
              <Download className="w-4 h-4" /> Plantilla
            </button>
            <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); }} />
          </>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {clientes === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6"><Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes...</div>
      ) : filtrados.length === 0 ? (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-8 text-center">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-white text-sm font-bold">{busqueda ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}</p>
          <p className="text-slate-500 text-xs mt-1">
            Agréguelos uno por uno o cárguelos con la plantilla de Excel. En el cobro basta escribir la cédula o el NIT.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs text-left border-b border-slate-800">
                <th className="px-3 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Documento</th>
                <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Contacto</th>
                <th className="px-3 py-2.5 font-semibold">Retenciones</th>
                {!soloLectura && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/70 last:border-0">
                  <td className="px-3 py-2.5 text-white font-semibold">{c.nombre}</td>
                  <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                    <span className="text-slate-500 text-xs">{nombreTipo(c.tipoDocumento)} </span>
                    {c.numeroDocumento}{c.digitoVerificacion ? `-${c.digitoVerificacion}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs hidden md:table-cell">
                    {[c.telefono, c.email, c.ciudad].filter(Boolean).join(' · ')}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.agenteRetencionFuente && <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[11px] font-bold">ReteFuente</span>}
                      {c.agenteRetencionIca && <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 text-[11px] font-bold">ReteICA</span>}
                      {!c.agenteRetencionFuente && !c.agenteRetencionIca && <span className="text-slate-600 text-xs">No</span>}
                    </div>
                  </td>
                  {!soloLectura && (
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setEditando(c)} className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center" aria-label={`Editar ${c.nombre}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => eliminar(c)} className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center" aria-label={`Eliminar ${c.nombre}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-slate-500 text-xs px-3 py-2 border-t border-slate-800">{filtrados.length} de {clientes.length} clientes</p>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditando(null)}>
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p className="font-bold text-white">{editando.id ? 'Editar cliente' : 'Nuevo cliente'}</p>
              <button onClick={() => setEditando(null)} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-1 text-xs text-slate-400 space-y-1">
                <span>Tipo</span>
                <select value={editando.tipoDocumento} onChange={(e) => setEditando({ ...editando, tipoDocumento: e.target.value })} className={campo}>
                  {TIPOS_DOCUMENTO_CLIENTE.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                </select>
              </label>
              <label className={`${editando.tipoDocumento === '31' ? 'col-span-1' : 'col-span-2'} text-xs text-slate-400 space-y-1`}>
                <span>Número</span>
                <input value={editando.numeroDocumento} onChange={(e) => setEditando({ ...editando, numeroDocumento: e.target.value })} inputMode="numeric" className={campo} />
              </label>
              {editando.tipoDocumento === '31' && (
                <label className="col-span-1 text-xs text-slate-400 space-y-1">
                  <span>DV (se calcula solo)</span>
                  <input
                    value={editando.digitoVerificacion || ''}
                    onChange={(e) => setEditando({ ...editando, digitoVerificacion: e.target.value.replace(/\D/g, '').slice(0, 1) })}
                    placeholder={editando.numeroDocumento ? digitoVerificacionNit(editando.numeroDocumento.replace(/\D/g, '')) : ''}
                    inputMode="numeric"
                    className={campo}
                  />
                </label>
              )}
            </div>
            <label className="block text-xs text-slate-400 space-y-1">
              <span>Nombre o razón social</span>
              <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className={campo} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-400 space-y-1">
                <span>Teléfono</span>
                <input value={editando.telefono || ''} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} inputMode="tel" className={campo} />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Correo</span>
                <input value={editando.email || ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} inputMode="email" className={campo} />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Dirección</span>
                <input value={editando.direccion || ''} onChange={(e) => setEditando({ ...editando, direccion: e.target.value })} className={campo} />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Ciudad</span>
                <input value={editando.ciudad || ''} onChange={(e) => setEditando({ ...editando, ciudad: e.target.value })} className={campo} />
              </label>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2">
              <p className="text-white text-xs font-bold">¿Este cliente le practica retenciones?</p>
              {([
                ['agenteRetencionFuente', 'Agente de retención en la fuente'],
                ['agenteRetencionIca', 'Agente de ReteICA'],
              ] as const).map(([k, texto]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={editando[k]} onChange={(e) => setEditando({ ...editando, [k]: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                  {texto}
                </label>
              ))}
              <p className="text-slate-500 text-[11px]">
                Solo se aplican si el negocio activó la retención en Facturación › Retenciones.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditando(null)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="h-10 px-4 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
