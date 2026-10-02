/**
 * Lector XML mínimo y seguro para documentos electrónicos DIAN.
 *
 * ── Por qué no se usa DOMParser ni una librería ──────────────────────────
 * El motor tiene que correr en dos entornos: el navegador (Web Worker) y
 * Deno (Edge Function). DOMParser no existe en Deno, y traer una librería
 * de XML significaría auditar su comportamiento frente a entidades — que
 * es justo el riesgo que hay que eliminar, porque el archivo lo aporta un
 * tercero desconocido.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────
 * Este lector NO resuelve entidades externas ni internas más allá de las
 * cinco predefinidas de XML. No sigue DOCTYPE: lo rechaza. Con eso quedan
 * cerrados XXE y las bombas de expansión de entidades (billion laughs) por
 * construcción, no por configuración — no hay una opción que alguien pueda
 * activar por error más adelante.
 *
 * Además impone techos de tamaño, profundidad y número de nodos, para que
 * un archivo hostil no pueda agotar la memoria del worker.
 */

export interface XmlNode {
  /** Nombre local, sin prefijo de namespace: 'Invoice', 'CompanyID'. */
  name: string;
  /** URI del namespace resuelta, o '' si el elemento no está en ninguno. */
  ns: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Texto directo del elemento, ya con las entidades básicas resueltas. */
  text: string;
}

export interface XmlLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
}

export const LIMITES_POR_DEFECTO: XmlLimits = {
  // Un AttachedDocument real pesa 40–60 KB. 12 MB deja muchísimo margen
  // para un documento con miles de líneas sin permitir un archivo absurdo.
  maxBytes: 12 * 1024 * 1024,
  maxDepth: 100,
  maxNodes: 400_000,
};

export class XmlError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DOCTYPE_PROHIBIDO'
      | 'DEMASIADO_GRANDE'
      | 'DEMASIADO_PROFUNDO'
      | 'DEMASIADOS_NODOS'
      | 'MAL_FORMADO',
  ) {
    super(message);
    this.name = 'XmlError';
  }
}

/** Las cinco entidades predefinidas de XML, más las numéricas. Cualquier
 *  otra entidad se deja tal cual: no se busca su definición en el DOCTYPE,
 *  porque el DOCTYPE ni siquiera se acepta. */
const ENTIDADES: Record<string, string> = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'",
};

export function decodificarTexto(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (todo, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      // Se descartan los code points inválidos en vez de lanzar: un acento
      // mal codificado no debe tumbar el procesamiento de un lote entero.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return todo;
      try { return String.fromCodePoint(code); } catch { return todo; }
    }
    return ENTIDADES[ent] ?? todo;
  });
}

const nombreLocal = (q: string): string => {
  const i = q.indexOf(':');
  return i === -1 ? q : q.slice(i + 1);
};
const prefijo = (q: string): string => {
  const i = q.indexOf(':');
  return i === -1 ? '' : q.slice(0, i);
};

/** Encuentra el '>' que cierra el tag, ignorando los que van dentro de un
 *  valor de atributo entrecomillado. */
function finDeTag(s: string, desde: number): number {
  let comilla: string | null = null;
  for (let i = desde + 1; i < s.length; i++) {
    const c = s[i];
    if (comilla) { if (c === comilla) comilla = null; continue; }
    if (c === '"' || c === "'") { comilla = c; continue; }
    if (c === '>') return i;
  }
  return -1;
}

