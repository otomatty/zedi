# Chrome Web Clipper MVP テスト戦略

## 対象範囲

clipUrl クエリ受け渡しと Web アプリ自動起動フロー、Chrome 拡張 MVP の動作確認。

## 単体テスト

| 対象               | ファイル                          | 観点                                                                                                     |
| ------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `isClipUrlAllowed` | `src/lib/webClipper.test.ts`      | 許可 URL（http/https）、除外 URL（chrome://, about:, file:, localhost, 127.0.0.1, プライベートIP）の検証 |
| 既存 Web Clipper   | `src/hooks/useWebClipper.test.ts` | 既存の clip・reset・getTiptapContent の動作維持                                                          |

## E2E テスト

| テスト                                   | ファイル                  | 観点                                                                                       |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| clipUrl 付き起動でダイアログ自動オープン | `e2e/web-clipper.spec.ts` | `/home?clipUrl=https://example.com` で WebClipperDialog が表示され、URL がプリフィルされる |

## 回帰テスト

- **既存手動 Web Clipper**: FAB → URL から取り込み → URL 入力 → 取り込み、の手動確認
- **未ログイン時の clipUrl**: `/home?clipUrl=...` でサインインへリダイレクトされ、復帰後に同 URL でダイアログが開くことを確認

## 実行方法

```bash
bun run test:run              # 単体テスト
bun run test:e2e              # E2E（VITE_E2E_TEST=true で mock auth）
```
