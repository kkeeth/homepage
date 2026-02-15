import observable from '@riotjs/observable';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';

const googleProvider = new GoogleAuthProvider();

const authStore = observable({
  user: null,
  isPremium: false,
  isLoading: true,
  membershipPlan: 'free',
  subscriptionStatus: null,
  _unsubUser: null,

  init() {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        this.user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        await this._ensureUserDoc(firebaseUser.uid, firebaseUser.email);
        this._subscribeUserDoc(firebaseUser.uid);
      } else {
        this._cleanup();
        this.user = null;
        this.isPremium = false;
        this.membershipPlan = 'free';
        this.subscriptionStatus = null;
      }
      this.isLoading = false;
      this.trigger('auth-changed');
    });
  },

  async _ensureUserDoc(uid, email) {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email,
        plan: 'free',
        stripeCustomerId: null,
        subscriptionId: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
        createdAt: new Date().toISOString(),
      });
    }
  },

  _subscribeUserDoc(uid) {
    this._cleanup();
    const userRef = doc(db, 'users', uid);
    this._unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        this.membershipPlan = data.plan || 'free';
        this.isPremium = data.plan === 'premium' && data.subscriptionStatus === 'active';
        this.subscriptionStatus = data.subscriptionStatus;
        this.trigger('membership-changed');
      }
    });
  },

  _cleanup() {
    if (this._unsubUser) {
      this._unsubUser();
      this._unsubUser = null;
    }
  },

  async loginWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },

  async signupWithEmail(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  },

  async loginWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  },

  async logout() {
    this._cleanup();
    return signOut(auth);
  },

  isLoggedIn() {
    return !!this.user;
  },
});

export default authStore;
