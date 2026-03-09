# GitHub コントリビューションコンポーネント 仕様書

> **ドキュメントバージョン:** 0.1
> **作成日:** 2026-03-08
> **ステータス:** 要件定義中（ドラフト）
> **関連 Issue:** #319
> **依存:** [拡張機能マーケットプレイスシステム仕様書](./extension-marketplace-spec.md)

---

## 1. 概要

### 1.1 目的

Zedi のエディター拡張として **GitHub コントリビューションコンポーネント**を提供する。ユーザーの GitHub アカウントから活動データ（プッシュ数、コントリビューション数など）を取得し、エディター内にインタラクティブなコンポーネントとして埋め込む。

### 1.2 ユーザーストーリー

> 👤 **ユーザー A（個人開発者）**
>
> 「日記に今日の GitHub の活動を記録したい。毎日のコミット数やプッシュ回数を手入力するのは面倒なので、自動的に取得して表示されると嬉しい。」

> 👤 **ユーザー B（チームリーダー）**
>
> 「週次レポートに自分のコントリビューション状況を含めたい。コントリビューショングラフ（草）をエディターに埋め込めると、レポート作成が楽になる。」

> 👤 **ユーザー C（ポートフォリオ作成者）**
>
> 「学習ログとして、どのリポジトリにどれだけコントリビュートしたかを記録したい。GitHub の統計データをノートに添付できると便利。」

### 1.3 設計原則

| 原則 | 説明 |
|------|------|
| **スラッシュコマンド統合** | `/github` で簡単にコンポーネントを追加 |
| **リアルタイム性** | データは GitHub API から最新情報を取得 |
| **表示のカスタマイズ** | 表示期間・表示項目・レイアウトを選択可能 |
| **オフライン対応** | 最後に取得したデータをキャッシュし、オフラインでも表示 |

---

## 2. 機能要件

### 2.1 コア機能

| # | 機能 | 説明 | 優先度 |
|---|------|------|--------|
| F1 | コントリビューショングラフ表示 | GitHub の草（contribution graph）をエディター内に表示 | 高 |
| F2 | 今日のコントリビューション統計 | 今日のコミット数・プッシュ数・PR 数を表示 | 高 |
| F3 | 期間指定統計 | 指定期間のコントリビューション集計 | 中 |
| F4 | リポジトリ別統計 | リポジトリごとのコントリビューション内訳 | 中 |
| F5 | `/github` スラッシュコマンド | エディターで `/github` と入力してコンポーネント追加 | 高 |
| F6 | GitHub アカウント連携 | GitHub Personal Access Token / OAuth で認証 | 高 |
| F7 | データキャッシュ | 取得データをキャッシュし API レート制限を回避 | 高 |
| F8 | 自動更新 | 定期的にデータを更新（設定可能なインターバル） | 低 |

### 2.2 コンポーネント種類

#### 2.2.1 コントリビューショングラフ（草）

GitHub プロフィールに表示されるコントリビューショングラフと同様のヒートマップをエディター内に表示。

```
┌──────────────────────────────────────────────┐
│  🐙 GitHub Contributions                      │
│  otomatty · 過去 365 日                        │
│                                                │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│  ░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██░░▓▓░░██   │
│                                                │
│  1,234 contributions in the last year          │
│  最終更新: 2026-03-08 14:30                     │
│                                                │
│  Less ░░▓▓██ More                              │
└──────────────────────────────────────────────┘
```

#### 2.2.2 今日の統計カード

```
┌──────────────────────────────────────────────┐
│  🐙 Today's GitHub Activity                   │
│  2026-03-08 (日曜日)                           │
│                                                │
│  📊 コミット: 12    🔀 PR: 2    📝 Issue: 1    │
│  ⭐ スター獲得: 3   📦 プッシュ: 5              │
│                                                │
│  🔥 連続コントリビューション: 45 日              │
│                                                │
│  最終更新: 14:30  [🔄 更新]                     │
└──────────────────────────────────────────────┘
```

#### 2.2.3 リポジトリ別統計

```
┌──────────────────────────────────────────────┐
│  🐙 Repository Activity (今月)                │
│                                                │
│  📦 otomatty/zedi          ████████░░  42      │
│  📦 otomatty/portfolio     ███░░░░░░░  15      │
│  📦 otomatty/cli-tool      ██░░░░░░░░   8      │
│                                                │
│  合計: 65 contributions                        │
└──────────────────────────────────────────────┘
```

