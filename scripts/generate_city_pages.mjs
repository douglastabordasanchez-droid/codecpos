// Genera las páginas SEO por ciudad a partir de landing/index.html (la home).
// Uso: node scripts/generate_city_pages.mjs
// Vuelve a correrlo cada vez que cambie landing/index.html (precios, módulos,
// preguntas, etc.) para que todas las páginas de ciudad queden iguales a la home.
//
// Está organizado por PAÍS. Para abrir otro país basta con agregar su entrada
// en PAISES (hay un ejemplo comentado de México al final de la lista):
//   ruta             carpeta del país. Colombia usa '' para conservar las URLs que
//                    Google ya tiene (/pos-bogota/); otro país, por ejemplo 'mx',
//                    queda en /mx/pos-<ciudad>/.
//   textos           pares [buscar, reemplazar] que se aplican a la home para ese
//                    país (impuestos, ente de facturación, medios de pago, moneda).
//   quitarSecciones  ids de <section> de la home que allá no aplican, por ejemplo
//                    'facturacion' mientras no facturemos electrónicamente en ese
//                    país. También se quita su enlace del menú.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING_DIR = path.join(ROOT, 'landing');
const BASE_URL = 'https://pos.codecstudio.online';

const PAISES = [
  {
    codigo: 'co',
    nombre: 'Colombia',
    locale: 'es_CO',
    ruta: '',
    textos: [],
    quitarSecciones: [],
    ciudades: [
      { slug: 'bogota', name: 'Bogotá', hero: 'a 2.600 metros de altura, donde el ritmo no para' },
      { slug: 'medellin', name: 'Medellín', hero: 'en el Valle de Aburrá, cuna de la eterna primavera' },
      { slug: 'cali', name: 'Cali', hero: 'en la capital mundial de la salsa' },
      { slug: 'barranquilla', name: 'Barranquilla', hero: 'a orillas del río más grande del país, en pleno Caribe' },
      { slug: 'cartagena', name: 'Cartagena', hero: 'entre murallas coloniales frente al mar Caribe' },
      { slug: 'cucuta', name: 'Cúcuta', hero: 'en la frontera más movida del país' },
      { slug: 'bucaramanga', name: 'Bucaramanga', hero: 'en la ciudad de los parques, rodeada de montañas santandereanas' },
      { slug: 'soledad', name: 'Soledad', hero: 'en el corazón del Atlántico' },
      { slug: 'ibague', name: 'Ibagué', hero: 'en la capital musical de Colombia' },
      { slug: 'soacha', name: 'Soacha', hero: 'a las puertas de la sabana bogotana' },
      { slug: 'villavicencio', name: 'Villavicencio', hero: 'en la puerta de entrada a los Llanos Orientales' },
      { slug: 'valledupar', name: 'Valledupar', hero: 'cuna del vallenato, junto al río Guatapurí' },
      { slug: 'pereira', name: 'Pereira', hero: 'en pleno corazón del Eje Cafetero' },
      { slug: 'monteria', name: 'Montería', hero: 'a orillas del río Sinú, tierra ganadera' },
      { slug: 'manizales', name: 'Manizales', hero: 'entre montañas cafeteras y clima de niebla' },
      { slug: 'pasto', name: 'Pasto', hero: 'a los pies del volcán Galeras' },
      { slug: 'neiva', name: 'Neiva', hero: 'a orillas del río Magdalena, en el Huila' },
      { slug: 'palmira', name: 'Palmira', hero: 'en la capital agrícola del Valle del Cauca' },
      { slug: 'armenia', name: 'Armenia', hero: 'en el corazón del paisaje cultural cafetero' },
      { slug: 'popayan', name: 'Popayán', hero: 'en la ciudad blanca del sur del país' },
      { slug: 'sincelejo', name: 'Sincelejo', hero: 'en plena sabana sucreña' },
      { slug: 'tulua', name: 'Tuluá', hero: 'en el corazón del Valle del Cauca' },
      { slug: 'buenaventura', name: 'Buenaventura', hero: 'en el principal puerto del Pacífico colombiano' },
      { slug: 'floridablanca', name: 'Floridablanca', hero: 'en el área metropolitana de Santander' },
      { slug: 'bello', name: 'Bello', hero: 'en el norte del Valle de Aburrá' },
      { slug: 'itagui', name: 'Itagüí', hero: 'en el sur industrial del Valle de Aburrá' },
      { slug: 'envigado', name: 'Envigado', hero: 'en las laderas del sur del Valle de Aburrá' },
      { slug: 'dosquebradas', name: 'Dosquebradas', hero: 'en pleno Eje Cafetero risaraldense' },
      { slug: 'barrancabermeja', name: 'Barrancabermeja', hero: 'a orillas del Magdalena Medio, tierra petrolera' },
      { slug: 'riohacha', name: 'Riohacha', hero: 'frente al mar Caribe, junto al desierto guajiro' },
    ],
  },
  // {
  //   codigo: 'mx',
  //   nombre: 'México',
  //   locale: 'es_MX',
  //   ruta: 'mx',
  //   textos: [
  //     ['pagos de Nequi y Bre-B verificados solos', 'pagos por transferencia verificados solos'],
  //     ['Precios en pesos colombianos (COP).', 'Escríbenos para conocer el precio en pesos mexicanos.'],
  //   ],
  //   quitarSecciones: ['facturacion'],
  //   ciudades: [
  //     { slug: 'ciudad-de-mexico', name: 'Ciudad de México', hero: 'en la capital más grande de América Latina' },
  //   ],
  // },
];

