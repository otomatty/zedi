# リスク・容易さヒューリスティック / Risk & Ease Heuristics

各候補モジュールに `risk_score`（0–100）と `ease_score`（0–100）を付け、`priority` を決める。

## Priority 計算

```
combined = risk_score * 0.6 + ease_score * 0.4
P0: combined >= 70 かつ ease >= 50
P1: combined >= 55
P2: combined >= 40
P3: それ以外（ただし risk >= 80 は P1 下限）
```

## risk_score 加点（上限 100）

| 条件                                                 | 加点 |
| ---------------------------------------------------- | ---- |
| パスに `auth`, `permission`, `acl`, `rbac`           | +25  |
| パスに `billing`, `payment`, `stripe`, `invoice`     | +30  |
| パスに `password`, `token`, `secret`, `crypto`       | +25  |
| パスに `delete`, `destroy`, `purge`, `migrate`       | +20  |
| パスに `validate`, `parser`, `sanitize`, `normalize` | +15  |
| パスに `api`, `route`, `handler`, `controller`       | +15  |
| import に DB / ORM / `fetch` / `axios`               | +10  |
| 公開 API（export 多数）                              | +5   |

## ease_score 加点（上限 100）

| 条件                                                   | 加点 |
| ------------------------------------------------------ | ---- |
| レイヤー = pure / util / validation                    | +40  |
| 外部 I/O import なし                                   | +25  |
| 既存テストの隣接ファイル（同ディレクトリに test あり） | +15  |
| ファイル行数 < 150（wc -l 相当）                       | +15  |
| 単一 export の関数群                                   | +10  |
| React コンポーネント（Testing Library 未導入）         | −20  |
| ファイル行数 > 400                                     | −15  |
| グローバル状態 / singleton 依存                        | −20  |

## suggested_first_cases

レイヤーとパスから Phase 2 向けの初期ケースを 3–5 個提案（inventory 時点の仮説）:

| シグナル            | 提案ケース                         |
| ------------------- | ---------------------------------- |
| validate / sanitize | 空、不正形式、境界長、マルチバイト |
| auth / permission   | 未認証、他人リソース、正常         |
| numeric limit       | 下限−1、下限、上限、上限+1         |
| list / pagination   | 空、1 件、上限、上限超え           |
| state machine       | 合法遷移 1、非法遷移 1             |

## dedupe_note

同一シンボルが E2E と unit の両方で詳細境界をテストしている場合:

> 「`<symbol>` の境界値は E2E `<path>` と重複。unit に集約し E2E はジャーニーのみ推奨」