---

## 3. 技術設計

### 3.1 拡張機能マニフェスト

```json
{
  "id": "zedi-github-contribution",
  "name": "github-contribution",
  "displayName": "GitHub コントリビューション",
  "version": "1.0.0",
  "description": "GitHub の活動データをエディターに表示します",
  "author": "Zedi Team",
  "category": "data-integration",
  "icon": "github",
  "permissions": ["http", "storage"],
  "tiptapExtensions": ["githubContributionNode"],
  "slashCommands": ["/github"],
  "settings": {
    "githubUsername": {
      "type": "string",
      "label": "GitHub ユーザー名",
      "required": true
    },
    "githubToken": {
      "type": "secret",
      "label": "GitHub Personal Access Token",
      "description": "read:user スコープが必要です",
      "required": false
    },
    "defaultPeriod": {
      "type": "select",
      "label": "デフォルト表示期間",
      "options": ["today", "week", "month", "year"],
      "default": "year"
    },
    "autoRefreshInterval": {
      "type": "number",
      "label": "自動更新間隔（分）",
      "default": 30,
      "min": 5,
      "max": 1440
    }
  }
}
```

### 3.2 Tiptap カスタムノード

GitHub コントリビューションコンポーネントは Tiptap の **Custom Node** として実装し、**Node View（React）** で描画する。

#### ノード定義

```typescript
// githubContributionNode.ts
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { GitHubContributionView } from './GitHubContributionView';

export const GitHubContributionNode = Node.create({
  name: 'githubContribution',
  group: 'block',
  atom: true, // インラインではなくブロック要素
  draggable: true,

  addAttributes() {
    return {
      username: { default: null },
      period: { default: 'year' },
      displayType: { default: 'graph' }, // 'graph' | 'stats' | 'repos'
      lastFetched: { default: null },
      cachedData: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="github-contribution"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'github-contribution',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GitHubContributionView);
  },
});
```

#### React Node View

```typescript
// GitHubContributionView.tsx（概要）
import { NodeViewWrapper } from '@tiptap/react';

export function GitHubContributionView({ node, updateAttributes }) {
  const { username, period, displayType, cachedData } = node.attrs;

  // GitHub API からデータ取得
  // キャッシュの有効性チェック
  // 表示タイプに応じたレンダリング

  return (
    <NodeViewWrapper className="github-contribution-block">
      {displayType === 'graph' && <ContributionGraph data={data} />}
      {displayType === 'stats' && <TodayStats data={data} />}
      {displayType === 'repos' && <RepoStats data={data} />}
    </NodeViewWrapper>
  );
}
```

### 3.3 スラッシュコマンド統合

既存の `slashSuggestionPlugin.ts` に GitHub コンポーネントのコマンドを追加：

```typescript
// slashCommandItems.ts に追加
{
  title: 'GitHub コントリビューション',
  description: 'GitHub の活動データを表示',
  icon: 'github',
  command: ({ editor }) => {
    editor.chain().focus().insertContent({
      type: 'githubContribution',
      attrs: {
        username: extensionSettings.githubUsername,
        period: extensionSettings.defaultPeriod,
        displayType: 'graph',
      },
    }).run();
  },
  aliases: ['github', 'contribution', 'git'],
}
```

ユーザーが `/` を入力した後のフロー：

```
/ を入力
  → スラッシュコマンドメニュー表示
  → "github" と入力してフィルタリング
  → 📊 GitHub コントリビューション を選択
  → コンポーネント種類を選択
    → コントリビューショングラフ
    → 今日の統計
    → リポジトリ別統計
  → エディターにコンポーネントが挿入される
```

### 3.4 GitHub API 連携

#### 使用する API

| API | 用途 | 認証 |
|-----|------|------|
| GitHub GraphQL API | コントリビューションデータ取得 | Personal Access Token（`read:user`） |
| GitHub REST API v3 | リポジトリ情報取得 | Personal Access Token / 未認証（制限あり） |

#### GraphQL クエリ例（コントリビューション取得）

```graphql
query ContributionData($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
          }
        }
      }
      commitContributionsByRepository(maxRepositories: 10) {
        repository {
          name
          owner { login }
        }
        contributions {
          totalCount
        }
      }
    }
  }
}
```

#### API レート制限対策