const base = readFileSync(path.join(LANDING_DIR, 'index.html'), 'utf8');

/** Reemplaza un fragmento que debe existir exactamente una vez en la home. */
function reemplazarUnico(html, re, nuevo, etiqueta) {
  const n = (html.match(new RegExp(re.source, 'g')) || []).length;
  if (n !== 1) throw new Error(`Esperaba 1 vez "${etiqueta}" en landing/index.html y encontré ${n}.`);
  return html.replace(re, nuevo);
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const rutaPais = (pais) => (pais.ruta ? `/${pais.ruta}` : '');
const urlDe = (pais, ciudad) => `${BASE_URL}${rutaPais(pais)}/pos-${ciudad.slug}/`;

function paginaCiudad(pais, ciudad) {
  const url = urlDe(pais, ciudad);
  const titulo = `Codec POS en ${ciudad.name}: sistema POS con facturación, inventario y caja`;
  const desc = `Codec POS en ${ciudad.name}: punto de venta, inventario, caja, reportes y confirmación de pagos. Funciona con o sin internet. Prueba 14 días gratis.`;
  let html = base;

  // La página vive en una subcarpeta: las rutas relativas de la home pasan a absolutas.
  html = html.split('="./').join('="/');

  html = reemplazarUnico(html, /<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`, 'title');
  html = reemplazarUnico(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`, 'description');
  html = reemplazarUnico(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, 'canonical');
  html = reemplazarUnico(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titulo)}">`, 'og:title');
  html = reemplazarUnico(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`, 'og:description');
  html = reemplazarUnico(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, 'og:url');
  html = reemplazarUnico(html, /<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${pais.locale}">`, 'og:locale');
  html = reemplazarUnico(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(titulo)}">`, 'twitter:title');
  html = reemplazarUnico(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`, 'twitter:description');
  html = reemplazarUnico(
    html,
    /"applicationCategory": "BusinessApplication",/,
    `"applicationCategory": "BusinessApplication",\n  "areaServed": { "@type": "City", "name": "${ciudad.name}", "containedInPlace": { "@type": "Country", "name": "${pais.nombre}" } },`,
    'applicationCategory',
  );

  // Referencia local en el hero, sin repetir el nombre de la ciudad.
  html = reemplazarUnico(html, /(<p class="hero-sub">[^<]*?)(<\/p>)/, `$1 Pensado para negocios ${ciudad.hero}.$2`, 'hero-sub');

  // Sección propia de la ciudad, antes de la primera sección de contenido.
  const seccionCiudad = `<!-- ═══════════ CIUDAD (contenido local) ═══════════ -->
  <section class="section" id="ciudad" style="padding-bottom:0">
    <div class="wrap">
      <div class="head reveal" style="margin-bottom:0">
        <span class="kicker"><i data-lucide="map-pin"></i> Codec POS en ${ciudad.name}</span>
        <h2>Hecho para negocios en ${ciudad.name}.</h2>
        <p>Vende, controla el inventario y lleva la caja al día desde ${ciudad.name}. Funciona con o sin internet, ideal donde la conexión no siempre es estable, y te acompañamos por WhatsApp desde cualquier lugar de ${pais.nombre}.</p>
      </div>
    </div>
  </section>

  `;
  html = reemplazarUnico(html, /<!-- ═+ FACTURACIÓN ELECTRÓNICA ═+ -->/, (m) => seccionCiudad + m, 'marca de facturación');

  html = reemplazarUnico(
    html,
    /<span>© <span id="year"><\/span> Codec Studio<\/span>/,
    `<span>Codec POS en ${ciudad.name}, ${pais.nombre} · © <span id="year"></span> Codec Studio</span>`,
    'pie de página',
  );

  for (const [buscar, poner] of pais.textos) {
    if (!html.includes(buscar)) throw new Error(`[${pais.codigo}] no encontré el texto "${buscar}" en la home.`);
    html = html.split(buscar).join(poner);
  }
  for (const id of pais.quitarSecciones) {
    html = reemplazarUnico(html, new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/section>`), '', `section #${id}`);
    html = html.replace(new RegExp(`\\s*<a href="#${id}"[^>]*>[\\s\\S]*?<\\/a>`, 'g'), '');
  }

  const carpeta = path.join(LANDING_DIR, ...(pais.ruta ? [pais.ruta] : []), `pos-${ciudad.slug}`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(path.join(carpeta, 'index.html'), html, 'utf8');
  return url;
}

