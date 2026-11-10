# homepage

kkeeth の個人サイト + ポッドキャスト「雨宿りと WEB の小噺.fm」のホームページ。

## Tech Stack

- **Frontend**: Riot.js (SPA) + Vite + Shoelace
- **Hosting**: Firebase Hosting
- **音声ホスティング**: ART19（パブリック RSS を取得して表示）
- **会員向け配信**: Substack（有料限定回を含む別番組。`/membership` と一覧に表示）
- **Workers**: Cloudflare Workers
  - `workers/premium-feed` — Substack の RSS / archive API に CORS ヘッダーを付けて中継
- **お問い合わせフォーム**: Google Apps Script

## Commands

```bash
pnpm dev        # ローカル開発サーバー (localhost:5173)
pnpm build      # プロダクションビルド (docs/ に出力)
pnpm lint       # ESLint
pnpm lint:fix   # ESLint 自動修正
pnpm ts         # TypeScript 型チェック
```

## Local Development Setup

リポジトリ直下に `.env.local`（または `.env`）を作成:

```
# Contact form (Google Apps Script)
VITE_GAS_URL=https://your-backend-api-url.example.com
```

ローカルでは Substack のフィードを Vite の dev サーバーがプロキシする (`/api/rss`, `/api/archive`) ので、Worker を起動する必要はない。

## Deploy

- **Frontend**: main へのマージで GitHub Actions が Firebase Hosting に自動デプロイ (WIF 認証、サービスアカウントキー不使用)
- **Workers**: `cd workers/premium-feed && npx wrangler deploy`

**Important:** シークレットは絶対にコミットしないこと。`.env` と `.env.local` は gitignore 済み。
