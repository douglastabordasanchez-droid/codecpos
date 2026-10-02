// Edge Function: firma (XAdES) y transmisión a la DIAN desde el servidor,
// para que la web y el celular puedan facturar electrónicamente igual que
// Electron.
//
// El certificado digital del negocio se sube UNA vez, se valida y queda
// cifrado (AES-256-GCM, llave en el secreto DIAN_CERT_KEY). La llave privada
// nunca vuelve a salir de aquí: el navegador manda el XML y recibe el XML
// firmado y la respuesta de la DIAN.
//
// Quién puede qué:
//   · Cualquier sesión del negocio (empleado o instalación de Electron)
//     puede firmar/transmitir documentos del perfil fiscal de SU negocio.
//   · Solo un administrador (o la instalación de Electron del dueño) puede
//     subir o eliminar el certificado.
// El negocio se resuelve con current_cliente_id() usando el JWT de quien
// llama — el mismo criterio de todas las políticas RLS.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { abrirP12, firmarXades, metadatosCertificado, yaFirmado, type Credenciales } from './xades.ts';
import { consultarEstado, consultarEstadoZip, enviarDocumento, enviarSetDePruebas, type Ambiente } from './soap.ts';
import { cifrar, descifrar } from './cifrado.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const DIAN_CERT_KEY = Deno.env.get('DIAN_CERT_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class ErrorHttp extends Error {
  constructor(mensaje: string, readonly status: number) { super(mensaje); }
}

