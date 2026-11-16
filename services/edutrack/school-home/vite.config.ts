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
    // The root of the school's address: <school>.edutrack.ng/ (greenfield.localhost through the
    // local router). The portals live beside it under /teacher/, /parent/ and /student/.
    base: '/',
    plugins: [vue(), tailwindcss(), command === 'serve' && vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5175,
      strictPort: true,
      // The page's Host is kept (changeOrigin: false): the API reads the school from it.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET ?? 'http://localhost:8000', changeOrigin: false },
      },
    },
    preview: { port: 5175, strictPort: true },
  };
});
