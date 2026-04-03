---
name: security-check
description: セキュリティ修正後の再チェック。修正が正しく適用されているか検証する。
---

# security-check

セキュリティ修正後の簡易チェックを実行する。

## Steps

1. `grep -r 'innerHTML' src/` で innerHTML の直接使用がないか確認
2. `grep -rn 'gradient' src/` でグラデーション混入がないか確認（デザインルール）
3. `.env` ファイルが `.gitignore` に含まれているか確認
4. `src/utils/sanitize.ts` が存在し、DOMPurify を使用しているか確認
5. `firestore.rules` でワイルドカード許可 (`allow read, write: if true`) がないか確認
6. `pnpm audit` で依存パッケージの脆弱性チェック

## Output

各チェック項目の PASS/FAIL を一覧表示し、FAIL があれば修正箇所を具体的に提示する。
