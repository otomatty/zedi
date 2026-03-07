# PR #191 調査: Cloudflare proxy と Railway SSL（現行方針は proxied = true）

## 結論

- **現行の本番運用は `proxied = true` が正しい。** `api` / `realtime` は Cloudflare を前段に置いた状態で運用されている。
- **Railway の「Toggle Trick」** は、証明書発行や再検証が必要な場面で **一時的に `proxied = false` に切り替えるための手順** として扱う。
- **Terraform / docs / 本番実態を一致させる。** 通常運用は `proxied = true`、必要時のみ一時的に `false` にして apply し、完了後に `true` に戻す。

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

## 3. 通常運用を Proxied（proxied = true）にするケース

Railway の「Toggle Trick」は「一時的に OFF にしてから ON に戻す」手順であり、**通常運用で Cloudflare プロキシを有効にしておく構成とも両立**する。

- **Proxied を恒常にする利点**
  - Cloudflare が前段に入るため、WAF・DDoS 緩和・Firewall Rules などの保護を利用できる。
  - オリジンの Railway ドメインを直接見せず、公開経路を Cloudflare 側に集約できる。
  - 実際の production の DNS は `api` / `realtime` ともに Cloudflare proxy ON で運用されている。

- **注意点**
  - Cloudflare を経由するため、SSL/TLS・WebSocket・実クライアント IP の取り扱いは Cloudflare 前提で考える必要がある。
  - 証明書発行や再検証で Railway 側への直接到達が必要な場合は、Cloudflare proxy を一時的に OFF にする手順が有効。

したがって、**api.zedi-note.app / realtime.zedi-note.app を通常 `proxied = true` で運用し、必要時だけ一時的に `false` にする**方針は、Cloudflare / Railway の両方の運用に整合する。

---

## 4. 何が「コメントの誤り」か

現在のコメント:

```hcl
# Toggle Trick: temporarily proxied=false for Railway cert issuance, then switch back to true
```

- これは **Railway の「Toggle Trick」手順**（一時的に OFF → 発行 → ON に戻す）を説明している。
- 一方、production の実運用は **通常 `proxied = true`** であり、当時の Terraform が `false` 固定だったため、本番実態と IaC が食い違っていた。
- つまり **「通常は true / 必要時のみ false」という運用意図をコードで表現できていなかった** ことが問題だった。

通常運用の意図が `proxied = true` であれば、コメントは **「通常は true、必要時のみ一時的に false」** を説明すべき。

---

## 5. コメント修正案（実装＝通常 proxied = true に合わせる）

**api / realtime の CNAME 用に、次のいずれか（または組み合わせ）で置き換える。**

### 案 1: 短い説明

```hcl
# api.zedi-note.app -> Railway API
# Proxied by Cloudflare in normal operation (proxied=true).
```

```hcl
# realtime.zedi-note.app -> Railway Hocuspocus
# Proxied by Cloudflare in normal operation (proxied=true).
```

### 案 2: 理由を少し補足

```hcl
# api.zedi-note.app -> Railway API
# Proxied by Cloudflare by design. Temporarily set proxied=false only when Railway cert issuance requires direct validation.
```

```hcl
# realtime.zedi-note.app -> Railway Hocuspocus
# Proxied by Cloudflare by design. Temporarily set proxied=false only when Railway cert issuance requires direct validation.
```

### 案 3: 将来の運用者向けに「Toggle Trick」に言及する場合

```hcl
# api.zedi-note.app -> Railway API
# Normal state is proxied=true. For Railway custom-domain troubleshooting, temporarily set proxied=false, apply, then revert to true.
```

- 「通常は true / 一時的に false」をコメントで明示できる。

---

## 6. 推奨

- **実装は `proxied = true` を通常状態として揃える。**
- **コメントも更新**し、「通常は Cloudflare proxy を有効にし、必要時のみ一時的に false にする」ことを書く。
- 上記のうち **案 2 または 案 3** を採用すると、運用意図と実装の両方が分かりやすい。
