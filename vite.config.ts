import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Tshwane RapidLink',
        short_name: 'RapidLink',
        description: 'One press connects a person in distress with available responders.',
        start_url: '/client',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#003172',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{html,js,css,png,svg,webmanifest}'],
        runtimeCaching: [{
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: { cacheName: 'rapidlink-pages', networkTimeoutSeconds: 4 },
        }],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
