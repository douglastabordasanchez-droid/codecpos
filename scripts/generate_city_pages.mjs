// Genera las páginas SEO de ciudad (landing/pos-<slug>/index.html) a partir de landing/index.html.
// Uso: node scripts/generate_city_pages.mjs
// Vuelve a correr este script cada vez que cambie el contenido base de landing/index.html
// (pricing, módulos, FAQ, etc.) para que las 30 páginas de ciudad queden sincronizadas.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING_DIR = path.join(ROOT, 'landing');
const BASE_URL = 'https://codecpos.vercel.app'; // Dominio de Vercel (temporal). Cambiar aquí cuando se compre el dominio propio.

const CITIES = [
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
];

const base = readFileSync(path.join(LANDING_DIR, 'index.html'), 'utf8');

function assertOnce(html, needle, label) {
  const count = html.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(`Esperaba 1 ocurrencia de "${label}" pero encontré ${count}. Revisa landing/index.html.`);
  }
}

// Fragmentos exactos del template base que se reemplazan por ciudad.
const T_TITLE = '<title>Codec POS | El sistema que pone todo tu negocio bajo control</title>';
const T_DESC = '<meta name="description" content="Codec POS es el ecosistema completo para administrar tu negocio: ventas, inventario, caja, reportes, facturación electrónica DIAN, Codec Verify y app móvil. Funciona online y offline. Prueba 14 días gratis.">';
const T_CANON = '<link rel="canonical" href="https://codecpos.vercel.app/">';
const T_OG_TITLE = '<meta property="og:title" content="Codec POS | El sistema que pone todo tu negocio bajo control">';
const T_OG_DESC = '<meta property="og:description" content="Ventas, inventario, caja, reportes, facturación electrónica DIAN y confirmación automática de pagos, en un solo sistema que funciona online y offline. 14 días gratis.">';
const T_OG_URL = '<meta property="og:url" content="https://codecpos.vercel.app/">';
const T_TW_TITLE = '<meta name="twitter:title" content="Codec POS | El sistema que pone todo tu negocio bajo control">';
const T_TW_DESC = '<meta name="twitter:description" content="Ventas, inventario, caja, reportes, DIAN y Codec Verify, todo en un solo sistema, online y offline. 14 días gratis.">';
const T_SCHEMA_DESC = '"description": "Sistema de punto de venta con inventario, contabilidad, facturación electrónica DIAN, confirmación automática de pagos (Codec Verify) y funcionamiento online/offline.",';
const T_HERO_LEDE = `      <p class="hero-lede reveal in">
        Codec POS es el sistema que reúne ventas, inventario, caja y reportes en un solo lugar,
        y sigue funcionando aunque se vaya el internet.
      </p>`;
const T_HERO_SECTION_END = `      </div>
    </div>
  </section>

  <!-- ═══════════════ CODEC VERIFY (prioritario, justo después del hero) ═══════════════ -->`;
const T_FOOTER_CIUDADES = '<p><a href="/ciudades/" data-event="click_ciudades" data-event-loc="footer">Codec POS en tu ciudad</a></p>';

[T_TITLE, T_DESC, T_CANON, T_OG_TITLE, T_OG_DESC, T_OG_URL, T_TW_TITLE, T_TW_DESC, T_SCHEMA_DESC, T_HERO_LEDE, T_HERO_SECTION_END, T_FOOTER_CIUDADES]
  .forEach((needle, i) => assertOnce(base, needle, `fragmento #${i}`));

mkdirSync(LANDING_DIR, { recursive: true });

const generated = [];

