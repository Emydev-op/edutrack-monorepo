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
    plugins: [vue(), tailwindcss(), command === 'serve' && vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5170,
      strictPort: true,
      // Same-site API calls: the refresh cookie (Path=/api/v1/auth) stays first-party. Keep the
      // portal's Host (changeOrigin: false) so the API sees where the request came from.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: false },
      },
    },
    preview: { port: 5170, strictPort: true },
  };
});
