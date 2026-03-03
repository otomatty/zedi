# PR #191 調査: Cloudflare proxy と Railway SSL（実装は正・コメント修正）

## 結論

- **実装（`proxied = false`）は正しい。** api / realtime は **恒常的に DNS-only（グレークラウド）** とする設計で問題ない。
- **コメントが誤っている。** 「一時的に false にしてあとで true に戻す」は Railway の「Toggle Trick」手順の説明であり、**このリポジトリの意図（恒常的に false）と一致していない。** コメントを「DNS-only が意図した恒常状態」と分かるように修正する。

---

## 1. Cloudflare のプロキシ有無の違い

| 設定               | アイコン         | 動作                                                                                                                   |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Proxied (ON)**   | オレンジクラウド | トラフィックは Cloudflare 経由。Cloudflare が SSL 終端し、オリジンへは Cloudflare が接続。CDN・DDoS 対策・WAF が有効。 |
| **DNS only (OFF)** | グレークラウド   | トラフィックは **直接オリジンへ**。Cloudflare は DNS 解決のみ。オリジン（ここでは Railway）が SSL を提供。             |

公式: [Proxy status - Cloudflare DNS](https://developers.cloudflare.com/dns/proxy-status)

---

## 2. Railway 公式ドキュメントの「Toggle Trick」

**出典**: [Railway – Troubleshooting SSL](https://docs.railway.com/guides/troubleshooting-ssl)

> **The Toggle Trick:** If your certificate is stuck on "Validating Challenges," try **temporarily** turning the Cloudflare proxy **OFF** (grey cloud), wait for Railway to issue the certificate (you'll see a green checkmark in Railway), **then turn the proxy back ON** (orange cloud). This removes Cloudflare from the validation path and allows Railway's Let's Encrypt challenge to reach the origin directly.

- これは **証明書発行が「Validating Challenges」で止まったときの一時的な対処** として書かれている。
- 手順: 一時的に OFF → 証明書発行 → **再度 ON にする** ことが Railway ドキュメント上の想定。

---

## 3. 恒常的に DNS-only（proxied = false）が正しいケース

Railway の「Toggle Trick」は「一時的に OFF にしてから ON に戻す」手順だが、**恒常的にプロキシ OFF のままにしておく構成も有効**です。

- **DNS-only を恒常にする利点**
  - Railway がオリジンで Let's Encrypt 証明書を発行・保持し、クライアントは **Railway と直接 TLS 通信** する。
  - Cloudflare の SSL モード（Full / Full Strict）や証明書更新タイミングを気にしなくてよい。
  - API や WebSocket（realtime）のようにキャッシュや CDN が不要なサブドメインでは、プロキシを挟まない方がシンプルなことが多い。

- **Cloudflare の公式的な使い分け**
  - グレークラウドは「API やオリジン直アクセスが必要なサービス」「プロキシを挟むと都合が悪い場合」に使う、と説明されている。

したがって、**api.zedi-note.app / realtime.zedi-note.app を恒常的に `proxied = false` にする実装は、Cloudflare の設定として正しい。**

---

## 4. 何が「コメントの誤り」か

現在のコメント:

```hcl
# Toggle Trick: temporarily proxied=false for Railway cert issuance, then switch back to true
```

- これは **Railway の「Toggle Trick」手順**（一時的に OFF → 発行 → ON に戻す）を説明している。
- 一方、**この Terraform では `proxied = false` が固定** であり、「true に戻す」状態はコードに存在しない。
- つまり **「then switch back to true」がこのリポジトリの意図と一致していない** ＝ コメントが実装と食い違っている。

実装の意図が「恒常的に DNS-only」であれば、コメントは **「恒常的に proxied=false」** である理由を説明すべき。

---

## 5. コメント修正案（実装＝恒常 DNS-only に合わせる）

**api / realtime の CNAME 用に、次のいずれか（または組み合わせ）で置き換える。**

### 案 1: 短い説明

```hcl
# api.zedi-note.app -> Railway API
# DNS-only (proxied=false): traffic goes directly to Railway; Railway provides SSL at origin.
```

```hcl
# realtime.zedi-note.app -> Railway Hocuspocus
# DNS-only (proxied=false): traffic goes directly to Railway; Railway provides SSL at origin.
```

### 案 2: 理由を少し補足

```hcl
# api.zedi-note.app -> Railway API
# DNS-only by design. We do not use Cloudflare proxy here; Railway issues and serves SSL.
```

```hcl
# realtime.zedi-note.app -> Railway Hocuspocus
# DNS-only by design. We do not use Cloudflare proxy here; Railway issues and serves SSL.
```

### 案 3: 将来の運用者向けに「Toggle Trick」に言及する場合

```hcl
# api.zedi-note.app -> Railway API
# DNS-only (proxied=false). Railway provides SSL at origin. Intentional permanent state; not using Cloudflare proxy for this subdomain.
```

- 「Intentional permanent state」で「true に戻す想定ではない」ことを明示できる。

---

## 6. 推奨

- **実装はそのまま**（`proxied = false` のまま）。
- **コメントのみ修正**し、「恒常的に DNS-only」であることと、Railway がオリジンで SSL を提供していることを書く。
- 上記のうち **案 1 または 案 2** を採用すると、レビュー指摘（「コメントとコードの矛盾」）も解消できる。
