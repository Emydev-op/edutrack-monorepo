import './assets/main.css';

import { createVueQueryOptions } from '@edutrack/web-core/query';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, createVueQueryOptions());

app.mount('#app');
