import { createApp } from 'vue';
import { createPinia } from 'pinia';
import TDesign from 'tdesign-vue-next';
import App from './App.vue';
import router from '@/router/index.ts';
import 'tdesign-vue-next/es/style/index.css';
import '@/styles/index.scss';
import { useThemeStore } from '@/stores/themeStore';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(TDesign);

// 尽早同步 html[theme-mode]，避免首屏闪一下浅色
useThemeStore(pinia).init();

app.mount('#app');