const generadas = [];
for (const pais of PAISES) {
  for (const ciudad of pais.ciudades) generadas.push({ pais, ciudad, url: paginaCiudad(pais, ciudad) });
}

// ── Hub /ciudades/: listado por país para que Google descubra cada página ──
const bloquesPais = PAISES.map((pais) => {
  const links = pais.ciudades
    .map((c) => `        <a href="${rutaPais(pais)}/pos-${c.slug}/"><span class="ico-box"><i data-lucide="map-pin"></i></span>${c.name}</a>`)
    .join('\n');
  return `      <h3 class="pais reveal">${pais.nombre}</h3>
      <div class="biz reveal">
${links}
      </div>`;
}).join('\n');
const nombresPaises = PAISES.map((p) => p.nombre).join(', ');

// El botón flotante de WhatsApp se toma tal cual de la home.
const waFlotante = (base.match(/<a class="wa-float"[\s\S]*?<\/a>/) || [''])[0].replace('data-event-loc="flotante"', 'data-event-loc="ciudades"');

const hub = `<!DOCTYPE html>
<html lang="es" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Codec POS en tu ciudad | ${nombresPaises}</title>
<meta name="description" content="Codec POS: sistema POS con inventario, caja y facturación electrónica disponible en ${generadas.length} ciudades de ${nombresPaises}. Elige tu ciudad y prueba 14 días gratis.">
<link rel="canonical" href="${BASE_URL}/ciudades/">
<link rel="icon" href="/assets/favicon.ico">
<meta name="theme-color" content="#fbfaf7">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/home.css?v=20261118c">
<style>.pais{font-size:22px;font-weight:800;margin:40px 0 14px}.pais:first-of-type{margin-top:0}.biz{grid-template-columns:repeat(2,minmax(0,1fr))}.biz a{min-width:0;overflow-wrap:anywhere}@media (min-width:700px){.biz{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:1024px){.biz{grid-template-columns:repeat(6,minmax(0,1fr))}}</style>
</head>
<body>
<header class="nav" id="nav">
  <div class="wrap nav-inner">
    <a href="/" class="brand" aria-label="Codec POS, inicio">
      <img src="/assets/logo-icon.png" width="34" height="34" alt="">
      <span>Codec<b>POS</b></span>
    </a>
    <div class="nav-panel">
      <nav class="nav-links" aria-label="Secciones">
        <a href="/#facturacion">Facturación</a>
        <a href="/#negocios">Negocios</a>
        <a href="/#precios">Precios</a>
      </nav>
      <div class="nav-cta">
        <a href="/app/login" class="nav-login" data-event="click_login">Iniciar sesión</a>
        <a href="/app/prueba-gratis" class="btn btn-brand btn-sm" id="trialCtaNav" data-event="click_prueba_gratis" data-event-loc="ciudades">Probar gratis</a>
      </div>
    </div>
    <button class="nav-burger" id="navBurger" aria-label="Abrir menú" aria-expanded="false"><i data-lucide="menu"></i></button>
  </div>
</header>
<main id="top">
  <section class="section">
    <div class="wrap">
      <div class="head reveal">
        <span class="kicker"><i data-lucide="map-pin"></i> Cobertura</span>
        <h2>Codec POS en tu ciudad</h2>
        <p>Mismo sistema y mismo soporte por WhatsApp, estés donde estés. Elige tu ciudad.</p>
      </div>
${bloquesPais}
    </div>
  </section>
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <a href="/" class="brand"><img src="/assets/logo-icon.png" width="26" height="26" alt=""><span>Codec<b>POS</b></span></a>
    <nav aria-label="Pie de página">
      <a href="https://codecstudio.online/" rel="noopener">Un producto de Codec Studio</a>
      <a href="/descargar/" data-event="click_descargar" data-event-loc="ciudades">Descargar para Windows</a>
      <a href="/app/login">Iniciar sesión</a>
    </nav>
    <span>© <span id="year"></span> Codec Studio</span>
  </div>
</footer>
${waFlotante}
<script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<script src="/home.js?v=20261118c"></script>
</body>
</html>
`;
mkdirSync(path.join(LANDING_DIR, 'ciudades'), { recursive: true });
writeFileSync(path.join(LANDING_DIR, 'ciudades', 'index.html'), hub, 'utf8');

// ── sitemap.xml y robots.txt ──
const urls = [`${BASE_URL}/`, `${BASE_URL}/ciudades/`, `${BASE_URL}/descargar/`, ...generadas.map((g) => g.url)];
writeFileSync(
  path.join(LANDING_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
  'utf8',
);
writeFileSync(
  path.join(LANDING_DIR, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\n\nSitemap: ${BASE_URL}/sitemap.xml\n`,
  'utf8',
);

console.log(`Generadas ${generadas.length} páginas de ciudad en ${PAISES.length} país(es), el hub /ciudades/, sitemap.xml y robots.txt`);
