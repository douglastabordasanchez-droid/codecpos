/**
 * Imagen de un producto a partir de su nombre (modo fácil de Alimentos y
 * Bebidas, y de la tienda: papelería, piñatería, misceláneas). Se elige un emoji por palabras clave y se dibuja con Twemoji: SVG
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

// Papelería, piñatería, fiestas, juguetería y misceláneas. Van antes que las
// de comida: «papel seda» no es pan y «vela de cumpleaños» no es una torta.
const REGLAS_TIENDA: Array<[RegExp, string]> = [
  [/\b(pinata|pinatas)\b/, '🪅'],
  [/\b(globo|globos|bomba|bombas|metalizado|helio)\b/, '🎈'],
  [/\b(vela|velas|velita|velitas|bengala|bengalas)\b/, '🕯️'],
  [/\b(confeti|serpentina|serpentinas|cotillon|pito|pitos|espantasuegras|matraca)\b/, '🎊'],
  [/\b(gorro de fiesta|gorros|antifaz|mascara|disfraz|corona)\b/, '🥳'],
  [/\b(feliz cumpleanos|cumpleanos|fiesta|decoracion|guirnalda|banderin|banderines|letrero)\b/, '🎉'],
  [/\b(regalo|regalos|sorpresa|sorpresas|detalle|anchetas?|caja de regalo)\b/, '🎁'],
  [/\b(papel regalo|papel de regalo|bolsa de regalo|bolsas de regalo)\b/, '🎁'],
  [/\b(mono|monos|cinta|cintas|lazo|lazos|cinta raso)\b/, '🎀'],
  [/\b(tarjeta|tarjetas|postal|invitacion|invitaciones)\b/, '💌'],
  [/\b(sobre|sobres|carta)\b/, '✉️'],
  [/\b(cuaderno|cuadernos|cuadriculado|rayado|argollado|cosido)\b/, '📓'],
  [/\b(libreta|libretas|agenda|agendas|block|bloc|diario)\b/, '📔'],
  [/\b(libro|libros|cartilla|cartillas|diccionario|biblia|revista|colorear)\b/, '📚'],
  [/\b(lapicero|lapiceros|esfero|esferos|boligrafo|boligrafos|kilometrico|lapicera)\b/, '🖊️'],
  [/\b(marcador|marcadores|resaltador|resaltadores|sharpie|plumon|plumones|micropunta|rotulador)\b/, '🖋️'],
  [/\b(lapiz|lapices|portaminas|mina|minas|grafito)\b/, '✏️'],
  [/\b(color|colores|crayola|crayolas|crayon|crayones|plastilina)\b/, '🖍️'],
  [/\b(pincel|pinceles|brocha)\b/, '🖌️'],
  [/\b(tempera|temperas|vinilo|vinilos|acuarela|acuarelas|pintura|pinturas|oleo|escarcha|diamantina)\b/, '🎨'],
  [/\b(tijera|tijeras|bisturi|cortador|cuchilla)\b/, '✂️'],
  [/\b(regla|reglas|metro)\b/, '📏'],
  [/\b(escuadra|escuadras|transportador|compas|juego geometrico)\b/, '📐'],
  [/\b(clip|clips|gancho|ganchos|grapa|grapas|cosedora|grapadora|perforadora)\b/, '📎'],
  [/\b(chinche|chinches|tachuela|tachuelas|alfiler|alfileres)\b/, '📌'],
  [/\b(pegante|pegamento|colbon|silicona|pegastick|goma|ega|boxer)\b/, '🧴'],
  [/\b(cinta pegante|cinta transparente|cinta de enmascarar|cinta adhesiva|celo)\b/, '🧻'],
  [/\b(borrador|borradores|corrector|correctores|liquid paper)\b/, '🧽'],
  [/\b(sacapuntas|tajalapiz)\b/, '✏️'],
  [/\b(carpeta|carpetas|folder|legajador|legajadores|archivador|archivadores|sobre de manila)\b/, '📁'],
  [/\b(sticker|stickers|calcomania|calcomanias|etiqueta|etiquetas|adhesivo)\b/, '🏷️'],
  [/\b(hoja|hojas|resma|resmas|papel|papeles|cartulina|cartulinas|foami|fomi|papel silueta|papel seda|papel crepe|papel iris|block iris|octavo|pliego|pliegos)\b/, '📄'],
  [/\b(fotocopia|fotocopias|copia|copias|impresion|impresiones|escaneo|escaner|imprimir)\b/, '🖨️'],
  [/\b(plastificado|plastificar|anillado|anillar|empastado|laminado)\b/, '📑'],
  [/\b(calculadora|calculadoras|abaco)\b/, '🧮'],
  [/\b(morral|morrales|maleta|maletas|mochila|mochilas|lonchera|loncheras|cartuchera|cartucheras|estuche|estuches)\b/, '🎒'],
  [/\b(lana|hilo|hilos|estambre|cordon|cordones|piola|pita)\b/, '🧶'],
  [/\b(usb|memoria|cable|audifonos|cargador|pila|pilas|bateria|baterias)\b/, '🔌'],
  [/\b(peluche|peluches|muneca|munecas|oso|juguete|juguetes|carrito de juguete)\b/, '🧸'],
  [/\b(pelota|pelotas|balon|balones)\b/, '⚽'],
  [/\b(rompecabezas|puzzle|lego|ficha|fichas|domino|parques|naipe|naipes|cartas de juego)\b/, '🧩'],
  [/\b(bolsa|bolsas|empaque|empaques)\b/, '🛍️'],
  // Nombres de categoría (secciones de la tienda).
  [/\b(fiestas|pinateria|cotillon|eventos)\b/, '🎉'],
  [/\b(escritura|esferos|lapiceros|boligrafos)\b/, '🖊️'],
  [/\b(arte|artes|manualidades|pinturas)\b/, '🎨'],
  [/\b(utiles|escolar|escolares|oficina)\b/, '✂️'],
  [/\b(papeles|papeleria)\b/, '📄'],
  [/\b(servicios|fotocopias|impresiones|copias)\b/, '🖨️'],
  [/\b(jugueteria|juguetes)\b/, '🧸'],
  [/\b(regalos|detalles)\b/, '🎁'],
  [/\b(tecnologia|electronica|accesorios)\b/, '🔌'],
  [/\b(dulceria|confiteria)\b/, '🍬'],
];

/** Emoji que mejor representa el producto; si nada coincide, el de su categoría o el que se indique. */
export function emojiParaProducto(nombre: string, categoria?: string, porDefecto = '🍽️'): string {
  const n = ` ${quitarTildes(nombre || '')} `;
  for (const [re, emoji] of REGLAS_TIENDA) if (re.test(n)) return emoji;
  for (const [re, emoji] of REGLAS) if (re.test(n)) return emoji;
  if (categoria) {
    const c = ` ${quitarTildes(categoria)} `;
    for (const [re, emoji] of REGLAS_TIENDA) if (re.test(c)) return emoji;
    for (const [re, emoji] of REGLAS) if (re.test(c)) return emoji;
  }
  return porDefecto;
}

/** Dirección del dibujo de Twemoji para un emoji (sin el selector de variación cuando no hace falta). */
export function urlTwemoji(emoji: string): string {
  const puntos = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const sinVariacion = puntos.includes('200d') ? puntos : puntos.filter((p) => p !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${sinVariacion.join('-')}.svg`;
}

/**
 * Dirección del ícono 3D de Microsoft Fluent Emoji (licencia MIT, unos 4 KB
 * por imagen, servido por jsDelivr: no ocupa espacio en la nube). Unos vienen
 * con el selector de variación en el nombre y otros sin él, por eso hay dos.
 */
export function urlFluent3D(emoji: string, conVariacion = false): string {
  const puntos = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const lista = conVariacion || puntos.includes('200d') ? puntos : puntos.filter((p) => p !== 'fe0f');
  return `https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@1.1.0/assets/${lista.join('-')}.webp`;
}
