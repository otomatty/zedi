# PR #191 レビュー対応案

## レビュー指摘の要約

**Gemini Code Assist** と **GitHub Copilot** の両方から、同じ内容が指摘されています。

| 指摘内容                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- |
| コメントでは「一時的に `proxied=false` にして、その後 `true` に戻す」と書いているが、コードでは通常状態が明確でない。 |
| production の実運用は `proxied = true` なので、Terraform も「通常は true、必要時のみ false」に揃えるべき。            |
| 手動で Cloudflare 上を変更すると IaC とずれるため、通常状態も一時切替も Terraform で表現した方がよい。                |
| **IaC の状態とコメントで説明している運用が一致しておらず、混乱を招く。**                                              |

---

## 対応方針の選択肢

### 案 A: 通常状態を `proxied = true` に合わせる（推奨）

**やること**

- `api_cname` / `realtime_cname` の `proxied` を **通常状態の `true`** に変更する。
- コメントを「通常は Cloudflare proxy を有効にし、証明書発行や再検証が必要なときだけ一時的に `false` にする」説明に変更する。

**メリット**

- production の実運用と Terraform が一致する。
- 変数や tfvars を増やさない。

**デメリット**

- 一時的に `false` にする場合は、その都度 Terraform を変更して apply する運用になる。

**コメント例（案 A）**

```hcl
# api.zedi-note.app -> Railway API
# Proxied by Cloudflare in normal operation (proxied=true). If Railway cert issuance needs direct validation, temporarily set proxied=false and apply.
```

---

### 参考: 案 B（代替案）

> 現在の採用方針は `docs/pr-191-investigation-cloudflare-railway.md` を正とし、
> api/realtime は通常 `proxied = true` で運用し、必要時のみ一時的に `proxied = false` にする。
> 以下は証明書更新時などに proxy を一時的に切り替える場合の代替案である。

---

以下は案 B（変数でトグル可能にする）の詳細説明である。

**やること**

1. **変数追加**（`variables.tf`）
   - 例: `api_proxied` と `realtime_proxied`（bool、default = `true`）
   - または 1 つにまとめる: `railway_subdomains_proxied`（bool、default = `true`）
2. **`dns.tf`**
   - `api_cname` / `realtime_cname` の `proxied` にその変数を参照させる。
3. **コメント**
   - 「通常は `true`。Railway 証明書発行時だけ変数を `false` にして apply → 発行後に `true` に戻して apply」と記載。

**運用イメージ**

- **通常時**: 変数 = `true`（デフォルト） → Cloudflare プロキシ有効。
- **証明書発行時**: 変数を `false` に変更 → `terraform apply` → 証明書取得後、変数を `true` に戻して `terraform apply`。

**メリット**

- コメントの「一時的に false → その後 true」と Terraform の状態が一致する。
- トグルが「変数の変更 + apply」で再現でき、IaC と運用が一致する。
- レビュー指摘（「コメントとコードの矛盾」「apply で上書きされる」）を解消できる。

**デメリット**

- 変数と `dns.tf` の修正が必要（作業量は少なめ）。

---

## 採用方針

- **現在の採用方針**は `docs/pr-191-investigation-cloudflare-railway.md` を正とし、api/realtime は**通常 `proxied = true`** とする。
- 案 A に従い、コードとコメントを production の実態に合わせて修正する。
- 案 B は証明書更新時などに proxy を一時的に切り替える場合の**参考用の代替案**として残す。

---

## 案 B を採用する場合の具体的な変更例（参考）

1. **`variables.tf`** に追加:

```hcl
# Railway api/realtime subdomains: Cloudflare proxy on/off
# Set to false only during Railway custom-domain cert issuance; then set back to true and apply.
variable "railway_subdomains_proxied" {
  type        = bool
  description = "Proxied for api.zedi-note.app and realtime.zedi-note.app. Use false temporarily for Railway cert issuance."
  default     = true
}
```

2. **`dns.tf`** の `api_cname` / `realtime_cname` で `proxied` を変数参照に変更し、コメントを上記運用に合わせて修正（「通常は true、証明書発行時のみ false にして apply」と明記）。

3. **現状どおりプロキシ無効にしたい場合**
   - 変数のデフォルトを一時的に `false` にするか、`terraform.tfvars` や CI の変数で `railway_subdomains_proxied = false` を渡す。
   - 証明書発行が終わったら `true` に戻す。

案 A を採用する場合、`dns.tf` の `proxied` とコメントを案 A の例に従って修正し、レビューへの対応として「production の通常運用を `proxied = true` に揃え、必要時のみ一時的に `false` へ切り替える方針に整理した」と返信する形がおすすめです。
