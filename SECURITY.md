# Security Policy

## Supported Versions

現在サポートされているバージョン:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

セキュリティの脆弱性を発見した場合は、**公開の Issue として報告しないでください**。

### 報告方法

1. **メールで報告**: security@example.com (プロジェクトのセキュリティメールアドレスに置き換えてください)
2. **GitHub Security Advisories**: リポジトリの Security タブから Private vulnerability reporting を使用

### 報告に含める情報

- 脆弱性の詳細な説明
- 再現手順
- 影響を受けるバージョン
- 可能であれば、修正案

### 対応プロセス

1. **確認**: 報告を受け取ったら、48時間以内に確認の連絡をします
2. **調査**: 脆弱性を調査し、影響範囲を評価します
3. **修正**: 優先度に応じて修正を行います
4. **公開**: 修正がリリースされた後、適切なタイミングで脆弱性を公開します

### セキュリティ上の考慮事項

#### API キーの取り扱い

- AI 機能用の API キーはローカルに暗号化して保存されます
- API キーがサーバーに送信されることはありません（BYOK: Bring Your Own Key）

#### データの保存

- ローカルデータは SQLite (sql.js) に保存されます
- 認証済みユーザーのデータは Turso クラウドに同期されます
- すべての通信は HTTPS で暗号化されます

#### 認証

- 認証には Clerk を使用しています
- パスワードはアプリケーション側では一切取り扱いません

---

Thank you for helping keep Zedi secure! 🔒
