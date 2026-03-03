# Dependabot オープンPR 一覧とマージ方針

**作成日:** 2026-03-03  
**対象リポジトリ:** otomatty/zedi  
**ベースブランチ:** develop

## 1. オープンPR一覧（全10件・いずれも Dependabot）

| #   | パッケージ                | 変更              | スコープ   | 備考                          |
| --- | ------------------------- | ----------------- | ---------- | ----------------------------- |
| 176 | lucide-react              | 0.575.0 → 0.576.0 | ルート     | **minor**・影響小             |
| 175 | @types/node               | 22.19.13 → 25.3.3 | server/api | **major**                     |
| 174 | @polar-sh/sdk             | 0.43.1 → 0.45.2   | server/api | minor                         |
| 171 | react-day-picker          | 8.10.1 → 9.14.0   | ルート     | **major**・破壊的変更の可能性 |
| 170 | eslint-plugin-react-hooks | 5.2.0 → 7.0.1     | ルート     | **major**                     |
| 169 | jsdom                     | 27.4.0 → 28.1.0   | ルート     | **major**                     |
| 168 | tailwind-merge            | 2.6.1 → 3.5.0     | ルート     | **major**                     |
| 167 | @types/node               | 22.19.13 → 25.3.3 | ルート     | **major**                     |
| 166 | globals                   | 15.15.0 → 17.4.0  | ルート     | **major**                     |
| 165 | @vitejs/plugin-react-swc  | 3.11.0 → 4.2.3    | ルート     | **major**                     |

- **ルート** = リポジトリ直下の `package.json` + `bun.lock`
- **server/api** = `server/api/package.json` + `server/api/bun.lock`（別 lockfile のためルートと競合しない）

---

## 2. マージ時の注意点

1. **ルートの8本は同じ `package.json` / `bun.lock` を触る**  
   同時に複数マージするとコンフリクトするため、「1本マージ → develop を更新 → 次のPRを develop にリベース/更新」の順で進める必要があります。

2. **Dependabot ブランチは作成時点の develop がベース**  
   1本マージするたびに、残りのPRは「Update branch」または `@dependabot rebase` で最新 develop を取り込まないとコンフリクトまたは古い lock のままになります。

3. **major アップデート**  
   react-day-picker (8→9)、eslint-plugin-react-hooks (5→7)、@types/node (22→25) などは破壊的変更や型・ルール変更の可能性があるため、マージ後にビルド・テスト・Lint の確認を推奨します。

---

## 3. 推奨マージ方針

### 方針A: 1本ずつ順番にマージ（推奨）

CI が通っている前提で、以下の順でマージすることを推奨します。

**ステップ1: 影響が小さいものから**

| 順  | PR                                  | 理由                                |
| --- | ----------------------------------- | ----------------------------------- |
| 1   | **#176** lucide-react (minor)       | 変更範囲が小さくリスクが低い        |
| 2   | **#174** @polar-sh/sdk (server/api) | server/api のみでルートと競合しない |
| 3   | **#175** @types/node (server/api)   | 同上                                |

**ステップ2: ルートの major（ビルド・テストに直結しにくいものから）**

| 順  | PR                                 | 理由                                                                           |
| --- | ---------------------------------- | ------------------------------------------------------------------------------ |
| 4   | **#168** tailwind-merge            | ユーティリティ系で影響範囲が限定的                                             |
| 5   | **#166** globals                   | ESLint 周りのみ                                                                |
| 6   | **#167** @types/node (ルート)      | 型定義のみ。型エラーが出たら対応                                               |
| 7   | **#169** jsdom                     | テスト環境。`vitest run` で確認                                                |
| 8   | **#170** eslint-plugin-react-hooks | Lint ルール変更の可能性。`npm run lint` で確認                                 |
| 9   | **#165** @vitejs/plugin-react-swc  | Vite ビルドに直結。`npm run build` で確認                                      |
| 10  | **#171** react-day-picker          | **最後に**。UI コンポーネントの major のため、カレンダー系 UI の手動確認を推奨 |

**各マージ後**

- 次のPRで GitHub の「Update branch」を実行するか、PR に `@dependabot rebase` とコメントしてからマージする。

---

### 方針B: 一括更新PRでまとめて対応

Dependabot のPRをすべてクローズし、1本の「chore(deps): update dependencies」PRにまとめる方法です。

1. `develop` から作業ブランチを作成
2. ルートで:  
   `bun update lucide-react react-day-picker eslint-plugin-react-hooks jsdom tailwind-merge @types/node globals @vitejs/plugin-react-swc`
3. `server/api` で:  
   `cd server/api && bun update @types/node @polar-sh/sdk`
4. ビルド・テスト・Lint をローカルで実行
5. 変更をコミットして PR を作成
6. マージ後、Dependabot の該当10本のPRをクローズ

**メリット:** コンフリクトを一度に解消でき、履歴が1本にまとまる。  
**デメリット:** 問題が出たときにどのパッケージが原因か切り分けが必要。

---

## 4. マージ前の共通確認

- [ ] 対象PRの CI（CodeRabbit 等）が成功していること
- [ ] マージ後: ルートで `bun run build` が通ること
- [ ] マージ後: `bun run test:run`（または `vitest run`）が通ること
- [ ] マージ後: `bun run lint` が通ること（とくに #170 マージ後）
- [ ] #171 (react-day-picker) マージ後: 日付ピッカーを使っている画面の動作確認

---

## 5. 参考リンク

- [GitHub PR 一覧](https://github.com/otomatty/zedi/pulls?q=is%3Apr+is%3Aopen+author%3Aapp%2Fdependabot)
- Dependabot コマンド: PR に `@dependabot rebase` とコメントすると、ベースブランチの最新を取り込んでリベースします。
