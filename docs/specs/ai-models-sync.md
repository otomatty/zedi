# AI モデル一覧の自動同期

各LLMプロバイダー（OpenAI / Anthropic / Google）の「利用可能なモデル一覧」API を呼び出し、取得結果を DB の `ai_models` テーブルに反映します。

## 実行方法

```bash
cd server/api
npm run sync:ai-models
```

- **DATABASE_URL** は必須です。
- 各プロバイダーの API キーは任意です。未設定のプロバイダーはスキップされます。
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_AI_API_KEY`

ローカルで `.env` に設定している場合は、同じディレクトリで上記コマンドを実行すれば読み込まれます（環境に応じて `.env` の読み込み方法は異なります）。Railway ではデプロイ時に設定した変数がそのまま使われます。

## Railway で実行する場合（推奨）

`railway run npm run sync:ai-models` は**ローカル**で実行されるため、Railway の DB ホスト（`postgres.railway.internal`）に接続できません。**API の管理エンドポイント**から同期する方法を使います。

1. **秘密文字列を作成し、Railway の環境変数に登録**（手順は下記「秘密文字列の作成と登録」を参照）。

2. **API をデプロイ**（上記を追加したうえで再デプロイ）。
   - **推奨（Git 連携）:** 該当ブランチへ `git push` すると自動で再デプロイされます。
   - **CLI でデプロイする場合:** Root Directory は **`server/api`** のままにし、**リポジトリルート**で `railway up`（パスなし）を実行してください。手順は下記「CLI でデプロイする（Root Directory の設定）」を参照。

3. **同期を実行**（API が Railway 上で動いているため、同じネットワーク内の DB に接続できます）:

   ```bash
   curl -X POST "https://api-development-b126.up.railway.app/api/ai/admin/sync-models" \
     -H "X-Sync-Secret: あなたが設定したSYNC_AI_MODELS_SECRET"
   ```

   本番の場合は URL を `https://api.zedi-note.app` などに変更してください。

4. 成功時は `{"ok":true,"results":[...]}` が返ります。`results` に各プロバイダーの取得件数・エラーが入ります。

ローカルで `npm run sync:ai-models` を使う場合は、**公開用の DATABASE_URL**（Railway ダッシュボードで確認できる、外部から接続可能な URL）を設定してから実行してください。

## CLI でデプロイする（Root Directory の設定）

### 推奨: リポジトリルートからアップロード（パス指定なし）

**Root Directory** を **`server/api`** にしたまま、**リポジトリのルート**からアップロードすると、ビルドが通ります。

