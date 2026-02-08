# 移行ユーザーのマッピング検討（Phase B2–B3）

**日付:** 2026-02-08  
**前提:** B1 で Turso から Clerk user_id 一覧を取得済み

---

## 1. 取得済み：移行対象ユーザー（B1 結果）

**取得元:** Turso（開発 DB: `.env.development`）  
**取得日:** 2026-02-08  
**スクリプト:** `bun run scripts/migration/list-clerk-users.ts`

| clerk_user_id | pages | notes(owner) | note_pages | note_members | メール（紐づけ） |
|---------------|-------|--------------|------------|--------------|------------------|
| `user_37axfEra8z81aMdhOhBMcXMpWeU` | 1331 | 3 | 0 | 0 | 以前: saedgewell@gmail.com → 移行後サインイン: akimasa.sugai@saedgewell.com |

- **メールアドレス:** Turso には保存されていない。Clerk ダッシュボードのエクスポートまたは手動で「誰がこの user_id か」を把握する。
- 開発ユーザーが 1 件のみのため、**「移行後も使う Google/GitHub アカウントで一度 Cognito にサインインしてもらう」** ことで、その時の Cognito `sub` を 1 件だけ取得すればよい。

---

## 2. マッピングの考え方

- **Clerk userId**（現 Turso の `user_id` / `owner_user_id` 等）→ **Cognito `sub`** の 1:1 対応表を作る。
- Cognito の `sub` は **初回サインイン時の IdP（Google/GitHub）に紐づく**。同じ人でも別メールでサインインすると別 `sub` になるため、**移行時に「使うアカウント」で一度サインインしてもらう**方針（計画書・調査ドキュメントと同一）。
- **マッピングのキーはメールアドレスではない**。DB 更新で使うのは「Clerk user_id → Cognito sub」のみ。メールが変わっても影響しない。

### 2.0 メールアドレスが変わる場合（Gmail → Google Workspace など）

**結論:** そのまま対応できる。移行後も使うアカウント（例: Google Workspace のカスタムドメイン）で一度サインインし、そのとき発行された **Cognito `sub`** をマッピングに使えばよい。

| 項目 | 説明 |
|------|------|
| 以前（Clerk） | 本件: **saedgewell@gmail.com**（Gmail）でサインインしていた → Clerk の `user_xxxx` が記録されている。 |
| 移行後（Cognito） | 本件: **akimasa.sugai@saedgewell.com**（Google Workspace カスタムドメイン）でサインインする → Cognito にはそのアカウントに紐づく `sub` を取得する。 |
| 対応方法 | **メールの一致は不要**。移行時に「今後使うアカウント」（ここでは Google Workspace）でアプリにサインインしてもらい、その時の `sub` を取得して「Clerk の user_id → この sub」とマッピングするだけ。DB 更新スクリプトはこの対応表だけを見る。 |

- マッピング表に「移行前に使っていたメール（参考）」「移行後にサインインに使ったアカウント（参考）」を optional で書いておくと、後から誰がどのアカウントに紐づいたか分かりやすい（B4 の実行には不要）。

### 2.1 手順イメージ（B2）

1. 上記 1 ユーザーに、**移行後も使う Google または GitHub アカウント**でアプリ（Cognito Hosted UI）にサインインしてもらう。
2. サインイン後、**現在の Cognito `sub`** を取得する：
   - **案 A:** アプリの既存 `useAuth().userId`（Cognito 実装では `sub` を返している）を、開発者ツールや一時的な「マイページ／デバッグ表示」で確認。
   - **案 B:** ID Token をデコード（jwt.io やローカルスクリプト）して `sub` を取得。
3. その 1 件を **マッピング表** に記載する。

### 2.2 マッピング表のフォーマット（B3）

CSV または JSON で保持。**B4 の DB 更新に必要なのは `clerk_user_id` と `cognito_sub` のみ**。メールや備考は記録用（任意）。

**CSV（clerk_to_cognito_mapping.csv）:**

```csv
clerk_user_id,cognito_sub,email_before_optional,email_after_optional,notes_optional
user_37axfEra8z81aMdhOhBMcXMpWeU,<Cognito sub>,saedgewell@gmail.com,akimasa.sugai@saedgewell.com,
```

**JSON（clerk-to-cognito-mapping.json）:** 実ファイルは `docs/plans/20260208/clerk-to-cognito-mapping.json` を参照。

```json
[
  {
    "clerk_user_id": "user_37axfEra8z81aMdhOhBMcXMpWeU",
    "cognito_sub": "<サインイン後に取得した sub を記入>",
    "email_before_optional": "saedgewell@gmail.com",
    "email_after_optional": "akimasa.sugai@saedgewell.com",
    "notes_optional": ""
  }
]
```

- B4 の DB 更新スクリプトは、このマッピングの **clerk_user_id と cognito_sub だけ**を読み込み、`pages.user_id` / `notes.owner_user_id` / `note_pages.added_by_user_id` / `note_members.invited_by_user_id` を一括で Cognito `sub` に更新する。メール列は読み込まない（記録・監査用）。

---

## 3. 次のアクション

| 順序 | アクション | 担当・メモ |
|------|------------|------------|
| 1 | **メール（誰か）の記入** | 上記表の email 列に、この Clerk user が誰か（メール or 備考）を手動で記入。開発 1 件なら省略可。メールが Gmail→Google Workspace 等で変わる場合は §2.0 のとおり「移行後に使うアカウント」でサインインすればよい。 |
| 2 | **Cognito で 1 回サインイン** | **akimasa.sugai@saedgewell.com**（Google Workspace）でアプリにサインインする。 |
| 3 | **Cognito `sub` の取得** | useAuth の userId（＝sub）を画面 or トークンデコードで確認。 |
| 4 | **マッピング表の作成** | 上記フォーマットで `user_37axfEra8z81aMdhOhBMcXMpWeU` → 取得した `sub` を 1 行追加。 |
| 5 | **B4 スクリプト作成** | マッピング表を読み、Turso の 4 カラムを UPDATE するスクリプト（ドライラン付き）。 |

---

## 4. 参照

- 作業計画書: `docs/plans/20260208/next-steps-work-plan.md` §4 Phase B
- Clerk→Cognito 調査: `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` §5.4
- B1 ユーザー一覧（JSON）: `docs/plans/20260208/clerk-users-to-migrate.json`
- **マッピング表（実ファイル）:** `docs/plans/20260208/clerk-to-cognito-mapping.json` / `clerk_to_cognito_mapping.csv` — `cognito_sub` は **akimasa.sugai@saedgewell.com** でサインイン後に取得して記入する。
