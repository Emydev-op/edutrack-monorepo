import './assets/main.css';

import { recallBrandColor } from '@edutrack/app-kit/lib/brand-memory';
import { applyBrandTheme } from '@edutrack/app-kit/lib/brand-theme';
import { createApp } from 'vue';

import App from './App.vue';

// Paint in the colour this school used last time before anything renders; the page refreshes it
// once the school has loaded.
applyBrandTheme(recallBrandColor());

createApp(App).mount('#app');
