import './assets/main.css';

import { configureUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { createVueQueryOptions } from '@edutrack/web-core/query';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';
import { installSchoolTheme } from './lib/school-theme';
import { useAuthStore } from './stores/auth';

async function bootstrap() {
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(VueQueryPlugin, createVueQueryOptions());
  // Signing out already warns about unsaved changes, so leaving must not ask again.
  configureUnsavedChanges({ shouldAsk: () => useAuthStore().isAuthenticated });
  installSchoolTheme();

  await router.isReady();
  app.mount('#app');
}

void bootstrap();
