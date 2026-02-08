# 実装計画と現状サマリー

**作成日:** 2026-01-23  
**最終更新:** 2026-02-03  
**対象:** AWS環境への移行とリアルタイム編集を中心としたドキュメントエディター移行

---

## 0. 引き継ぎ用・現在の状態（要約）

| 領域 | 状態 | 次のアクション |
|------|------|----------------|
| **認証（フロント）** | **Cognito OAuth（Google/GitHub）に移行済み** | Terraform に IdP の Client ID/Secret を設定しサインイン動作確認 |
| **リアルタイム編集（クライアント）** | 接続・同期まで動作確認済み。getToken は Cognito ID Token に差し替え済み | 特になし |
| **リアルタイム編集（サーバー）** | AWS Hocuspocus 稼働。**Cognito JWT 検証実装済み**（COGNITO_USER_POOL_ID 設定時）。未設定時は開発用に全許可 | Redis/Aurora 永続化（将来） |
| **AWS インフラ** | Phase 1–5 完了、Phase 6（CDN）以降は未着手 | アプリの DB はまだ Turso。認証は Cognito 接続済み |

**環境変数（接続確認に必要）**

- `VITE_REALTIME_URL` … AWS ALB の WebSocket URL（例: `ws://zedi-dev-alb-....elb.amazonaws.com`）。取得方法は `docs/work-logs/20260131/aws-connection-summary.md` または `terraform output websocket_url`。

**主要ファイル**

- 認証: `src/lib/auth/cognitoAuth.ts`, `src/components/auth/CognitoAuthProvider.tsx`, `src/hooks/useAuth.ts`, `src/pages/SignIn.tsx`, `src/pages/AuthCallback.tsx`
- クライアント: `src/lib/collaboration/CollaborationManager.ts`, `src/hooks/useCollaboration.ts`, `src/components/editor/PageEditorView.tsx`, `src/components/editor/TiptapEditor/editorConfig.ts`
- サーバー: `server/hocuspocus/src/index.ts`
- 調査・移行計画: `docs/plans/20260203/clerk-to-cognito-migration-investigation.md`, `docs/work-logs/20260202/realtime-4401-unauthorized-investigation.md`

**その他の修正（引き継ぎ用）**

- **LocalDB 多重初期化** … `src/lib/turso.ts` で同一 userId の同時 `getLocalClient` 呼び出し時に 1 本の promise にまとめるため `initializingUserId` を導入済み。
- **Tiptap 重複 link** … `src/components/editor/TiptapEditor/editorConfig.ts` で StarterKit に `link: false` を指定し、外部リンク用の Link 拡張は 1 つのみ使用。

---

## 1. 全体像

Zedi の今後の実装は、次の2本柱で進められています。

| 柱 | 内容 | 参照ドキュメント |
|----|------|------------------|
| **AWS環境への移行** | Turso/Clerk から Aurora/Cognito 等へのインフラ・認証移行 | `docs/specs/aws-terraform-implementation-plan.md`<br>`docs/work-logs/20260131/README.md` |
| **リアルタイム編集** | Y.js + Hocuspocus による同時編集・オフライン対応 | `docs/specs/realtime-collaboration-specification.md`<br>`docs/specs/application-implementation-plan.md` |

両者は「AWS上で Hocuspocus を動かし、Cognito で認証してリアルタイム編集する」という形で統合される設計です。

---

## 2. AWS環境への移行

### 2.1 現状（アプリ側）

| 項目 | 現状 | 移行先（計画） |
|------|------|----------------|
| **DB** | **Turso**（`src/lib/turso.ts`）で運用中 | Aurora Serverless v2 (PostgreSQL) |
| **認証** | **Cognito OAuth（Google/GitHub）** にフロント移行済み。E2E 時は MockClerkProvider | Terraform で IdP 登録・本番動作確認 |
| **API** | Turso 直接利用 / Workers 等 | Lambda + API Gateway（計画） |
| **フロント配信** | 現行のまま | CloudFront + S3（Phase 6） |

