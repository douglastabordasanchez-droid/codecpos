/**
 * Imagen de un producto a partir de su nombre (modo fácil de Alimentos y
 * Bebidas). Se elige un emoji por palabras clave y se dibuja con Twemoji: SVG
 * de 1 a 2 KB que el navegador guarda después de la primera vez. Sin internet
 * se usa el emoji del propio sistema, así que nunca queda vacío.
 */

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// El orden importa: lo más específico va primero ("cafe con leche" antes que "leche").
const REGLAS: Array<[RegExp, string]> = [
  [/\b(tinto|cafe|capuchino|cappuccino|espresso|expreso|latte|perico de cafe)\b/, '☕'],
  [/\b(chocolate|chocolatina|milo)\b/, '🍫'],
  [/\b(aromatica|te|infusion|agua de panela|aguapanela|panela)\b/, '🍵'],
  [/\b(huevo|huevos|pericos?|rancheros?|omelette|tortilla de huevo)\b/, '🍳'],
  [/\b(changua|cereal|granola|avena con|bowl)\b/, '🥣'],
  [/\b(caldo|sopa|sancocho|ajiaco|crema de|mute|mondongo|consome)\b/, '🍲'],
  [/\b(almuerzo|bandeja|corrientazo|ejecutivo|plato del dia|menu del dia)\b/, '🍛'],
  [/\b(desayuno|calentado)\b/, '🍳'],
  [/\b(arepa|arepas)\b/, '🫓'],
  [/\b(empanada|empanadas|pastel de pollo|pastel de carne)\b/, '🥟'],
  [/\b(tamal|tamales|envuelto|bollo)\b/, '🫔'],
  [/\b(hojaldre|hojaldres|croissant|cruasan|pastel|milhoja|gloria|pastel gloria|hawaiano|criollo)\b/, '🥐'],
  [/\b(pandebono|pan de bono|almojabana|pan de queso|rosca|roscon)\b/, '🥯'],
  [/\b(bunuelo|bunuelos|dona|donas|donut)\b/, '🍩'],
  [/\b(palito de queso|palito|queso|quesillo|cuajada)\b/, '🧀'],
  [/\b(pan|baguette|tostada|tostadas|mogolla|calado)\b/, '🍞'],
  [/\b(sandwich|sanduche|emparedado)\b/, '🥪'],
  [/\b(hamburguesa)\b/, '🍔'],
  [/\b(perro caliente|hot ?dog|salchicha|chorizo|butifarra)\b/, '🌭'],
  [/\b(pizza)\b/, '🍕'],
  [/\b(papas? fritas|papa francesa|francesa)\b/, '🍟'],
  [/\b(pollo|alitas|pechuga)\b/, '🍗'],
  [/\b(carne|res|cerdo|chicharron|costilla|lomo|churrasco|sobrebarriga)\b/, '🥩'],
  [/\b(pescado|mojarra|trucha|bagre)\b/, '🐟'],
  [/\b(arroz)\b/, '🍚'],
  [/\b(pasta|espagueti|spaghetti|lasana)\b/, '🍝'],
  [/\b(ensalada|verdura|vegetales)\b/, '🥗'],
  [/\b(torta|tortas|pastel de cumpleanos|cheesecake|tres leches|porcion)\b/, '🍰'],
  [/\b(ponque|ponques|cupcake|mantecada|muffin|brownie)\b/, '🧁'],
  [/\b(galleta|galletas|cookie)\b/, '🍪'],
  [/\b(helado|paleta|cono)\b/, '🍨'],
  [/\b(postre|flan|arequipe|natilla|gelatina)\b/, '🍮'],
  [/\b(dulce|bocadillo|chicle|confite)\b/, '🍬'],
  [/\b(licuado|batido|malteada|smoothie|frappe|granizado)\b/, '🥤'],
  [/\b(jugo|jugos|zumo|hit|tutifruti|del valle)\b/, '🧃'],
  [/\b(gaseosa|coca|cola|pepsi|postobon|colombiana|manzana postobon|sprite|quatro|pony|malta|soda|bretana|refresco|gatorade|energizante|redbull|vive100)\b/, '🥤'],
  [/\b(fresa|fresas)\b/, '🍓'],
  [/\b(naranja|mandarina)\b/, '🍊'],
  [/\b(limonada|limon)\b/, '🍋'],
  [/\b(mango)\b/, '🥭'],
  [/\b(banano|banana|platano|maduro|patacon)\b/, '🍌'],
  [/\b(pina)\b/, '🍍'],
  [/\b(sandia|patilla)\b/, '🍉'],
  [/\b(manzana)\b/, '🍎'],
  [/\b(uva|uvas)\b/, '🍇'],
  [/\b(coco)\b/, '🥥'],
  [/\b(fruta|frutas|salpicon|ensalada de frutas)\b/, '🍓'],
  [/\b(kumis|yogurt|yogur|leche|avena|kefir|lacteo)\b/, '🥛'],
  [/\b(agua|cristal|brisa|manantial)\b/, '💧'],
  [/\b(cerveza|aguila|poker|club colombia|costena)\b/, '🍺'],
  [/\b(vino)\b/, '🍷'],
  [/\b(combo|promo|promocion)\b/, '🍱'],
  [/\b(salsa|ketchup|mayonesa)\b/, '🥫'],
  [/\b(adicional|extra|porcion de)\b/, '➕'],
];

/** Emoji que mejor representa el producto; si nada coincide, el de su categoría o un plato. */
export function emojiParaProducto(nombre: string, categoria?: string): string {
  const n = ` ${quitarTildes(nombre || '')} `;
  for (const [re, emoji] of REGLAS) if (re.test(n)) return emoji;
  if (categoria) {
    const c = ` ${quitarTildes(categoria)} `;
    for (const [re, emoji] of REGLAS) if (re.test(c)) return emoji;
  }
  return '🍽️';
}

/** Dirección del dibujo de Twemoji para un emoji (sin el selector de variación cuando no hace falta). */
export function urlTwemoji(emoji: string): string {
  const puntos = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const sinVariacion = puntos.includes('200d') ? puntos : puntos.filter((p) => p !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${sinVariacion.join('-')}.svg`;
}
