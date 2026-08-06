import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(), // ✅ SIN configuración de Babel (Vite ya optimiza todo)
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Optimizaciones para Electron
  base: './',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    
    // ✅ OPTIMIZACIÓN EXTREMA PARA MÁXIMA VELOCIDAD
    rollupOptions: {
      output: {
        // ⚡ REDUCIR CHUNKS para carga más rápida
        manualChunks: {
          // Core mínimo
          'vendor': ['react', 'react-dom', 'react-router'],
          // UI solo cuando se necesite
          'ui': ['lucide-react', 'sonner'],
        },
        
        // ✅ Nombres compactos
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]',
        
        // ✅ Máxima compresión
        compact: true,
        generatedCode: {
          constBindings: true,
          objectShorthand: true,
        },
      }
    },
    
    // ⚡ ESBUILD = 100x MÁS RÁPIDO QUE TERSER
    minify: 'esbuild',
    
    // ⚡ Target moderno = código más pequeño y rápido
    target: 'es2020',
    
    // ✅ Sin warnings
    chunkSizeWarningLimit: 2000,
    
    // ⚡ NO sourcemaps = 50% menos peso
    sourcemap: false,
    
    // ⚡ CSS en mismo archivo = menos requests HTTP
    cssCodeSplit: false,
    
    // ⚡ Inline assets pequeños = menos requests
    assetsInlineLimit: 8192, // 8KB (antes 4KB)
    
    // ⚡ Reducir CSS
    cssMinify: 'esbuild',
    
    // ⚡ Reportar tamaño comprimido
    reportCompressedSize: false, // Más rápido
  },

  // ✅ OPTIMIZACIÓN: Pre-bundling MÍNIMO
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router',
    ],
    exclude: ['electron'],
    
    // ⚡ esbuild ultra-rápido
    esbuildOptions: {
      target: 'es2020',
      supported: {
        'top-level-await': true
      },
      // ⚡ Optimizaciones extras
      minify: true,
      treeShaking: true,
    }
  },

  // ✅ Servidor de desarrollo ULTRA-OPTIMIZADO
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    
    // ⚡ HMR mínimo
    hmr: {
      overlay: false, // Sin overlay = menos memoria
      host: '0.0.0.0',
      protocol: 'ws',
    },

    // ✅ Permitir acceso estable desde red local (LAN)
    cors: true,
    
    // ⚡ Pre-transform solo lo necesario
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/app/App.tsx',
      ]
    }
  },
  
  // ⚡ OPTIMIZACIONES ESBUILD MÁXIMAS
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    legalComments: 'none',
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    // ⚡ Eliminar console.log en producción
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // ⚡ JSX optimizado
    jsx: 'automatic',
    jsxDev: false,
  }
})