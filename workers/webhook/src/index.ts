/**
 * Stripe Webhook Worker
 *
 * Firebase Functions の代替実装。npm 依存ゼロで以下を処理する:
 *   - Stripe Webhook 署名検証 (Web Crypto API / HMAC-SHA256)
 *   - Firestore REST API 経由のデータ書き込み (サービスアカウント JWT / RS256)
 *   - Firebase Auth REST API 経由のユーザー操作
 *
 * 必要な Secrets (wrangler secret put で設定):
 *   STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_TEST
 *   STRIPE_SECRET_KEY
 *   GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY
 */

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str).buffer as ArrayBuffer);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer as ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe: Webhook 署名検証 (Web Crypto、stripe npm パッケージ不要)
// ─────────────────────────────────────────────────────────────────────────────

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // 5 分以上古いイベントは拒否（リプレイ攻撃防止）
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 定数時間比較（タイミング攻撃防止）
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe: REST API
// ─────────────────────────────────────────────────────────────────────────────

async function stripeGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Stripe GET /${path} failed: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// URLSearchParams がブラケットをエンコードするため手動で body を構築する
async function stripeUpdateCustomerMetadata(
  customerId: string,
  metadata: Record<string, string>,
  apiKey: string,
): Promise<void> {
  const body = Object.entries(metadata)
    .map(([k, v]) => `metadata[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe update customer ${customerId} failed: ${await res.text()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Google: サービスアカウント JWT → アクセストークン (Web Crypto、googleapis SDK 不要)
// ─────────────────────────────────────────────────────────────────────────────

// isolate 内でトークンをキャッシュ（ウォームリクエストで再取得を省略）
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && now < _tokenExpiry - 60) return _cachedToken;

  const header = base64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlStr(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      // Firestore + Firebase Auth Admin の両方をカバー
      scope: [
        'https://www.googleapis.com/auth/datastore',
        'https://www.googleapis.com/auth/identitytoolkit',
      ].join(' '),
    }),
  );

  const signingInput = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  _cachedToken = access_token;
  _tokenExpiry = now + expires_in;
  return access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore REST API クライアント
// ─────────────────────────────────────────────────────────────────────────────

type FsFieldValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: 'NULL_VALUE' }
  | { mapValue: { fields: Record<string, FsFieldValue> } };

// フィールド削除のセンチネル値
const FS_DELETE = Symbol('FS_DELETE');

function toFsFieldValue(val: unknown): FsFieldValue | typeof FS_DELETE {
  if (val === FS_DELETE) return FS_DELETE;
  if (val === null || val === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'object') {
    const fields: Record<string, FsFieldValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const fv = toFsFieldValue(v);
      if (fv !== FS_DELETE) fields[k] = fv;
    }
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported Firestore value: ${typeof val}`);
}

function fromFsFieldValue(v: FsFieldValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    return Object.fromEntries(
      Object.entries(v.mapValue.fields).map(([k, fv]) => [k, fromFsFieldValue(fv)]),
    );
  }
  return null;
}

function fromFsDoc(doc: { fields?: Record<string, FsFieldValue> }): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc.fields ?? {}).map(([k, v]) => [k, fromFsFieldValue(v)]),
  );
}

const FS_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function fsGet(
  projectId: string,
  path: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FS_BASE(projectId)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} failed: ${await res.text()}`);
  return fromFsDoc((await res.json()) as { fields?: Record<string, FsFieldValue> });
}

// set with merge: true — updateMask で指定フィールドのみ上書き、他は保持
// data の値が FS_DELETE の場合はフィールドを削除する
async function fsSet(
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  token: string,
): Promise<void> {
  const fields: Record<string, FsFieldValue> = {};
  const maskPaths: string[] = [];

  for (const [k, v] of Object.entries(data)) {
    maskPaths.push(k);
    const fv = toFsFieldValue(v);
    if (fv !== FS_DELETE) fields[k] = fv;
  }

  const mask = maskPaths
    .map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`)
    .join('&');
  const res = await fetch(`${FS_BASE(projectId)}/${path}?${mask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${path} failed: ${await res.text()}`);
}

