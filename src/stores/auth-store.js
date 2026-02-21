import observable from '@riotjs/observable';
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { getGravatarUrl } from '@/utils/gravatar';

const EMAIL_STORAGE_KEY = 'emailForSignIn';

const authStore = observable({
  user: null,
  isPremium: false,
  isLoading: true,
  membershipPlan: 'free',
  subscriptionStatus: null,
  gravatarURL: '',
  _unsubUser: null,
  _readyPromise: null,
  _resolveReady: null,

  init() {
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        this.user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        };
        if (firebaseUser.email) {
          this.gravatarURL = await getGravatarUrl(firebaseUser.email);
        }
        this._subscribeUserDoc(firebaseUser.uid);
      } else {
        this._cleanup();
        this.user = null;
        this.isPremium = false;
        this.membershipPlan = 'free';
        this.subscriptionStatus = null;
        this.gravatarURL = '';
      }
      this.isLoading = false;
      this.trigger('auth-changed');
      this._resolveReady();
    });
  },

  /**
   * Auth の初期化完了を待つ。
   *
   * `init()` 実行時に作成された単一の Promise インスタンスを返します。
   * この Promise は、最初の `onAuthStateChanged` コールバック内で一度だけ resolve され、
   * resolve 済みの後でも何度でも `ready()` を呼んで await することができます。
   * （JavaScript の Promise は一度 resolve されると、その結果を再利用できるため安全です）
   */
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
          this.isPremium =
            data.plan === 'premium' && data.subscriptionStatus === 'active';
          this.subscriptionStatus = data.subscriptionStatus;
          this.trigger('membership-changed');
        } else {
          this.membershipPlan = 'free';
          this.isPremium = false;
          this.subscriptionStatus = null;
          this.trigger('membership-changed');
        }
      },
      (error) => {
        console.error('Failed to subscribe user doc:', error);
      },
    );
  },

  _cleanup() {
    if (this._unsubUser) {
      this._unsubUser();
      this._unsubUser = null;
    }
  },

  /**
   * マジックリンクメールを送信
   * @param {string} email
   */
  async sendLoginLink(email) {
    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem(EMAIL_STORAGE_KEY, email);
  },

  /**
   * メールリンクからのサインインを完了する
   * @param {string} url
   * @param {string} [providedEmail] - オプションで指定するメールアドレス
   */
  async completeEmailLinkSignIn(url, providedEmail = null) {
    if (!isSignInWithEmailLink(auth, url)) {
      throw new Error('Invalid email link');
    }
    let email = providedEmail || localStorage.getItem(EMAIL_STORAGE_KEY);
    if (!email) {
      const error = new Error('Email is required for verification');
      error.code = 'auth/email-required';
      throw error;
    }
    const result = await signInWithEmailLink(auth, email, url);
    localStorage.removeItem(EMAIL_STORAGE_KEY);

    // onAuthStateChanged の発火を待たずに即座に user と gravatarURL をセット
    // これにより router.push('/account') 後の isLoggedIn() チェックが正しく動作する
    this.user = {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
    };
    if (result.user.email) {
      this.gravatarURL = await getGravatarUrl(result.user.email);
    }

    return result;
  },

  /**
   * Gravatar URL を返す
   * @returns {string}
   */
  getAvatarUrl() {
    return this.gravatarURL || '';
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
