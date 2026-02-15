import observable from '@riotjs/observable';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import { db } from '@/services/firebase';
import app from '@/services/firebase';

const functions = getFunctions(app);

const membershipStore = observable({
  premiumEpisodeIds: new Set(),
  _unsub: null,

  init() {
    const colRef = collection(db, 'premiumEpisodes');
    this._unsub = onSnapshot(colRef, (snapshot) => {
      this.premiumEpisodeIds = new Set(snapshot.docs.map((doc) => doc.id));
      this.trigger('premium-episodes-changed');
    });
  },

  isEpisodePremium(episodeId) {
    return this.premiumEpisodeIds.has(episodeId);
  },

  async createCheckoutSession() {
    const createSession = httpsCallable(functions, 'createCheckoutSession');
    const result = await createSession({ origin: window.location.origin });
    const { url } = result.data;
    if (url) {
      window.location.href = url;
    }
  },

  async openCustomerPortal() {
    const createPortal = httpsCallable(functions, 'customerPortalSession');
    const result = await createPortal({ origin: window.location.origin });
    const { url } = result.data;
    if (url) {
      window.location.href = url;
    }
  },

  destroy() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },
});

export default membershipStore;
