import observable, { type ObservableInstance } from '@riotjs/observable';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(
    amount,
  );
}

const MONTHLY_PAYMENT_LINK_URL =
  import.meta.env.VITE_STRIPE_PAYMENT_LINK_MONTHLY_URL || '';
const YEARLY_PAYMENT_LINK_URL =
  import.meta.env.VITE_STRIPE_PAYMENT_LINK_YEARLY_URL || '';
const CUSTOMER_PORTAL_URL =
  import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL || '';

interface PricingPlan {
  amount: number;
  currency: string;
}

interface MembershipStore extends ObservableInstance<unknown> {
  premiumEpisodeIds: Set<string>;
  _loaded: boolean;
  _unsub: (() => void) | null;
  _unsubPricing: (() => void) | null;
  monthlyPricing: PricingPlan | null;
  yearlyPricing: PricingPlan | null;
  init(): void;
  /**
   * @returns true=premium, false=非premium, null=判定不能（未ロードまたはエラー）
   */
  isEpisodePremium(episodeId: string): boolean | null;
  /**
   * Payment Link URL を返す。uid を渡すと ?client_reference_id=<uid> を付与し、
   * Webhook 側でメール検索を経由せず直接 Firebase UID でユーザーを特定できる。
   * 未ログインの場合は uid なしでそのまま返す（Webhook 側でメール検索フォールバック）。
   */
  getMonthlyPaymentLinkUrl(uid?: string | null): string | null;
  getYearlyPaymentLinkUrl(uid?: string | null): string | null;
  getCustomerPortalUrl(): string | null;
  getFormattedMonthlyPrice(): string | null;
  getFormattedYearlyPrice(): string | null;
  destroy(): void;
}

function buildPaymentUrl(baseUrl: string, uid?: string | null): string | null {
  if (!baseUrl) return null;
  if (!uid) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('client_reference_id', uid);
  return url.toString();
}

const membershipStore = observable({
  premiumEpisodeIds: new Set<string>(),
  _loaded: false,
  _unsub: null as (() => void) | null,
  _unsubPricing: null as (() => void) | null,
  monthlyPricing: null as PricingPlan | null,
  yearlyPricing: null as PricingPlan | null,

  init(this: MembershipStore): void {
    if (this._unsub) return;
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
        this._loaded = false;
        this._unsub = null;
        this.premiumEpisodeIds = new Set();
        this.trigger('premium-episodes-changed');
      },
    );

    // config/pricing を購読して Stripe の価格をリアルタイム反映
    if (!this._unsubPricing) {
      const pricingRef = doc(db, 'config', 'pricing');
      this._unsubPricing = onSnapshot(
        pricingRef,
        (snap) => {
          const data = snap.data();
          this.monthlyPricing = data?.monthly ?? null;
          this.yearlyPricing = data?.yearly ?? null;
          this.trigger('pricing-changed');
        },
        (error) => {
          console.error('Failed to subscribe pricing:', error);
        },
      );
    }
  },

  isEpisodePremium(this: MembershipStore, episodeId: string): boolean | null {
    if (!this._loaded) return null;
    return this.premiumEpisodeIds.has(episodeId);
  },

  getMonthlyPaymentLinkUrl(uid?: string | null): string | null {
    return buildPaymentUrl(MONTHLY_PAYMENT_LINK_URL, uid);
  },

  getYearlyPaymentLinkUrl(uid?: string | null): string | null {
    return buildPaymentUrl(YEARLY_PAYMENT_LINK_URL, uid);
  },

  getCustomerPortalUrl(): string | null {
    return CUSTOMER_PORTAL_URL || null;
  },

  getFormattedMonthlyPrice(this: MembershipStore): string | null {
    if (!this.monthlyPricing) return null;
    return formatPrice(
      this.monthlyPricing.amount,
      this.monthlyPricing.currency,
    );
  },

  getFormattedYearlyPrice(this: MembershipStore): string | null {
    if (!this.yearlyPricing) return null;
    return formatPrice(this.yearlyPricing.amount, this.yearlyPricing.currency);
  },

  destroy(this: MembershipStore): void {
    this._loaded = false;
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    if (this._unsubPricing) {
      this._unsubPricing();
      this._unsubPricing = null;
    }
  },
}) as unknown as MembershipStore;

export default membershipStore;
