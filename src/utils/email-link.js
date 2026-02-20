/**
 * @riotjs/route はクエリパラメータ付き URL でルートマッチしないため
 * ルーター起動前にメールリンク URL を退避し、パスのみに書き換える
 * sessionStorage に保存することで、ページリフレッシュ後も復元可能にする
 */
const STORAGE_KEY = 'emailLinkUrl';

export function captureEmailLinkUrl() {
  if (
    window.location.search.includes('apiKey=') &&
    window.location.search.includes('oobCode=')
  ) {
    const emailLinkUrl = window.location.href;
    sessionStorage.setItem(STORAGE_KEY, emailLinkUrl);
    window.history.replaceState(null, '', window.location.pathname);
  }
}

export function consumeEmailLinkUrl() {
  const url = sessionStorage.getItem(STORAGE_KEY);
  if (url) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return url;
}
