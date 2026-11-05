import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// El gateway solo permite CORS desde :8080, así que en desarrollo el proxy de Vite
// hace que el navegador hable siempre con su propio origen (rutas relativas).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_GATEWAY_URL || 'http://localhost:8000';
  return {
    plugins: [react(), tailwindcss()],
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
