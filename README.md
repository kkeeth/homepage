# homepage

kkeeth の個人サイト + ポッドキャスト「雨宿りと WEB の小噺.fm」のホームページ。

## Tech Stack

- **Frontend**: Riot.js (SPA) + Vite + Shoelace
- **Hosting**: Firebase Hosting
- **音声ホスティング**: ART19（パブリック RSS を取得して表示）
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

## Deploy

main へのマージで GitHub Actions が Firebase Hosting に自動デプロイ (WIF 認証、サービスアカウントキー不使用)。

**Important:** シークレットは絶対にコミットしないこと。`.env` と `.env.local` は gitignore 済み。