function leerAtributos(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = decodificarTexto(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/**
 * Parsea un documento XML a un árbol. Lanza XmlError ante cualquier
 * condición que haga el archivo inseguro o inutilizable.
 */
export function parseXml(source: string, limits: XmlLimits = LIMITES_POR_DEFECTO): XmlNode {
  if (source.length > limits.maxBytes) {
    throw new XmlError(`El archivo supera el límite de ${limits.maxBytes} bytes`, 'DEMASIADO_GRANDE');
  }

  // Se quita el BOM si viene: no es contenido, y desalinea el primer match.
  let s = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  const raiz: XmlNode = { name: '#root', ns: '', attrs: {}, children: [], text: '' };
  const pila: XmlNode[] = [raiz];
  // Mapa prefijo → URI por nivel, para resolver namespaces con el alcance
  // correcto: un mismo prefijo puede reapuntarse dentro de un subárbol.
  const nsPila: Array<Record<string, string>> = [{ '': '' }];
  let nodos = 0;
  let i = 0;

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) break;

    if (lt > i) {
      const t = s.slice(i, lt);
      if (t.trim()) pila[pila.length - 1].text += decodificarTexto(t);
    }

    // DOCTYPE: se rechaza el documento entero. Es la puerta de XXE y de las
    // bombas de entidades, y ningún documento legítimo de la DIAN lo trae.
    if (s.startsWith('<!DOCTYPE', lt) || s.startsWith('<!ENTITY', lt)) {
      throw new XmlError('El documento declara DOCTYPE o ENTITY', 'DOCTYPE_PROHIBIDO');
    }

    if (s.startsWith('<![CDATA[', lt)) {
      const fin = s.indexOf(']]>', lt);
      const corte = fin === -1 ? s.length : fin;
      // El texto de CDATA es literal: no se decodifican entidades.
      pila[pila.length - 1].text += s.slice(lt + 9, corte);
      i = fin === -1 ? s.length : fin + 3;
      continue;
    }

    if (s.startsWith('<!--', lt)) {
      const fin = s.indexOf('-->', lt);
      i = fin === -1 ? s.length : fin + 3;
      continue;
    }

    if (s.startsWith('<?', lt)) {
      const fin = s.indexOf('?>', lt);
      i = fin === -1 ? s.length : fin + 2;
      continue;
    }

    const gt = finDeTag(s, lt);
    if (gt === -1) throw new XmlError('Tag sin cerrar', 'MAL_FORMADO');

    const bruto = s.slice(lt, gt + 1);
    const cierra = bruto[1] === '/';
    const autocierra = bruto[bruto.length - 2] === '/';
    const qname = bruto.slice(cierra ? 2 : 1).match(/^[^\s/>]+/)?.[0] ?? '';

    if (cierra) {
      if (pila.length <= 1) throw new XmlError(`Cierre inesperado de ${qname}`, 'MAL_FORMADO');
      const abierto = pila[pila.length - 1];
      if (abierto.name !== nombreLocal(qname)) {
        throw new XmlError(`Se esperaba cerrar ${abierto.name} y llegó ${qname}`, 'MAL_FORMADO');
      }
      pila.pop();
      nsPila.pop();
      i = gt + 1;
      continue;
    }

    if (++nodos > limits.maxNodes) {
      throw new XmlError(`El documento supera los ${limits.maxNodes} nodos`, 'DEMASIADOS_NODOS');
    }
    if (pila.length > limits.maxDepth) {
      throw new XmlError(`El documento supera ${limits.maxDepth} niveles de anidamiento`, 'DEMASIADO_PROFUNDO');
    }

    const attrs = leerAtributos(bruto);

    // Alcance de namespaces: se hereda el del padre y se sobrescribe con
    // lo que declare este elemento.
    const nsLocal: Record<string, string> = { ...nsPila[nsPila.length - 1] };
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'xmlns') nsLocal[''] = v;
      else if (k.startsWith('xmlns:')) nsLocal[k.slice(6)] = v;
    }

    const nodo: XmlNode = {
      name: nombreLocal(qname),
      ns: nsLocal[prefijo(qname)] ?? '',
      attrs,
      children: [],
      text: '',
    };
    pila[pila.length - 1].children.push(nodo);

    if (!autocierra) {
      pila.push(nodo);
      nsPila.push(nsLocal);
    }
    i = gt + 1;
  }

  if (pila.length !== 1) {
    throw new XmlError(`Quedaron ${pila.length - 1} elemento(s) sin cerrar`, 'MAL_FORMADO');
  }
  if (raiz.children.length === 0) throw new XmlError('El documento no tiene elemento raíz', 'MAL_FORMADO');

  return raiz.children[0];
}

// ── Navegación ────────────────────────────────────────────────────────────
// Todo se busca por nombre local, nunca por prefijo: los emisores declaran
// los mismos namespaces con prefijos distintos (unos usan cbc:, otros lo
// ponen por defecto), así que buscar 'cbc:ID' fallaría en la mitad de los
// documentos reales. El namespace queda disponible en node.ns para cuando
// haga falta desambiguar de verdad.

/** Primer hijo directo con ese nombre local. */
export function hijo(n: XmlNode | undefined, nombre: string): XmlNode | undefined {
  return n?.children.find((c) => c.name === nombre);
}

/** Todos los hijos directos con ese nombre local. */
export function hijos(n: XmlNode | undefined, nombre: string): XmlNode[] {
  return n?.children.filter((c) => c.name === nombre) ?? [];
}

/** Desciende por una ruta de nombres locales: ruta(inv, 'Price', 'PriceAmount'). */
export function ruta(n: XmlNode | undefined, ...nombres: string[]): XmlNode | undefined {
  let actual = n;
  for (const nombre of nombres) {
    if (!actual) return undefined;
    actual = hijo(actual, nombre);
  }
  return actual;
}

/** Texto del elemento en esa ruta, ya recortado. '' si no existe. */
export function texto(n: XmlNode | undefined, ...nombres: string[]): string {
  return (nombres.length ? ruta(n, ...nombres) : n)?.text.trim() ?? '';
}

/** Valor de un atributo del elemento en esa ruta. */
export function atributo(n: XmlNode | undefined, attr: string, ...nombres: string[]): string {
  return (nombres.length ? ruta(n, ...nombres) : n)?.attrs[attr] ?? '';
}

/** Primer descendiente a cualquier profundidad. Se usa sólo cuando la ruta
 *  exacta varía entre emisores; para todo lo demás, ruta() es más seguro. */
export function buscar(n: XmlNode | undefined, nombre: string): XmlNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (c.name === nombre) return c;
    const hallado = buscar(c, nombre);
    if (hallado) return hallado;
  }
  return undefined;
}

/** Todos los descendientes con ese nombre, a cualquier profundidad. */
export function buscarTodos(n: XmlNode | undefined, nombre: string): XmlNode[] {
  const salida: XmlNode[] = [];
  const recorrer = (nodo: XmlNode) => {
    for (const c of nodo.children) {
      if (c.name === nombre) salida.push(c);
      recorrer(c);
    }
  };
  if (n) recorrer(n);
  return salida;
}
