# Copilot Code Review Instructions

## このプロジェクトの設計判断（指摘不要）

以下は意図的な設計であり、コードレビューで指摘しないこと。

### Firebase / Auth
- `auth-store.ts` の `init()` は冪等性ガード（`if (this._readyPromise) return`）が実装済み。重複呼び出しは安全。
- `onAuthStateChanged` のアンサブスクライブは `_unsubAuth` で管理済み。リスナーの積み上がりは発生しない。
- `ready()` / `updateDisplayName()` / `sendEmailChangeVerification()` の non-null assertion (`!`) は `onMounted` での `isLoggedIn()` ガード後にのみ呼ばれる設計。null には到達しない。
- `account.riot` の `onMounted` で認証チェック済み。198行目 `isLoggedIn()` は冗長ではなく防御的チェック。

### Stripe / Membership
- Stripe Payment Links は `client_reference_id` をサポートしないため、メールアドレスベースでユーザーを特定する設計を採用。意図的なトレードオフ。
- Webhook で `emailVerified: false` のまま Premium 付与するのは意図的。マジックリンク認証完了時に Firebase が自動で `true` に更新する。
- `premiumEpisodes` コレクションの Firestore public read は意図的。エピソードIDは機密情報でない。
- Webhook エラー時に 200 OK を返してイベントをスキップするのは意図的設計（ポストリリースで改善予定）。

### membership-store
- `init()` 冒頭の `if (this._unsub) this.destroy()` で重複サブスクリプションを防止済み。

### 環境変数
- `import.meta.env.VITE_*` の変数名変換（`VITE_` プレフィックス除去 + 小文字化）はブラウザ向けビルド時の Vite の標準動作。

### セキュリティ
- Gravatar で SHA-256 を使用しているのは正しい。Gravatar は 2024年に SHA-256 を正式サポート済み（MD5 より推奨）。
- `sanitize.ts` の DOMPurify で `RETURN_DOM: true` を使用する場合、型定義が `Node` を返すため `as HTMLBodyElement` キャストが必要。これは型定義の制約であり実装上の問題ではない。

## レビュー対象外とする観点
- 上記の設計判断に関連する指摘
- Riot.js の `this.update()` パターン（Riot.js 固有のリアクティブ更新手法）
- Shoelace コンポーネントの `::part()` CSS セレクタ（Shoelace の Shadow DOM カスタマイズ手法）
