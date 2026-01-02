# 実装計画書: Zedi 価格戦略・マネタイズ設計

## 概要

| 項目       | 内容                                                                   |
| :--------- | :--------------------------------------------------------------------- |
| **機能名** | Pricing & Monetization System（価格設定・マネタイズシステム）          |
| **目的**   | 持続可能な収益モデルの構築とクラウドコストの確実なカバー               |
| **優先度** | 🟠 高（ビジネスの持続可能性に直結）                                    |
| **依存**   | クラウド同期機能（✅ 実装済み）、認証システム（✅ 実装済み）           |
| **状態**   | 📋 計画中                                                              |

---

## ビジネスモデル概要

### コンセプト

**ハイブリッドモデル：本体買い切り + クラウド同期サブスク**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Zedi 価格体系                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Free] 無料プラン                                                          │
│     • ローカル保存のみ                                                      │
│     • 100ページ制限                                                         │
│     • 基本機能                                                              │
│     • 14日間のPro無料トライアル                                             │
│                                                                             │
│  [Pro] 買い切り $39 / ¥4,980                                                │
│     • ローカル無制限ページ                                                  │
│     • 全機能アクセス                                                        │
│     • 現行メジャーバージョン永続利用                                        │
│     • AIウィキ生成（自分のAPIキー使用）                                     │
│                                                                             │
│  [Sync] クラウド同期（Proユーザー向けオプション）                           │
│     • 年額: $24 / ¥2,980（月額換算 $2）                                     │
│     • 月額: $3 / ¥400                                                       │
│     • マルチデバイス同期                                                    │
│     • 自動クラウドバックアップ                                              │
│                                                                             │
│  [Upgrade] メジャーアップデート                                             │
│     • 既存ユーザー: $29 / ¥3,480                                            │
│     • 早期割引（30日間）: $19 / ¥2,480                                      │
│     • 新規ユーザー: $39 / ¥4,980（通常価格）                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### このモデルを選択した理由

| 観点 | 説明 |
| :--- | :--- |
| **確実な継続収益** | Sync サブスクがクラウドコストを確実にカバー |
| **低い参入障壁** | 無料で始められ、必要に応じてアップグレード |
| **買い切りの魅力** | ローカル派・サブスク嫌いにもアピール |
| **柔軟性** | 同期不要なら買い切りのみで完結 |
| **競争優位性** | 長く使うほど他サービスよりお得 |

---

## 価格表

### 日本円 (JPY)

| プラン | 価格 | 請求サイクル | 内容 |
| :----- | :--- | :----------- | :--- |
| Free | ¥0 | - | 100ページ、ローカルのみ、14日間Pro試用 |
| Pro | ¥4,980 | 買い切り | 無制限ページ、全機能、ローカル保存 |
| Sync 月額 | ¥400 | 月額 | クラウド同期、マルチデバイス |
| Sync 年額 | ¥2,980 | 年額 | クラウド同期、マルチデバイス（38%お得） |
| アップグレード | ¥3,480 | 買い切り | 次期メジャーバージョン |
| 早期アップグレード | ¥2,480 | 買い切り | リリース後30日間限定 |

### 米ドル (USD)

| プラン | 価格 | 請求サイクル | 内容 |
| :----- | :--- | :----------- | :--- |
| Free | $0 | - | 100 pages, local only, 14-day Pro trial |
| Pro | $39 | One-time | Unlimited pages, all features, local storage |
| Sync Monthly | $3 | Monthly | Cloud sync, multi-device |
| Sync Yearly | $24 | Yearly | Cloud sync, multi-device (33% off) |
| Upgrade | $29 | One-time | Next major version |
| Early Upgrade | $19 | One-time | First 30 days after release |

---

## 競合比較

### 年間コスト比較（2年間使用想定）

| サービス | モデル | 1年目 | 2年目 | 2年間合計 |
| :------- | :----- | :---- | :---- | :-------- |
| Obsidian + Sync | 本体無料 + Sync | $96 | $96 | $192 |
| Craft | サブスク | $60 | $60 | $120 |
| Bear | サブスク | $30 | $30 | $60 |
| Notion Pro | サブスク | $96 | $96 | $192 |
| **Zedi Pro + Sync** | **買い切り + Sync** | **$63** | **$24** | **$87** |
| **Zedi Pro のみ** | **買い切り** | **$39** | **$0** | **$39** |

### 訴求ポイント

1. **長く使うほどお得** - 2年目以降は Sync 費用のみ
2. **同期不要なら最安** - $39 の一度きりで永続利用
3. **機能は全部入り** - 段階的なアンロックなし

---

## 収益シミュレーション

### シナリオ: 月間新規100ユーザー（初年度）

#### 前提条件

