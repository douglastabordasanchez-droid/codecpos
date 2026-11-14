/**
 * Compatibilidad del CSS con el WebView de terminales Android viejas
 * (M60WL con Android 9: WebView Chrome 101). Solo se activa al compilar el
 * APK (CODEC_ANDROID=1); Electron y la web siguen con el CSS moderno.
 *
 * Tailwind 4 pide Chrome 111+. En Chrome 101 fallan:
 *   · oklch(): los colores quedan inválidos y el texto sale transparente.
 *     Se convierten a rgb() con el mismo color.
 *   · translate / scale / rotate como propiedades sueltas (Chrome 104):
 *     las ventanas emergentes quedan descentradas. Se pasan a transform.
 * color-mix() no hace falta: Tailwind ya lo envuelve en @supports con respaldo.
 */
import type { Plugin } from 'vite';

function oklchARgb(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lineal = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lineal.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(g * 255);
  }) as [number, number, number];
}

function numero(v: string, porcentajeEsUno = false): number {
  if (v.endsWith('%')) return parseFloat(v) / (porcentajeEsUno ? 100 : 1);
  return parseFloat(v);
}

export function convertirOklch(css: string): string {
  return css.replace(/oklch\(\s*([^)]*?)\s*\)/g, (todo, cuerpo: string) => {
    const [color, alfa] = cuerpo.split('/').map((p) => p.trim());
    const partes = color.split(/\s+/);
    if (partes.length !== 3 || partes.some((p) => p === 'none' || p.includes('var('))) return todo;
    const l = numero(partes[0], true);
    const c = numero(partes[1]);
    const h = numero(partes[2]);
    if ([l, c, h].some((n) => Number.isNaN(n))) return todo;
    const [r, g, b] = oklchARgb(l, c, h);
    if (alfa === undefined) return `rgb(${r},${g},${b})`;
    const al = numero(alfa, true);
    return Number.isNaN(al) ? todo : `rgba(${r},${g},${b},${+al.toFixed(3)})`;
  });
}

function argumentos(valor: string): string {
  return valor
    .replace(/\)\s*var\(/g, ') var(')
    .trim()
    .split(/\s+(?![^(]*\))/)
    .join(',');
}

export function convertirTransformSueltos(css: string): string {
  return css.replace(/([;{])(translate|scale|rotate):([^;}]+)/g, (todo, antes: string, prop: string, valor: string) => {
    const v = valor.trim();
    if (v === 'none') return todo;
    return `${antes}transform:${prop}(${argumentos(v)})`;
  });
}

/**
 * Diagnóstico remoto opcional (CODEC_DIAG_URL=http://IP:8081/log): la app
 * reporta versión del WebView, errores y estado de la pantalla a ese equipo.
 * Sirve cuando la terminal no tiene depuración USB ni inalámbrica.
 */
function scriptDiagnostico(url: string): string {
  return `<script>
(function(){
  var U=${JSON.stringify(url)}, n=0;
  function env(t,d){ if(n++>300)return; try{ var x=new XMLHttpRequest(); x.open('POST',U,true); x.setRequestHeader('Content-Type','text/plain;charset=utf-8'); x.send(t+' | '+String(d).slice(0,3000)); }catch(e){} }
  window.__diag=env;
  env('INICIO', navigator.userAgent+' | pantalla '+screen.width+'x'+screen.height+' dpr '+devicePixelRatio);
  window.addEventListener('error',function(e){ env('ERROR', (e.message||'')+' @ '+(e.filename||(e.target&&(e.target.src||e.target.href))||'')+':'+(e.lineno||'')+' '+(e.error&&e.error.stack||'')); },true);
  window.addEventListener('unhandledrejection',function(e){ var r=e.reason; env('PROMESA', r&&(r.stack||r.message)||r); });
  var ce=console.error;
  console.error=function(){ env('CONSOLE.ERROR', [].map.call(arguments,function(a){try{return a&&a.stack||(typeof a==='object'?JSON.stringify(a):a)}catch(_){return a}}).join(' ')); return ce.apply(console,arguments); };
  setTimeout(function(){
    var P=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.ImpresoraPos;
    if(!P){ env('IMPRESORA','plugin no disponible'); return; }
    P.listar().then(function(r){ env('IMPRESORA', JSON.stringify(r)); }, function(e){ env('IMPRESORA ERROR', e&&e.message||e); });
  },4000);
  var k=0, iv=setInterval(function(){ k++;
    env('ESTADO '+k*5+'s', location.href+' | texto: '+(document.body?document.body.innerText.replace(/[\\s]+/g,' ').slice(0,300):''));
    if(k>=6) clearInterval(iv);
  },5000);
})();
</script>`;
}

