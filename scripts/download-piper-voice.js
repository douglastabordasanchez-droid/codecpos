/**
 * Descarga el modelo de voz Piper (es_AR-daniela-high, ~114MB) si no está
 * presente en electron/resources/piper/voices/. No va en el repo porque
 * supera el límite de 100MB de GitHub (ver .gitignore) — así que cada build
 * lo trae de Hugging Face antes de empaquetar. Si ya existe con el tamaño
 * correcto, no vuelve a descargar.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const VOICES_DIR = path.join(ROOT, 'electron', 'resources', 'piper', 'voices');
const MODELO = {
  archivo: 'es_AR-daniela-high.onnx',
  url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx',
  tamanoEsperado: 114199011,
};

function descargar(url, destino, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiadas redirecciones'));
    const archivo = fs.createWriteStream(destino);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          archivo.close();
          fs.unlinkSync(destino);
          descargar(res.headers.location, destino, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          archivo.close();
          fs.unlinkSync(destino);
          reject(new Error(`HTTP ${res.statusCode} descargando ${url}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let recibido = 0;
        let ultimoReporte = 0;
        res.on('data', (chunk) => {
          recibido += chunk.length;
          if (total && Date.now() - ultimoReporte > 2000) {
            ultimoReporte = Date.now();
            const pct = ((recibido / total) * 100).toFixed(0);
            console.log(`  ${pct}% (${(recibido / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
          }
        });
        res.pipe(archivo);
        archivo.on('finish', () => archivo.close(resolve));
      })
      .on('error', (error) => {
        archivo.close();
        fs.unlink(destino, () => {});
        reject(error);
      });
  });
}

async function main() {
  fs.mkdirSync(VOICES_DIR, { recursive: true });
  const destino = path.join(VOICES_DIR, MODELO.archivo);

  if (fs.existsSync(destino)) {
    const { size } = fs.statSync(destino);
    if (size === MODELO.tamanoEsperado) {
      console.log(`✅ Voz Piper ya presente (${MODELO.archivo}, ${(size / 1024 / 1024).toFixed(1)}MB) — sin descarga.`);
      return;
    }
    console.warn(`⚠️  ${MODELO.archivo} presente pero con tamaño distinto al esperado — se vuelve a descargar.`);
    fs.unlinkSync(destino);
  }

  console.log(`⬇️  Descargando voz Piper (${MODELO.archivo}, ~${(MODELO.tamanoEsperado / 1024 / 1024).toFixed(0)}MB)...`);
  const tmp = destino + '.tmp';
  await descargar(MODELO.url, tmp);
  fs.renameSync(tmp, destino);
  console.log('✅ Voz Piper descargada.');
}

main().catch((error) => {
  console.error('❌ Error descargando la voz Piper:', error.message);
  console.error('   El build continuará, pero la voz embebida no estará disponible (cae a Web Speech API).');
  // No se aborta el build por esto — la voz es una mejora, no un bloqueante.
  process.exit(0);
});