| 項目 | 割合 | 人数/月 |
| :--- | :--- | :------ |
| 無料ユーザー | 50% | 50人 |
| Pro 購入 | 35% | 35人 |
| Pro + Sync 契約 | 15% | 15人 |

#### 年間収益予測

| 収益源 | 計算 | 年間収益 |
| :----- | :--- | :------- |
| Pro 購入 | 35人 × 12ヶ月 × $39 | $16,380 |
| Sync 年額 | 15人 × 12ヶ月 × $24 × 50% | $2,160 |
| Sync 月額 | 15人 × 12ヶ月 × $3 × 6ヶ月 × 50% | $1,620 |
| **合計** | | **$20,160** |

#### クラウドコスト

| 項目 | 計算 | 年間コスト |
| :--- | :--- | :--------- |
| Turso (Scaler) | $29 × 12ヶ月 | $348 |
| 認証 (Supabase/Clerk) | $25 × 12ヶ月 | $300 |
| ドメイン・CDN | $10 × 12ヶ月 | $120 |
| **合計** | | **$768** |

#### 収益性

```
年間収益: $20,160
年間コスト: $768
年間利益: $19,392
利益率: 96.2%
```

---

## 無料トライアル設計

### フロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         無料トライアルフロー                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ユーザー登録                                                            │
│     ↓                                                                       │
│  2. 自動的に14日間のPro+Sync無料トライアル開始                              │
│     • 無制限ページ                                                          │
│     • クラウド同期有効                                                      │
│     • 全機能アクセス                                                        │
│     ↓                                                                       │
│  3. トライアル終了3日前に通知                                               │
│     「Pro版を購入して継続しますか？」                                       │
│     ↓                                                                       │
│  4a. 購入 → Pro ユーザーに移行                                              │
│     ↓                                                                       │
│  4b. 購入しない → Free プランにダウングレード                               │
│     • 既存ページは保持（閲覧・編集可能）                                    │
│     • 100ページ超過分は新規作成不可                                         │
│     • クラウド同期停止（ローカルデータは保持）                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### トライアル終了後の制限

| 機能 | Free | Pro |
| :--- | :--- | :-- |
| ページ数上限 | 100ページ | 無制限 |
| ローカル保存 | ✅ | ✅ |
| クラウド同期 | ❌ | ✅（Sync契約時） |
| 既存ページ閲覧 | ✅ | ✅ |
| 既存ページ編集 | ✅ | ✅ |
| 新規ページ作成 | 100ページまで | 無制限 |

---

## メジャーアップデート戦略

### バージョニングポリシー

```
v1.0.0 → v1.x.x: 無料アップデート（バグ修正、軽微な改善）
v1.x.x → v2.0.0: メジャーアップデート（有料アップグレード）
```

### アップグレード判断基準

ユーザーがアップグレードを**選択**できる仕組み：

| 項目 | v1.x（現行版） | v2.0（新版） |
| :--- | :------------- | :----------- |
| 継続利用 | ✅ 可能 | 要購入 |
| セキュリティ修正 | ✅ 提供（1年間） | ✅ 提供 |
| 新機能 | ❌ なし | ✅ あり |
| サポート | 📧 限定的 | 📧 優先対応 |

### アップグレード促進策

1. **早期割引**: リリース後30日間は $29 → $19
2. **新機能プレビュー**: アップグレード画面で新機能をデモ
3. **データ移行保証**: v1 → v2 の移行は完全サポート

---

## AI Wiki Generator の扱い

### 方針

**プランに含めず、APIキー設定で誰でも利用可能**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI Wiki Generator                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  • Free/Pro プラン共通で利用可能                                            │
│  • ユーザーが自分のAPIキーを設定                                            │
│  • API利用料はユーザー負担                                                  │
│                                                                             │
│  対応プロバイダー:                                                          │
│  ├── OpenAI (GPT-4, GPT-3.5)                                               │
│  ├── Anthropic (Claude)                                                     │
│  ├── Google (Gemini)                                                        │
│  └── ローカルLLM (Ollama)                                                   │
│                                                                             │
│  メリット:                                                                  │
│  ├── 運営側のAPI費用負担なし                                                │
│  ├── ユーザーが好きなモデルを選択可能                                       │
│  ├── 価格設定がシンプル                                                     │
│  └── 無料ユーザーでもAI機能を利用可能                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## チップ・サポート機能

### 実装方針

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ☕ Zedi をサポート                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  任意の金額で開発をサポートできます:                                        │
│                                                                             │
│  ├── ☕ $5  - コーヒー1杯                                                   │
│  ├── 🍱 $15 - ランチ1回                                                     │
│  ├── 🍽️ $50 - ディナー1回                                                   │
│  └── 💎 カスタム金額                                                        │
│                                                                             │
│  連携サービス:                                                              │
│  ├── Buy Me a Coffee                                                        │
│  ├── Ko-fi                                                                  │
│  └── GitHub Sponsors                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 技術実装

