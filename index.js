import '@riotjs/hot-reload';
import { install, component } from 'riot';
import '@shoelace-style/shoelace/dist/themes/light.css';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path';
setBasePath(
  'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/',
);

import '@/assets/style.css';
import '@/utils/shoelace-components';
import App from '@/app.riot';
import registerGlobalComponents from '@/register-global-components';
import i18nStore from '@/stores/i18n-store';

// register
registerGlobalComponents();

install((componentAPI) => {
  componentAPI.t = i18nStore.t.bind(i18nStore);

  return componentAPI;
});

component(App)(document.getElementById('root'));
