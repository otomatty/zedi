# 作業ログ: Tiptap v3 コラボレーション機能セットアップ

**作業日:** 2026-02-01  
**作業者:** -  
**ステータス:** 完了 ✅

---

## 1. 作業サマリー

Hocuspocusサーバーデプロイ完了後の次のステップとして、クライアントサイドのリアルタイムコラボレーション機能の基盤をセットアップ。Tiptapを最新版に更新し、Y.js関連パッケージをインストール。

### 1.1 完了した作業

| # | 作業内容 | ステータス |
|---|----------|-----------|
| 1 | Tiptapパッケージを最新版(3.18.0)に更新 | ✅ 完了 |
| 2 | Y.js関連パッケージをインストール | ✅ 完了 |
| 3 | Tiptap Collaboration拡張をインストール | ✅ 完了 |
| 4 | 仕様書の更新（パッケージ名変更対応） | ✅ 完了 |
| 5 | ビルド・テスト検証 | ✅ 完了 |

---

## 2. Tiptap v3 調査結果

### 2.1 発見した問題

仕様書で参照していたパッケージ名がTiptap v3で変更されていた：

| 旧パッケージ名 | 新パッケージ名 | 備考 |
|---------------|---------------|------|
| `@tiptap/extension-collaboration-cursor` | `@tiptap/extension-collaboration-caret` | v3でリネーム |
| - | `@tiptap/y-tiptap` | v3で新規追加（必須） |

### 2.2 公式ドキュメント参照