for (const city of CITIES) {
  const url = `${BASE_URL}/pos-${city.slug}/`;
  const title = `Codec POS en ${city.name}: sistema POS, inventario y caja`;
  const desc = `Codec POS en ${city.name}: punto de venta, inventario, caja, reportes y facturación electrónica DIAN. Funciona online y offline. Prueba 14 días gratis.`;

  let html = base;

  // Rutas de assets: la página vive un nivel bajo la raíz (/pos-<slug>/), así que deben ser absolutas.
  html = html
    .split('="./assets/').join('="/assets/')
    .split('="./styles.css').join('="/styles.css')
    .split('="./script.js').join('="/script.js');

  html = html.split(T_TITLE).join(`<title>${title}</title>`);
  html = html.split(T_DESC).join(`<meta name="description" content="${desc}">`);
  html = html.split(T_CANON).join(`<link rel="canonical" href="${url}">`);
  html = html.split(T_OG_TITLE).join(`<meta property="og:title" content="${title}">`);
  html = html.split(T_OG_DESC).join(`<meta property="og:description" content="${desc}">`);
  html = html.split(T_OG_URL).join(`<meta property="og:url" content="${url}">`);
  html = html.split(T_TW_TITLE).join(`<meta name="twitter:title" content="${title}">`);
  html = html.split(T_TW_DESC).join(`<meta name="twitter:description" content="${desc}">`);
  html = html.split(T_SCHEMA_DESC).join(`${T_SCHEMA_DESC}\n  "areaServed": { "@type": "City", "name": "${city.name}", "containedInPlace": { "@type": "Country", "name": "Colombia" } },`);

  // Hero: sin el nombre de la ciudad explícito, solo una referencia local.
  const heroLede = `      <p class="hero-lede reveal in">
        Codec POS es el sistema que reúne ventas, inventario, caja y reportes en un solo lugar,
        pensado para negocios ${city.hero}, y que sigue funcionando aunque se vaya el internet.
      </p>`;
  html = html.split(T_HERO_LEDE).join(heroLede);

  // Sección nueva justo después del hero: aquí sí va el nombre de la ciudad explícito (señal SEO en el body).
  const citySection = `      </div>
    </div>
  </section>

  <!-- ═══════════════ CIUDAD (contenido local, señal SEO) ═══════════════ -->
  <section class="section-tight" id="ciudad">
    <div class="wrap" style="text-align:center;max-width:760px;margin:0 auto">
      <span class="kicker on-brand">Codec POS en ${city.name}</span>
      <h2 style="margin-top:12px">Hecho para negocios en ${city.name}</h2>
      <p class="lede" style="margin:16px auto 0">
        Negocios de ${city.name} y alrededores ya usan Codec POS para vender, controlar el inventario
        y llevar la caja al día. Funciona con o sin internet, ideal para las zonas de ${city.name}
        donde la conexión no siempre es estable.
      </p>
    </div>
  </section>

  <!-- ═══════════════ CODEC VERIFY (prioritario, justo después del hero) ═══════════════ -->`;
  html = html.split(T_HERO_SECTION_END).join(citySection);

  html = html.split(T_FOOTER_CIUDADES).join(
    `${T_FOOTER_CIUDADES}\n    <p class="footer-copy">Codec POS también está disponible en ${city.name} y en toda Colombia.</p>`
  );

  const outDir = path.join(LANDING_DIR, `pos-${city.slug}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  generated.push({ ...city, url });
}

// Hub /ciudades/ — página de listado para que Google descubra las 30 páginas por enlace interno.
const cityLinks = generated
  .map((c) => `        <li><a href="/pos-${c.slug}/">Codec POS en ${c.name}</a></li>`)
  .join('\n');

const hubHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Codec POS en tu ciudad | Colombia</title>
<meta name="description" content="Codec POS: sistema de punto de venta, inventario y facturación electrónica disponible en las principales ciudades de Colombia. Elige tu ciudad y prueba 14 días gratis.">
<link rel="canonical" href="${BASE_URL}/ciudades/">
<link rel="icon" href="/assets/favicon.ico">
<meta name="theme-color" content="#0F172A">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/styles.css?v=20261002">
</head>
<body>
<header class="nav" id="nav">
  <div class="wrap nav-inner">
    <a href="/" class="brand">
      <img src="/assets/logo-icon.png" width="32" height="32" alt="" class="brand-mark-img">
      <span>Codec<b>POS</b></span>
    </a>
  </div>
</header>
<main id="top">
  <section class="section">
    <div class="wrap">
      <div class="section-head reveal in">
        <span class="kicker on-brand">Cobertura nacional</span>
        <h1>Codec POS en tu ciudad</h1>
        <p class="lede" style="margin:0 auto">Elige tu ciudad para ver cómo Codec POS se adapta a tu negocio. Mismo sistema, mismo soporte, disponible en toda Colombia.</p>
      </div>
      <ul style="max-width:720px;margin:32px auto 0;columns:2;column-gap:24px;list-style:none;text-align:left;padding:0">
${cityLinks}
      </ul>
      <style>#top ul a{display:block;padding:9px 0;color:var(--ink-soft);font-size:14.5px;border-bottom:1px solid var(--border)}#top ul a:hover{color:var(--brand)}</style>
    </div>
  </section>
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <img src="/assets/logo-icon.png" width="24" height="24" alt="" style="border-radius:6px">
      Codec POS
    </div>
    <p>Un producto de <a href="/">Codec Studio</a></p>
    <p class="footer-copy">© <span id="year"></span> Codec Studio. Todos los derechos reservados.</p>
  </div>
</footer>
<a class="wa-float" href="https://wa.me/573238646844?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20Codec%20POS" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp" data-event="click_whatsapp" data-event-loc="flotante">
  <span class="wa-float-tip">¿Hablamos por WhatsApp?</span>
  <svg width="30" height="30" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.2 1.6 6.02L4 29l8.13-1.56a12 12 0 0 0 3.91.65h.01C22.68 28.09 28 22.69 28 16.05 28 9.4 22.68 3 16.04 3Zm0 22.9h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-4.83.93.96-4.7-.24-.38a9.84 9.84 0 0 1-1.52-5.12c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.45-4.44 9.85-9.73 9.85Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/></svg>
</a>
<script>document.getElementById('year').textContent = new Date().getFullYear();</script>
</body>
</html>
`;

const ciudadesDir = path.join(LANDING_DIR, 'ciudades');
mkdirSync(ciudadesDir, { recursive: true });
writeFileSync(path.join(ciudadesDir, 'index.html'), hubHtml, 'utf8');

// sitemap.xml
const urls = [
  `${BASE_URL}/`,
  `${BASE_URL}/ciudades/`,
  ...generated.map((c) => c.url),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
writeFileSync(path.join(LANDING_DIR, 'sitemap.xml'), sitemap, 'utf8');

// robots.txt
const robots = `User-agent: *
Allow: /
Disallow: /app/
Disallow: /admin/

Sitemap: ${BASE_URL}/sitemap.xml
`;
writeFileSync(path.join(LANDING_DIR, 'robots.txt'), robots, 'utf8');

console.log(`Generadas ${generated.length} páginas de ciudad + hub /ciudades/ + sitemap.xml + robots.txt`);
