import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// 🩹 `vite dev` sólo sirve automáticamente el `index.html` que está en la
// raíz del proyecto — como este repo comparte raíz con Electron (que ya
// tiene SU PROPIO `index.html`, entry `src/index.tsx`), sin este middleware
// el server de la PWA (puerto 5174) terminaba sirviendo el HTML de
// Electron en cualquier navegación (`/app/`, `/app/#/lo-que-sea`), booteando
// la app de escritorio (HashRouter, sidebar con módulos premium de Electron)
// dentro de lo que debía ser la PWA. `vite build` no tiene este problema
// (usa `build.rollupOptions.input` → `index.pwa.html` correctamente), solo
// el dev server necesita este empujón para usar el HTML correcto.
function pwaIndexFallback(): Plugin {
  const indexPwaPath = path.resolve(__dirname, 'index.pwa.html')
  return {
    name: 'pwa-index-fallback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const url = req.url || ''
        const accept = req.headers.accept || ''
        const rutaSinQuery = url.split('?')[0]
        // Solo navegaciones HTML sin extensión de archivo (assets/JS/API siguen su curso normal)
        if (!accept.includes('text/html')) return next()
        if (path.extname(rutaSinQuery)) return next()
        try {
          const html = fs.readFileSync(indexPwaPath, 'utf-8')
          const transformed = await server.transformIndexHtml(url, html, req.originalUrl)
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html')
          res.end(transformed)
        } catch (e) {
          next(e as Error)
        }
      })
    },
  }
}

// Segundo entry point, independiente del build de Electron (vite.config.ts):
// misma app React/Tailwind/shadcn, pero servida como PWA real instalable
// (base:'/', browser router, manifest + service worker). No toca `npm run
// build`/`dist/` de Electron en absoluto.
export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    pwaIndexFallback(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      cleanupOutdatedCaches: true,
      includeAssets: ['logo.png'],
      // 🌐 Fase 5 (arquitectura unificada): la PWA ahora comparte dominio con
      // la landing comercial (`landing/`, servida en la raíz del mismo
      // subdominio por `vercel.json`) — la PWA vive bajo `/app/` en vez de
      // la raíz. `start_url`/`scope` deben apuntar ahí para que el service
      // worker no intente controlar la landing, y para que "Instalar app"
      // desde el navegador abra `/app/`, no `/`.
      manifest: {
        name: 'CODEC POS',
        short_name: 'CODEC POS',
        description: 'Gestiona tu negocio CODEC POS desde el celular',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: '/app/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/app/logo.png', sizes: '512x512', type: 'image/png' },
          { src: '/app/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  root: '.',
  // 🛡️ Caché de deps SEPARADO del vite.config.ts de Electron. Ambos servers
  // corriendo a la vez con el mismo cacheDir por defecto (node_modules/.vite)
  // corrompían el optimizador de dependencias entre sí (504 "Outdated
  // Optimize Dep" persistente, página en blanco sin error visible).
  cacheDir: 'node_modules/.vite-pwa',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  // Base '/app/' (antes '/'): la PWA se sirve bajo ese subpath del mismo
  // dominio que la landing — ver comentario del manifest arriba y
  // `src/pwa/routes.tsx` (basename del router) para el resto del cambio.
  base: '/app/',
  build: {
    // Sale directo en su propia subcarpeta dentro de dist-pwa/ para que
    // `vercel.json` pueda copiar la landing en la raíz de ese mismo output
    // sin que se pisen entre sí.
    outDir: 'dist-pwa/app',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.pwa.html'),
    },
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5174,
    strictPort: false,
    host: true,
    cors: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
})
