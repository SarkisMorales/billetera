import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** "2026-10-30 · cc347d1": para saber qué versión corre cada teléfono (Ajustes, abajo de todo). */
function version(): string {
  let commit = 'local';
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* Sin git: queda "local". */
  }
  return `${new Date().toISOString().slice(0, 10)} · ${commit}`;
}

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version()) },
  // Rutas relativas: GitHub Pages la sirve desde /billetera/, no desde la raíz.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // El registro lo hace `datos/actualizacion.ts`, que además busca versión
      // nueva al volver a primer plano (el iPhone casi nunca recarga la app).
      injectRegister: false,
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Billetera',
        short_name: 'Billetera',
        description: 'Gastos personales en pesos y dólares, offline',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F5F7FB',
        theme_color: '#F5F7FB',
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
        // La versión nueva toma el control apenas se baja; `datos/actualizacion.ts`
        // recarga cuando no estás cargando nada.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
