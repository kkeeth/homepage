import observable, { type ObservableInstance } from '@riotjs/observable';
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
  type UserCredential,
} from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { getGravatarUrl } from '@/utils/gravatar';

const EMAIL_STORAGE_KEY = 'emailForSignIn';

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthStore extends ObservableInstance<unknown> {
  user: AuthUser | null;
  isPremium: boolean;
  isLoading: boolean;
  membershipPlan: string;
  subscriptionStatus: string | null;
  gravatarURL: string;
  _unsubUser: Unsubscribe | null;
  _unsubAuth: Unsubscribe | null;
  _readyPromise: Promise<void> | null;
  _resolveReady: (() => void) | null;
  init(): void;
  /**
   * Auth の初期化完了を待つ。
   *
   * `init()` 実行時に作成された単一の Promise インスタンスを返します。
   * この Promise は、最初の `onAuthStateChanged` コールバック内で一度だけ resolve され、
   * resolve 済みの後でも何度でも `ready()` を呼んで await することができます。
   * （JavaScript の Promise は一度 resolve されると、その結果を再利用できるため安全です）
   */
  ready(): Promise<void>;
  _subscribeUserDoc(uid: string): void;
  _cleanup(): void;
  /** マジックリンクメールを送信 */
  sendLoginLink(email: string): Promise<void>;
  /** メールリンクからのサインインを完了する */
  completeEmailLinkSignIn(
    url: string,
    providedEmail?: string | null,
  ): Promise<UserCredential>;
  /** Gravatar URL を返す */
  getAvatarUrl(): string;
  logout(): Promise<void>;
  isLoggedIn(): boolean;
  updateDisplayName(displayName: string): Promise<void>;
  sendEmailChangeVerification(newEmail: string): Promise<void>;
}

const authStore = observable({
  user: null as AuthUser | null,
  isPremium: false,
  isLoading: true,
  membershipPlan: 'free',
  subscriptionStatus: null as string | null,
  gravatarURL: '',
  _unsubUser: null as Unsubscribe | null,
  _unsubAuth: null as Unsubscribe | null,
  _readyPromise: null as Promise<void> | null,
  _resolveReady: null as (() => void) | null,

  init(this: AuthStore): void {
    if (this._readyPromise) return;
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    this._unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
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
      this._resolveReady?.();
    });
  },

  ready(this: AuthStore): Promise<void> {
    // init() 後は必ず非 null。init() 前に ready() を呼ぶのはプログラムエラー
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this._readyPromise!;
  },

  _subscribeUserDoc(this: AuthStore, uid: string): void {
    this._cleanup();
    const userRef = doc(db, 'users', uid);
    this._unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          this.membershipPlan = data['plan'] || 'free';
          this.isPremium =
            data['plan'] === 'premium' &&
            data['subscriptionStatus'] === 'active';
          this.subscriptionStatus = data['subscriptionStatus'] ?? null;
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

  _cleanup(this: AuthStore): void {
    if (this._unsubUser) {
      this._unsubUser();
      this._unsubUser = null;
    }
  },

  async sendLoginLink(this: AuthStore, email: string): Promise<void> {
    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem(EMAIL_STORAGE_KEY, email);
  },

  async completeEmailLinkSignIn(
    this: AuthStore,
    url: string,
    providedEmail: string | null = null,
  ): Promise<UserCredential> {
    if (!isSignInWithEmailLink(auth, url)) {
      throw new Error('Invalid email link');
    }
    const email = providedEmail || localStorage.getItem(EMAIL_STORAGE_KEY);
    if (!email) {
      const error = Object.assign(
        new Error('Email is required for verification'),
        {
          code: 'auth/email-required',
        },
      );
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

  getAvatarUrl(this: AuthStore): string {
    return this.gravatarURL || '';
  },

  async logout(this: AuthStore): Promise<void> {
    this._cleanup();
    return signOut(auth);
  },

  isLoggedIn(this: AuthStore): boolean {
    return !!this.user;
  },

  async updateDisplayName(this: AuthStore, displayName: string): Promise<void> {
    // auth.currentUser / this.user は isLoggedIn() を確認した呼び出し元が保証する
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await updateProfile(auth.currentUser!, { displayName });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.user = { ...this.user!, displayName };
    this.trigger('auth-changed');
  },

  async sendEmailChangeVerification(
    this: AuthStore,
    newEmail: string,
  ): Promise<void> {
    // auth.currentUser は isLoggedIn() を確認した呼び出し元が保証する
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await verifyBeforeUpdateEmail(auth.currentUser!, newEmail);
  },
}) as unknown as AuthStore;

export default authStore;