// stripeCustomerId でユーザーを逆引きする
async function fsQueryByCustomerId(
  projectId: string,
  customerId: string,
  token: string,
): Promise<Array<{ uid: string; data: Record<string, unknown> }>> {
  const res = await fetch(`${FS_BASE(projectId)}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'stripeCustomerId' },
            op: 'EQUAL',
            value: { stringValue: customerId },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Firestore query failed: ${await res.text()}`);
  const results = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsFieldValue> };
  }>;
  return results
    .filter((r) => r.document)
    .map((r) => {
      const name = r.document!.name;
      // name = "projects/.../documents/users/{uid}"
      const uid = name.split('/').pop()!;
      return { uid, data: fromFsDoc(r.document!) };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Auth REST API (Admin 操作)
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_BASE = (projectId: string) =>
  `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;

async function authGetUserByEmail(
  projectId: string,
  email: string,
  token: string,
): Promise<{ uid: string; emailVerified: boolean } | null> {
  const res = await fetch(`${AUTH_BASE(projectId)}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message === 'USER_NOT_FOUND') return null;
    throw new Error(`authGetUserByEmail failed: ${JSON.stringify(body)}`);
  }
  const data = (await res.json()) as {
    users?: Array<{ localId: string; emailVerified?: boolean }>;
  };
  if (!data.users?.length) return null;
  return {
    uid: data.users[0].localId,
    emailVerified: data.users[0].emailVerified ?? false,
  };
}

async function authGetUser(projectId: string, uid: string, token: string): Promise<boolean> {
  const res = await fetch(`${AUTH_BASE(projectId)}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { users?: unknown[] };
  return (data.users?.length ?? 0) > 0;
}

async function authCreateUser(
  projectId: string,
  email: string,
  token: string,
): Promise<string> {
  const res = await fetch(`${AUTH_BASE(projectId)}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, emailVerified: false }),
  });
  if (!res.ok) throw new Error(`authCreateUser failed: ${await res.text()}`);
  const data = (await res.json()) as { localId: string };
  return data.localId;
}

