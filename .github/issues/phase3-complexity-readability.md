## 親 Issue

**#69** [方針] ESLint/Prettier に基づく今後の実装方針

---

## 目的

「複雑度が高い関数」「長大な関数」「ネストが深いブロック」に関する ESLint の警告を解消し、可読性と保守性を上げる。作業者が迷わないよう、手順・パターン・参照をまとめる。

---

## 対象ルールと閾値

| ルール                   | 閾値                            | 対象パス                                         | 意味                                       |
| ------------------------ | ------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `complexity`             | max **20**                      | 全 TS/TSX                                        | 関数の cyclomatic complexity（分岐の多さ） |
| `max-lines-per-function` | max **150 行**                  | 全 TS/TSX（scripts/e2e/server/terraform は除外） | 1 関数あたりの行数（空行・コメント除く）   |
| `max-depth`              | max **4**（scripts 等は **5**） | 全 TS/TSX                                        | ブロックのネスト深度                       |

※ `scripts/` `e2e/` `server/` `terraform/` では `max-lines-per-function` は **off**、`max-depth` は **5** まで許可（`eslint.config.js` の override で設定済み）。

---

## 作業手順

### Step 1: 警告の一覧取得

```bash
bun run lint 2>&1 | grep -E "complexity|max-lines-per-function|max-depth"
```

- ファイルパスと行番号が出るので、**影響範囲の小さいもの**（1 ファイル・1 関数単位）から手を付けるとよい。

### Step 2: complexity（複雑度）の削減

**Cyclomatic complexity** は、`if` / `else` / `switch` / `for` / `&&` / `||` / 三項演算子 など、分岐が増えるほど上がる。

**よく使う対策:**

1. **早期 return（ガード節）**  
   条件を満たさない場合に先に return し、本線のネストを浅くする。
2. **ヘルパー関数への抽出**  
   一部の分岐ブロックを別関数に切り出し、呼び出し元の分岐を減らす。
3. **ルックアップ・マップの利用**  
   `switch` や長い `if-else` を、オブジェクトや Map の参照に置き換える。
4. **複雑な条件の名前付け**  
   条件式を変数や関数（例: `isValid()`）にまとめ、意図を明確にする。

**例（早期 return）:**

```ts
// Before: ネストが深く複雑度が高い
function process(data: Data) {
  if (data) {
    if (data.valid) {
      if (data.items.length > 0) {
        // 本処理
      }
    }
  }
}

// After: 早期 return で複雑度・ネストを削減
function process(data: Data) {
  if (!data?.valid || data.items.length === 0) return;
  // 本処理
}
```

### Step 3: max-lines-per-function（長大な関数）の削減

**方針:** 責務ごとに **小さな関数に分割** する。

1. **「何をしているブロックか」で区切る**
   - 入力の検証 / データ取得 / 変換 / 副作用（API コールなど）/ 描画 など。
2. **React コンポーネント**
   - レンダリング部分を **子コンポーネント** に切り出す。
   - ロジックを **カスタムフック**（例: `useXxx`）に切り出す。
3. **イベントハンドラやコールバック**
   - 中身を別関数（例: `handleSubmit` の実装を `doSubmit()` に）に切り出し、関数の行数を減らす。

**目安:** 1 関数 50〜80 行以内を目標にすると、150 行制限に余裕が持てる。

### Step 4: max-depth（ネスト深度）の削減

**方針:** ネストを **4 段（scripts 等は 5 段）以下** に収める。

1. **早期 return**  
   条件が偽のときにすぐ return し、`else` ブロックや深い `if` を減らす。
2. **ループ内の深い if**  
   条件を満たす場合だけ処理するなら、ループの先頭で `if (!condition) continue;` のようにする。
3. **コールバックの深いネスト**  
   async/await に直す、または処理を別関数に切り出す。

**例:**

```ts
// Before: 深度 5
function run() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          doWork();
        }
      }
    }
  }
}

// After: 深度 1
function run() {
  if (!a || !b || !c || !d) return;
  doWork();
}
```

---

## 完了条件の確認

- [ ] `bun run lint` で **complexity** / **max-lines-per-function** / **max-depth** に関する **warn が 0** になっている（対象パス内）。
- [ ] `bun run test:run` および `bun run build` が成功する。
- [ ] リファクタ後も挙動が変わっていないことを、既存テストや手動確認で担保する。

---

## 参照情報

| 項目                      | 場所                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| ルール方針                | `docs/lint-and-format.md`                                                                      |
| ESLint 設定（閾値・対象） | `eslint.config.js`（72〜74 行目、84〜96 行目の override）                                      |
| complexity                | [ESLint - complexity](https://eslint.org/docs/latest/rules/complexity)                         |
| max-depth                 | [ESLint - max-depth](https://eslint.org/docs/latest/rules/max-depth)                           |
| max-lines-per-function    | [ESLint - max-lines-per-function](https://eslint.org/docs/latest/rules/max-lines-per-function) |
| リファクタの考え方        | プロジェクト内: Vercel React Best Practices（レンダリング・パフォーマンスの指針）              |

---

## 注意事項

- **一度に大きなリファクタをしない**。1 ファイル・1 関数単位で PR にすると安全。
- **テストがあるファイル** は、リファクタ後にテストを必ず実行する。
- **UI の変更がないか** コンポーネントの場合は目視や E2E で確認するとよい。
- 150 行を少し超える程度で、分割するとかえって読みにくい場合は、**一時的に eslint-disable のコメント** を付けて対応し、理由をコメントに書いておく方法もある（乱用は避ける）。
