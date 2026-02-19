/**
 * @riotjs/route はクエリパラメータ付き URL でルートマッチしないため
 * ルーター起動前にメールリンク URL を退避し、パスのみに書き換える
 */
let _emailLinkUrl = null;

export function captureEmailLinkUrl() {
  if (
    window.location.search.includes('apiKey=') &&
    window.location.search.includes('oobCode=')
  ) {
    _emailLinkUrl = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
  }
}

export function consumeEmailLinkUrl() {
  const url = _emailLinkUrl;
  _emailLinkUrl = null;
  return url;
}
