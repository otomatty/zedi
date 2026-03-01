# DNS レコード設定ガイド — Railway カスタムドメイン

**作成日:** 2026-02-27
**対象:** Cloudflare DNS で `zedi-note.app` のサブドメインを Railway サービスに接続する

---

## 概要

Railway にデプロイした `api-prod` と `hocuspocus-prod` サービスにカスタムドメインを割り当てるため、Cloudflare DNS に以下のレコードを追加する。

| サブドメイン             | 用途                                         | 接続先サービス    |
| ------------------------ | -------------------------------------------- | ----------------- |
| `api.zedi-note.app`      | REST API（Better Auth, CRUD, AI チャット等） | `api-prod`        |
| `realtime.zedi-note.app` | WebSocket（Hocuspocus リアルタイム共同編集） | `hocuspocus-prod` |

---

## 追加するレコード一覧

合計 **4 レコード**（各サブドメインにつき CNAME 1 + TXT 1）。

### api.zedi-note.app

| #   | タイプ | 名前 (Name)           | 値 (Content)                                                                                     | プロキシ               |
| --- | ------ | --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | CNAME  | `api`                 | `2yg7k4yt.up.railway.app`                                                                        | **DNS only（灰色雲）** |
| 2   | TXT    | `_railway-verify.api` | `railway-verify=railway-verify=97b0cf3ce5de53d394f30217a4788eec389f509a8ab5013a90a0c7c0d23cd629` | —                      |

### realtime.zedi-note.app

| #   | タイプ | 名前 (Name)                | 値 (Content)                                                                                     | プロキシ               |
| --- | ------ | -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| 3   | CNAME  | `realtime`                 | `nnkek1wf.up.railway.app`                                                                        | **DNS only（灰色雲）** |
| 4   | TXT    | `_railway-verify.realtime` | `railway-verify=railway-verify=b08709e7971274931c697417f9b8f8fc4d0ab61ef8a7690ababd25b8447d1a78` | —                      |

---

## 手順（Cloudflare Dashboard）

### Step 1: Cloudflare Dashboard にログイン

1. https://dash.cloudflare.com/ を開く
2. アカウントにログイン
3. ドメイン一覧から **`zedi-note.app`** をクリック

### Step 2: DNS 管理画面を開く

左サイドバーの **「DNS」→「Records」** をクリック。

### Step 3: api.zedi-note.app の CNAME レコードを追加

1. **「Add record」** ボタンをクリック
2. 以下を入力:

| 項目         | 値                                                                      |
| ------------ | ----------------------------------------------------------------------- |
| Type         | `CNAME`                                                                 |
| Name         | `api`                                                                   |
| Target       | `2yg7k4yt.up.railway.app`                                               |
| Proxy status | **DNS only**（灰色の雲アイコン — クリックしてオレンジを灰色に切り替え） |
| TTL          | Auto                                                                    |

3. **「Save」** をクリック

> **重要: Proxy status を「DNS only」にする理由**
>
> Cloudflare のプロキシ（オレンジ雲）を有効にすると、Railway の SSL 証明書の発行に失敗する。Railway は自前で Let's Encrypt 証明書を発行するため、Cloudflare プロキシを経由させると証明書の検証が通らない。
>
> ただし、Railway のドキュメントでは Cloudflare プロキシを使う場合の設定方法も紹介されている。プロキシを使いたい場合は、Cloudflare の SSL/TLS 設定を **「Full (strict)」** に変更すること。

### Step 4: api.zedi-note.app の TXT レコードを追加

1. **「Add record」** ボタンをクリック
2. 以下を入力:

| 項目    | 値                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------ |
| Type    | `TXT`                                                                                            |
| Name    | `_railway-verify.api`                                                                            |
| Content | `railway-verify=railway-verify=97b0cf3ce5de53d394f30217a4788eec389f509a8ab5013a90a0c7c0d23cd629` |
| TTL     | Auto                                                                                             |

3. **「Save」** をクリック

> **TXT レコードの役割:** Railway がドメインの所有権を確認するための検証レコード。このレコードがないとカスタムドメインの SSL 証明書が発行されない。

### Step 5: realtime.zedi-note.app の CNAME レコードを追加

1. **「Add record」** ボタンをクリック
2. 以下を入力:

| 項目         | 値                        |
| ------------ | ------------------------- |
| Type         | `CNAME`                   |
| Name         | `realtime`                |
| Target       | `nnkek1wf.up.railway.app` |
| Proxy status | **DNS only**（灰色の雲）  |
| TTL          | Auto                      |

3. **「Save」** をクリック

### Step 6: realtime.zedi-note.app の TXT レコードを追加

1. **「Add record」** ボタンをクリック
2. 以下を入力:

