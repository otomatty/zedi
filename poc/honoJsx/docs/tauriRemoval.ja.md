> **言語:** [English](tauriRemoval.md) | 日本語

# Tauri の廃止: デスクトップ専用機能の棚卸し（現行アプリ）

決定事項: Zedi は Web アプリのみ（PWA、オフライン対応あり）とする。本書は現行アプリ（この PoC ではなくリポジトリ直下）のうち、Tauri に依存する機能、またはデスクトップ版のためだけにある機能を洗い出し、残す・Web へ移植する・削除するを判断できるようにするものです。まだ何も削除していません。

現状のつくり: フロントの Tauri 呼び出しはすべて `isTauriDesktop()`（`src/lib/platform.ts`、呼び出し約 40 か所。`src/lib/storageAdapter/createStorageAdapter.ts` にも同じ判定の複製）の内側にあります。そのため Web 利用者にはこれらの機能は表示されません。実質的な結合は、文書に保存されるノード型・サーバーの PDF 用テーブル・ビルド/CI の 3 つです。

## 棚卸し

| #   | 項目                                                                   | 機能                                                                                        | Web 版の代替                                                                                        | 削除した場合                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tauri 本体（`src-tauri/`）                                             | ネイティブウィンドウ、IPC コマンド 16 個、dialog/shell/store/updater                        | —                                                                                                   | 3・7・10・11 がこのコマンドを呼ぶ                                                                                                                                             |
| 2   | プラットフォーム判定（`src/lib/platform.ts`）                          | デスクトップ / Web の切り替え                                                               | —                                                                                                   | 呼び出し元がなくなれば削除                                                                                                                                                    |
| 3   | Claude Code サイドカー（`packages/claude-sidecar`）                    | 利用者の端末で Claude Agent SDK を動かす                                                    | なし                                                                                                | 4〜9 はすべてこれを経由                                                                                                                                                       |
| 4   | AI の「Claude Code」モード / プロバイダー                              | 手元の Claude CLI の契約で AI チャット                                                      | **あり**: サーバーモードと自分の API キーモード                                                     | 到達しない分岐の整理のみ。Web はこのモードを保存しないので設定の移行は不要                                                                                                    |
| 5   | MCP クライアントのサーバー設定                                         | Claude Code 用の MCP サーバー追加（`~/.claude.json` からの取り込み含む）                    | なし                                                                                                | Claude Code モード時のみ表示。`server/mcp`（Zedi 自身の MCP サーバー）とは別物で、そちらは残す                                                                                |
| 6   | MCP リソース埋め込みノード                                             | MCP で取得したリソースを埋め込む                                                            | なし（Web では「デスクトップのみ」表示）                                                            | **文書に保存される**: スキーマを残して読み取り専用表示にするか、移行が必要                                                                                                    |
| 7   | エージェント用スラッシュコマンド（`/analyze`・`/run`・`/review` など） | ノートや手元のファイルに Claude エージェントを実行                                          | なし                                                                                                | explain / summarize / research はサーバー AI へ移せる。git-summary / run / test は移せない                                                                                    |
| 8   | 実行可能コードブロック                                                 | Claude の Bash ツールで実行するノートブック風セル                                           | なし（表示はできるが実行不可）                                                                      | **文書に保存され**、`server/hocuspocus`（`ydocWikiLinkNormalizer.ts`）も参照: スキーマを残すか `codeBlock` へ移行。設定のトグルが Web にも表示され、何も起きない状態          |
| 9   | AI チャットの「ワークフロー」タブ                                      | Claude Code の複数ステップ実行でノートに書き込む                                            | なし（タブ非表示）                                                                                  | サーバー側エージェントへ移植は可能                                                                                                                                            |
| 10  | ノートのワークスペース（ローカルフォルダの紐付け）                     | Claude の作業ディレクトリ、`@file:` プレビュー、パス補完                                    | なし                                                                                                | `fileReference` マークが**文書に保存される**。移植するなら File System Access API（Chromium のみ）                                                                            |
| 11  | ローカル PDF リーダー                                                  | 手元の PDF を開いてハイライトし、ハイライトからページを作る（PDF 本体はアップロードしない） | 一部あり: ネイティブなのはファイルの登録・読み込み・検証のみ。pdf.js・ハイライト・API は Web で動く | 削除すると `server/api/src/routes/pdfSources.ts`、テーブル 2 つ（マイグレーション `0025`/`0026`）、ハイライト検索、E2E テスト、pdf.js の資産も外す                            |
| 12  | 自動アップデート                                                       | 署名付きのデスクトップ更新                                                                  | Web では不要                                                                                        | フロントのコードなし。`TAURI_SIGNING_*` シークレット                                                                                                                          |
| 13  | 未使用のプラグイン                                                     | `@tauri-apps/plugin-store`・`plugin-shell`・`plugin-updater` は JS から未使用               | —                                                                                                   | 影響なし                                                                                                                                                                      |
| 14  | ビルド・CI・ドキュメント                                               | デスクトップのリリース                                                                      | —                                                                                                   | `tauri-release.yml`、release-please の `extra-files` と Cargo.lock ジョブ、`package.json` のスクリプトと依存、`vite.config.ts` の `TAURI_*`、各種 ignore、README と AGENTS.md |