| 対策 | 説明 |
|------|------|
| **キャッシュ** | 取得データを IndexedDB にキャッシュ（TTL: 30 分） |
| **条件付きリクエスト** | `If-Modified-Since` / `ETag` ヘッダーの活用 |
| **バッチリクエスト** | GraphQL で必要なデータを一度に取得 |
| **サーバーサイドプロキシ** | API キーの漏洩防止 + レート制限の集約 |

### 3.5 データキャッシュ構造

```typescript
interface GitHubContributionCache {
  username: string;
  fetchedAt: string; // ISO 8601
  ttl: number; // seconds
  data: {
    contributionCalendar: ContributionCalendar;
    todayStats: TodayStats;
    repoStats: RepoStats[];
    streak: number; // 連続コントリビューション日数
  };
}

interface ContributionCalendar {
  totalContributions: number;
  weeks: {
    contributionDays: {
      date: string;
      contributionCount: number;
      color: string;
    }[];
  }[];
}

interface TodayStats {
  commits: number;
  pullRequests: number;
  issues: number;
  pushes: number;
  starsReceived: number;
}

interface RepoStats {
  name: string;
  owner: string;
  contributions: number;
}
```

### 3.6 実装コンポーネント

| ファイル | 説明 |
|----------|------|
| `src/extensions/github-contribution/index.ts` | 拡張機能エントリポイント |
| `src/extensions/github-contribution/githubContributionNode.ts` | Tiptap カスタムノード定義 |
| `src/extensions/github-contribution/GitHubContributionView.tsx` | React Node View メインコンポーネント |
| `src/extensions/github-contribution/ContributionGraph.tsx` | コントリビューショングラフ（ヒートマップ） |
| `src/extensions/github-contribution/TodayStats.tsx` | 今日の統計カード |
| `src/extensions/github-contribution/RepoStats.tsx` | リポジトリ別統計 |
| `src/extensions/github-contribution/githubApi.ts` | GitHub API クライアント |
| `src/extensions/github-contribution/cache.ts` | データキャッシュ管理 |
| `src/extensions/github-contribution/GitHubSettings.tsx` | 設定 UI |
| `src/extensions/github-contribution/githubSlashCommand.ts` | `/github` スラッシュコマンド |
| `server/api/src/routes/extensions/github.ts` | GitHub API プロキシ（トークン保護） |

### 3.7 contentUtils.ts への統合

既存の `src/lib/contentUtils.ts` の `SUPPORTED_NODE_TYPES` に `githubContribution` を追加する必要がある。

```typescript
// contentUtils.ts
const SUPPORTED_NODE_TYPES = [
  // ... existing types
  'githubContribution',
];
```

---

## 4. UI/UX 設計

### 4.1 コンポーネントのインタラクション

| 操作 | 動作 |
|------|------|
| **クリック** | コンポーネントを選択（枠線表示） |
| **ダブルクリック** | 設定パネルを開く（期間・表示タイプ変更） |
| **ドラッグ** | エディター内でコンポーネントを移動 |
| **右クリック** | コンテキストメニュー（更新・設定・削除） |
| **ホバー** | ヒートマップのセルにホバーで詳細表示（「3月8日: 5 contributions」） |

### 4.2 レスポンシブ対応

| 画面幅 | レイアウト |
|--------|-----------|
| `>= 768px` | フルサイズのヒートマップ（52 週分） |
| `< 768px` | 直近 26 週分に圧縮 |
| `< 480px` | 直近 13 週分 + スクロール |

### 4.3 テーマ対応

コントリビューショングラフの色は Zedi のテーマ（ライト/ダーク）に連動：

| テーマ | 背景色 | レベル 0 | レベル 1 | レベル 2 | レベル 3 | レベル 4 |
|--------|--------|----------|----------|----------|----------|----------|
| ライト | `#ffffff` | `#ebedf0` | `#9be9a8` | `#40c463` | `#30a14e` | `#216e39` |
| ダーク | `#0d1117` | `#161b22` | `#0e4429` | `#006d32` | `#26a641` | `#39d353` |

---

## 5. 要件定義のための質問・提案

### 5.1 質問事項

