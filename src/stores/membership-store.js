import observable from '@riotjs/observable';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

const PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL || '';
const CUSTOMER_PORTAL_URL = import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL || '';

const membershipStore = observable({
  premiumEpisodeIds: new Set(),
  _unsub: null,

  init() {
    // Prevent duplicate subscriptions by destroying existing one first
    if (this._unsub) {
      this.destroy();
    }
    
    const colRef = collection(db, 'premiumEpisodes');
    this._unsub = onSnapshot(
      colRef,
      (snapshot) => {
        this.premiumEpisodeIds = new Set(snapshot.docs.map((d) => d.id));
        this.trigger('premium-episodes-changed');
      },
      (error) => {
        console.error('Failed to subscribe premiumEpisodes:', error);
      }
    );
  },

  isEpisodePremium(episodeId) {
    return this.premiumEpisodeIds.has(episodeId);
  },

  /**
   * Payment Link URL を返す
   * Webhook 側でメールアドレスからユーザーを特定するため client_reference_id は不要
   */
  getPaymentLinkUrl() {
    return PAYMENT_LINK_URL || null;
  },

  getCustomerPortalUrl() {
    return CUSTOMER_PORTAL_URL || null;
  },

  destroy() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },
});

export default membershipStore;