見つからなかったもの（削除対象なし）: ディープリンク、グローバルショートカット、トレイ、通知、Tauri のファイルシステムプラグイン。残っているのは Gyazo 設定の説明文にある `zedi://oauth/callback`（デスクトップ用コールバック）だけです。コード上に `tauri://` オリジンはありません（CORS は環境変数 `CORS_ORIGIN` で決まるので、本番の値は別途確認が必要）。

現行の PWA について: マニフェスト（`public/site.webmanifest`）のみで、Service Worker はありません。この PoC で確かめたオフライン設計（README の「オフライン（PWA）」）は新規の作業になります。

## 推奨

**削除してよいもの（Web 利用者への影響なし）:**

1. リリース関連: `tauri-release.yml`、release-please の Cargo.lock ジョブと `extra-files`、`scripts/inject-tauri-updater-pubkey.mjs`、`TAURI_SIGNING_*` シークレット
2. `src-tauri/`（アイコン含む）、`tauri*` スクリプト、`@tauri-apps/cli` と未使用プラグイン、`vite.config.ts` と ignore ファイルの Tauri 設定
3. `packages/claude-sidecar` とそのスクリプト、テスト・カバレッジ・knip・CI からの参照
4. Claude Code モード（4）と MCP クライアント設定（5）: Web では表示されず、既存のモードで AI チャットは賄える
5. README / AGENTS.md のデスクトップ関連の記述

`@tauri-apps/api` と `plugin-dialog` は、これらを静的に import しているファイル（`src/lib/claudeCode/bridge.ts`、`src/lib/workspace/bridge.ts`、`src/lib/noteWorkspace/*`）を消すまで残してください。先に外すと Web のビルドが壊れます。

**プロダクト判断が必要なもの:**

- **PDF リーダー（11）**: 最も移植しやすい（`<input type=file>` で開いてハッシュで照合する、または R2 にアップロードする）。削除するとサーバーのルート・テーブル・検索連携も外すことになる。
- **文書に保存されるノード（6・8・10）**: デスクトップで作った文書は Web にも同期されるため、機能をどうするかにかかわらず、スキーマを読み取り専用で残すか移行が必要。
- **ワークフローとエージェント用スラッシュコマンド（7・9）**: サーバー側 AI へ移植するか削除するか。
- **ローカルフォルダ（10）**: File System Access（Chromium のみ）で移植するか削除するか。

この PoC が検討している一からの作り直しでは、どれもまだ存在しないため、主な判断は「それぞれを持ち込むかどうか」になります。
