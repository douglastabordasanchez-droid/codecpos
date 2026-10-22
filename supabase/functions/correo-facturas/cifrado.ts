/**
 * Cifrado en reposo del certificado y su clave (AES-256-GCM, Web Crypto).
 *
 * La llave maestra vive SOLO como secreto de la Edge Function
 * (`DIAN_CERT_KEY`, 32 bytes en base64): no está en la base de datos ni en
 * el código. Quien obtuviera una copia de la tabla dian_certificados_nube
 * tendría únicamente texto cifrado.
 *
 * El id del perfil fiscal entra como dato autenticado adicional: un
 * certificado cifrado para un perfil no se puede descifrar «pegado» en la
 * fila de otro.
 */
const aBase64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function importarLlave(llaveBase64: string): Promise<CryptoKey> {
  const cruda = deBase64(llaveBase64);
  if (cruda.length !== 32) throw new Error('DIAN_CERT_KEY debe ser de 32 bytes (base64).');
  return crypto.subtle.importKey('raw', cruda, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Devuelve `iv.cifrado` en base64. */
export async function cifrar(datos: Uint8Array, llaveBase64: string, contexto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(contexto) },
    await importarLlave(llaveBase64),
    datos,
  );
  return `${aBase64(iv)}.${aBase64(new Uint8Array(cifrado))}`;
}

export async function descifrar(sobre: string, llaveBase64: string, contexto: string): Promise<Uint8Array> {
  const [iv, cifrado] = sobre.split('.');
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(iv), additionalData: new TextEncoder().encode(contexto) },
    await importarLlave(llaveBase64),
    deBase64(cifrado),
  );
  return new Uint8Array(claro);
}
