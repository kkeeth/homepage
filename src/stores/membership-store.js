import observable from '@riotjs/observable';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

const PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL || '';
const CUSTOMER_PORTAL_URL =
  import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL || '';

const membershipStore = observable({
  premiumEpisodeIds: new Set(),
  _loaded: false,
  _unsub: null,

  init() {
    this._loaded = false;
    this.destroy(); // 念のため既存の購読をクリーンアップ
    const colRef = collection(db, 'premiumEpisodes');
    this._unsub = onSnapshot(
      colRef,
      (snapshot) => {
        this.premiumEpisodeIds = new Set(snapshot.docs.map((d) => d.id));
        this._loaded = true;
        this.trigger('premium-episodes-changed');
      },
      (error) => {
        console.error('Failed to subscribe premiumEpisodes:', error);
        // _loaded は false のまま保持 → isEpisodePremium が null を返し fail-closed になる
        this.trigger('premium-episodes-changed');
      },
    );
  },

  /**
   * @returns {boolean|null} true=premium, false=非premium, null=判定不能（未ロードまたはエラー）
   */
  isEpisodePremium(episodeId) {
    if (!this._loaded) return null;
    return this.premiumEpisodeIds.has(episodeId);
  },

  /**
   * Payment Link URL を返す
   *
   * 設計方針: client_reference_id を使わず、Webhook 側でメールアドレスからユーザーを特定
   *
   * 理由:
   * - Stripe Payment Links は client_reference_id をサポートしていない
   * - メールアドレスは Checkout Session から確実に取得できる
   *
   * トレードオフと制限:
   * - メールアドレス変更時: 初回決済時のメールで Firebase Auth ユーザーを作成/特定するため、
   *   その後ユーザーがメールアドレスを変更しても、Stripe Customer の metadata に保存した
   *   firebaseUID で継続的に追跡可能（metadata は stripeWebhook で自動設定される）
   * - 異なるメールでの再購入: 新しいメールアドレスで決済した場合、別の Firebase Auth
   *   ユーザーとして扱われる（これは意図的な動作）
   * - メールアドレスの一意性: Firebase Auth のメール認証を前提としているため、同じメール
   *   アドレスで複数のユーザーが作成されることはない
   */
  getPaymentLinkUrl() {
    return PAYMENT_LINK_URL || null;
  },

  getCustomerPortalUrl() {
    return CUSTOMER_PORTAL_URL || null;
  },

  destroy() {
    this._loaded = false;
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },
});

export default membershipStore;