const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const textoDe = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!DIAN_CERT_KEY) throw new ErrorHttp('El servidor no tiene configurada la llave de cifrado de certificados (DIAN_CERT_KEY).', 500);

    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) throw new ErrorHttp('No autenticado', 401);

    // Cliente con el JWT de quien llama: resuelve identidad y negocio con las
    // mismas reglas que el resto del sistema.
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: errorUsuario } = await comoUsuario.auth.getUser(token);
    if (errorUsuario || !user) throw new ErrorHttp('Sesión inválida o vencida', 401);

    const { data: clienteId } = await comoUsuario.rpc('current_cliente_id');
    if (!clienteId) throw new ErrorHttp('Esta sesión no pertenece a ningún negocio', 403);

    const cuerpo = await req.json().catch(() => ({}));
    const { accion, perfilFiscalId } = cuerpo as { accion?: string; perfilFiscalId?: string };
    if (!accion || !perfilFiscalId) throw new ErrorHttp('Faltan accion o perfilFiscalId', 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // El perfil fiscal debe ser del negocio de quien llama.
    const { data: perfil } = await admin.from('perfiles_fiscales')
      .select('id, cliente_id, nit').eq('id', perfilFiscalId).eq('cliente_id', clienteId).maybeSingle();
    if (!perfil) throw new ErrorHttp('El perfil fiscal no existe o no es de tu negocio', 404);

    const exigirAdministrador = async () => {
      const [{ data: empleado }, { data: instalacion }] = await Promise.all([
        admin.from('empleados').select('rol').eq('id', user.id).maybeSingle(),
        admin.from('sync_identidades').select('id').eq('id', user.id).maybeSingle(),
      ]);
      const esAdmin = !!instalacion || ['admin', 'super_usuario'].includes(empleado?.rol ?? '');
      if (!esAdmin) throw new ErrorHttp('Solo un administrador puede cambiar el certificado digital', 403);
    };

    const estadoCertificado = async () => {
      const { data } = await admin.from('dian_certificados_nube')
        .select('nombre_archivo, sujeto, emisor, vence_el, subido_el').eq('perfil_fiscal_id', perfilFiscalId).maybeSingle();
      return data
        ? { existe: true, nombreArchivo: data.nombre_archivo, sujeto: data.sujeto, emisor: data.emisor, venceEl: data.vence_el, subidoEl: data.subido_el }
        : { existe: false };
    };

    const cargarCredenciales = async (): Promise<Credenciales> => {
      const { data } = await admin.from('dian_certificados_nube')
        .select('p12_cifrado, pin_cifrado').eq('perfil_fiscal_id', perfilFiscalId).maybeSingle();
      if (!data) {
        throw new ErrorHttp('Este perfil fiscal no tiene certificado digital en el servidor. Súbelo en Facturación → Certificado digital.', 409);
      }
      const p12 = await descifrar(data.p12_cifrado, DIAN_CERT_KEY, `p12:${perfilFiscalId}`);
      const pin = textoDe(await descifrar(data.pin_cifrado, DIAN_CERT_KEY, `pin:${perfilFiscalId}`));
      const credenciales = abrirP12(p12, pin);
      if (credenciales.certificado.validity.notAfter.getTime() < Date.now()) {
        throw new ErrorHttp('El certificado digital está vencido. Sube el certificado renovado.', 409);
      }
      return credenciales;
    };

    /** Solo se firma un documento cuyo emisor sea el NIT de este perfil. */
    const exigirEmisorPropio = (xml: string) => {
      const emisor = xml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:CompanyID[^>]*>([^<]+)<\/cbc:CompanyID>/)?.[1]?.trim();
      if (!perfil.nit || emisor !== String(perfil.nit).trim()) {
        throw new ErrorHttp('El documento no corresponde al NIT de este perfil fiscal', 400);
      }
    };

    switch (accion) {
      case 'estado-certificado':
        return json(await estadoCertificado());

      case 'guardar-certificado': {
        await exigirAdministrador();
        const { p12Base64, pin, nombreArchivo } = cuerpo as { p12Base64?: string; pin?: string; nombreArchivo?: string };
        if (!p12Base64 || !pin) throw new ErrorHttp('Faltan el archivo del certificado o su clave', 400);
        const p12 = deBase64(p12Base64);
        if (p12.length > 100_000) throw new ErrorHttp('El archivo es demasiado grande para ser un certificado', 400);

        // Se abre ANTES de guardar: una clave equivocada se descubre ahora,
        // no al intentar facturar.
        let credenciales: Credenciales;
        try { credenciales = abrirP12(p12, pin); } catch (e) { throw new ErrorHttp((e as Error).message, 400); }
        const meta = metadatosCertificado(credenciales);
        if (new Date(meta.venceEl).getTime() < Date.now()) throw new ErrorHttp(`Este certificado venció el ${meta.venceEl.slice(0, 10)}`, 400);

        const { error } = await admin.from('dian_certificados_nube').upsert({
          perfil_fiscal_id: perfilFiscalId,
          cliente_id: clienteId,
          p12_cifrado: await cifrar(p12, DIAN_CERT_KEY, `p12:${perfilFiscalId}`),
          pin_cifrado: await cifrar(new TextEncoder().encode(pin), DIAN_CERT_KEY, `pin:${perfilFiscalId}`),
          nombre_archivo: (nombreArchivo || 'certificado.p12').slice(0, 200),
          sujeto: meta.sujeto,
          emisor: meta.emisor,
          vence_el: meta.venceEl,
          subido_por: user.id,
          subido_el: new Date().toISOString(),
        });
        if (error) throw new ErrorHttp(error.message, 500);
        return json(await estadoCertificado());
      }

      case 'eliminar-certificado': {
        await exigirAdministrador();
        const { error } = await admin.from('dian_certificados_nube').delete().eq('perfil_fiscal_id', perfilFiscalId);
        if (error) throw new ErrorHttp(error.message, 500);
        return json({ existe: false });
      }

      case 'firmar': {
        const { xml } = cuerpo as { xml?: string };
        if (!xml) throw new ErrorHttp('Falta el XML', 400);
        exigirEmisorPropio(xml);
        return json({ xmlFirmado: yaFirmado(xml) ? xml : firmarXades(xml, await cargarCredenciales()) });
      }

      case 'firmar-enviar': {
        const { xml, numero, ambiente, testSetId } = cuerpo as { xml?: string; numero?: string; ambiente?: Ambiente; testSetId?: string };
        if (!xml || !numero) throw new ErrorHttp('Faltan el XML o el número del documento', 400);
        exigirEmisorPropio(xml);
        const credenciales = await cargarCredenciales();
        const xmlFirmado = yaFirmado(xml) ? xml : firmarXades(xml, credenciales);
        try {
          const respuesta = testSetId
            ? await enviarSetDePruebas(numero, xmlFirmado, testSetId, credenciales)
            : await enviarDocumento(numero, xmlFirmado, ambiente === 'produccion' ? 'produccion' : 'habilitacion', credenciales);
          return json({ xmlFirmado, respuesta });
        } catch (e) {
          // La firma sí se hizo: se devuelve para que el documento quede
          // firmado hoy aunque la DIAN no haya respondido.
          return json({ ok: false, error: (e as Error).message, xmlFirmado });
        }
      }

      case 'consultar-estado': {
        const { trackId, ambiente } = cuerpo as { trackId?: string; ambiente?: Ambiente };
        if (!trackId) throw new ErrorHttp('Falta el identificador a consultar', 400);
        return json({ respuesta: await consultarEstado(trackId, ambiente === 'produccion' ? 'produccion' : 'habilitacion', await cargarCredenciales()) });
      }

      case 'estado-zip': {
        const { trackId, ambiente } = cuerpo as { trackId?: string; ambiente?: Ambiente };
        if (!trackId) throw new ErrorHttp('Falta el identificador a consultar', 400);
        return json({ respuesta: await consultarEstadoZip(trackId, ambiente === 'produccion' ? 'produccion' : 'habilitacion', await cargarCredenciales()) });
      }

      default:
        throw new ErrorHttp(`Acción desconocida: ${accion}`, 400);
    }
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500;
    if (status === 500) console.error('[dian-emision]', e);
    return json({ ok: false, error: (e as Error).message }, status);
  }
});