つまり、**本番アプリはまだ Turso + Clerk のまま**です。AWS 側は「インフラだけ先に構築済み」の状態です。

### 2.2 AWSインフラの構築状況（Terraform）

`docs/work-logs/20260131/README.md` および各 Phase ログより。

| Phase | モジュール | 内容 | ステータス |
|-------|------------|------|------------|
| 1 | networking | VPC, Subnets, VPC Endpoints | ✅ 完了 |
| 2 | security | Cognito User Pool, IAM Roles | ✅ 完了 |
| 3 | database | Aurora Serverless v2 | ✅ 完了 |
| 4 | cache | ElastiCache Redis | ✅ 完了 |
| 5 | realtime | ECS Fargate, ALB（Hocuspocus用） | ✅ 完了 |
| 6 | cdn | CloudFront, S3 | ⏳ 次回 |
| 7 | monitoring | CloudWatch Alarms 等 | ⏳ 未着手 |

- **Cognito**: User Pool / Client 作成済み（アプリからの利用は未接続）
- **Aurora**: クラスター・エンドポイント作成済み（アプリのメインDBとしては未切り替え）
- **Redis**: ElastiCache 作成済み（Hocuspocus のマルチインスタンス同期用、未接続）
- **ECS + ALB**: Hocuspocus 用の土台は作成済みで、**Hocuspocus サーバーはデプロイ済み**（後述）

### 2.3 移行が完了するとどうなるか

- アプリの **DB 接続先が Turso → Aurora** に切り替わる
- **認証が Clerk → Cognito** に切り替わる
- REST API が **Lambda + API Gateway** に載る（計画）
- フロントが **CloudFront + S3** で配信される（Phase 6 以降）

---

## 3. リアルタイム編集を中心としたドキュメントエディター移行

### 3.1 設計（仕様）

- **リアルタイム同時編集**: 同一ページを複数ユーザーが同時編集
- **技術**: Y.js (CRDT) + Tiptap Collaboration Extension + CollaborationCaret（カーソル表示）
- **サーバー**: Hocuspocus（Y.js 用 WebSocket サーバー）
- **オフライン**: IndexedDB（y-indexeddb）でローカル永続化し、復帰時に同期
- **プレゼンス**: 編集中ユーザー・カーソル位置の表示

仕様の詳細は `docs/specs/realtime-collaboration-specification.md` を参照。

### 3.2 実装状況

#### サーバー（Hocuspocus）

| 項目 | 状態 | 備考 |
|------|------|------|
| ディレクトリ | `server/hocuspocus/` | 実装済み |
| ECR イメージ | プッシュ済み | `zedi-dev-hocuspocus:latest` |
| ECS デプロイ | 稼働中 | 1 タスク、ステディステート |
| WebSocket URL | `ws://zedi-dev-alb-...elb.amazonaws.com` | ヘルスチェック `/health` も応答 |
| 認証 | 未実装（開発用で全許可） | Cognito JWT 検証は TODO |
| 永続化 | メモリのみ | Aurora / Redis 未接続 |

→ **「AWS 上の Hocuspocus は動いているが、認証・永続化はまだ開発用」** という状態です。

#### クライアント（エディタまわり）

