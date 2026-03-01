# モデル選択 UI コスト表示「最安/1x のみ」問題の調査

## 現象

モデル選択ドロップダウンで、本来 5x, 25x, 60x などバラつくはずのコスト倍率が、すべて「最安」または「×1」としか表示されない。

---

## 調査結果

### 1. 想定される原因（優先度順）

#### 原因 A: ローカルストレージキャッシュが古い形式

**場所:** `src/lib/aiService.ts`  
**キャッシュキー:** `zedi-ai-server-models`  
**TTL:** 10 分

**流れ:**

- Cost Units 対応前にモデル一覧を取得した場合、API レスポンスに `inputCostUnits` / `outputCostUnits` が含まれていなかった
- そのレスポンスが `localStorage` にキャッシュされた
- `normalizeToAIModel` では欠損時 `inputCostUnits: 0` にフォールバック
- 全モデルが `inputCostUnits: 0` → 倍率計算で `multiplier <= 1` となり、全て「最安」表示になる

**キャッシュヒット時の処理:**

```ts
// aiService.ts L655-656
const models = (parsed.models ?? []).map((m) =>
  normalizeToAIModel(m as unknown as Record<string, unknown>),
);
```

キャッシュから復元するときも `normalizeToAIModel` を通すが、保存時のオブジェクトに `inputCostUnits` が無ければ 0 になる。

**補足:** キャッシュキーを変えていないため、古いキャッシュがそのまま使われ続ける可能性がある。

---

#### 原因 B: DB の Cost Units が全モデルで同一（DEFAULT_COST_UNITS）

**場所:** `server/api/src/services/syncAiModels.ts`  
**定数:** `DEFAULT_COST_UNITS = 1`

**流れ:**

- `OPENROUTER_API_KEY` が未設定、または OpenRouter API が失敗した場合、全モデルに `DEFAULT_COST_UNITS` が使われる
- 結果として全モデルの `inputCostUnits = 1`
- `minCostUnits = 1`、各モデルの `1/1 = 1` → 全モデルが「1x」表示

```ts
// syncAiModels.ts L328-330, L389-391, L430-432
inputCostUnits: DEFAULT_COST_UNITS,  // = 1
outputCostUnits: DEFAULT_COST_UNITS,
```

---

#### 原因 C: `minCostUnits` 計算の境界ケース

**場所:** `AISettingsForm.tsx` L216-219, `AIChatModelSelector.tsx`

```ts
const minCostUnits = Math.max(
  1,
  Math.min(...serverModels.map((m) => m.inputCostUnits).filter((v) => v > 0)),
);
```

**挙動:**

- 全モデルが `inputCostUnits: 0` の場合:
  - `.filter((v) => v > 0)` → 空配列
  - `Math.min(...[])` → `Infinity`
  - `Math.max(1, Infinity)` → `Infinity`
- `getCostMultiplier`:
  - `model.inputCostUnits <= 0` のとき常に `return 1`
  - そのため、全モデルが「最安」/「1x」になる

このケースは「原因 A」と組み合わせて発生する。

---

### 2. 想定外だった点（確認済み）

| 項目                                    | 状態                                  |
| --------------------------------------- | ------------------------------------- |
| API が `inputCostUnits` を返すか        | ✅ `models.ts` で select に含めている |
| レスポンスのキー名                      | ✅ camelCase `inputCostUnits`         |
| `normalizeToAIModel` の snake_case 対応 | ✅ `input_cost_units` も参照          |
| DB スキーマ                             | ✅ `input_cost_units` は notNull      |

---

## 推奨対応

### 即効性のある対応

1. **キャッシュキーのバージョンアップ**
   - 例: `zedi-ai-server-models` → `zedi-ai-server-models-v2`
   - 古いキャッシュが使われなくなり、API から最新の Cost Units を含むレスポンスを取得できる

2. **キャッシュの妥当性チェック**
   - キャッシュ読込後、いずれかのモデルで `inputCostUnits > 0` かチェック
   - 満たさない場合はキャッシュを破棄して API 再取得

### 運用・確認

3. **DB の Cost Units 確認**
   - `npm run sync:ai-models` を実行して OpenRouter から最新 Cost Units を取り込む
   - `OPENROUTER_API_KEY` が Railway/本番環境で設定されているか確認

4. **API レスポンスの簡易確認**
   ```bash
   curl -s "https://<API_BASE>/api/ai/models" -H "Cookie: ..." | jq '.models[0:3] | .[] | {displayName, inputCostUnits}'
   ```

---

## DB 調査方法

キャッシュをクリアしても改善しない場合、DB の `input_cost_units` を直接確認する。

### 調査スクリプト

```bash
cd server/api && npm run inspect:ai-models-cost
```

- プロジェクトルートの `.env` に `DATABASE_URL` が必要
- Railway 利用時: Dashboard → Postgres → Connect から TCP Proxy の URL を `DATABASE_URL` に設定
- ローカルで DB が無い場合: Railway の公開 URL を使う（`docs/specs/ai-models-sync.md` 参照）

### 想定される DB 状態

| 状態                               | 想定原因                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| 全モデル `input_cost_units = 1`    | OPENROUTER_API_KEY 未設定、sync で DEFAULT が適用           |
| 全モデル `input_cost_units = 0`    | スキーマやマイグレーションの不整合（本来 notNull のため稀） |
| モデルごとに 5, 25, 125 等バラつく | DB は正常。API レスポンス or フロントの別要因を疑う         |

---

## 結論

- **キャッシュクリアで改善しない** → 原因 B（DB の Cost Units が同一）の可能性が高い
- DB 調査スクリプト `inspect:ai-models-cost` で `input_cost_units` の実態を確認する
