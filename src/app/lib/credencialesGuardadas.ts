/**
 * «Guardar contraseña» del inicio de sesión: usuario y contraseña quedan en
 * este equipo (localStorage), nunca en la nube. La contraseña no se guarda en
 * texto plano a simple vista (va mezclada con una llave propia del equipo),
 * pero quien tenga acceso al equipo podría recuperarla: por eso es opcional y
 * se borra al desmarcar la casilla.
 */

const CLAVE = 'codecpos_credenciales_guardadas';
const CLAVE_LLAVE = 'codecpos_credenciales_llave';

export interface CredencialesGuardadas {
  usuario: string;
  password: string;
}

function llave(): string {
  try {
    let k = localStorage.getItem(CLAVE_LLAVE);
    if (!k) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(CLAVE_LLAVE, k);
    }
    return k;
  } catch {
    return 'codecpos';
  }
}

function mezclar(texto: string, k: string): string {
  const entrada = new TextEncoder().encode(texto);
  const kb = new TextEncoder().encode(k);
  const salida = entrada.map((b, i) => b ^ kb[i % kb.length]);
  let bin = '';
  salida.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function desmezclar(cifrado: string, k: string): string {
  const bin = atob(cifrado);
  const kb = new TextEncoder().encode(k);
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ kb[i % kb.length]);
  return new TextDecoder().decode(bytes);
}

export function leerCredenciales(ambito = 'caja'): CredencialesGuardadas | null {
  try {
    const raw = localStorage.getItem(`${CLAVE}_${ambito}`);
    if (!raw) return null;
    const { u, p } = JSON.parse(raw);
    if (typeof u !== 'string' || typeof p !== 'string') return null;
    return { usuario: u, password: desmezclar(p, llave()) };
  } catch {
    return null;
  }
}

export function guardarCredenciales(c: CredencialesGuardadas, ambito = 'caja'): void {
  try {
    localStorage.setItem(`${CLAVE}_${ambito}`, JSON.stringify({ u: c.usuario, p: mezclar(c.password, llave()) }));
  } catch { /* sin almacenamiento */ }
}

export function borrarCredenciales(ambito = 'caja'): void {
  try { localStorage.removeItem(`${CLAVE}_${ambito}`); } catch { /* ignorar */ }
}