- **リネームPR**: [#6173 Rename CollaborationCursor extension to CollaborationCaret](https://github.com/ueberdosis/tiptap/pull/6173)
- **公式ドキュメント**: https://tiptap.dev/docs/collaboration/getting-started/overview
- **GitHubパッケージ一覧**: https://github.com/ueberdosis/tiptap/tree/main/packages

---

## 3. パッケージ更新詳細

### 3.1 Tiptapコアパッケージ（更新）

| パッケージ | 旧バージョン | 新バージョン |
|-----------|-------------|-------------|
| `@tiptap/react` | ^3.14.0 | ^3.18.0 |
| `@tiptap/core` | - | ^3.18.0 |
| `@tiptap/pm` | - | ^3.18.0 |
| `@tiptap/starter-kit` | ^3.14.0 | ^3.18.0 |
| `@tiptap/extension-link` | ^3.14.0 | ^3.18.0 |
| `@tiptap/extension-placeholder` | ^3.14.0 | ^3.18.0 |
| `@tiptap/extension-typography` | ^3.14.0 | ^3.18.0 |
| `@tiptap/extension-image` | ^3.15.2 | ^3.18.0 |
| `@tiptap/extension-bubble-menu` | ^3.14.0 | ^3.18.0 |
| `@tiptap/html` | ^3.14.0 | ^3.18.0 |

### 3.2 コラボレーション関連パッケージ（新規）

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `yjs` | ^13.6.29 | CRDT基盤ライブラリ |
| `y-websocket` | ^3.0.0 | WebSocket同期プロバイダー |
| `y-indexeddb` | ^9.0.12 | オフライン永続化 |
| `y-protocols` | ^1.0.7 | Y.js同期プロトコル |
| `@tiptap/extension-collaboration` | ^3.18.0 | Y.jsドキュメント連携 |
| `@tiptap/extension-collaboration-caret` | ^3.18.0 | カーソル表示 |
| `@tiptap/y-tiptap` | ^3.0.2 | TiptapとY.jsのブリッジ |

### 3.3 インストールコマンド

```bash
# Tiptapコアパッケージ更新
npm install @tiptap/react@latest @tiptap/core@latest @tiptap/pm@latest \
  @tiptap/starter-kit@latest @tiptap/extension-link@latest \
  @tiptap/extension-placeholder@latest @tiptap/extension-typography@latest \
  @tiptap/extension-image@latest @tiptap/extension-bubble-menu@latest \
  @tiptap/html@latest

# コラボレーション関連パッケージ追加
npm install yjs y-websocket y-indexeddb y-protocols \
  @tiptap/extension-collaboration@latest \
  @tiptap/extension-collaboration-caret@latest \
  @tiptap/y-tiptap@latest

# lockファイル作成
bun install
```

---

## 4. 仕様書更新

### 4.1 更新したファイル

| ファイル | 変更内容 |
|---------|---------|
| `docs/specs/realtime-collaboration-specification.md` | 技術スタックバージョン更新、パッケージ名変更 |
| `docs/specs/application-implementation-plan.md` | インポート文・コード内のパッケージ名変更 |
| `docs/guides/hocuspocus-overview.md` | Mermaid図内のパッケージ名変更 |

### 4.2 変更箇所詳細

#### realtime-collaboration-specification.md

**技術スタック表の更新:**
```markdown
| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| **CRDT** | Y.js | ^13.6.0 | ドキュメント同期の基盤 |
| **エディタ** | Tiptap | ^3.18.0 | リッチテキストエディタ |
| **Tiptap Y.js連携** | @tiptap/y-tiptap | ^3.0.0 | TiptapとY.jsのブリッジ |
| **同期(Client)** | y-websocket | ^3.0.0 | WebSocket通信 |
| **永続化(Client)** | y-indexeddb | ^9.0.0 | ローカル保存 |
| **同期(Server)** | Hocuspocus | ^3.x | Y.js WebSocketサーバー |
```

**アーキテクチャ図の更新:**
```
CollaborationCursor Extension → CollaborationCaret Extension
```

#### application-implementation-plan.md

**インポート文の変更:**
```typescript
// Before
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

// After
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
```

**コード内の変更:**
```typescript
// Before
CollaborationCursor.configure({ ... })

// After
CollaborationCaret.configure({ ... })
```

---

## 5. 検証結果

### 5.1 ビルド

```bash
npm run build
# ✓ built in 23.63s
```

### 5.2 テスト

```bash
npm run test:run
# Test Files  12 passed (12)
#      Tests  156 passed (156)
```

---

## 6. 次のステップ

### 6.1 クライアントサイド実装（✅ 完了）

- [x] `src/lib/collaboration/types.ts` - 型定義
- [x] `src/lib/collaboration/CollaborationManager.ts` - Y.Doc管理、WebSocket接続
- [x] `src/lib/collaboration/index.ts` - エクスポート
- [x] `src/hooks/useCollaboration.ts` - Reactフック
- [x] `src/components/editor/ConnectionIndicator.tsx` - 接続状態UI
- [x] `src/components/editor/UserAvatars.tsx` - オンラインユーザー表示
- [x] 環境変数設定（`VITE_REALTIME_URL`）

### 6.2 動作検証・統合作業（次回）

- [ ] ローカルHocuspocusサーバー起動テスト
- [ ] TiptapEditor への useCollaboration 統合
- [ ] ConnectionIndicator の PageEditor への統合
- [ ] AWS上のHocuspocusサーバーとの接続テスト

### 6.3 サーバーサイド拡張（将来）

- [ ] Cognito JWT検証の実装
- [ ] Redis連携（マルチインスタンス同期）
- [ ] Aurora PostgreSQL永続化

---

## 7. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Hocuspocusデプロイ作業ログ | [hocuspocus-server-deployment.md](./hocuspocus-server-deployment.md) |
| Phase 5 インフラ作業ログ | [../20260131/aws-infrastructure-phase5-realtime.md](../20260131/aws-infrastructure-phase5-realtime.md) |
| リアルタイム同時編集仕様 | [../../specs/realtime-collaboration-specification.md](../../specs/realtime-collaboration-specification.md) |
| アプリケーション実装計画 | [../../specs/application-implementation-plan.md](../../specs/application-implementation-plan.md) |
| Hocuspocus概要ガイド | [../../guides/hocuspocus-overview.md](../../guides/hocuspocus-overview.md) |

---

## 8. 参考リンク

| リソース | URL |
|---------|-----|
| Tiptap公式ドキュメント | https://tiptap.dev/docs |
| Tiptap Collaboration | https://tiptap.dev/docs/collaboration/getting-started/overview |
| Y.js公式ドキュメント | https://docs.yjs.dev/ |
| Tiptap GitHubリポジトリ | https://github.com/ueberdosis/tiptap |
| Hocuspocus公式ドキュメント | https://tiptap.dev/docs/hocuspocus/introduction |

---

*作成日: 2026-02-01*
