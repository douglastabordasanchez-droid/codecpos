import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

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

// Tercer entry point, independiente del build de Electron (vite.config.ts) y
// de la PWA (vite.config.pwa.ts): el Admin Web de Codec Studio. Mismo
// stack React/Tailwind/shadcn para reutilizar componentes y convenciones,
// pero es un bundle COMPLETAMENTE APARTE -- el código de administración
// comercial (clientes, licencias, precios) nunca se envía al bundle público
// del POS/PWA. Fase 4: separa la administración comercial de Electron sin
// tocar `npm run build`/`npm run dev:pwa`.
export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  root: '.',
  cacheDir: 'node_modules/.vite-admin',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg'],
  // 🌐 Comparte dominio con la PWA ('/app/') y la landing ('/') — vive bajo
  // '/admin/' en vez de la raíz para no chocar con los assets de las otras
  // dos. Ver App.tsx (basename '/admin') y vercel.json para el resto.
  base: '/admin/',
  build: {
    outDir: 'dist-admin',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.admin.html'),
    },
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5175,
    strictPort: false,
    host: true,
    cors: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
})
