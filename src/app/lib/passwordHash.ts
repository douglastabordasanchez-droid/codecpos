import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX = /^\$2[aby]?\$/;

export function esHashBcrypt(valor: string | undefined | null): boolean {
  return !!valor && BCRYPT_PREFIX.test(valor);
}

export function hashPassword(passwordPlano: string): string {
  return bcrypt.hashSync(passwordPlano, 10);
}

/**
 * Compara una contraseña en texto plano contra el valor almacenado.
 * Si el almacenado ya es un hash bcrypt, compara con bcrypt.
 * Si es texto plano legado (instalaciones previas a este cambio), compara
 * directamente y reporta que debe re-hashearse (migración perezosa).
 */
export function verificarPassword(
  passwordPlano: string,
  almacenado: string | undefined | null
): { valido: boolean; requiereRehash: boolean } {
  if (!almacenado) return { valido: false, requiereRehash: false };

  if (esHashBcrypt(almacenado)) {
    return { valido: bcrypt.compareSync(passwordPlano, almacenado), requiereRehash: false };
  }

  const valido = passwordPlano === almacenado;
  return { valido, requiereRehash: valido };
}
