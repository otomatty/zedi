# Zedi リアーキテクチャ仕様書

**作成日:** 2026-02-09  
**ステータス:** Draft  
**目的:** Tauri（Desktop / Mobile）対応を含むマルチプラットフォーム化に伴い、Zedi のアプリケーション全体のアーキテクチャを再設計する。本ドキュメントは、Web・Desktop・Mobile すべてのプラットフォームにおける技術仕様の正本とする。

---

## 目次

1. [概要](#1-概要)
2. [設計原則](#2-設計原則)
3. [プラットフォーム戦略](#3-プラットフォーム戦略)
4. [システムアーキテクチャ全体像](#4-システムアーキテクチャ全体像)
5. [データ構造](#5-データ構造)
6. [ストレージアーキテクチャ](#6-ストレージアーキテクチャ)
7. [コンテンツ管理（エディタ）](#7-コンテンツ管理エディタ)
8. [同期アーキテクチャ](#8-同期アーキテクチャ)
9. [リアルタイム共同編集](#9-リアルタイム共同編集)
10. [検索アーキテクチャ](#10-検索アーキテクチャ)
11. [認証・認可](#11-認証認可)
12. [メディア管理](#12-メディア管理)
13. [API 設計](#13-api-設計)
14. [サーバーアーキテクチャ](#14-サーバーアーキテクチャ)
15. [Tauri 固有の設計](#15-tauri-固有の設計)
16. [移行計画](#16-移行計画)
17. [既存仕様からの変更一覧](#17-既存仕様からの変更一覧)
18. [ロードマップ](#18-ロードマップ)

---

## 1. 概要

### 1.1 背景

Zedi は「Zero-Friction Knowledge Network」をコンセプトとした個人ナレッジ管理 + 共有ノートアプリである。現在 Web App（React + Vite）として Phase A が稼働中で、ローカル DB に sql.js（SQLite WASM）、リモートに Turso を使用している。

本リアーキテクチャでは以下の 3 つを同時に達成する：

1. **AWS 移行**: Turso → Aurora Serverless v2（PostgreSQL）、API 経由の接続に切り替え
2. **マルチプラットフォーム**: Web + Tauri 2.0（Desktop / Mobile）対応
3. **リアルタイム共同編集**: 共有ノート内のページで Y.js + Hocuspocus による同時編集

### 1.2 本ドキュメントの位置づけ

| ドキュメント | 役割 | 本書との関係 |
|-------------|------|-------------|
| **本書（zedi-rearchitecture-spec.md）** | **技術仕様の正本。** マルチプラットフォーム対応を含む全アーキテクチャ | - |
| docs/PRD.md | プロダクト要件（What / Why） | 本書の技術方針を反映して更新する |
| docs/specs/zedi-data-structure-spec.md | DB スキーマ・データ構造の詳細 | 本書 §5 から参照。内容は維持 |
| docs/specs/zedi-future-considerations-options.md | 各論点の選択肢比較 | 本書の決定に至る検討過程。§10 検索方針は本書で更新 |
| docs/specs/realtime-collaboration-specification.md | リアルタイム編集の詳細 | 本書 §9 から参照。Tauri 対応を追記 |
| docs/specs/wiki-link-specification.md | WikiLink 機能仕様 | 変更なし |

---

## 2. 設計原則

| # | 原則 | 説明 |
|---|------|------|
| 1 | **Platform Abstraction** | UI（React + Tiptap）と業務ロジックを共通化し、ストレージ・ネットワーク・OS 統合はプラットフォーム抽象化レイヤーで切り替える。 |
| 2 | **Local-First for Personal** | 個人ページはローカルを正とし、表示速度を最優先する。オフラインでも読み書き可能。 |
| 3 | **Online-First for Shared** | 共有ノートはサーバーを正とし、ローカルには保存しない。リアルタイム編集は Hocuspocus 経由。 |
| 4 | **Simplicity** | プラットフォームごとに最適なストレージを使いつつ、抽象化レイヤーで差異を吸収し、上位レイヤーのコードは共通に保つ。 |
| 5 | **Y.Doc as Content Format** | 全ページの本文を Y.Doc（CRDT）で統一し、リアルタイム編集・オフライン・マルチプラットフォームを同一の仕組みで実現する。 |
| 6 | **Sync on Demand** | 全プラットフォームで同期タイミングを統一：手動トリガーまたはアプリ起動時のみ。バックグラウンド常時同期は行わない。 |

---

## 3. プラットフォーム戦略

### 3.1 リリースフェーズ

| Phase | プラットフォーム | 形態 | 優先度 |
|-------|------------------|------|--------|
| **A** | **Web** | React + Vite（ブラウザ） | 🔴 最優先・開発中 |
| **B** | **Desktop** | Tauri 2.0（Windows / macOS / Linux） | 🟡 次フェーズ |
| **C** | **Mobile** | Tauri 2.0 Mobile（iOS / Android） | 🟢 将来 |

### 3.2 コア機能（全プラットフォーム共通）

以下の機能は全プラットフォームで同等に提供する：

- ページの CRUD・Date Grid
- Tiptap エディタ（Markdown ショートカット、WikiLink）
- 個人ページのローカル保存・オフライン閲覧・編集
- 共有ノート（ノート単位の共有、メンバー管理）
- 共有ノート内ページのリアルタイム共同編集
- 検索（個人ページ: ローカル検索、共有ノート: サーバー検索）
- 差分同期（メタデータ + Y.Doc）
- AI 機能（Wiki Generator 等）
- Web Clipping
- Cognito 認証

### 3.3 プラットフォーム固有機能

| 機能 | Web | Desktop | Mobile |
|------|-----|---------|--------|
| グローバルホットキー（`Alt+Space`） | - | ✅ | - |
| システムトレイ常駐 | - | ✅ | - |
| Share Sheet 連携 | - | - | ✅ |
| ホーム画面ウィジェット | - | - | ✅（将来） |
| ローカルメディアキャッシュ | - | ✅ | ✅ |
| Rust 全文検索（SQLite FTS5） | - | ✅ | ✅ |
| Rust WebSocket（Hocuspocus 直結） | - | ✅ | ✅ |

### 3.4 コードシェアリング

```
┌──────────────────────────────────────────────────────────┐
│                  共通コード（React + TypeScript）           │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ UI       │  │ Editor   │  │ Hooks    │  │ App      │  │
│  │ Components│  │ (Tiptap) │  │ (React   │  │ Logic    │  │
│  │          │  │          │  │  Query)  │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Platform Abstraction Layer                    │  │
│  │   StorageAdapter / SearchAdapter / MediaAdapter /     │  │
│  │   SyncAdapter / CollaborationAdapter                  │  │
│  └──────────┬─────────────────────────┬──────────────────┘  │
│             │                         │                      │
└─────────────┼─────────────────────────┼──────────────────────┘
              │                         │
    ┌─────────▼─────────┐    ┌─────────▼─────────┐
    │   Web Adapters     │    │  Tauri Adapters    │
    │                    │    │                    │
    │ • IndexedDB        │    │ • SQLite (native)  │
    │ • y-indexeddb      │    │ • Filesystem       │
    │ • fetch API        │    │ • Rust WebSocket   │
    │ • JS WebSocket     │    │ • Tauri Commands   │
    └────────────────────┘    └────────────────────┘
```

---

## 4. システムアーキテクチャ全体像

### 4.1 Web 版

```
┌───────────────────────────────────────────────────────┐
│                  Browser (Web App)                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │         React + Tiptap + Y.js                    │   │
│  │                                                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │   │
│  │  │ IndexedDB │  │y-indexeddb│  │ JS WebSocket  │  │   │
│  │  │(metadata) │  │ (Y.Doc)  │  │(Hocuspocus)   │  │   │
│  │  └──────────┘  └──────────┘  └───────┬───────┘  │   │
│  └──────────────────────────────────────┼───────────┘   │
│                                          │               │
│         fetch (REST API)                 │ wss://        │
└─────────────┬────────────────────────────┼───────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐
│  API Gateway + Lambda │    │  ALB + Hocuspocus    │
│  (REST API)           │    │  (ECS Fargate)       │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           ▼
┌──────────────────────────────────────────────────┐
│               Aurora Serverless v2                │
│               (PostgreSQL 15.x)                   │
├──────────────────────────────────────────────────┤
│  users │ pages │ notes │ note_pages │ links │ ...│
│  page_contents (ydoc_state BYTEA)                │
└──────────────────────────────────────────────────┘
```

### 4.2 Tauri 版（Desktop / Mobile）

```
┌──────────────────────────────────────────────────────────┐
│                    Tauri App                               │
│                                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │              WebView (React + Tiptap)             │     │
│  │                                                    │     │
│  │  ┌──────────┐  ┌──────────┐                       │     │
│  │  │ Y.Doc    │  │ Tiptap   │                       │     │
│  │  │(in-memory)│  │ Editor   │                       │     │
│  │  └────┬─────┘  └──────────┘                       │     │
│  └───────┼────────────────────────────────────────────┘     │
│          │ Tauri IPC (Commands / Events)                    │
│  ┌───────▼────────────────────────────────────────────┐     │
│  │              Rust Backend                           │     │
│  │                                                     │     │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐  │     │
│  │  │ SQLite    │  │ yrs       │  │ WebSocket     │  │     │
│  │  │ (native)  │  │ (Y.Doc   │  │ Client        │  │     │
│  │  │ metadata  │  │  Rust)   │  │ (Hocuspocus)  │  │     │
│  │  │ + FTS5    │  │          │  │               │  │     │
│  │  └───────────┘  └───────────┘  └───────┬───────┘  │     │
│  │                                         │          │     │
│  │  ┌───────────┐  ┌───────────┐          │          │     │
│  │  │ Filesystem│  │ HTTP      │          │          │     │
│  │  │ (media    │  │ Client    │          │          │     │
│  │  │  cache)   │  │ (REST API)│          │          │     │
│  │  └───────────┘  └─────┬─────┘          │          │     │
│  └────────────────────────┼────────────────┼──────────┘     │
│                           │                │                 │
└───────────────────────────┼────────────────┼─────────────────┘
                            │                │
                  REST API  │                │ wss://
                            ▼                ▼
              ┌──────────────────┐  ┌──────────────────┐
              │  API Gateway     │  │  Hocuspocus      │
              │  + Lambda        │  │  (ECS Fargate)   │
              └────────┬─────────┘  └────────┬─────────┘
                       │                     │
                       ▼                     ▼
              ┌──────────────────────────────────────┐
              │        Aurora Serverless v2           │
              └──────────────────────────────────────┘
```

**Tauri 版の特徴:**

- **Rust バックエンド** がストレージ・ネットワーク・Y.Doc 管理を担当
- **WebView** は UI レンダリングに集中し、Tauri IPC（Commands / Events）で Rust と通信
- **Hocuspocus との WebSocket 接続は Rust 側** で管理（WebView のライフサイクルに依存しない）
- **SQLite（ネイティブ）** で高速なメタデータ管理・FTS5 による全文検索
- **メディアファイルはローカル FS にキャッシュ** し、同期時に S3 にアップロード

---

## 5. データ構造

**正本:** `docs/specs/zedi-data-structure-spec.md`

DB スキーマはプラットフォーム非依存で共通。主要テーブル：

| テーブル | 用途 | ローカル保存 |
|---------|------|-------------|
| **users** | ユーザー情報（Cognito 連携） | ❌（サーバーのみ） |
| **pages** | ページメタデータ（owner_id, title, content_preview 等） | ✅ 個人ページのみ |
| **page_contents** | Y.Doc バイナリ（ydoc_state, version） | ✅ 個人ページのみ |
| **notes** | ノート（共有コンテナ） | ❌ |
| **note_pages** | ノートとページの紐付け | ❌ |
| **note_members** | ノートメンバー | ❌ |
| **links** | ページ間リンク | ✅ 個人ページ間のみ |
| **ghost_links** | 未作成リンク | ✅ 個人ページのみ |

**変更なし:** スキーマは全プラットフォームで同一。ローカルに保存するデータの範囲（個人ページのみ）も共通。

**共有ノート内での新規ページ作成:** 共有ノート内で「新規ページを追加」して作成されたページのオーナーは **ノートのオーナー**（`notes.owner_id`）とする。これにより社外秘・機密ノートでも、ノート内で作成されたコンテンツの帰属がノートオーナーに保たれる。詳細は `zedi-data-structure-spec.md` §3.2.1。

---

## 6. ストレージアーキテクチャ

### 6.1 プラットフォーム抽象化レイヤー

上位レイヤー（Hooks, Application Logic）はストレージの実装詳細に依存しない。`StorageAdapter` インターフェースを定義し、プラットフォームごとに実装を切り替える。

```typescript
// src/lib/storage/StorageAdapter.ts
interface StorageAdapter {
  // ── メタデータ ──
  getAllPages(): Promise<PageMetadata[]>;
  getPage(pageId: string): Promise<PageMetadata | null>;
  upsertPage(page: PageMetadata): Promise<void>;
  deletePage(pageId: string): Promise<void>;

  // ── Y.Doc ──
  getYDocState(pageId: string): Promise<Uint8Array | null>;
  saveYDocState(pageId: string, state: Uint8Array, version: number): Promise<void>;
  getYDocVersion(pageId: string): Promise<number>;

  // ── リンク ──
  getLinks(pageId: string): Promise<Link[]>;
  getBacklinks(pageId: string): Promise<Link[]>;
  saveLinks(sourcePageId: string, links: Link[]): Promise<void>;
  getGhostLinks(pageId: string): Promise<GhostLink[]>;
  saveGhostLinks(sourcePageId: string, ghostLinks: GhostLink[]): Promise<void>;

  // ── 検索 ──
  searchPages(query: string): Promise<SearchResult[]>;
  updateSearchIndex(pageId: string, text: string): Promise<void>;

  // ── 同期メタデータ ──
  getLastSyncTime(): Promise<number>;
  setLastSyncTime(time: number): Promise<void>;

  // ── 初期化・クリーンアップ ──
  initialize(userId: string): Promise<void>;
  close(): Promise<void>;
}
```

### 6.2 Web 実装: `IndexedDBStorageAdapter`

| 項目 | 内容 |
|------|------|
| **メタデータ** | IndexedDB のオブジェクトストア `my_pages`。キー = page_id、インデックス: `updated_at`, `created_at` |
| **Y.Doc** | `y-indexeddb`（IndexeddbPersistence）。ドキュメント名 = page_id |
| **リンク** | IndexedDB ストア `my_links`（source_id + target_id）、`my_ghost_links` |
| **検索** | テキストを IndexedDB に保存し、JavaScript でフィルタリング。将来は MiniSearch 等のインメモリ全文検索ライブラリで強化 |
| **利点** | WASM 不要で起動が速い。ブラウザネイティブ API のみ |

### 6.3 Tauri 実装: `TauriStorageAdapter`

| 項目 | 内容 |
|------|------|
| **メタデータ** | Rust 側でネイティブ SQLite を使用。テーブル構成は Aurora スキーマのサブセット（pages, links, ghost_links） |
| **Y.Doc** | SQLite の BLOB カラム（page_contents.ydoc_state）、または `~/.zedi/ydocs/{page_id}.ydoc` としてファイルシステムに保存 |
| **リンク** | SQLite テーブル（links, ghost_links） |
| **検索** | SQLite **FTS5** による全文検索。Y.Doc 保存時にテキスト抽出して FTS テーブルに投入 |
| **利点** | ネイティブ SQLite で高速。FTS5 による本格的な全文検索。SQL クエリが使える |
| **IPC** | WebView → Rust: Tauri Commands。Rust → WebView: Tauri Events |

### 6.4 ストレージ選択の自動判定

```typescript
// src/lib/storage/createStorageAdapter.ts
export function createStorageAdapter(): StorageAdapter {
  if (isTauri()) {
    return new TauriStorageAdapter();
  }
  return new IndexedDBStorageAdapter();
}

function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}
```

---

## 7. コンテンツ管理（エディタ）

### 7.1 統一 Y.Doc エディタ

全プラットフォーム・全ページで **Tiptap + Collaboration エクステンション + Y.Doc** を使用する。個人ページと共有ノートページの違いは「Provider の有無」のみ。

```
              ┌────────────────────────────┐
              │    Tiptap Editor           │
              │    + Collaboration ext.    │
              │    + CollaborationCaret    │
              └────────────┬───────────────┘
                           │
                     binds to Y.Doc
                           │
              ┌────────────▼───────────────┐
              │       Y.Doc (in-memory)     │
              └──────┬───────────┬──────────┘
                     │           │
         ┌───────────▼──┐  ┌────▼────────────┐
         │ Local        │  │ Network         │
         │ Persistence  │  │ Provider        │
         │              │  │ (共有のみ)       │
         │ Web: y-idb   │  │ Web: Hocuspocus │
         │ Tauri: IPC   │  │   Provider(JS)  │
         │  → SQLite/FS │  │ Tauri: IPC      │
         │              │  │  → Rust WS      │
         └──────────────┘  └─────────────────┘
```

### 7.2 個人ページの編集フロー

```
1. ページを開く
   ├─ ローカルに Y.Doc がある → 即座に表示
   └─ ない → API で ydoc_state を取得 → ローカルに保存 → 表示

2. 編集中
   └─ Y.Doc が更新される → ローカルに自動保存（デバウンス）

3. 保存
   ├─ ローカル: Y.Doc → StorageAdapter.saveYDocState()
   ├─ ローカル: メタデータ更新 → StorageAdapter.upsertPage()
   ├─ ローカル: テキスト抽出 → StorageAdapter.updateSearchIndex()
   └─ サーバー同期は手動/起動時（§8 参照）

4. 同期時
   ├─ Y.Doc: スナップショット + バージョンで API と同期（§8.2）
   └─ メタデータ: 差分同期（§8.1）
```

### 7.3 共有ノートページの編集フロー

```
1. ノートページを開く
   ├─ API でページメタデータ取得
   ├─ Web: HocuspocusProvider で WebSocket 接続
   │   → Y.Doc がサーバーから同期される → Tiptap に反映
   └─ Tauri: Rust バックエンドが WebSocket 接続（§9.2）
       → Y.Doc が IPC 経由で WebView に渡る → Tiptap に反映

2. 編集中（リアルタイム）
   ├─ Y.Doc 更新 → WebSocket 経由で他ユーザーに配信
   └─ 他ユーザーの更新 → Y.Doc に CRDT マージ → Tiptap が再描画

3. ページを閉じる
   ├─ Web: HocuspocusProvider を disconnect
   └─ Tauri: Rust が WebSocket を切断
   （ローカルには保存しない）
```

### 7.4 CollaborationManager の設計

```typescript
// src/lib/collaboration/CollaborationManager.ts
class CollaborationManager {
  private ydoc: Y.Doc;
  private mode: 'local' | 'collaborative';

  async setup(pageId: string, options: {
    mode: 'local' | 'collaborative';
    token?: string;
  }): Promise<void> {
    this.ydoc = new Y.Doc();
    this.mode = options.mode;

    if (options.mode === 'local') {
      // ── 個人ページ ──
      if (isTauri()) {
        // Rust から Y.Doc 状態を取得
        const state = await invoke<number[]>('get_ydoc_state', { pageId });
        if (state) Y.applyUpdate(this.ydoc, new Uint8Array(state));
        // 変更時に Rust に送信
        this.ydoc.on('update', (update) => {
          invoke('save_ydoc_update', { pageId, update: Array.from(update) });
        });
      } else {
        // Web: y-indexeddb で永続化
        this.indexeddbProvider = new IndexeddbPersistence(pageId, this.ydoc);
      }
    } else {
      // ── 共有ノートページ ──
      if (isTauri()) {
        // Rust バックエンドに WebSocket 接続を依頼
        await invoke('connect_hocuspocus', {
          pageId,
          token: options.token,
        });
        // Rust からの Y.Doc 更新を受信
        this.unlisten = await listen('ydoc-remote-update', (event) => {
          Y.applyUpdate(this.ydoc, new Uint8Array(event.payload.update));
        });
        // ローカル変更を Rust に送信
        this.ydoc.on('update', (update, origin) => {
          if (origin !== 'remote') {
            invoke('send_ydoc_update', { pageId, update: Array.from(update) });
          }
        });
      } else {
        // Web: HocuspocusProvider
        this.hocuspocusProvider = new HocuspocusProvider({
          url: HOCUSPOCUS_URL,
          name: `page-${pageId}`,
          document: this.ydoc,
          token: options.token,
        });
      }
    }
  }
}
```

### 7.5 自分のページを共有ノートに含めた場合の同期

**質問:** 共有ノートに自分のページを持っていったとき、共有ノート側で更新されたら、個人のページにも反映されるか。

**結論: 反映される。** ただし「個人ページ」画面では **同期タイミング（手動 or 起動時）** まで遅延する。

#### データモデル上の前提

- **1 ページ = 1 エンティティ** である。自分のページを共有ノートに「追加」する操作は、**同じ page_id** を `note_pages` でノートに紐づけるだけであり、ページのコピーは作らない。
- したがって **「自分のページ」と「共有ノート内のそのページ」は同じ page_id・同じ Y.Doc（サーバー上は `page_contents` の 1 行）** を指す。
- 違いは **開き方** だけである：
  - **個人として開く**（`/page/:id`）→ ローカル Y.Doc + API 同期（手動/起動時）
  - **共有ノートとして開く**（`/note/:noteId/page/:pageId`）→ Hocuspocus でリアルタイム同期

#### 共有ノート側で更新されたとき

```
1. 誰か（自分または他メンバー）が共有ノート内でそのページを編集
2. 編集は Hocuspocus 経由でサーバーに送信される
3. Hocuspocus が定期保存 or 切断時に Aurora の page_contents を更新
4. 所有者が「自分のページ」一覧からそのページを開いている場合
   → その時点ではまだローカル Y.Doc のまま（リアルタイム反映されない）
5. 所有者が「同期」を実行する、またはアプリを再起動する
   → GET /api/pages/{id}/content でサーバーの最新 ydoc_state を取得
   → Y.applyUpdate(localDoc, remoteState) で CRDT マージ
   → ローカルの「自分のページ」に共有ノートでの変更が反映される
```

つまり、**共有ノートでの更新は個人ページにも反映されるが、反映されるのは「次回同期時」** である。

#### 逆方向（個人で編集 → 共有ノート側）

- 所有者が「自分のページ」画面で編集 → ローカル保存後に API へ PUT。
- 他ユーザーがそのページを共有ノート内で開くとき、Hocuspocus はサーバーから Y.Doc をロード（`onLoadDocument`）するため、**サーバーに反映済みの内容** が共有ノート側に表示される。
- 同様に、**反映は「サーバーに PUT された後」「共有ノートでそのページを開いたとき」** に現れる。

#### まとめ

| 編集した場所         | 反映先           | 反映タイミング                         |
|----------------------|------------------|----------------------------------------|
| 共有ノート内で編集   | 個人のページ     | 次回同期（手動 or 起動時）             |
| 個人ページで編集     | 共有ノート内表示 | 次にそのページを共有ノートで開いたとき |

どちらも **同一の page_id・同一の page_contents** を参照しているため、双方向に内容は一致する。リアルタイム性があるのは「共有ノート内でそのページを開いている間」のみである。

---

## 8. 同期アーキテクチャ

### 8.1 メタデータ同期（差分同期）

**対象:** 個人ページのメタデータ（pages, links, ghost_links）。共有ノートは対象外（API 都度取得）。

**タイミング:** 手動トリガーまたはアプリ起動時のみ。全プラットフォーム共通。

```
クライアント                              サーバー (API)
    │                                          │
    │  GET /api/sync/pages?since={last_sync}   │
    │ ─────────────────────────────────────────►│
    │                                          │
    │  200: { pages: [...], server_time: ... }  │
    │ ◄─────────────────────────────────────────│
    │                                          │
    │  ローカルに upsert（updated_at 比較）     │
    │                                          │
    │  POST /api/sync/pages (ローカル変更分)    │
    │ ─────────────────────────────────────────►│
    │                                          │
    │  200: { conflicts: [...] }               │
    │ ◄─────────────────────────────────────────│
    │                                          │
    │  last_sync = server_time に更新           │
```

**競合解決:** LWW（Last-Write-Wins）。`updated_at` が新しい方を採用。メタデータは本文（CRDT）と異なり、同時編集の頻度が低いため LWW で十分。

### 8.2 Y.Doc 同期（スナップショット + バージョン）

**対象:** 個人ページの本文（Y.Doc）。共有ノートは Hocuspocus が担当（§9）。

```
クライアント                                 サーバー (API)
    │                                             │
    │ GET /api/pages/{id}/content                  │
    │ ────────────────────────────────────────────►│
    │                                             │
    │ 200: { ydoc_state: <binary>, version: 5 }   │
    │ ◄────────────────────────────────────────────│
    │                                             │
    │ ローカル version=3, リモート version=5       │
    │ → Y.applyUpdate(localDoc, remoteState)       │
    │   (CRDT マージ: 両方の変更が保たれる)         │
    │                                             │
    │ PUT /api/pages/{id}/content                  │
    │   { ydoc_state: <merged>, version: 5 }      │
    │ ────────────────────────────────────────────►│
    │                                             │
    │ 200: { version: 6 }                          │
    │ ◄────────────────────────────────────────────│
```

- **保存タイミング（ローカル）:** 編集確定時にデバウンス（3〜5 秒）＋アプリ終了時
- **同期タイミング（サーバー）:** 手動/起動時の同期トリガーに合わせて
- **安全性:** CRDT マージにより、複数デバイスで編集した場合も両方の変更が保持される

### 8.3 メディア同期

§12 で詳述。Tauri ではローカル保存 + S3 アップロード、Web では S3 直接アップロード。

### 8.4 同期フロー全体

```
同期トリガー（手動 or 起動時）
    │
    ├─ 1. メタデータ差分取得（GET /api/sync/pages?since=...）
    │     └─ ローカル更新 → サーバーにプッシュ
    │
    ├─ 2. Y.Doc 同期（各ページごとに GET/PUT /api/pages/{id}/content）
    │     └─ バージョン比較 → CRDT マージ → PUT
    │
    ├─ 3. メディア同期（Tauri のみ）
    │     └─ 未アップロードのローカルメディアを S3 にアップロード
    │
    └─ 4. last_sync 更新
```

---

## 9. リアルタイム共同編集

### 9.1 概要

共有ノート内のページを複数ユーザーで同時編集するとき、Y.js + Hocuspocus によるリアルタイム同期を行う。個人ページでは使用しない。

### 9.2 Web 版の接続

```
Browser
  └─ HocuspocusProvider (JavaScript)
       └─ WebSocket (wss://realtime.zedi-note.app/)
            └─ Hocuspocus Server (ECS Fargate)
```

- `@hocuspocus/provider` を使用（現行実装と同じ）
- 接続時に Cognito JWT で認証
- Awareness によるプレゼンス（カーソル位置、ユーザー名）

### 9.3 Tauri 版の接続

```
Tauri App
  ├─ WebView (Tiptap + Y.Doc in-memory)
  │     ↑↓ Tauri IPC (Commands / Events)
  └─ Rust Backend
       ├─ yrs (Y.Doc Rust 実装)
       ├─ y-sync (Y.js 同期プロトコル)
       └─ tokio-tungstenite (WebSocket)
            └─ Hocuspocus Server
```

**Rust 側の責務:**

| 責務 | 説明 |
|------|------|
| WebSocket 接続管理 | `tokio-tungstenite` で Hocuspocus に接続。自動再接続。 |
| Y.Doc 管理 | `yrs` クレートで Y.Doc を保持。リモート更新の適用。 |
| 同期プロトコル | `y-sync` で Hocuspocus と Y.js sync protocol を実行。 |
| IPC（WebView 連携） | WebView からの更新を受け取り Y.Doc に適用。リモート更新を WebView にイベント通知。 |
| 認証 | Cognito JWT を WebSocket 接続時に送信。 |

**Tauri Commands / Events:**

```rust
// Tauri Commands (WebView → Rust)
#[tauri::command]
async fn connect_hocuspocus(page_id: String, token: String) -> Result<(), String>;

#[tauri::command]
async fn disconnect_hocuspocus(page_id: String) -> Result<(), String>;

#[tauri::command]
async fn send_ydoc_update(page_id: String, update: Vec<u8>) -> Result<(), String>;

#[tauri::command]
async fn get_ydoc_state(page_id: String) -> Result<Option<Vec<u8>>, String>;

// Tauri Events (Rust → WebView)
// "ydoc-remote-update"  → { page_id, update: Vec<u8> }
// "collaboration-status" → { page_id, status: "connected" | "disconnected" | "syncing" }
// "awareness-update"    → { page_id, states: Vec<UserPresence> }
```

**利点:**

- WebSocket 接続が WebView のナビゲーション（ページ遷移）に影響されない
- Rust 側で接続リトライ・オフライン検出を堅牢に実装できる
- Y.Doc を Rust 側でも保持するため、ローカル永続化が自然に行える
- WebView ↔ Rust 間の IPC は最小限のバイナリ交換のみ

### 9.4 Hocuspocus サーバーの永続化

**方式:** 定期保存（30〜60 秒）＋ 切断時保存。

| タイミング | 処理 |
|-----------|------|
| **定期（30〜60 秒）** | アクティブなルームの `ydoc_state` を Aurora の `page_contents` に保存 |
| **全員切断時** | ルームの `ydoc_state` を保存してからメモリから解放 |
| **ルーム起動時** | Aurora から `ydoc_state` をロードして Y.Doc を復元 |

**Redis:**

- マルチインスタンス時の Pub/Sub（Y.Doc 更新の中継）
- プレゼンス情報の共有
- ElastiCache（t4g.micro）

---

## 10. 検索アーキテクチャ

### 10.1 方針

| 検索対象 | 検索場所 | 理由 |
|---------|---------|------|
| **個人ページ** | **ローカル（全プラットフォーム）** | 個人ページはローカルに常にあるため即座に検索可能。オフラインでも動作。 |
| **共有ノート内ページ** | **サーバー（API 経由）** | 共有ノートはローカルに保存しないため、サーバーで検索。 |

**以前の方針との変更点:** 以前は「全ページをサーバーで検索」を推奨していたが、個人ページはローカルにあるためローカル検索の方が高速かつオフライン対応可能という判断に変更。

### 10.2 個人ページのローカル検索

#### Web

```
Y.Doc → テキスト抽出 → IndexedDB (search_index ストア) に保存
  → 検索時: IndexedDB から全テキストを取得 → JavaScript でフィルタリング
  → 将来: MiniSearch 等のインメモリ全文検索ライブラリを導入
```

- Y.Doc 保存時にテキストを抽出し、IndexedDB の `search_index` ストアに `{ page_id, text, title }` を保存
- 検索時は `getAll()` → `filter()` でシンプルに部分一致検索
- ページ数が増えたら MiniSearch 等でインデックス化して高速化

#### Tauri

```
Y.Doc → テキスト抽出 → SQLite FTS5 テーブルに保存
  → 検索時: SQL クエリで全文検索
```

```sql
-- Tauri ローカル SQLite
CREATE VIRTUAL TABLE pages_fts USING fts5(
    page_id,
    title,
    content_text,
    tokenize='unicode61'  -- 日本語はバイグラムでの追加対応を検討
);

-- 検索クエリ
SELECT page_id, title, snippet(pages_fts, 2, '<b>', '</b>', '...', 32)
FROM pages_fts
WHERE pages_fts MATCH ?
ORDER BY rank;
```

- SQLite FTS5 はネイティブで高速
- 日本語トークナイズは `unicode61` + 追加のバイグラム処理、または ICU tokenizer で対応
- Y.Doc 保存時に Rust 側でテキスト抽出し FTS テーブルを更新

### 10.3 共有ノートのサーバー検索

```
API: GET /api/search?q={query}&scope=shared
  → Aurora PostgreSQL で全文検索
  → pg_bigm (2-gram) で日本語対応
```

```sql
-- Aurora PostgreSQL
ALTER TABLE page_contents ADD COLUMN content_text TEXT;
CREATE INDEX idx_page_contents_bigm ON page_contents
  USING gin (content_text gin_bigm_ops);

-- 検索クエリ
SELECT p.id, p.title, pc.content_text
FROM pages p
JOIN page_contents pc ON pc.page_id = p.id
JOIN note_pages np ON np.page_id = p.id
WHERE pc.content_text LIKE '%' || $1 || '%'
  AND np.note_id IN (-- ユーザーがアクセス可能なノート)
ORDER BY p.updated_at DESC;
```

### 10.4 統合検索 UI

ユーザーの検索操作は 1 つ（`Cmd+K` / `Ctrl+K`）。裏で個人ページ（ローカル）と共有ノート（API）の両方を検索し、結果をマージして表示する。

```typescript
// src/hooks/useSearch.ts
async function search(query: string): Promise<SearchResult[]> {
  const [localResults, remoteResults] = await Promise.all([
    storageAdapter.searchPages(query),           // 個人ページ（ローカル）
    apiClient.searchSharedNotes(query),           // 共有ノート（API）
  ]);

  return mergeAndRank([...localResults, ...remoteResults]);
}
```

---

## 11. 認証・認可

### 11.1 認証方式

全プラットフォームで **Amazon Cognito** を使用。認証必須（サインインしないとアプリを使用できない）。

### 11.2 Web

- Cognito Hosted UI にリダイレクト → 認証後にコールバック URL に戻る
- 現行実装と同じ

### 11.3 Tauri

Tauri では WebView 内で Cognito Hosted UI を表示する方式を基本とする。

```
1. アプリ起動 → 未認証を検出
2. WebView 内で Cognito Hosted UI を表示
3. Google / GitHub OAuth で認証
4. Cognito がコールバック URL にリダイレクト
5. コールバックをインターセプトしてトークンを取得
6. トークンを Rust バックエンドに渡す（Tauri Command）
7. Rust がトークンをセキュアストレージに保存
```

- **トークン保存:** Tauri の `tauri-plugin-store` + OS のキーストア（Keychain / Credential Manager）
- **リフレッシュ:** Rust バックエンドがリフレッシュトークンで自動更新
- Web と同じ Cognito 設定を使い回し、Tauri 用のコールバック URL を追加登録

### 11.4 アクセス制御

| 対象 | 制御方法 |
|------|---------|
| 個人ページ | `pages.owner_id = 自分の user_id` で判定。API でも JWT の sub から owner_id を検証 |
| 共有ノート | `note_members.member_email` にユーザーの email が含まれるか判定。または `notes.owner_id = 自分` |
| Hocuspocus | 接続時に JWT を検証。ページが属するノートに対するアクセス権を確認 |

---

## 12. メディア管理

### 12.1 メディアの保存先

| プラットフォーム | ローカル保存 | クラウド保存 |
|------------------|-------------|-------------|
| **Web** | ❌（ブラウザキャッシュのみ） | S3（直接アップロード） |
| **Tauri** | ✅（`~/.zedi/media/` にキャッシュ） | S3（同期時にアップロード） |

### 12.2 メディアアップロードフロー

#### Web

```
1. ユーザーが画像をドロップ/ペースト
2. API 経由で S3 に直接アップロード
   POST /api/media/upload → Presigned URL 取得 → S3 PUT
3. S3 URL を Y.Doc 内の画像ノードの src に設定
4. エディタに画像が表示される
```

#### Tauri

```
1. ユーザーが画像をドロップ/ペースト
2. Rust バックエンドがローカル FS にコピー
   ~/.zedi/media/{hash}.{ext}
3. media_id (UUID) を生成し、ローカル DB に登録
   media_registry: { media_id, local_path, s3_url: NULL, status: 'pending' }
4. Y.Doc 内の画像ノードの src に media_id を設定
5. エディタではローカルパスから画像を表示（即座に）
6. 同期時: Rust が pending メディアを S3 にアップロード
   → s3_url を更新 → Y.Doc 内の src を S3 URL に更新
```

#### クロスプラットフォーム表示

- **Tauri → Web:** 同期後、Y.Doc の画像 src が S3 URL に更新されるため、Web でも表示可能
- **Web → Tauri:** Tauri アプリは S3 URL の画像をダウンロードしてローカルにキャッシュ。次回以降はローカルから高速表示
- **Tauri（オフライン）:** ローカルにキャッシュ済みの画像は表示可能。未ダウンロードの画像はプレースホルダー表示

### 12.3 メディアストレージのクリーンアップ

- Tauri: ページが削除されたメディアは、次回同期時にローカルキャッシュからも削除
- S3: 孤立メディアの定期クリーンアップ（Lambda バッチ、将来実装）

---

## 13. API 設計

### 13.1 REST API（Lambda + API Gateway）

認証: すべてのエンドポイントで Cognito JWT を検証。

#### ページ API

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/sync/pages?since={timestamp}` | 差分取得（個人ページメタデータ） |
| POST | `/api/sync/pages` | ローカル変更の一括送信 |
| GET | `/api/pages/{id}/content` | Y.Doc 状態の取得 |
| PUT | `/api/pages/{id}/content` | Y.Doc 状態の保存 |
| POST | `/api/pages` | ページ作成 |
| DELETE | `/api/pages/{id}` | ページ削除（論理削除） |

#### ノート API

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/notes` | 自分がアクセス可能なノート一覧 |
| GET | `/api/notes/{id}` | ノート詳細 + ページ一覧 |
| POST | `/api/notes` | ノート作成 |
| PUT | `/api/notes/{id}` | ノート更新 |
| DELETE | `/api/notes/{id}` | ノート削除 |
| POST | `/api/notes/{id}/pages` | ノートにページを追加（既存ページの紐付け）または **ノート内で新規ページ作成**（後述） |
| DELETE | `/api/notes/{id}/pages/{pageId}` | ノートからページを削除 |
| GET | `/api/notes/{id}/members` | メンバー一覧 |
| POST | `/api/notes/{id}/members` | メンバー招待 |
| DELETE | `/api/notes/{id}/members/{email}` | メンバー削除 |

**ノートにページを追加する API の二義:**

- **既存ページをノートに追加:** `POST /api/notes/{id}/pages` に `{ "pageId": "uuid" }` を渡す。`note_pages` に紐付けするだけ。`pages.owner_id` は変更しない。
- **ノート内で新規ページ作成:** 同一エンドポイントに `{ "title": "..." }` のみ（または `pageId` なし）で渡す。サーバーが新規 `pages` を作成し、**`owner_id = notes.owner_id`** とし、`note_pages` に追加する。zedi-data-structure-spec §3.2.1 に従う。

#### 検索 API

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/search?q={query}&scope=shared` | 共有ノートの全文検索 |

#### メディア API

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/media/upload` | Presigned URL の発行 |
| POST | `/api/media/confirm` | アップロード完了確認 |

#### ユーザー API

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/users/upsert` | サインイン時のユーザー upsert |
| GET | `/api/users/{id}` | ユーザー情報取得 |

### 13.2 WebSocket API（Hocuspocus）

```
Endpoint: wss://realtime.zedi-note.app/
Protocol: Y.js Sync Protocol
Auth: JWT token (query parameter or initial message)
Document Name: page-{pageId}
```

---

## 14. サーバーアーキテクチャ

### 14.1 構成

| サービス | 用途 | スペック（dev） |
|---------|------|----------------|
| **Aurora Serverless v2** | メタデータ + Y.Doc + 全文検索 | 0.5〜4 ACU, PostgreSQL 15.x |
| **Hocuspocus (ECS Fargate)** | リアルタイム同期サーバー | 0.25 vCPU, 0.5GB |
| **ElastiCache (Redis)** | Pub/Sub + プレゼンス | cache.t4g.micro |
| **Lambda + API Gateway** | REST API | オンデマンド |
| **S3** | メディアファイル + フロントエンド | - |
| **CloudFront** | CDN | - |
| **Cognito** | 認証 | - |

### 14.2 Aurora スキーマ（追加分）

`zedi-data-structure-spec.md` の定義に加え、以下のテーブル/カラムを追加：

```sql
-- Y.Doc 永続化
CREATE TABLE page_contents (
    page_id UUID PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    ydoc_state BYTEA NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    content_text TEXT,  -- 全文検索用（Y.Doc から抽出）
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 全文検索インデックス（日本語対応: pg_bigm）
CREATE EXTENSION IF NOT EXISTS pg_bigm;
CREATE INDEX idx_page_contents_text_bigm
  ON page_contents USING gin (content_text gin_bigm_ops);

-- メディア管理
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    s3_key TEXT NOT NULL,
    file_name TEXT,
    content_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 15. Tauri 固有の設計

### 15.1 Rust バックエンドの構成

```
server/src-tauri
├── src/
│   ├── main.rs              # Tauri エントリポイント
│   ├── commands/             # Tauri Commands
│   │   ├── storage.rs        # ローカル DB 操作
│   │   ├── collaboration.rs  # Hocuspocus 接続
│   │   ├── sync.rs           # サーバー同期
│   │   ├── media.rs          # メディア管理
│   │   └── auth.rs           # 認証トークン管理
│   ├── db/
│   │   ├── sqlite.rs         # SQLite ネイティブ接続
│   │   ├── schema.rs         # ローカルスキーマ定義
│   │   └── fts.rs            # FTS5 全文検索
│   ├── collaboration/
│   │   ├── ws_client.rs      # WebSocket クライアント
│   │   ├── ydoc_manager.rs   # yrs による Y.Doc 管理
│   │   └── sync_protocol.rs  # Y.js 同期プロトコル
│   ├── media/
│   │   ├── cache.rs          # ローカルキャッシュ管理
│   │   └── s3_upload.rs      # S3 アップロード
│   └── auth/
│       ├── token.rs          # JWT 管理
│       └── secure_store.rs   # セキュアストレージ
├── Cargo.toml
└── tauri.conf.json
```

### 15.2 Rust の主要クレート

| クレート | 用途 |
|---------|------|
| `tauri` | アプリフレームワーク |
| `rusqlite` | SQLite ネイティブ接続 |
| `yrs` | Y.Doc（Rust 実装） |
| `y-sync` | Y.js 同期プロトコル |
| `tokio` | 非同期ランタイム |
| `tokio-tungstenite` | WebSocket クライアント |
| `reqwest` | HTTP クライアント（REST API） |
| `serde` / `serde_json` | シリアライズ |
| `keyring` | OS キーストア（トークン保存） |

### 15.3 Desktop 固有機能

| 機能 | 実装方法 |
|------|---------|
| グローバルホットキー | `tauri-plugin-global-shortcut` |
| システムトレイ | `tauri::tray::TrayIconBuilder` |
| 自動起動 | `tauri-plugin-autostart` |
| ウィンドウ管理 | Tauri Window API |

### 15.4 Mobile 固有機能

| 機能 | 実装方法 |
|------|---------|
| Share Sheet | Tauri の Deep Link + Intent Filter（Android）/ Share Extension（iOS） |
| プッシュ通知 | `tauri-plugin-notification`（将来） |
| バイオメトリクス認証 | OS 標準 API（将来） |

---

## 16. 移行計画

### 16.1 概要

```
現行                          移行後
──────────────                ──────────────
sql.js (WASM SQLite)    →     Web: IndexedDB / Tauri: SQLite (native)
Turso (LibSQL)          →     Aurora Serverless v2 (PostgreSQL)
Tiptap JSON             →     Y.Doc (全ページ)
Turso 直接接続          →     API (Lambda + API Gateway)
Hocuspocus (メモリのみ) →     Hocuspocus + Aurora 永続化 + Redis
```

### 16.2 移行ステップ

#### Phase C1: API レイヤー構築

1. Lambda + API Gateway で REST API を実装（§13 のエンドポイント）
2. Aurora に DDL を適用（zedi-data-structure-spec + page_contents + media）
3. API のテスト・デプロイ

#### Phase C2: データ移行

1. Turso から全データをエクスポート
2. ID を UUID に変換、users テーブルを生成
3. **Tiptap JSON → Y.Doc 一括変換**（`prosemirrorJSONToYDoc()`）
4. Aurora にインポート（pages, page_contents, notes, note_pages, note_members, links, ghost_links）
5. テキスト抽出して `page_contents.content_text` に格納
6. 整合性検証

#### Phase C3: クライアント移行（Web）

1. `StorageAdapter` インターフェース + `IndexedDBStorageAdapter` を実装
2. `turso.ts` を `apiClient.ts` に差し替え（REST API 呼び出し）
3. エディタを全ページ Y.Doc 対応に変更（`CollaborationManager` の `local` モード）
4. 検索を IndexedDB ベースのローカル検索 + API サーバー検索に変更
5. 同期ロジックを新 API に対応

#### Phase C4: Hocuspocus 永続化

1. Hocuspocus に Aurora 永続化（`onStoreDocument` / `onLoadDocument`）を実装
2. Redis 連携（Pub/Sub）を実装
3. 定期保存 + 切断時保存

#### Phase D: Tauri Desktop

1. Tauri 2.0 プロジェクト初期化、React コードを配置
2. `TauriStorageAdapter` を実装（SQLite + FTS5）
3. Rust WebSocket クライアント（Hocuspocus 接続）を実装
4. 認証フロー（WebView 内 Cognito）を実装
5. メディアのローカルキャッシュ + S3 同期を実装
6. Desktop 固有機能（ホットキー、トレイ）

#### Phase E: Tauri Mobile

1. Tauri Mobile ビルド設定（iOS / Android）
2. Share Sheet 統合
3. モバイル UI 最適化

### 16.3 ロールバック

- Turso を移行完了まで読み取り専用で維持
- Aurora 移行に問題があれば、Turso からのデータ再読み込みで切り戻し可能

---

## 17. 既存仕様からの変更一覧

本リアーキテクチャにより、既存のドキュメント・方針から変更が必要な項目：

### 17.1 zedi-future-considerations-options.md からの変更

| § | 項目 | 旧推奨 | 新方針 | 変更理由 |
|---|------|--------|--------|---------|
| §1 | ローカルストア | B. IndexedDB 直接 | **プラットフォームで分岐**: Web=IndexedDB, Tauri=ネイティブ SQLite | Tauri ではネイティブ SQLite が高速。抽象化レイヤーで統一 |
| §10 | 全文検索 | A. サーバー PostgreSQL のみ | **個人ページ=ローカル検索**, 共有ノート=サーバー検索 | 個人ページはローカルにあるため即座に検索可能。オフライン対応。 |
| §9 | エディタ | A. 統一 Y.Doc エディタ | 維持。ただし **Tauri は Rust IPC 経由** | Rust が Y.Doc とネットワーク接続を管理 |
| 新規 | メディア管理 | （未検討） | Tauri=ローカル+S3同期, Web=S3直接 | Tauri でのオフライン画像表示・高速化 |

### 17.2 PRD からの更新が必要な箇所

| PRD の箇所 | 変更内容 |
|-----------|---------|
| §0.2 現在の開発フェーズ | 「リアーキテクチャ（AWS 移行 + マルチプラットフォーム設計）」を反映 |
| §0.3 Tauri 移行計画 | 本書の Phase D/E に合わせて更新 |
| §2.9 認証と同期 | Clerk → Cognito、Turso → Aurora/API に更新 |
| §3.1 Tech Stack | sql.js → StorageAdapter（抽象化）、Turso → Aurora、Hocuspocus 追加 |
| §3.3 データモデル | zedi-data-structure-spec.md を参照するよう更新 |
| §7.1 DB 同期アーキテクチャ | 本書 §8 の新同期方式に更新 |
| Phase 5: Sync | 本書の方式に合わせて更新 |
| Phase 6/7: Tauri | 本書 Phase D/E に合わせて更新 |

### 17.3 realtime-collaboration-specification.md からの更新

| 箇所 | 変更内容 |
|------|---------|
| §2.1 全体構成図 | Tauri 版のアーキテクチャ図を追加 |
| §4.1 Aurora スキーマ | zedi-data-structure-spec.md の pages/notes を正とする旨を明記（既に記載済み） |
| §3.4 API 仕様 | 本書 §13 の API 設計を参照 |
| 新規 | Tauri 版の Rust WebSocket 接続仕様（§9.3 相当）を追記 |

---

## 18. ロードマップ

```
Phase A (現在)          Phase C               Phase D              Phase E
Web App                 AWS 移行               Tauri Desktop        Tauri Mobile
────────────────────    ──────────────────     ──────────────────   ───────────
✅ Tiptap Editor        C1: API 構築           D1: プロジェクト初期化  E1: Mobile ビルド
✅ WikiLink             C2: データ移行          D2: SQLite Adapter    E2: Share Sheet
✅ Date Grid            C3: Web クライアント    D3: Rust WS Client    E3: Mobile UI
✅ AI (Wiki Gen)            移行               D4: 認証フロー
✅ Web Clipping         C4: Hocuspocus         D5: メディアキャッシュ
✅ Cognito Auth             永続化             D6: Desktop 固有機能
✅ Hocuspocus (基本)
⬜ 共有ノート完全対応    ◀── 最優先 ──▶        ◀── 次フェーズ ──▶
```

---

## 付録 A: 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| docs/PRD.md | プロダクト要件（更新が必要） |
| docs/specs/zedi-data-structure-spec.md | DB スキーマの正本 |
| docs/specs/zedi-future-considerations-options.md | 各論点の選択肢比較・検討過程 |
| docs/specs/realtime-collaboration-specification.md | リアルタイム編集の詳細仕様 |
| docs/specs/wiki-link-specification.md | WikiLink 機能仕様 |
| docs/plans/20260208/turso-to-aurora-migration-decisions.md | Aurora 移行の決定事項 |

## 付録 B: 技術スタック一覧

| レイヤー | Web | Tauri Desktop / Mobile |
|---------|-----|------------------------|
| **UI** | React + Tiptap + Tailwind CSS | 同左（WebView） |
| **状態管理** | React Query + Zustand | 同左 |
| **エディタ** | Tiptap + Y.js + Collaboration ext. | 同左 |
| **ローカル DB** | IndexedDB | SQLite (native, via Rust) |
| **Y.Doc 永続化** | y-indexeddb | Rust (SQLite BLOB or FS) |
| **検索（個人）** | IndexedDB + JS filter | SQLite FTS5 (Rust) |
| **検索（共有）** | API → PostgreSQL pg_bigm | 同左 |
| **WebSocket** | @hocuspocus/provider (JS) | Rust (tokio-tungstenite + yrs) |
| **HTTP** | fetch API | Rust (reqwest) |
| **認証** | Cognito (browser redirect) | Cognito (WebView) |
| **メディア** | S3 直接 | ローカル FS + S3 同期 |
| **OS 統合** | - | グローバルホットキー, トレイ, Share Sheet |
| **サーバー** | Aurora + Hocuspocus + Lambda + Redis + S3 | 同左 |
