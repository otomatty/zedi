# Google APIs設定ガイド - Custom Search API & Gemini API

**作成日**: 2026-01-18  
**対象**: サムネイル検索・生成機能のセットアップ

---

## 目次

1. [Google Custom Search APIの設定](#1-google-custom-search-apiの設定)
2. [Gemini APIの設定](#2-gemini-apiの設定)
3. [Cloudflare Workersへの環境変数設定](#3-cloudflare-workersへの環境変数設定)
4. [動作確認](#4-動作確認)
5. [トラブルシューティング](#5-トラブルシューティング)

---

## 1. Google Custom Search APIの設定

### 1.1 Google Cloudプロジェクトの作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. Googleアカウントでログイン（まだの場合はアカウント作成）
3. 画面上部のプロジェクト選択ドロップダウンをクリック
4. 「新しいプロジェクト」をクリック
5. プロジェクト情報を入力:
   - **プロジェクト名**: 任意（例: `zedi-thumbnail-api`）
   - **組織**: 個人利用の場合は「組織なし」でOK
   - **場所**: 任意
6. 「作成」をクリック
7. プロジェクトが作成されたら、プロジェクトを選択

### 1.2 Custom Search APIの有効化

1. Google Cloud Consoleの左側メニューから「APIとサービス」→「ライブラリ」を選択
2. 検索バーに「Custom Search API」と入力
3. 「Custom Search API」を選択
4. 「有効にする」ボタンをクリック
5. 有効化が完了するまで数秒待機

### 1.3 APIキーの作成

1. 左側メニューから「APIとサービス」→「認証情報」を選択
2. 画面上部の「認証情報を作成」をクリック
3. 「APIキー」を選択
4. APIキーが作成され、ポップアップが表示される
5. **重要**: APIキーをコピーして安全な場所に保存（後で使用します）
   - 例: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

#### APIキーの制限設定（推奨）

セキュリティのため、APIキーに制限を設定することを推奨します。APIキー作成時に表示される画面で、以下のように設定してください:

**重要**: 警告メッセージが表示されますが、セキュリティのため制限を設定することを強く推奨します。

##### ステップ1: アプリケーションの制限

**重要**: Cloudflare WorkersからGoogle APIを呼び出す場合、HTTPリファラーが設定されないため、**「なし」を選択することを推奨します**。

**開発・テスト段階**:
1. 「アプリケーションの制限」セクションで、**「なし」**を選択
   - これにより、curlコマンドやCloudflare Workersからのリクエストが正常に動作します

**本番環境（セキュリティ重視の場合）**:
1. 「アプリケーションの制限」セクションで、**「IPアドレス」**を選択
   - Cloudflare WorkersのIPアドレスを制限することは難しいため、この方法は推奨しません

2. または、**「なし」**のままにして、APIの制限のみで保護することを推奨します

**注意**: 
- 「ウェブサイト」制限を設定すると、Cloudflare Workersからのリクエストがブロックされる可能性があります
- セキュリティは「APIの制限」で十分に保護できます

##### ステップ2: APIの制限

1. 「APIの制限」セクションで、**「キーを制限」**を選択
   - 現在「キーを制限しない」が選択されている場合は、これを変更してください

2. 「APIを選択」または検索バーが表示されるので、以下を検索して選択:
   - **Custom Search API** を検索して選択
   - 他のAPIは選択しないでください（このAPIキーはCustom Search API専用にします）

3. 選択後、リストに「Custom Search API」が表示されることを確認

##### ステップ3: 保存

1. 画面下部の「保存」または「制限」ボタンをクリック
2. 確認メッセージが表示されたら「OK」をクリック

**注意**: 
- 制限を設定すると、指定したドメイン以外からはAPIが使用できなくなります
- 開発中に問題が発生した場合は、一時的に制限を緩和してテストできます
- 本番環境では必ず制限を設定してください

### 1.4 カスタム検索エンジン（CSE）の作成

1. [Programmable Search Engine](https://programmablesearchengine.google.com/)にアクセス
2. Googleアカウントでログイン
3. 「新しい検索エンジンを作成」をクリック
4. 検索エンジン設定を入力:
   - **検索対象のサイト**: `*`（全サイトを検索対象にする）
   - **検索エンジンの名前**: 任意（例: `Zedi Image Search`）
   - **検索エンジンの言語**: 日本語（または任意）
5. 「作成」をクリック
6. 次の画面で「制御パネル」をクリック
7. 左側メニューから「基本設定」を選択
8. **重要**: 「画像検索を有効にする」を**ON**にする
9. 「保存」をクリック
10. 左側メニューから「基本設定」の下にある「詳細設定」を選択
11. 「検索エンジンID」をコピーして保存（後で使用します）
    - 例: `012345678901234567890:abcdefghijk`

---

## 2. Gemini APIの設定

### 2.1 Google AI StudioでのAPIキー作成（推奨）

1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. Googleアカウントでログイン
3. 左側メニューから「Get API key」を選択
4. 「Create API key」をクリック
5. プロジェクトを選択（既存のプロジェクトまたは新規作成）
6. APIキーが作成され、ポップアップが表示される
7. **重要**: APIキーをコピーして安全な場所に保存（後で使用します）
   - 例: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

### 2.2 Google Cloud Consoleでの設定（代替方法）

Google AI Studioが使用できない場合:

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを選択（Custom Search APIで作成したものと同じでOK）
3. 左側メニューから「APIとサービス」→「ライブラリ」を選択
4. 検索バーに「Vertex AI API」と入力
5. 「Vertex AI API」を選択
6. 「有効にする」ボタンをクリック
7. 左側メニューから「APIとサービス」→「認証情報」を選択
8. 「認証情報を作成」→「APIキー」を選択
9. APIキーをコピーして保存

**注意**: Vertex AI APIを使用する場合は、追加の設定が必要になる場合があります。Google AI StudioでのAPIキー作成を推奨します。

---

## 3. Cloudflare Workersへの環境変数設定

### 3.1 ローカル開発環境（Wrangler）

#### 3.1.1 `.dev.vars`ファイルの作成

プロジェクトルートの`workers/thumbnail-api/`ディレクトリに`.dev.vars`ファイルを作成:

```bash
cd workers/thumbnail-api
touch .dev.vars
```

#### 3.1.2 環境変数の設定

`.dev.vars`ファイルに以下を記述:

```bash
GOOGLE_CUSTOM_SEARCH_API_KEY=your-custom-search-api-key
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your-search-engine-id
GOOGLE_GEMINI_API_KEY=your-gemini-api-key
CORS_ORIGIN=http://localhost:30000
```

**注意**: 
- `your-custom-search-api-key`: 1.3で取得したCustom Search APIキー
- `your-search-engine-id`: 1.4で取得した検索エンジンID
- `your-gemini-api-key`: 2.1で取得したGemini APIキー

#### 3.1.3 `.gitignore`への追加

`.dev.vars`ファイルは機密情報を含むため、`.gitignore`に追加:

```bash
echo ".dev.vars" >> .gitignore
```

### 3.2 本番環境（Cloudflare Dashboard）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にアクセス
2. 左側メニューから「Workers & Pages」を選択
3. プロジェクト（`zedi-thumbnail-api`）を選択
4. 「Settings」タブを選択
5. 「Variables」セクションまでスクロール
6. 「Environment Variables」の「Add variable」をクリック
7. 以下の3つの環境変数を追加:

   **変数1**:
   - **Variable name**: `GOOGLE_CUSTOM_SEARCH_API_KEY`
   - **Value**: Custom Search APIキー
   - **Type**: Encrypted（推奨）

   **変数2**:
   - **Variable name**: `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
   - **Value**: 検索エンジンID
   - **Type**: Encrypted（推奨）

   **変数3**:
   - **Variable name**: `GOOGLE_GEMINI_API_KEY`
   - **Value**: Gemini APIキー
   - **Type**: Encrypted（推奨）

8. 各変数を追加後、「Save」をクリック

### 3.3 Wrangler CLIでの設定（代替方法）

コマンドラインから環境変数を設定する場合:

```bash
cd workers/thumbnail-api

# Custom Search APIキー
wrangler secret put GOOGLE_CUSTOM_SEARCH_API_KEY

# 検索エンジンID
wrangler secret put GOOGLE_CUSTOM_SEARCH_ENGINE_ID

# Gemini APIキー
wrangler secret put GOOGLE_GEMINI_API_KEY
```

各コマンド実行時に、プロンプトが表示されるので、対応する値を入力します。

---

## 4. 動作確認

### 4.1 ローカル環境でのテスト

#### 4.1.1 Workersの起動

```bash
cd workers/thumbnail-api
npm run dev
```

または

```bash
wrangler dev
```

正常に起動すると、以下のようなメッセージが表示されます:

```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

#### 4.1.2 画像検索のテスト

別のターミナルで以下を実行:

```bash
curl "http://localhost:8787/api/image-search?query=sunset&limit=10"
```

**期待される結果**:
- HTTPステータス: `200 OK`
- JSONレスポンスに`items`配列が含まれる
- 各アイテムに`previewUrl`、`imageUrl`、`alt`等が含まれる

**エラーの場合**:
- `400 Bad Request`: クエリパラメータが不正
- `500 Internal Server Error`: 環境変数が設定されていない、またはAPIキーが無効

#### 4.1.3 画像生成のテスト

```bash
curl -X POST "http://localhost:8787/api/image-generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A beautiful sunset over the ocean"}'
```

**期待される結果**:
- HTTPステータス: `200 OK`
- JSONレスポンスに`imageUrl`（base64データURI）と`mimeType`が含まれる

**エラーの場合**:
- `400 Bad Request`: リクエストボディが不正（`prompt`が欠如）
- `500 Internal Server Error`: 環境変数が設定されていない、またはAPIキーが無効

### 4.2 本番環境でのテスト

本番環境にデプロイ後、同様のコマンドでテスト（URLを本番環境のURLに変更）:

```bash
# 画像検索
curl "https://your-worker.workers.dev/api/image-search?query=sunset&limit=10"

# 画像生成
curl -X POST "https://your-worker.workers.dev/api/image-generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A beautiful sunset over the ocean"}'
```

### 4.3 フロントエンドからのテスト

1. アプリケーションを起動
2. ページ編集画面を開く
3. サムネイル未設定のページで、下部の「おすすめ」バーを確認
4. 「画像を検索」ボタンをクリック
5. 検索結果が表示されることを確認
6. 「AIで生成」ボタンをクリック
7. 画像が生成され、サムネイルとして設定されることを確認

---

## 5. トラブルシューティング

### 5.1 よくあるエラーと解決方法

#### エラー: `Google Custom Search API key or search engine ID is not configured`

**原因**: 環境変数が設定されていない

**解決方法**:
1. `.dev.vars`ファイル（ローカル）またはCloudflare Dashboard（本番）で環境変数を確認
2. 変数名のタイポがないか確認
3. Workersを再起動

#### エラー: `Google Custom Search request failed: 400`

**原因**: APIキーまたは検索エンジンIDが無効

**解決方法**:
1. APIキーが正しくコピーされているか確認
2. 検索エンジンIDが正しくコピーされているか確認
3. Custom Search APIが有効化されているか確認
4. APIキーの制限設定を確認（制限が厳しすぎる場合、一時的に削除してテスト）

#### エラー: `Google Custom Search request failed: 403`

**原因**: APIキーの制限またはクォータ超過

**よくある原因1: HTTPリファラー制限**
エラーメッセージに `API_KEY_HTTP_REFERRER_BLOCKED` が含まれる場合:

**解決方法**:
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)にアクセス
2. 該当するAPIキーの「編集」をクリック
3. 「アプリケーションの制限」セクションで**「なし」**を選択
4. 「保存」をクリック
5. 数分待ってから再度テスト

**注意**: Cloudflare WorkersからGoogle APIを呼び出す場合、HTTPリファラーが設定されないため、「ウェブサイト」制限を設定するとリクエストがブロックされます。セキュリティは「APIの制限」で十分に保護できます。

**よくある原因2: クォータ超過**

**解決方法**:
1. Google Cloud Consoleでクォータを確認
2. 無料枠（1日100リクエスト）を超過していないか確認
3. 超過している場合は、翌日まで待つか、有料プランに切り替える

#### エラー: `Gemini API key is not configured`

**原因**: 環境変数が設定されていない

**解決方法**:
1. `.dev.vars`ファイル（ローカル）またはCloudflare Dashboard（本番）で環境変数を確認
2. 変数名のタイポがないか確認
3. Workersを再起動

#### エラー: `Gemini API request failed: 401`

**原因**: APIキーが無効または期限切れ

**解決方法**:
1. Google AI StudioでAPIキーが有効か確認
2. APIキーを再生成して環境変数を更新

#### エラー: `Gemini API request failed: 429`

**原因**: レート制限超過

**解決方法**:
1. リクエスト頻度を下げる
2. しばらく待ってから再試行

#### エラー: `No image data found in Gemini API response`

**原因**: Gemini APIのレスポンス形式が期待と異なる

**解決方法**:
1. APIのレスポンスをログで確認
2. モデル名が正しいか確認（`imagen-4.0-fast-generate-001`）
3. プロンプトが適切か確認（不適切な内容はフィルタリングされる可能性）

### 5.2 デバッグ方法

#### ログの確認

ローカル環境:
```bash
# Workersのログを確認
wrangler dev
```

本番環境:
1. Cloudflare Dashboard → Workers & Pages → プロジェクト選択
2. 「Logs」タブを選択
3. エラーログを確認

#### 環境変数の確認

ローカル環境:
```bash
# .dev.varsファイルの内容を確認（機密情報に注意）
cat workers/thumbnail-api/.dev.vars
```

本番環境:
1. Cloudflare Dashboard → Workers & Pages → プロジェクト選択
2. 「Settings」タブ → 「Variables」セクション
3. 環境変数が正しく設定されているか確認

### 5.3 よくある質問

#### Q: APIキーはどこで確認できますか？

**A**: 
- Custom Search APIキー: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Gemini APIキー: [Google AI Studio](https://aistudio.google.com/app/apikey)

#### Q: 無料枠はどのくらいですか？

**A**:
- Custom Search API: 1日100リクエスト（月約3,000リクエスト）
- Gemini API (Imagen): 無料枠なし（$0.02/画像）

#### Q: 検索エンジンIDはどこで確認できますか？

**A**: [Programmable Search Engine](https://programmablesearchengine.google.com/)の「制御パネル」→「基本設定」→「詳細設定」で確認できます。

#### Q: 画像検索が動作しない

**A**: 
1. 検索エンジンの「画像検索を有効にする」がONになっているか確認
2. APIキーの制限設定を確認
3. クォータを確認

#### Q: 画像生成が遅い

**A**: 
- Imagen 4 Fastモデルを使用している場合、通常10-30秒程度かかります
- より高速なモデルはありませんが、タイムアウト設定を確認してください

---

## 6. セキュリティのベストプラクティス

### 6.1 APIキーの保護

- ✅ `.dev.vars`ファイルを`.gitignore`に追加
- ✅ 環境変数は「Encrypted」タイプで保存（Cloudflare Dashboard）
- ✅ APIキーに制限を設定（HTTPリファラー、API制限）
- ❌ APIキーをコードに直接記述しない
- ❌ APIキーをGitにコミットしない
- ❌ APIキーを公開リポジトリにプッシュしない

### 6.2 クォータ管理

- 無料枠を超えないよう、使用量を監視
- 必要に応じてアラートを設定
- 予算アラートを設定（Google Cloud Console）

---

## 7. 参考資料

- **Google Custom Search API**: https://developers.google.com/custom-search/v1/overview
- **Programmable Search Engine**: https://programmablesearchengine.google.com/
- **Gemini API (Imagen)**: https://ai.google.dev/gemini-api/docs/imagen
- **Google AI Studio**: https://aistudio.google.com/
- **Cloudflare Workers環境変数**: https://developers.cloudflare.com/workers/configuration/environment-variables/

---

## 8. 次のステップ

設定が完了したら、以下を確認してください:

1. ✅ 画像検索が正常に動作する
2. ✅ 画像生成が正常に動作する
3. ✅ フロントエンドからAPIが呼び出せる
4. ✅ エラーハンドリングが適切に動作する

問題が解決しない場合は、上記のトラブルシューティングセクションを参照するか、ログを確認してください。
