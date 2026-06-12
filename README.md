# homepage

kkeeth の個人サイト + ポッドキャスト「雨宿りと WEB の小噺.fm」のホームページ。

## Tech Stack

- **Frontend**: Riot.js (SPA) + Vite + Shoelace
- **Hosting**: Firebase Hosting
- **Auth**: Firebase Auth (magic link)
- **DB**: Firestore (REST API 経由でも利用)
- **Workers**: Cloudflare Workers (npm 依存ゼロ)
  - `workers/webhook` — Stripe Webhook 受信 → Firestore 反映
  - `workers/premium-feed` — プレミアム音声のプロキシ (Firebase ID トークン認証)
- **決済**: Stripe Payment Links
- **音声ホスティング**: ART19

## Architecture

```
ブラウザ (Riot.js SPA)
  ├─ Firebase Auth ──────────── magic link ログイン
  ├─ Firestore ──────────────── plan (premium/free) 読み取り
  ├─ premium-feed Worker ────── GET /episodes (ID トークン認証)
  │     └─ ART19 プレミアムフィード → HMAC 署名付き音声 URL に書き換え
  └─ Stripe Payment Link ────── ?client_reference_id=<uid> 付き決済

Stripe ──→ webhook Worker ──→ Firestore (plan 更新)
```

プレミアム再生はウェブのみ。ポッドキャストアプリには ART19 のパブリックフィードのみ配信される。

## Commands

```bash
pnpm dev        # ローカル開発サーバー (localhost:5173)
pnpm build      # プロダクションビルド (docs/ に出力)
pnpm lint       # ESLint
pnpm lint:fix   # ESLint 自動修正
pnpm ts         # TypeScript 型チェック
```

## Local Development Setup

### 1. Root `.env.local`

リポジトリ直下に `.env.local` を作成:

```
# Feed and API URLs
VITE_GAS_URL=https://your-backend-api-url.example.com

# Cloudflare Worker (ローカルは wrangler dev のポート)
VITE_WORKER_BASE_URL=http://localhost:8787

# Firebase
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-firebase-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id

# Stripe Payment Links
VITE_STRIPE_PAYMENT_LINK_MONTHLY_URL=https://checkout.stripe.com/pay/your-monthly-payment-link-id
VITE_STRIPE_PAYMENT_LINK_YEARLY_URL=https://checkout.stripe.com/pay/your-yearly-payment-link-id
VITE_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/your-portal-link-id
```

### 2. premium-feed Worker `.dev.vars`

`workers/premium-feed/.dev.vars` を作成:

```
ART19_PREMIUM_FEED_URL="https://rss.art19.com/alternate_feeds/..."
SIGNING_KEY="dev-signing-key-local"
FIREBASE_PROJECT_ID="your-firebase-project-id"
DEV_MODE="true"
```

`DEV_MODE="true"` でローカルでは Firebase 認証なしにプレミアムフィードを確認できる。
**本番の vars / secrets には絶対に設定しないこと**(認証がバイパスされる)。

### 3. 起動

```bash
# ターミナル1: premium-feed Worker
cd workers/premium-feed && npx wrangler dev   # → localhost:8787

# ターミナル2: フロントエンド
pnpm dev                                      # → localhost:5173
```

## Workers のシークレット (本番)

`wrangler secret put <NAME>` で設定する。

### workers/webhook

| Secret | 内容 |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット (本番) |
| `STRIPE_WEBHOOK_SECRET_TEST` | 同上 (テスト) |
| `STRIPE_SECRET_KEY` | Stripe API キー |
| `GCP_CLIENT_EMAIL` | サービスアカウントのメールアドレス |
| `GCP_PRIVATE_KEY` | サービスアカウントの秘密鍵 (PEM) |

### workers/premium-feed

| Secret | 内容 |
|---|---|
| `SIGNING_KEY` | 音声 URL の HMAC 署名キー |
| `ART19_PREMIUM_FEED_URL` | ART19 プレミアムフィード URL (capability URL のため秘匿) |

## Deploy

- **Frontend + Firestore rules**: main へのマージで GitHub Actions が自動デプロイ (WIF 認証、サービスアカウントキー不使用)
- **Workers**: 各ディレクトリで `npx wrangler deploy`

**Important:** シークレットは絶対にコミットしないこと。`.env.local` と `.dev.vars` は gitignore 済み。
