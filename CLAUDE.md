# Project Guidelines

## Design Rules

- **グラデーション厳禁**: `linear-gradient`, `radial-gradient` など CSS のグラデーションは一切使わないこと。背景・ボタン・テキスト装飾すべてソリッドカラーで表現する。
- CSS カスタムプロパティ (`--hero-gradient` 等) にもグラデーション値を入れない。

## Color Scheme

- メインカラー: `#3498db` (明るいブルー) — ヘッダー、リンク、ボタン
- アクセントカラー: `#ff9800` (明るいオレンジ) — CTA、ハイライト
- 背景: `#f8f9fa` (ライトグレー)
- テキスト: `#2c3e50` (ダークネイビー)

## Tech Stack

- Riot.js (SPA)
- Vite (ビルド)
- Shoelace (UI コンポーネント)
- i18n: `src/locales/ja.json` / `en.json`