| 項目 | 状態 | ファイル・備考 |
|------|------|----------------|
| 型定義 | ✅ 完了 | `src/lib/collaboration/types.ts` |
| CollaborationManager | ✅ 完了 | `src/lib/collaboration/CollaborationManager.ts`（Y.Doc, **HocuspocusProvider**, IndexedDB）。※ y-websocket → @hocuspocus/provider に差し替え済み（4401 解消） |
| useCollaboration | ✅ 完了 | `src/hooks/useCollaboration.ts`（Clerk の getToken 使用。Cognito 化時に差し替え） |
| ConnectionIndicator | ✅ 完了 | 接続状態表示 |
| UserAvatars | ✅ 完了 | オンラインユーザー表示 |
| Tiptap Collaboration パッケージ | ✅ 導入済み | `@tiptap/extension-collaboration`, `collaboration-caret`, `y-tiptap`, `@hocuspocus/provider` 等 |
| TiptapEditor への useCollaboration 統合 | ✅ 完了 | editorConfig に Collaboration / CollaborationCaret、StarterKit の link: false（重複解消） |
| ConnectionIndicator・UserAvatars の PageEditor 表示 | ✅ 完了 | PageEditorHeader に接続状態・オンラインユーザー表示 |
| CollaborativeEditor / PageEditor 統合 | ✅ 完了 | PageEditorView/Content で useCollaboration 利用、ydoc 準備後に TiptapEditor に渡す |
| **AWS Hocuspocus との接続** | ✅ **動作確認済み** | HocuspocusProvider により接続・同期まで確認。認証はサーバー側「全許可」のまま |

→ **「クライアントは HocuspocusProvider で AWS Hocuspocus に接続・同期まで動作済み。Cognito JWT 検証・永続化は未実装」** という状況です。

### 3.3 エディター移行の「次の一手」

1. ~~**TiptapEditor に useCollaboration を組み込む**~~ ✅ 完了  
2. ~~**ConnectionIndicator・UserAvatars を PageEditor に表示**~~ ✅ 完了  
3. ~~**VITE_REALTIME_URL を設定して AWS Hocuspocus と接続テスト**~~ ✅ 完了（HocuspocusProvider 差し替えにより接続・同期を確認）
4. **（将来）Cognito JWT 検証・Redis / Aurora 永続化**  
   - クライアント: `getAuthToken` を Cognito の ID Token 取得に差し替え。  
   - サーバー: `onAuthenticate` で Cognito JWT 検証（`aws-jwt-verify` 等）。  
   - 詳細は `docs/work-logs/20260202/realtime-4401-unauthorized-investigation.md` の「Cognito 統一時の調査メモ」を参照。

---

## 4. アプリケーション実装計画との対応

`docs/specs/application-implementation-plan.md` の Phase と現状の対応は以下のとおりです。

| Phase | 内容 | 主な状態 |
|-------|------|----------|
| **Phase 1** | サーバーサイド（Hocuspocus, DB, 認証フック等） | サーバー最小実装・デプロイ済み。Cognito/Redis/Aurora は未接続 |
| **Phase 2** | ECR プッシュ・ECS デプロイ | ✅ 完了 |
| **Phase 3** | クライアント（CollaborationManager, useCollaboration, CollaborativeEditor 等） | ✅ 完了（HocuspocusProvider 化・TiptapEditor 統合・PageEditor 統合・AWS 接続確認済み） |
| **Phase 4** | 移行・テスト（データ移行, E2E 等） | 未着手 |
| **Phase 5** | 本番移行（DNS, 監視, ロールバック等） | 未着手 |

---

## 5. まとめ：いま「どの段階」にいるか

- **AWS 環境**  
  - インフラ（VPC, Cognito, Aurora, Redis, ECS, ALB）は **Terraform で構築済み**。  
  - 認証は **Cognito OAuth（Google/GitHub）にフロント移行済み**。DB は **まだ Turso** のまま。

- **リアルタイム編集**  
  - **Hocuspocus は AWS 上で稼働済み**（認証・永続化は開発用のまま）。  
  - クライアントは **HocuspocusProvider で接続・同期まで動作確認済み**。getToken は Cognito ID Token に差し替え済み。  
  - **残り**: Redis/Aurora 永続化（将来）。Cognito JWT 検証は実装済み。

- **ドキュメントエディターの移行**  
  - **Tiptap + Y.js + Hocuspocus** によるリアルタイム編集は接続・同期まで動作。本番向けには Hocuspocus 側の Cognito 検証・永続化が残っている。

---

## 6. 次のステップ（やるべき作業）

優先度の目安で並べています。上から順に進めるとよいです。