| 項目    | 値                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------ |
| Type    | `TXT`                                                                                            |
| Name    | `_railway-verify.realtime`                                                                       |
| Content | `railway-verify=railway-verify=b08709e7971274931c697417f9b8f8fc4d0ab61ef8a7690ababd25b8447d1a78` |
| TTL     | Auto                                                                                             |

3. **「Save」** をクリック

---

## 設定後の確認

### DNS 伝播の確認

DNS レコードの反映には最大 72 時間かかるが、Cloudflare DNS の場合は通常数分以内に反映される。

```bash
# CNAME の確認
dig api.zedi-note.app CNAME +short
# 期待値: 2yg7k4yt.up.railway.app.

dig realtime.zedi-note.app CNAME +short
# 期待値: nnkek1wf.up.railway.app.

# TXT の確認
dig _railway-verify.api.zedi-note.app TXT +short
dig _railway-verify.realtime.zedi-note.app TXT +short
```

Windows の場合は `nslookup` を使用:

```cmd
nslookup -type=CNAME api.zedi-note.app
nslookup -type=CNAME realtime.zedi-note.app
nslookup -type=TXT _railway-verify.api.zedi-note.app
nslookup -type=TXT _railway-verify.realtime.zedi-note.app
```

### Railway 側の確認

DNS レコードが正しく設定されると、Railway Dashboard のカスタムドメイン欄に緑のチェックマークが表示される。

```bash
# Railway CLI でのステータス確認
railway link -p Zedi -e production
railway service status --all --json
```

### ヘルスチェック

SSL 証明書が発行されたら、カスタムドメインでアクセスできることを確認する:

```bash
curl -s https://api.zedi-note.app/api/health
# 期待値: {"status":"ok","timestamp":"..."}

curl -s https://realtime.zedi-note.app/health
# 期待値: {"status":"healthy","service":"zedi-hocuspocus",...}
```

---

## トラブルシューティング

### SSL 証明書が発行されない

| 原因                           | 対処                                                 |
| ------------------------------ | ---------------------------------------------------- |
| TXT レコードが未設定または誤り | `_railway-verify.*` の TXT レコードを再確認          |
| Cloudflare プロキシが有効      | CNAME レコードのプロキシを「DNS only」（灰色）に変更 |
| DNS 伝播が未完了               | 数分〜数時間待ってから再確認                         |

### ERR_SSL_VERSION_OR_CIPHER_MISMATCH

Cloudflare プロキシ（オレンジ雲）を使用している場合に発生することがある。

**対処法 A（推奨）:** CNAME のプロキシを「DNS only」に切り替え。

**対処法 B:** Cloudflare SSL/TLS 設定を「Full (strict)」に変更:

1. Cloudflare Dashboard → `zedi-note.app` → SSL/TLS → Overview
2. 暗号化モードを **「Full (strict)」** に変更

### WebSocket 接続が失敗する (realtime.zedi-note.app)

| 原因                                       | 対処                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Cloudflare プロキシが WebSocket をブロック | 「DNS only」に変更（プロキシ経由の場合は Cloudflare が WebSocket に対応しているか確認） |
| CORS エラー                                | API サービスの `CORS_ORIGIN` 環境変数にフロントエンドのオリジンが含まれているか確認     |
| ポート不一致                               | Railway のカスタムドメイン設定でポートが `1234` になっているか確認                      |

### DNS レコードが反映されない

Cloudflare を使用している場合、TTL は自動管理されるためほぼ即時反映される。反映されない場合:

1. ブラウザのDNSキャッシュをクリア: `chrome://net-internals/#dns` → 「Clear host cache」
2. OS の DNS キャッシュをクリア:
   ```cmd
   ipconfig /flushdns
   ```
3. 別の DNS リゾルバで確認:
   ```bash
   dig @8.8.8.8 api.zedi-note.app CNAME +short
   ```

---

## Cloudflare DNS 設定完了後のレコード一覧（参考）

設定完了後、Cloudflare の DNS Records 画面には以下のようなレコードが並ぶ:

```
Type    Name                       Content                             Proxy    TTL
─────   ─────────────────────────  ──────────────────────────────────  ───────  ────
CNAME   api                        2yg7k4yt.up.railway.app            DNS only Auto
TXT     _railway-verify.api        railway-verify=railway-verify=97…  —        Auto
CNAME   realtime                   nnkek1wf.up.railway.app            DNS only Auto
TXT     _railway-verify.realtime   railway-verify=railway-verify=b0…  —        Auto
```

> **注:** 既存の `zedi-note.app` のルートドメインレコード（Cloudflare Pages 用など）はそのまま維持する。上記は追加レコードのみ。
