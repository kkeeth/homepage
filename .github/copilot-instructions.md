# Copilot Code Review Instructions

## このプロジェクトの設計判断（指摘不要）

以下は意図的な設計であり、コードレビューで指摘しないこと。

### 環境変数
- `import.meta.env.VITE_*` の変数名変換（`VITE_` プレフィックス除去 + 小文字化）はブラウザ向けビルド時の Vite の標準動作。

### セキュリティ
- `sanitize.ts` の DOMPurify で `RETURN_DOM: true` を使用する場合、型定義が `Node` を返すため `as HTMLBodyElement` キャストが必要。これは型定義の制約であり実装上の問題ではない。

## レビュー対象外とする観点
- 上記の設計判断に関連する指摘
- Riot.js の `this.update()` パターン（Riot.js 固有のリアクティブ更新手法）
- Shoelace コンポーネントの `::part()` CSS セレクタ（Shoelace の Shadow DOM カスタマイズ手法）
