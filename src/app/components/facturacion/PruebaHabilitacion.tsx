/**
 * Prueba de habilitación con la DIAN.
 *
 * Es la única forma REAL de saber si la DIAN acepta los documentos: emite
 * uno de prueba con los datos del perfil fiscal, lo firma con el certificado
 * del negocio, lo envía al ambiente de habilitación con el TestSetId que la
 * DIAN le asignó y muestra el veredicto, regla por regla si hay rechazo.
 *
 * Solo aparece mientras el perfil está en ambiente de habilitación: en
 * producción no se envían documentos de prueba.
 */
import { useState } from 'react';
import { FlaskConical, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { emitirFacturaDianDirecto, type ResultadoEmision } from '../../lib/dian/emitirFacturaDian';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, type FiscalProfile } from '../../lib/dian/types';

interface Props {
  perfil: FiscalProfile;
  clienteId: string;
  onTerminado: () => void;
}

type Tipo = 'factura' | 'pos';

export function PruebaHabilitacion({ perfil, clienteId, onTerminado }: Props) {
  const claveGuardado = `codecpos_dian_testsetid_${perfil.id}`;
  const [testSetId, setTestSetId] = useState(() => { try { return localStorage.getItem(claveGuardado) || ''; } catch { return ''; } });
  const [enviando, setEnviando] = useState<Tipo | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);

  async function probar(tipo: Tipo) {
    const id = testSetId.trim();
    if (!id) return;
    try { localStorage.setItem(claveGuardado, id); } catch { /* sin almacenamiento: solo no se recuerda */ }
    setEnviando(tipo);
    setResultado(null);
    const r = await emitirFacturaDianDirecto({
      clienteId,
      ventaReferencia: `PRUEBA-HABILITACION-${Date.now()}`,
      fecha: new Date().toISOString(),
      // Factura: comprador identificado (el propio negocio se factura a sí
      // mismo en la prueba). POS: consumidor final.
      adquirente: tipo === 'factura'
        ? { tipoDocumento: '31', numeroDocumento: perfil.nit || '', digitoVerificacion: perfil.digitoVerificacion, nombreORazonSocial: perfil.nombreORazonSocial, email: perfil.contactoEmail }
        : { tipoDocumento: '13', numeroDocumento: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, nombreORazonSocial: 'Consumidor final' },
      items: [
        { codigo: 'PRUEBA1', descripcion: 'Producto de prueba gravado', cantidad: 2, precioUnitario: 10000, subtotal: 20000, impuestos: [{ codigo: '01', porcentaje: 19, valor: 3800 }] },
        { codigo: 'PRUEBA2', descripcion: 'Producto de prueba excluido', cantidad: 1, precioUnitario: 5000, subtotal: 5000 },
      ],
      subtotal: 25000,
      totalImpuestos: 3800,
      total: 28800,
      pago: { metodo: 'efectivo' },
    }, { testSetId: id });
    setResultado(r);
    setEnviando(null);
    onTerminado();
  }

  const aceptado = resultado?.estado === 'accepted';
  const rechazado = resultado && ['rejected', 'no_emitido'].includes(resultado.estado);
  // La DIAN devuelve las reglas incumplidas separadas; aquí se listan una por línea.
  const mensajes = (resultado?.motivo || '').split(/;\s*(?=Regla|La |El |No )/).map((m) => m.trim()).filter(Boolean);

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
          <FlaskConical className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-bold">Prueba de habilitación con la DIAN</p>
          <p className="text-slate-400 text-xs">
            Envía un documento de prueba al ambiente de habilitación y muestra si la DIAN lo acepta. Pega el identificador del
            set de pruebas (TestSetId) que aparece en el portal de la DIAN al registrar tu software.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={testSetId}
          onChange={(e) => setTestSetId(e.target.value)}
          placeholder="TestSetId (ej. 8a2d7c2f-...)"
          className="flex-1 min-w-[220px] h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm font-mono"
        />
        {([['factura', 'Probar factura'], ['pos', 'Probar documento POS']] as const).map(([tipo, label]) => (
          <button
            key={tipo}
            onClick={() => probar(tipo)}
            disabled={!testSetId.trim() || enviando !== null}
            className="h-10 px-3 rounded-lg bg-sky-600/20 text-sky-400 text-sm font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            {enviando === tipo && <Loader2 className="w-4 h-4 animate-spin" />} {label}
          </button>
        ))}
      </div>

      {enviando && <p className="text-slate-400 text-xs">Firmando, enviando y esperando la validación de la DIAN (puede tardar unos segundos)...</p>}

      {resultado && (
        <div className={`rounded-xl px-3 py-2.5 text-xs ${aceptado ? 'bg-emerald-500/15 text-emerald-400' : rechazado ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <p className="font-bold flex items-center gap-1.5 text-sm">
            {aceptado ? <CheckCircle2 className="w-4 h-4" /> : rechazado ? <XCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            {aceptado
              ? `La DIAN aceptó el documento ${resultado.numero}`
              : resultado.estado === 'rejected'
                ? `La DIAN rechazó el documento ${resultado.numero}`
                : resultado.estado === 'no_emitido'
                  ? 'No se pudo emitir el documento de prueba'
                  : `Sin veredicto todavía para ${resultado.numero || 'el documento'}`}
          </p>
          {mensajes.length > 0 && (
            <ul className="mt-1.5 space-y-1 list-disc pl-5">
              {mensajes.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          {!aceptado && !rechazado && (
            <p className="mt-1.5">El documento quedó en la tabla de abajo; revisa su estado en unos minutos.</p>
          )}
        </div>
      )}
    </div>
  );
}
