import observable from '@riotjs/observable';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';

const googleProvider = new GoogleAuthProvider();

const authStore = observable({
  user: null,
  isPremium: false,
  isLoading: true,
  membershipPlan: 'free',
  subscriptionStatus: null,
  _unsubUser: null,
  _readyPromise: null,
  _resolveReady: null,

  init() {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        this.user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
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
      this._resolveReady();
    });
  },

  /** Auth の初期化完了を待つ */
  ready() {
    return this._readyPromise;
  },

  _subscribeUserDoc(uid) {
    this._cleanup();
    const userRef = doc(db, 'users', uid);
    this._unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          this.membershipPlan = data.plan || 'free';
          this.isPremium = data.plan === 'premium' && data.subscriptionStatus === 'active';
          this.subscriptionStatus = data.subscriptionStatus;
          this.trigger('membership-changed');
        } else {
          // ドキュメント未作成（初回ログイン）→ Cloud Functions 側で作成されるまで free
          this.membershipPlan = 'free';
          this.isPremium = false;
          this.subscriptionStatus = null;
          this.trigger('membership-changed');
        }
      },
      (error) => {
        console.error('Failed to subscribe user doc:', error);
      }
    );
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
