# PR #192 レビュー対応方針

**PR:** [Release: Merge develop into main #192](https://github.com/otomatty/zedi/pull/192)  
**作成日:** 2026-03-03

## レビュー概要

CodeRabbit / Copilot AI / Gemini Code Assist から指摘・提案があった項目を整理し、**対応する / しない / 後回し** を方針としてまとめる。

---

## 1. 対応する（推奨）

### 1.1 package.json の engines.node 更新（CodeRabbit / Copilot）

**指摘:** `@vitejs/plugin-react-swc` 4.x は Node 20.19+ / 22.12+、jsdom 28 も同様の要件。現状 `"node": ">=18.0.0"` のままだと実際の最小要件と不一致。

**対応:** `package.json` の `engines.node` を次に変更する。

```json
"engines": {
  "node": "^20.19.0 || >=22.12.0",
  "bun": ">=1.0.0"
}
```

**理由:** CI / ローカルで既に Node 22 を使っていても、`engines` が 18 のままでは「18 で動く」と誤解され、依存の peer 要件とも食い違う。合わせておくのが無難。

---

### 1.2 useCollaboration: awareness の遅延設定への対応（CodeRabbit）

**指摘:** `awareness` は `CollaborationManager` 内で WebSocket 接続後に `this.awareness = this.wsProvider.awareness` でセットされる。初回の `setManagerSnapshot` だけでは接続前で `undefined` のままになる可能性がある。

**対応:** `manager.subscribe` のコールバックで、state 更新に合わせて `managerSnapshot`（`awareness` 含む）を更新する。

```ts
const unsubscribe = manager.subscribe((newState) => {
  setState(newState);
  const nextAwareness = manager.getAwareness() ?? undefined;
  setManagerSnapshot((prev) =>
    prev.ydoc === manager.document &&
    prev.xmlFragment === manager.xmlFragment &&
    prev.awareness === nextAwareness
      ? prev
      : {
          ydoc: manager.document,
          xmlFragment: manager.xmlFragment,
          awareness: nextAwareness,
        },
  );
});
```

**理由:** collaborative モードで WebSocket 接続後に awareness が使えるようになるため、subscribe で状態が変わるたびに snapshot を更新すれば、コンポーネント側で正しく `awareness` を参照できる。

---

### 1.3 docs/pr-191-review-response.md のポリシー明示（CodeRabbit）

**指摘:** 「案 B（変数化）」を推奨している一方、`docs/pr-191-investigation-cloudflare-railway.md` では恒常的 DNS-only（`proxied=false`）を正としている。どちらが正か分かりにくい。

**対応:** 案 B の見出しを「参考: 案 B（代替案）」にし、採用方針を冒頭で明示する。

```markdown
## 参考: 案 B（代替案）

> 現在の採用方針は `docs/pr-191-investigation-cloudflare-railway.md` を正とし、
> api/realtime は恒常的に `proxied = false`（DNS-only）とする。
> 以下は証明書更新時などに proxy を一時的に切り替える場合の代替案である。
```

**理由:** 運用の正は「恒常 DNS-only」としつつ、案 B は「必要なときの手順」として残す形にすると、ドキュメント間で一貫する。

---

## 2. 任意・様子見（今回はスキップ可）

### 2.1 useEditorSetup: useEffect の依存配列（Gemini） / useLayoutEffect 化（Copilot）

**指摘:**

- 依存配列がないため毎レンダー effect が走る → `[slashState, suggestionState]` を入れるべき。
- ref を post-render の useEffect で更新すると、suggestion 開閉直後に keydown で一瞬古い state を読む窓がある → render 中更新か useLayoutEffect を推奨。

**方針:**

- **依存配列の追加は対応してよい。** `useEffect(() => { ... }, [slashState, suggestionState]);` にすると、不要な実行は減る。
- **useLayoutEffect への変更は任意。** 現状でも Lint は通り、多くのケースで問題にならない。もし「suggestion 表示直後のキーで挙動がおかしい」などの報告があれば、その時点で useLayoutEffect + 依存配列に変更する。

---

### 2.2 useKeyboardShortcuts: isCreatingRef の更新タイミング（Copilot）

**指摘:** useEffect で ref を更新すると、`isCreating` 変更から effect 実行まで古い値が見える窓があり、二重 `createNewPage` の可能性。

**方針:** 現状のまま（useEffect）でよい。元々「ref を render 中に書く」と react-hooks/refs でエラーになったため useEffect に移した経緯がある。useLayoutEffect にすれば理論上は窓は狭くなるが、実害が出ていなければ今回はスキップでよい。

---

### 2.3 NoteSettings: queueMicrotask をやめて直接 setState（Copilot）

**指摘:** useEffect 内の setState を queueMicrotask でラップすると、デバッグしづらくアンマウント時もキャンセルされない。直接 setState し、該当ルールだけ eslint-disable する方がよいのでは、という提案。

**方針:** 今回は変更しない。eslint-plugin-react-hooks 7.x の「effect 内の同期的 setState」を避けるために queueMicrotask を採用しており、挙動上の問題は出ていない。ルールを disable すると、他ファイルでも同様の指摘を許容する方針になり、判断が分かれるため、現状維持とする。

---

### 2.4 AIChatInput: useMemo の依存を inputCostUnits に狭める（CodeRabbit, nitpick）

**指摘:** `selectedModel` 全体ではなく `inputCostUnits` だけを依存にすると、他フィールド変更時の不要な再計算を防げる。

**方針:** 任意。Zustand の store で `selectedModel` の参照が安定していれば、現状でも大きな問題はない。リファクタのついでに対応する程度でよい。

---

## 3. 対応しない

### 3.1 dependabot-prs-merge-plan.md の「作成日 2026-03-03」（Gemini）

**指摘:** 作成日が「未来の日付」なので 2024 のタイポでは、という指摘。

**方針:** **変更しない。** ドキュメント作成日は実際に 2026-03-03 であり、user_info の日付とも一致している。2024 への変更は不要。

---

### 3.2 @vitejs/plugin-react-swc を 3.x に戻す（Copilot の別案）

**指摘:** Node 要件を上げる代わりに、plugin を Node 18 対応の 3.7.0 にピンする案。

**方針:** **採用しない。** 既に 4.2.3 に上げて develop/main に取り込んでおり、CI も Node 22 で通っている。engines を現実に合わせる方針（1.1）で十分。

---

## 4. 実施順序の提案

1. **1.1** package.json の `engines.node` を更新（変更箇所が少なく、影響が分かりやすい）。
2. **1.3** pr-191-review-response.md の見出しと注記を追加（ドキュメントのみ）。
3. **1.2** useCollaboration の subscribe 内で managerSnapshot（awareness）を更新（挙動修正）。
4. 必要なら **2.1** の useEditorSetup の useEffect に `[slashState, suggestionState]` を追加（軽微な最適化）。

2.2 / 2.3 / 2.4 は、別 PR や次のリリースで検討する形でよい。

---

## 5. まとめ

| 項目                                              | 対応     | 理由                                        |
| ------------------------------------------------- | -------- | ------------------------------------------- |
| engines.node                                      | ✅ 対応  | 実際の Node 要件と一致させる                |
| useCollaboration awareness                        | ✅ 対応  | 非同期設定後に awareness が読めるようにする |
| pr-191-review-response 案 B                       | ✅ 対応  | 調査ドキュメントと方針を一致させる          |
| useEditorSetup 依存配列                           | 任意     | パフォーマンス・一貫性のため追加してよい    |
| useKeyboardShortcuts / NoteSettings / AIChatInput | スキップ | 現状で問題なし、または nitpick              |
| 作成日 2026 / plugin 3.x に戻す                   | 非対応   | 誤指摘または方針不一致                      |

この方針に従い、1.1 → 1.3 → 1.2 の順で develop にコミットし、PR #192 に push するか、main マージ後に別 PR で対応するかは運用に合わせて判断すればよい。
