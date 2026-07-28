# Practices Discovery — Interview Questions

Brownfield evidence scan (4 agents: pipeline-deploy, quality, developer, devsecops) resolved most practices from AGENTS.md, CI workflows, and configs. The questions below cover only the gaps evidence could not determine.

---

## Q1. Way of Working — チーム構成とレビュー運用

エビデンス: ブランチ保護ルールセットは「PR承認1件」のみ要求。コミット履歴はほぼ otomatty 単独 + Dependabot/Claude/Cursor の自動ブランチ。

現在の開発体制に最も近いのはどれですか?

A. ソロ開発者 + AIエージェント（レビューは自己承認、AIレビュー活用）
B. ソロ開発者だが、重要変更は外部レビュアーに依頼
C. 小規模チーム（2-5人）で相互レビュー
D. チーム開発（5人以上）
E. その他の体制
X. Other (please specify)

[Answer]: A. ソロ開発者 + AIエージェント（レビューは自己承認、AIレビュー活用） (2026-07-18, mode: guided)

## Q2. Walking Skeleton の方針

エビデンス: コードからは判断不可。Construction フェーズの最初の Bolt をウォーキングスケルトン（最小のE2Eスライスで統合点を先に通す）として必ずゲート付きで実行するかを決めます。

新規機能・移行作業でウォーキングスケルトンをどう扱いますか?

A. 常に実施 — 最初に最薄のE2Eスライスを通してから残りを作る
B. 実施しない — 通常のユニット単位で最初から作り込む
C. スコープ依存 — インフラ移行や大きい機能では実施、小さい修正では省略
D. 今回の移行（#1091）に限っては必ず実施したい
X. Other (please specify)

[Answer]: A. 常に実施 — 最初に最薄のE2Eスライスを通してから残りを作る (2026-07-18, mode: guided)

## Q3. Deployment — 本番デプロイの承認ゲート

エビデンス: `deploy-prod.yml` は `main` push で自動起動。GitHub Environments（production）は参照されているが、Environment protection rules（手動承認）の有無はリポジトリからは見えない。

`main` への push 後の本番デプロイはどう運用していますか?

A. 完全自動 — main にマージされたら承認なしで本番へ
B. Environment protection で手動承認を挟んでいる
C. 現在は自動だが、Workers 移行後は手動承認を入れたい
D. わからない / 確認する
X. Other (please specify)

[Answer]: A. 完全自動 — main にマージされたら承認なしで本番へ (2026-07-18, mode: guided)

## Q4. CI Gates — required status checks の実態

エビデンス: コミット済みルールセット（`.github/rulesets/main-develop-branch-protection.json`）には required_status_checks が無い。GitHub 側の設定でテストジョブがマージをブロックしているかは不明。

CI のテストジョブ（test / api-test / e2e 等）はマージ要件になっていますか?

A. なっている — GitHub 側設定で required checks を構成済み
B. なっていない — CI は走るが赤でもマージ可能（運用でカバー）
C. なっていない — required checks にすべき（今後設定したい）
D. わからない / 確認する
X. Other (please specify)

[Answer]: A. なっている — GitHub 側設定で required checks を構成済み (2026-07-18, mode: guided)

## Q5. Coverage 80% の位置づけ

エビデンス: AGENTS.md は「行カバレッジ 80% 以上を目標」と記すが、vitest 設定に thresholds は無く機械強制されていない（レポートのみ）。Mutation score が第一指標。

80% カバレッジ目標の扱いはどうしますか?

A. 現状維持 — 目標値であり機械強制はしない（Mutation が第一指標）
B. vitest thresholds で機械強制したい
C. サービスごとに決める（server/api のみ強制 等）
X. Other (please specify)

[Answer]: A. 現状維持 — 目標値であり機械強制はしない（Mutation が第一指標） (2026-07-18, mode: guided)

---

## G1. Affirmation gate acknowledgment (typed turn required by gate guard)

AskUserQuestion での承認は記録済みですが、ゲートガードがタイプされたメッセージを要求しています。チャットに approve（または修正指示）を入力してください。

[Answer]: approve (typed, 2026-07-18)
