# Project Guidelines

## Design Rules

- **グラデーション厳禁**: `linear-gradient`, `radial-gradient` など CSS のグラデーションは一切使わないこと。背景・ボタン・テキスト装飾すべてソリッドカラーで表現する。
- CSS カスタムプロパティ (`--hero-gradient` 等) にもグラデーション値を入れない。

## Color Scheme

- カラー定義は `public/css/` 内の CSS カスタムプロパティおよび各 `.riot` コンポーネントの `<style>` を参照。
- メインカラー: `#3498db` (ブルー)、アクセントカラー: `#ff9800` (オレンジ)

## Tech Stack

- Riot.js (SPA)
- Vite (ビルド)
- Shoelace (UI コンポーネント)
- Firebase (Hosting / Functions / Firestore)
- i18n: `src/locales/ja.json` / `en.json`

## Commands

- `pnpm dev` — ローカル開発サーバー起動
- `pnpm build` — プロダクションビルド (`docs/` に出力)
- `pnpm lint` — ESLint 実行
- `pnpm lint:fix` — ESLint 自動修正
- `pnpm ts` — TypeScript 型チェック

## Directory Structure

- `src/pages/` — ページコンポーネント (.riot)
- `src/components/` — 共通コンポーネント (.riot)
- `src/stores/` — 状態管理 (.ts)
- `src/services/` — Firebase 等の外部サービス
- `src/locales/` — i18n 翻訳ファイル
- `src/constants/` — 定数定義
- `functions/` — Firebase Cloud Functions
- `workers/` — Cloudflare Workers

## i18n Rules

- UI テキストを追加・変更する場合は `src/locales/ja.json` と `src/locales/en.json` の **両方** を必ず更新すること。
- キー名は既存の命名規則 (ドット区切り) に従う。
