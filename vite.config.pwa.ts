import { defineConfig } from 'vite'
import path from 'path'
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

// Segundo entry point, independiente del build de Electron (vite.config.ts):
// misma app React/Tailwind/shadcn, pero servida como PWA real instalable
// (base:'/', browser router, manifest + service worker). No toca `npm run
// build`/`dist/` de Electron en absoluto.
export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'CODEC POS',
        short_name: 'CODEC POS',
        description: 'Gestiona tu negocio CODEC POS desde el celular',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
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
  base: '/',
  build: {
    outDir: 'dist-pwa',
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