### 必要なシステム

| システム | 選択肢 | 推奨 | 理由 |
| :------- | :----- | :--- | :--- |
| 決済 | Stripe / Paddle / LemonSqueezy | **LemonSqueezy** | グローバル税務対応、MoR |
| ライセンス管理 | 自前 / Keygen / Gumroad | **LemonSqueezy** | 決済と統合 |
| サブスク管理 | Stripe Billing / Paddle | **LemonSqueezy** | 決済と統合 |
| チップ | Buy Me a Coffee / Ko-fi | **Ko-fi** | 手数料なし |

### データベース設計

```sql
-- ユーザーライセンス
CREATE TABLE user_licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'free', -- 'free', 'pro'
  major_version INTEGER NOT NULL DEFAULT 1, -- 購入時のメジャーバージョン
  purchased_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync サブスクリプション
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- 'sync_monthly', 'sync_yearly'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'canceled', 'expired'
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  external_id TEXT, -- LemonSqueezy subscription ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 無料トライアル
CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP NOT NULL, -- started_at + 14 days
  notified_3days_before BOOLEAN DEFAULT FALSE,
  converted BOOLEAN DEFAULT FALSE -- Pro購入したかどうか
);

-- ページ数カウント（制限チェック用）
CREATE INDEX idx_pages_user_count ON pages(user_id);
```

### API エンドポイント

```typescript
// ライセンス確認
GET /api/license
Response: {
  plan: 'free' | 'pro',
  majorVersion: number,
  sync: {
    active: boolean,
    expiresAt: string | null
  },
  trial: {
    active: boolean,
    endsAt: string | null
  },
  limits: {
    maxPages: number | null, // null = unlimited
    currentPages: number
  }
}

// 購入完了 Webhook (LemonSqueezy)
POST /api/webhooks/lemonsqueezy
- order_created: Pro購入処理
- subscription_created: Sync開始
- subscription_cancelled: Sync解約
- subscription_expired: Sync期限切れ

// トライアル開始
POST /api/trial/start
Response: { endsAt: string }
```

### フロントエンド実装

```typescript
// src/hooks/useLicense.ts
export function useLicense() {
  const { data: license } = useQuery({
    queryKey: ['license'],
    queryFn: () => fetch('/api/license').then(r => r.json())
  });
  
  const canCreatePage = useMemo(() => {
    if (!license) return false;
    if (license.plan === 'pro') return true;
    if (license.trial?.active) return true;
    return license.limits.currentPages < license.limits.maxPages;
  }, [license]);
  
  const canSync = useMemo(() => {
    if (!license) return false;
    return license.sync?.active || license.trial?.active;
  }, [license]);
  
  return { license, canCreatePage, canSync };
}
```

---

## 実装フェーズ

### Phase 1: 基盤構築（2週間）

| タスク | 詳細 | 工数 |
| :----- | :--- | :--- |
| LemonSqueezy 設定 | 商品・プラン作成、Webhook設定 | 2日 |
| DB スキーマ追加 | licenses, subscriptions, trials | 1日 |
| API エンドポイント | /api/license, webhooks | 3日 |
| ライセンスフック | useLicense 実装 | 2日 |
| ページ数制限 | 作成時のチェック | 1日 |
| テスト | E2Eテスト、Webhook テスト | 2日 |

### Phase 2: UI/UX（1週間）

| タスク | 詳細 | 工数 |
| :----- | :--- | :--- |
| 料金ページ | 価格表、比較表 | 2日 |
| 購入フロー | チェックアウト、成功画面 | 2日 |
| トライアルUI | 残り日数表示、終了通知 | 1日 |
| アップグレード促進 | 制限到達時のモーダル | 1日 |

### Phase 3: 運用準備（3日）

| タスク | 詳細 | 工数 |
| :----- | :--- | :--- |
| ドキュメント | FAQ、利用規約 | 1日 |
| サポート体制 | 問い合わせフォーム | 1日 |
| 監視設定 | 決済エラー通知 | 1日 |

---

## 成功指標

| 指標 | 目標（初年度） | 測定方法 |
| :--- | :------------- | :------- |
| 有料転換率 | 20%以上 | Pro購入数 / 登録ユーザー数 |
| Sync 契約率 | 40%以上（Pro内） | Sync契約数 / Pro購入数 |
| トライアル転換率 | 30%以上 | Pro購入数 / トライアル開始数 |
| MRR（月間経常収益） | $500以上 | Sync月額収入 |
| チャーン率（解約率） | 5%以下 | 月間解約数 / 総契約数 |

---

## 関連ドキュメント

- [Turso パフォーマンス最適化](./turso-performance-optimization.md)
- [Tauri 移行計画](../20260101/tauri-migration.md)
- [LemonSqueezy ドキュメント](https://docs.lemonsqueezy.com/)
