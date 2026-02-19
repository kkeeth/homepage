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

// Firebase メールリンクコールバック:
// @riotjs/route はクエリパラメータ付きURLでルートマッチしないため
// ルーター起動前にURLを退避してパスだけに書き換える
if (window.location.search.includes('apiKey=') && window.location.search.includes('oobCode=')) {
  sessionStorage.setItem('emailLinkUrl', window.location.href);
  window.history.replaceState(null, '', window.location.pathname);
}

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
