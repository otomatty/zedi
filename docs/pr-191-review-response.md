# PR #191 レビュー対応案

## レビュー指摘の要約

**Gemini Code Assist** と **GitHub Copilot** の両方から、同じ内容が指摘されています。

| 指摘内容                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- |
| コメントでは「一時的に `proxied=false` にして、その後 `true` に戻す」と書いているが、コードでは `proxied = false` がハードコードされている。 |
| そのため Terraform は常に DNS-only を強制し、「true に戻す」状態をコードで表現できていない。                                                 |
| 手動で Cloudflare 上を `proxied = true` にしても、次回 `terraform apply` で上書きされてしまう。                                              |
| **IaC の状態とコメントで説明している運用が一致しておらず、混乱を招く。**                                                                     |

---

## 対応方針の選択肢

### 案 A: コメントを現状のコードに合わせる（最小変更）

**やること**

- 「Toggle Trick」の文言をやめ、**現在のコードの状態（常に `proxied = false`）** を説明するコメントに変更する。
- 運用で「証明書発行後に Cloudflare 経由に戻したい場合」は、**Terraform の値を `true` に変更して apply する**旨をコメントに書く。

**メリット**

- 変更が少ない（`dns.tf` のコメントのみ）。
- 変数や tfvars を増やさない。

**デメリット**

- 「トグル」は Terraform の値を書き換えて apply する手順になり、コメントで「手動で Cloudflare をいじる」と誤解されないように書く必要がある。

**コメント例（案 A）**

```hcl
# api.zedi-note.app -> Railway API
# DNS-only (proxied=false) for Railway-origin SSL. To use Cloudflare proxy, set proxied=true here and terraform apply.
```

---

### 案 B: コードを運用に合わせる（変数でトグル可能にする）★推奨

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

## 推奨: 案 B（変数化）

- 指摘は「コメントとコードを一致させるか、コードを運用に合わせるか」のどちらかであり、**案 B は「コードを運用に合わせる」方**です。
- 「Toggle Trick」を Terraform 上で再現できるため、今後の証明書更新時も手順が明確になります。
- 既存の `variables.tf` のスタイルに合わせて 1 変数（例: `railway_subdomains_proxied`）にまとめると、api / realtime を同時にトグルできて運用もしやすいです。

---

## 案 B を採用する場合の具体的な変更例

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

この内容で PR #191 に修正を push し、レビューへの対応として「案 B を採用し、変数化でコメントとコードを一致させた」と返信する形がおすすめです。
