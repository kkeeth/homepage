import '@riotjs/hot-reload';
import { install, component } from 'riot';

// Shoelace (設定はshoelace-components.jsに一本化)
import '@/utils/shoelace-components';

import '@/assets/style.css';
import App from '@/app.riot';
import registerGlobalComponents from '@/register-global-components';
import i18nStore from '@/stores/i18n-store';
import authStore from '@/stores/auth-store';
import membershipStore from '@/stores/membership-store';

// register
registerGlobalComponents();

// Initialize auth and membership
authStore.init();
membershipStore.init();

install((componentAPI) => {
  componentAPI.t = i18nStore.t.bind(i18nStore);

  return componentAPI;
});

component(App)(document.getElementById('root'));