| # | 質問 | 選択肢 / 補足 |
|---|------|--------------|
| Q1 | GitHub 認証方式はどちらが望ましいか？ | **A)** Personal Access Token（手動設定、シンプル）<br>**B)** GitHub OAuth App（ワンクリック認証、スコープ制御）<br>**C)** 両方サポート |
| Q2 | GitHub トークンの保存場所は？ | **A)** ブラウザの IndexedDB（クライアントサイドのみ）<br>**B)** サーバーサイド DB（暗号化して保存）<br>**C)** ユーザーが選択可能 |
| Q3 | コントリビューションデータのスナップショット保存は必要か？ | 過去のある時点のデータを保存し、変化を追跡する機能 |
| Q4 | GitHub 以外の Git プラットフォーム（GitLab, Bitbucket）への対応は将来的に必要か？ | 拡張性を考慮した設計にするか |
| Q5 | コンポーネントの印刷/エクスポート時の表現は？ | PDF 出力時に SVG/画像として表示するか、テキスト化するか |
| Q6 | コンポーネントは読み取り専用か、編集可能か？ | 取得データを手動で修正する需要はあるか |
| Q7 | 他のユーザーの GitHub データも表示可能にするか？ | チーム内で他メンバーの活動を閲覧するユースケース |

### 5.2 提案事項

#### 提案 1: MVP は Personal Access Token + クライアント直接取得

**初期実装では PAT を設定画面で入力し、クライアントから直接 GitHub API を呼ぶ。**

理由：
- OAuth App の設定（GitHub App 登録、コールバック URL 等）は初期段階では不要
- サーバーサイドのプロキシ実装も後回しにできる
- GitHub GraphQL API はブラウザから直接呼べる（CORS 対応済み）
- PAT は IndexedDB に保存し、ブラウザ外に送信しない

注意点：
- PAT の有効期限管理が必要
- PAT のスコープ(`read:user`)をユーザーに説明する UI が必要

#### 提案 2: コンポーネントデータはノード属性に埋め込まない

**GitHub データはキャッシュレイヤーに保存し、ノードには `username` と `displayType` のみ保持する。**

理由：
- コントリビューションデータは大きく（年間 365 日分）、ページの JSON が肥大化する
- データは常に最新を取得するため、ドキュメントに埋め込む意味が薄い
- キャッシュ層で TTL 管理し、必要に応じて再取得
- ページ同期（Y.js / Hocuspocus）のトラフィックを削減

#### 提案 3: 段階的なコンポーネント実装

**Phase 1 ではコントリビューショングラフのみ実装し、統計カードやリポジトリ別は Phase 2 以降で追加する。**

理由：
- コントリビューショングラフが最もビジュアルインパクトが大きい
- 必要な GitHub API が `contributionCalendar` のみで済む
- Node View の基盤コンポーネントを先に確立し、後から拡張しやすい
- ユーザーからのフィードバックを得てから追加機能を決定できる

#### 提案 4: サーバーサイドプロキシは Phase 2 で導入

**セキュリティ上、将来的には GitHub API 呼び出しをサーバー経由にする。**

理由：
- PAT がブラウザの DevTools で見えるリスクを排除
- サーバーで API レスポンスをキャッシュし、全ユーザーでキャッシュを共有
- GitHub API のレート制限をサーバー側で集約管理
- 将来的な OAuth 対応の基盤になる

---

## 6. セキュリティ考慮事項

| リスク | 対策 |
|--------|------|
| GitHub PAT の漏洩 | IndexedDB に保存、ページ JSON には含めない。Phase 2 でサーバー保存に移行 |
| XSS による PAT 窃取 | CSP ヘッダー、Tiptap のサニタイズ |
| API レート制限超過 | キャッシュ + 最小限のリクエスト頻度 |
| 他ユーザーのデータアクセス | 公開プロフィールデータのみ使用（PAT なしでも取得可能な範囲） |

---

## 7. スケジュール見積もり

| フェーズ | 内容 | 工数見積 |
|----------|------|----------|
| Phase 1 | コントリビューショングラフ + `/github` コマンド + 設定 UI | 5-7 日 |
| Phase 2 | 統計カード + リポジトリ別統計 + サーバーサイドプロキシ | 5-7 日 |
| Phase 3 | OAuth 認証 + データスナップショット | 5-7 日 |
| Phase 4 | GitLab/Bitbucket 対応（オプション） | 3-5 日 |

---

## 8. 関連ドキュメント

- [拡張機能マーケットプレイスシステム仕様書](./extension-marketplace-spec.md)
- [日記自動作成拡張仕様書](./daily-diary-extension-spec.md)
- [エディター拡張実装計画](../plans/20260215/editor-extensions-implementation-plan.md)
- [Zedi データ構造仕様書](./zedi-data-structure-spec.md)