| 順 | 作業 | 内容 | 参照 |
|---|------|------|------|
| 1 | **Cognito サインインの動作確認** | `.env` に `VITE_COGNITO_DOMAIN` / `VITE_COGNITO_CLIENT_ID` を設定し、ブラウザで `/sign-in` から Google または GitHub でサインインできるか確認する。IdP 未設定の場合は `dev.tfvars` に Google/GitHub の Client ID・Secret を追記して `terraform apply` し、Google/GitHub 側のリダイレクト URI に Cognito の `/oauth2/idpresponse` を登録する。 | `docs/guides/env-variables-guide.md`, `terraform/environments/dev.tfvars` |
| 2 | **Google/GitHub IdP の有効化（未設定の場合）** | Terraform で IdP を追加する。`dev.tfvars` のコメントを外して `google_oauth_client_id` / `google_oauth_client_secret`（および GitHub 用）を設定し、`terraform apply`。シークレットは `TF_VAR_*` で渡すことを推奨。 | `terraform/environments/dev.tfvars` |
| 3 | **既存ユーザー移行（Clerk → Cognito）** | 既存 Clerk ユーザーと Cognito ユーザー（`sub`）の対応表を作成し、Turso の `pages.user_id` / `notes.owner_user_id` 等を Cognito `sub` に一括更新する。移行スクリプト・手順書を用意し、メンテナンスウィンドウで実施する。 | `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` §5.4 |
| 4 | ~~**Hocuspocus の Cognito JWT 検証（任意）**~~ ✅ | 実装済み。`onAuthenticate` で `aws-jwt-verify` の `CognitoJwtVerifier` を使用。`COGNITO_USER_POOL_ID` 設定時のみ検証。 | — |
| 5 | **パッケージ整理** | E2E は `MockClerkProvider` のみ使用しているため、`@clerk/clerk-react` を依存から削除してよい。削除後、`src/test/mocks.ts` の Clerk モックを必要に応じて調整する。 | — |
| 6 | **本番デプロイ・運用** | 本番用 `.env`（または CI の環境変数）に `VITE_COGNITO_DOMAIN` / `VITE_COGNITO_CLIENT_ID` および本番のコールバック URL を設定。`prod.tfvars` で IdP とコールバック URL を設定済みであれば、本番 Terraform apply 後にアプリをデプロイする。 | `docs/guides/env-variables-guide.md` |

**別ライン（インフラ・DB 移行）**

- **Phase 6（CDN）**: CloudFront + S3 でフロント配信。
- **DB 移行**: Turso → Aurora Serverless v2 への切り替え（アプリの接続先変更・データ移行）。
- **API**: Lambda + API Gateway への載せ替え（計画）。

---

## 7. 関連ドキュメント一覧

| 種類 | パス |
|------|------|
| **次のステップ 作業計画書** | `docs/plans/20260208/next-steps-work-plan.md` |
| **Clerk→Cognito 移行調査・タスク一覧** | `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` |
| **.env 設定ガイド** | `docs/guides/env-variables-guide.md` |
| 4401 調査・HocuspocusProvider 差し替え・Cognito メモ | `docs/work-logs/20260202/realtime-4401-unauthorized-investigation.md` |
| AWS インフラ作業ログ | `docs/work-logs/20260131/README.md` |
| AWS 接続情報（VITE_REALTIME_URL 等） | `docs/work-logs/20260131/aws-connection-summary.md` |
| Hocuspocus デプロイ | `docs/work-logs/20260201/hocuspocus-server-deployment.md` |
| Tiptap コラボセットアップ | `docs/work-logs/20260201/tiptap-collaboration-setup.md` |
| リアルタイム同時編集仕様 | `docs/specs/realtime-collaboration-specification.md` |
| アプリ実装計画 | `docs/specs/application-implementation-plan.md` |
| AWS Terraform 計画 | `docs/specs/aws-terraform-implementation-plan.md` |
| Hocuspocus 概要 | `docs/guides/hocuspocus-overview.md` |