1. [Railway ダッシュボード](https://railway.app/) → プロジェクト **Zedi** → **api** サービス → **Settings**
2. **Root Directory** を **`server/api`** に設定（空にしない）。保存。
3. 手元で**リポジトリのルート**からデプロイ（パスは付けない）:
   ```bash
   cd /path/to/zedi
   railway link -p Zedi -e development
   railway service api
   railway up
   ```

`railway up` にパスを付けないと「現在のディレクトリ」（= リポジトリルート）がそのままアップロードされます。アップロードに `server/api` が含まれるため、Root Directory `server/api` が参照でき、その中にある `Dockerfile` も見つかります。

### よくあるエラーと対処

| ビルドログのメッセージ                         | 原因                                                                                                                | 対処                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Could not find root directory: /server/api** | Root Directory が `server/api` なのに、アップロードが `server/api` フォルダだけ（中身のみ）になっている             | 上記のとおり、**リポジトリルート**で `railway up`（パスなし）を実行する                                |
| **Dockerfile `Dockerfile` does not exist**     | Root Directory が空で、ビルドがリポジトリルートで実行されている。Dockerfile は `server/api/` にあるため見つからない | Root Directory を **`server/api`** に設定し、**リポジトリルート**で `railway up`（パスなし）を実行する |
| **prefix not found**                           | リポジトリルートで `railway up ./server/api` を実行したときに出ることがある                                         | パスを付けずに `railway up` だけにする                                                                 |

## 秘密文字列の作成と登録

### 作成方法

推測されにくいランダムな文字列を生成します。いずれか一つで構いません。

**方法 A: OpenSSL（Git Bash / WSL / macOS / Linux）**

```bash
openssl rand -hex 32
```

例: `a1b2c3d4e5f6...` のような 64 文字の英数字が出力されます。

**方法 B: Node.js**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**方法 C: PowerShell（Windows）**

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

生成した文字列を**コピーして安全な場所に控えておきます**。curl 実行時に `X-Sync-Secret` ヘッダーにこの値を指定します。

### Railway への登録方法

**方法 A: Railway ダッシュボード**

1. [Railway](https://railway.app/) にログインし、対象プロジェクト（Zedi）を開く。
2. **api** サービスを選択する。
3. **Variables** タブを開く。
4. **+ New Variable** をクリックする。
5. 変数名に `SYNC_AI_MODELS_SECRET`、値に上記で作成した秘密文字列を貼り付ける。
6. 保存すると自動で再デプロイが始まります。

**方法 B: Railway CLI**

1. 対象のサービスにリンクする:
   ```bash
   cd server/api
   railway link -p Zedi -e development
   railway service api
   ```
2. 変数を追加する（`<生成した秘密文字列>` を実際の値に置き換える）:
   ```bash
   railway variable set SYNC_AI_MODELS_SECRET="<生成した秘密文字列>"
   ```
3. 再デプロイが必要な場合は、デプロイを実行する。

登録後、同期実行時の curl では **-H "X-Sync-Secret: ここに同じ秘密文字列"** を指定します。

## 挙動

- 各プロバイダーの「モデル一覧」API を呼び出します。
  - **OpenAI:** `GET https://api.openai.com/v1/models`
  - **Anthropic:** `GET https://api.anthropic.com/v1/models`（[Models list API](https://docs.anthropic.com/en/api/models-list)）。レスポンスの `data` 配列を使用し、`has_more` でページネーション。
  - **Google:** `GET https://generativelanguage.googleapis.com/v1beta/models`
- 取得したモデルを `ai_models` に **upsert**（存在すれば更新、なければ挿入）します。
- `id` は `{provider}:{model_id}` 形式（例: `openai:gpt-4o`, `anthropic:claude-sonnet-4-6`, `google:gemini-1.5-flash`）です。
- 料金単位（`input_cost_units` / `output_cost_units`）は現状デフォルト値です。必要に応じて DB や別処理で更新してください。

## 特定モデルのみ登録する（OpenAI / Google）

モデル数が多いため、登録するモデルを限定したい場合は、環境変数で **モデル ID の allowlist** を指定できます。未設定の場合は従来どおり「取得した全件」を登録します。

| 環境変数             | 例                                | 説明                                                             |
| -------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **OPENAI_MODEL_IDS** | `gpt-4o,gpt-4o-mini,o1-mini`      | 登録する OpenAI モデル ID をカンマ区切りで指定。未設定なら全件。 |
| **GOOGLE_MODEL_IDS** | `gemini-2.0-flash,gemini-1.5-pro` | 登録する Google モデル ID をカンマ区切りで指定。未設定なら全件。 |

- Anthropic には allowlist はありません（一覧が少ないため）。必要ならコードでフィルタを追加可能。
- Railway の環境変数に上記を設定したうえで、同期エンドポイント（POST /api/ai/admin/sync-models）を再度呼び出すと、指定したモデルのみが upsert されます。既存の他モデルは DB から削除はされませんが、そのプロバイダーに対する allowlist 外のモデルは `isActive=false` に更新されるため、一覧からは表示されなくなります。

## 定期実行（任意）

最新のモデル一覧を定期的に反映したい場合は、cron や Railway の Cron ジョブなどで上記コマンドを定期実行してください。自動では実行されません。
