import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// El gateway solo permite CORS desde :8080, así que en desarrollo el proxy de Vite
// hace que el navegador hable siempre con su propio origen (rutas relativas).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_GATEWAY_URL || 'http://localhost:8000';
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
          navigateFallbackAllowlist: [/^\/$/, /^\/(login|inspector|supervisor|admin)(\/|$)/],
        },
        manifest: {
          name: 'Inspecciones de obra',
          short_name: 'Inspecciones',
          description: 'Gestión de inspecciones de obra municipales.',
          lang: 'es',
          theme_color: '#047857',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/(auth|api|mobile)(\/|$)/],
          ...(mode === 'development' && {
            runtimeCaching: [
              {
                urlPattern: ({ request, url }) =>
                  url.origin === self.location.origin &&
                  (request.destination === 'script' || request.destination === 'style'),
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'development-app-resources',
                  networkTimeoutSeconds: 3,
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 7 * 24 * 60 * 60,
                  },
                },
              },
            ],
          }),
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/auth': { target, changeOrigin: true },
        '/api': { target, changeOrigin: true },
        '/mobile': { target, changeOrigin: true },
      },
    },
  };
});
