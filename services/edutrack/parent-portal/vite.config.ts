import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // The app folder, not the working directory: the dev server may be started from the repo root.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  return {
    // Served under the school's address: <school>.edutrack.ng/parent/ (greenfield.localhost/parent/
    // through the local router). Links, assets and the router all start with it.
    base: '/parent/',
    plugins: [vue(), tailwindcss(), command === 'serve' && vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      // Same-site API calls, so the refresh cookie (Path=/api/v1/auth) stays first-party. The
      // portal's Host is kept (changeOrigin: false) so the API sees which address was used.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET ?? 'http://localhost:8000', changeOrigin: false },
      },
    },
    preview: { port: 5174, strictPort: true },
  };
});