/**
 * Degradados: Tailwind 4 los escribe como `to right in oklab` (espacio de
 * interpolación, Chrome 111). Chrome 101 descarta el degradado entero y los
 * botones de color quedan en blanco con letra blanca. Sin el `in oklab` el
 * degradado se mezcla en sRGB, casi idéntico a la vista.
 * Alturas dvh/svh/lvh (Chrome 108) pasan a vh: en pantalla completa es igual.
 */
export function convertirDegradadosYAlturas(css: string): string {
  return css
    .replace(
      /(--tw-gradient-position:[^;}]*?)\s+in\s+(?:oklab|oklch|srgb|lab|lch|hsl|hwb)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?/g,
      '$1',
    )
    .replace(/(\d)(?:dvh|svh|lvh)\b/g, '$1vh');
}

/**
 * Filtros: Tailwind 4 arma `filter:var(--tw-blur,)var(--tw-brightness,)…`
 * (variables con respaldo vacío). Chrome 101 deja el filtro inválido y el
 * brillo desenfocado detrás del total se ve como una caja sólida. En cada regla
 * que define el desenfoque se pone el filtro directo.
 * Texto con degradado (bg-clip-text + text-transparent): se refuerza con
 * -webkit-text-fill-color, que Chrome 101 respeta, para que el número del total
 * salga verde y no negro.
 */
export function convertirFiltrosYTextoDegradado(css: string): string {
  const conFiltros = css.replace(/\{([^{}]*)\}/g, (bloque, cuerpo: string) => {
    let c = cuerpo;
    const blur = c.match(/--tw-blur:([^;}]+)/)?.[1];
    if (blur) c = c.replace(/(^|;)filter:var\(--tw-blur,\)[^;}]*/, `$1filter:${blur}`);
    const bblur = c.match(/--tw-backdrop-blur:([^;}]+)/)?.[1];
    if (bblur) {
      c = c.replace(/(^|;)-webkit-backdrop-filter:var\(--tw-backdrop-blur,\)[^;}]*/, `$1-webkit-backdrop-filter:${bblur}`);
      c = c.replace(/(^|;)backdrop-filter:var\(--tw-backdrop-blur,\)[^;}]*/, `$1backdrop-filter:${bblur}`);
    }
    return c === cuerpo ? bloque : `{${c}}`;
  });
  return css.includes('.bg-clip-text{')
    ? `${conFiltros}\n.bg-clip-text.text-transparent{-webkit-text-fill-color:transparent}`
    : conFiltros;
}

export function compatAndroid(): Plugin {
  const diag = process.env.CODEC_DIAG_URL;
  return {
    name: 'codec-compat-android',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return diag ? html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
${scriptDiagnostico(diag)}`) : html;
    },
    generateBundle(_opts, bundle) {
      for (const archivo of Object.values(bundle)) {
        if (archivo.type === 'asset' && archivo.fileName.endsWith('.css')) {
          const css = typeof archivo.source === 'string' ? archivo.source : new TextDecoder().decode(archivo.source);
          archivo.source = convertirFiltrosYTextoDegradado(convertirDegradadosYAlturas(convertirTransformSueltos(convertirOklch(css))));
        }
      }
    },
  };
}
