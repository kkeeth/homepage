import observable from '@riotjs/observable';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import authStore from '@/stores/auth-store';

const PAYMENT_LINK_URL = import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL || '';
const CUSTOMER_PORTAL_URL = import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL || '';

const membershipStore = observable({
  premiumEpisodeIds: new Set(),
  _unsub: null,

  init() {
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
   * client_reference_id に Firebase UID を付与して Webhook で紐付ける
   */
  getPaymentLinkUrl() {
    if (!PAYMENT_LINK_URL) return null;
    const uid = authStore.user?.uid;
    if (!uid) return PAYMENT_LINK_URL;
    return `${PAYMENT_LINK_URL}?client_reference_id=${uid}`;
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
