import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: GitHub Pages la sirve desde /billetera/, no desde la raíz.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Billetera',
        short_name: 'Billetera',
        description: 'Gastos personales en pesos y dólares, offline',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#101319',
        theme_color: '#101319',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo el bundle queda cacheado: después de la primera carga anda sin red.
        // La cotización NO se cachea acá: la app guarda la última en la base.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
