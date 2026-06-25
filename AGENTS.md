<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---
## DevBrain ルール（DevKick 追記）

> 考え方の正本は Obsidian「DevBrain」。コードはこのリポジトリ。

- MVP優先（必須機能は3つまで）。範囲外は「将来」へ退避。
- 着手前に「理解ルール要約 / 今回の作業1行 / 手順」を提示し、承認を得てから実装。
- 不明点は推測せず質問（ハルシネーション禁止。分からないことは正直に）。
- TDD（Red→Green→Refactor）。テストは実機能を検証（無意味アサーション禁止）。本番にテスト用分岐を入れない。
- スタック無断変更・目的不明リファクタ・秘密情報のコミットは禁止。
- 最新のライブラリ/ツール仕様は context7 で確認してから使う。