async function revokeAccessByCustomerId(
  customerId: string,
  projectId: string,
  token: string,
): Promise<void> {
  const docs = await fsQueryByCustomerId(projectId, customerId, token);
  await Promise.all(
    docs.map(({ uid }) =>
      fsSet(projectId, `users/${uid}`, {
        plan: 'free',
        subscriptionStatus: 'canceled',
        subscriptionId: null,
        currentPeriodEnd: null,
      }, token),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// イベントハンドラ
// ─────────────────────────────────────────────────────────────────────────────

function ok(body: unknown = { received: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(status: number, message: string): Response {
  return new Response(JSON.stringify({ received: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCheckoutCompleted(
  session: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  if (!session.subscription) return ok();

  const customerId = session.customer as string;
  let uid: string;

  if (session.client_reference_id) {
    // ログイン済みユーザーが Payment Link に ?client_reference_id=<uid> を付けて決済
    const exists = await authGetUser(env.FIREBASE_PROJECT_ID, session.client_reference_id as string, token);
    if (!exists) {
      console.error(`Invalid client_reference_id: ${session.client_reference_id}`);
      return err(400, 'Invalid client_reference_id');
    }
    uid = session.client_reference_id as string;
  } else {
    // フォールバック: メールアドレスでユーザーを特定
    const email = (session.customer_details as Record<string, unknown> | undefined)?.email as
      | string
      | undefined;
    if (!email) return ok();

    const existing = await authGetUserByEmail(env.FIREBASE_PROJECT_ID, email, token);
    if (existing) {
      uid = existing.uid;
      // 既存ユーザーが別の Stripe Customer に紐づいていたら上書きを拒否
      const userDoc = await fsGet(env.FIREBASE_PROJECT_ID, `users/${uid}`, token);
      const existingCustomerId = userDoc?.stripeCustomerId as string | undefined;
      if (existingCustomerId && existingCustomerId !== customerId) {
        console.warn(
          `Possible account takeover: uid=${uid} linked to ${existingCustomerId}, rejecting ${customerId}`,
        );
        return ok({ received: true, skipped: true });
      }
    } else {
      uid = await authCreateUser(env.FIREBASE_PROJECT_ID, email, token);
    }
  }

  // Stripe Customer に firebaseUID を保存（以降の Webhook で参照）
  await stripeUpdateCustomerMetadata(customerId, { firebaseUID: uid }, env.STRIPE_SECRET_KEY);

  const subscription = await stripeGet<Record<string, unknown>>(
    `subscriptions/${session.subscription as string}`,
    env.STRIPE_SECRET_KEY,
  );
  const subStatus = subscription?.status;
  const periodEnd = subscription?.current_period_end;
  if (typeof subStatus !== 'string' || typeof periodEnd !== 'number' || !Number.isFinite(periodEnd)) {
    console.error(
      `Invalid subscription for session ${session.id}: status=${String(subStatus)} current_period_end=${String(periodEnd)}`,
    );
    return err(500, 'Invalid subscription data');
  }

  await fsSet(
    env.FIREBASE_PROJECT_ID,
    `users/${uid}`,
    {
      plan: 'premium',
      stripeCustomerId: customerId,
      subscriptionId: subscription.id,
      subscriptionStatus: subStatus,
      currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    },
    token,
  );

  return ok();
}

async function handleSubscriptionUpdated(
  subscription: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  const customer = await stripeGet<Record<string, unknown>>(
    `customers/${subscription.customer as string}`,
    env.STRIPE_SECRET_KEY,
  );
  if (customer.deleted) {
    await revokeAccessByCustomerId(subscription.customer as string, env.FIREBASE_PROJECT_ID, token);
    return ok();
  }

  const uid = (customer.metadata as Record<string, string> | undefined)?.firebaseUID;
  if (!uid) {
    console.error(`Missing firebaseUID in customer metadata for ${subscription.customer}`);
    return ok({ received: true, skipped: true });
  }

  const subStatus = subscription.status;
  const periodEnd = subscription.current_period_end;
  if (typeof subStatus !== 'string' || typeof periodEnd !== 'number' || !Number.isFinite(periodEnd)) {
    console.error(
      `Invalid subscription data for ${subscription.id}: status=${String(subStatus)} current_period_end=${String(periodEnd)}`,
    );
    return err(500, 'Invalid subscription data');
  }

  const plan = subStatus === 'active' ? 'premium' : 'free';
  await fsSet(
    env.FIREBASE_PROJECT_ID,
    `users/${uid}`,
    {
      plan,
      subscriptionStatus: subStatus,
      currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    },
    token,
  );
  return ok();
}

async function handleSubscriptionDeleted(
  subscription: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  const customer = await stripeGet<Record<string, unknown>>(
    `customers/${subscription.customer as string}`,
    env.STRIPE_SECRET_KEY,
  );
  if (customer.deleted) {
    await revokeAccessByCustomerId(subscription.customer as string, env.FIREBASE_PROJECT_ID, token);
    return ok();
  }

  const uid = (customer.metadata as Record<string, string> | undefined)?.firebaseUID;
  if (!uid) {
    console.error(`Missing firebaseUID for ${subscription.customer}`);
    return ok({ received: true, skipped: true });
  }

  await fsSet(
    env.FIREBASE_PROJECT_ID,
    `users/${uid}`,
    {
      plan: 'free',
      subscriptionStatus: 'canceled',
      subscriptionId: null,
      currentPeriodEnd: null,
    },
    token,
  );
  return ok();
}

async function handleInvoicePaymentFailed(
  invoice: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  if (!invoice.subscription) return ok();

  const subscription = await stripeGet<Record<string, unknown>>(
    `subscriptions/${invoice.subscription as string}`,
    env.STRIPE_SECRET_KEY,
  );
  const customer = await stripeGet<Record<string, unknown>>(
    `customers/${subscription.customer as string}`,
    env.STRIPE_SECRET_KEY,
  );

  if (customer.deleted) {
    await revokeAccessByCustomerId(subscription.customer as string, env.FIREBASE_PROJECT_ID, token);
    return ok();
  }

  const uid = (customer.metadata as Record<string, string> | undefined)?.firebaseUID;
  if (!uid) {
    console.error(`Missing firebaseUID for ${subscription.customer}`);
    return ok({ received: true, skipped: true });
  }

  await fsSet(env.FIREBASE_PROJECT_ID, `users/${uid}`, { subscriptionStatus: 'past_due' }, token);
  return ok();
}

async function handlePriceSync(
  price: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  const recurring = price.recurring as Record<string, unknown> | undefined;
  if (!recurring || !price.active) return ok();

  const key = recurring.interval === 'month' ? 'monthly' : 'yearly';
  const product = price.product;
  await fsSet(
    env.FIREBASE_PROJECT_ID,
    'config/pricing',
    {
      [key]: {
        amount: price.unit_amount,
        currency: price.currency,
        priceId: price.id,
        productId: typeof product === 'string' ? product : (product as Record<string, unknown>).id,
      },
      updatedAt: new Date().toISOString(),
    },
    token,
  );
  return ok();
}

async function handlePriceDeleted(
  price: Record<string, unknown>,
  env: Env,
  token: string,
): Promise<Response> {
  const recurring = price.recurring as Record<string, unknown> | undefined;
  if (!recurring?.interval) return ok();

  const key = recurring.interval === 'month' ? 'monthly' : 'yearly';
  // FS_DELETE センチネルでフィールド削除 + updatedAt 更新
  await fsSet(
    env.FIREBASE_PROJECT_ID,
    'config/pricing',
    { [key]: FS_DELETE, updatedAt: new Date().toISOString() },
    token,
  );
  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker エントリーポイント
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const sigHeader = request.headers.get('stripe-signature');
    if (!sigHeader) return err(400, 'Missing stripe-signature header');

    const rawBody = await request.text();

    // 本番 secret → テスト secret の順で検証
    const secrets = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_TEST].filter(Boolean);
    let verified = false;
    for (const secret of secrets) {
      if (await verifyStripeSignature(rawBody, sigHeader, secret)) {
        verified = true;
        break;
      }
    }
    if (!verified) {
      console.error('Webhook signature verification failed');
      return err(400, 'Webhook Error: signature verification failed');
    }

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return err(400, 'Invalid JSON body');
    }

    // Google アクセストークンを取得（Firestore + Firebase Auth 共用）
    const gToken = await getGoogleAccessToken(env.GCP_CLIENT_EMAIL, env.GCP_PRIVATE_KEY);
    const obj = event.data.object;

    switch (event.type) {
      case 'price.created':
      case 'price.updated':
        return handlePriceSync(obj, env, gToken);
      case 'price.deleted':
        return handlePriceDeleted(obj, env, gToken);
      case 'checkout.session.completed':
        return handleCheckoutCompleted(obj, env, gToken);
      case 'customer.subscription.updated':
        return handleSubscriptionUpdated(obj, env, gToken);
      case 'customer.subscription.deleted':
        return handleSubscriptionDeleted(obj, env, gToken);
      case 'invoice.payment_failed':
        return handleInvoicePaymentFailed(obj, env, gToken);
      default:
        return ok();
    }
  },
} satisfies ExportedHandler<Env>;
