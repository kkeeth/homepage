import '@riotjs/hot-reload';
import { install, component } from 'riot';

// Shoelace (設定はshoelace-components.jsに一本化)
import '@/utils/shoelace-components';

import '@/assets/style.css';
import App from '@/app.riot';
import registerGlobalComponents from '@/register-global-components';
import i18nStore from '@/stores/i18n-store';
import { validateFirebaseConfig } from '@/services/firebase';
import authStore from '@/stores/auth-store';
import membershipStore from '@/stores/membership-store';
import { captureEmailLinkUrl } from '@/utils/email-link';

// @riotjs/route はクエリパラメータ付きURLでルートマッチしないため
// ルーター起動前にメールリンクURLを sessionStorage に退避しパスだけに書き換える
// （sessionStorage はタブを閉じると破棄されるが、同一タブ内のスクリプトから参照可能なため取り扱いに注意する）
captureEmailLinkUrl();

// register
registerGlobalComponents();

try {
  validateFirebaseConfig();
  authStore.init();
  membershipStore.init();

  install((componentAPI) => {
    componentAPI.t = i18nStore.t.bind(i18nStore);
    return componentAPI;
  });

  component(App)(document.getElementById('root'));
} catch (err) {
  console.error('アプリの初期化に失敗しました:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#2c3e50;gap:1rem;">
        <p style="margin:0;">アプリの読み込みに失敗しました。しばらく待ってから再度お試しください。</p>
        <button onclick="location.reload()" style="padding:0.5rem 1.5rem;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">再読み込み</button>
      </div>
    `;
  }
}
