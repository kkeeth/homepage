import observable, { type ObservableInstance } from '@riotjs/observable';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

const MONTHLY_PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_MONTHLY_URL || '';
const YEARLY_PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_YEARLY_URL || '';
const CUSTOMER_PORTAL_URL =
  import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL || '';

interface MembershipStore extends ObservableInstance<unknown> {
  premiumEpisodeIds: Set<string>;
  _loaded: boolean;
  _unsub: (() => void) | null;
  init(): void;
  /**
   * @returns true=premium, false=非premium, null=判定不能（未ロードまたはエラー）
   */
  isEpisodePremium(episodeId: string): boolean | null;
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
  getMonthlyPaymentLinkUrl(): string | null;
  getYearlyPaymentLinkUrl(): string | null;
  getCustomerPortalUrl(): string | null;
  destroy(): void;
}

const membershipStore = observable({
  premiumEpisodeIds: new Set<string>(),
  _loaded: false,
  _unsub: null as (() => void) | null,

  init(this: MembershipStore): void {
    if (this._unsub) this.destroy(); // 既存の購読がある場合のみクリーンアップ
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

  isEpisodePremium(this: MembershipStore, episodeId: string): boolean | null {
    if (!this._loaded) return null;
    return this.premiumEpisodeIds.has(episodeId);
  },

  getMonthlyPaymentLinkUrl(): string | null {
    return MONTHLY_PAYMENT_LINK_URL || null;
  },

  getYearlyPaymentLinkUrl(): string | null {
    return YEARLY_PAYMENT_LINK_URL || null;
  },

  getCustomerPortalUrl(): string | null {
    return CUSTOMER_PORTAL_URL || null;
  },

  destroy(this: MembershipStore): void {
    this._loaded = false;
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },
}) as unknown as MembershipStore;

export default membershipStore;
