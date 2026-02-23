/**
 * @riotjs/route はクエリパラメータ付き URL でルートマッチしないため
 * ルーター起動前にメールリンク URL を退避し、パスのみに書き換える
 * sessionStorage に保存することで、ページリフレッシュ後も復元可能にする
 *
 * ## セキュリティ上の考慮事項
 *
 * sessionStorage には `apiKey` と `oobCode` を含む完全な URL が一時保存される。
 * `oobCode` はサインインを完了できる使い捨てトークンであり、取り扱いに注意が必要。
 *
 * ### リスク
 * - XSS 攻撃により同一オリジンのスクリプトが sessionStorage を読み取れる場合、
 *   `consumeEmailLinkUrl()` が呼ばれる前にトークンを窃取される可能性がある
 * - 端末への物理アクセスがある場合、ブラウザの開発者ツールで sessionStorage を確認できる
 *
 * ### 緩和措置（この実装が許容される理由）
 * 1. `window.history.replaceState()` により URL バーから即座にパラメータを除去し、
 *    ブラウザ履歴にトークンが残らない
 * 2. `consumeEmailLinkUrl()` は読み取りと同時に削除するため、存在時間が最小限
 * 3. sessionStorage はタブ単位で隔離され、タブを閉じると自動的に消去される
 *    （localStorage と異なりオリジン全体に共有されない）
 * 4. `oobCode` は Firebase により使い捨て（1回使用後に無効化）かつ短期間で期限切れ
 *
 * ### 残存リスクの受容
 * URL ベースの認証フローである以上、トークンをクライアントで一時保持することは
 * 避けられない。XSS に対する根本的な防御は Content Security Policy (CSP) 等の
 * 別レイヤーで担保する。
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
