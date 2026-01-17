# Dockerを使った並列開発ガイド

複数のアプリケーションインスタンスを並列で開発するためのDockerセットアップ方法を説明します。

## 概要

Dockerを使うことで、以下のメリットがあります：

- ✅ **環境の完全な分離**: 各インスタンスが独立した環境で動作
- ✅ **依存関係の管理**: システムに影響を与えずに依存関係を管理
- ✅ **簡単な起動/停止**: `docker-compose`コマンドで一括管理
- ✅ **ポートの自動管理**: 各インスタンスに異なるポートを割り当て
- ✅ **チーム間の一貫性**: 全員が同じ環境で開発可能

## 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) または Docker Engine がインストールされていること
- 最低8GBのRAM（推奨: 16GB以上）
- 最低20GBの空きディスク容量

## セットアップ

### 1. Dockerイメージのビルド

```bash
# 開発用イメージをビルド
docker-compose -f docker-compose.dev.yml build
```

### 2. 並列インスタンスの起動

```bash
# すべてのインスタンスを起動（3つ同時に起動）
docker-compose -f docker-compose.dev.yml up

# バックグラウンドで起動
docker-compose -f docker-compose.dev.yml up -d

# 特定のインスタンスのみ起動
docker-compose -f docker-compose.dev.yml up zedi-dev-1
```

### 3. アクセス

起動後、以下のURLでアクセスできます：

- インスタンス1: http://localhost:30000
- インスタンス2: http://localhost:30001
- インスタンス3: http://localhost:30002

### 4. ログの確認

```bash
# すべてのログを表示
docker-compose -f docker-compose.dev.yml logs -f

# 特定のインスタンスのログを表示
docker-compose -f docker-compose.dev.yml logs -f zedi-dev-1
```

### 5. 停止

```bash
# すべてのインスタンスを停止
docker-compose -f docker-compose.dev.yml down

# 停止してボリュームも削除
docker-compose -f docker-compose.dev.yml down -v
```

## 環境変数の設定

環境変数は以下の方法で設定できます：

### 方法1: docker-compose.dev.ymlで直接指定

```yaml
environment:
  - VITE_CLERK_PUBLISHABLE_KEY=your_key
  - VITE_TURSO_DATABASE_URL=your_url
```

### 方法2: .env.localファイルを使用

`.env.local`ファイルを作成し、`docker-compose.dev.yml`で読み込む：

```yaml
env_file:
  - .env.local
```

### 方法3: 環境変数ファイルを指定

```bash
docker-compose -f docker-compose.dev.yml --env-file .env.local up
```

## カスタムインスタンスの追加

`docker-compose.dev.yml`に新しいサービスを追加：

```yaml
zedi-dev-4:
  build:
    context: .
    dockerfile: Dockerfile.dev
  container_name: zedi-dev-4
  ports:
    - "30003:30000"
  environment:
    - VITE_PORT=30000
  volumes:
    - .:/app
    - /app/node_modules
  networks:
    - zedi-dev-network
```

## トラブルシューティング

### ポートが既に使用されている

```bash
# 使用中のポートを確認（Windows）
netstat -ano | findstr :30000

# 使用中のポートを確認（Mac/Linux）
lsof -i :30000
```

### コンテナが起動しない

```bash
# コンテナのログを確認
docker-compose -f docker-compose.dev.yml logs zedi-dev-1

# コンテナを再ビルド
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up
```

### メモリ不足エラー

Docker Desktopの設定でメモリ割り当てを増やしてください：
1. Docker Desktopを開く
2. Settings → Resources → Advanced
3. Memoryを8GB以上に設定

### ホットリロードが動作しない

ボリュームマウントが正しく設定されているか確認：

```bash
# コンテナ内でファイルが正しくマウントされているか確認
docker-compose -f docker-compose.dev.yml exec zedi-dev-1 ls -la /app/src
```

## パフォーマンス最適化

### 1. 不要なインスタンスを停止

```bash
# 使用していないインスタンスを停止
docker-compose -f docker-compose.dev.yml stop zedi-dev-2 zedi-dev-3
```

### 2. イメージのクリーンアップ

```bash
# 未使用のイメージを削除
docker image prune -a

# 未使用のボリュームを削除
docker volume prune
```

### 3. ビルドキャッシュの活用

```bash
# キャッシュを使用してビルド（高速）
docker-compose -f docker-compose.dev.yml build --parallel
```

## 推奨PCスペック

### 最小要件

- **CPU**: 4コア以上（Intel Core i5 / AMD Ryzen 5相当）
- **RAM**: 8GB以上
- **ストレージ**: 20GB以上の空き容量（SSD推奨）
- **OS**: Windows 10/11, macOS 10.15+, Linux (Ubuntu 20.04+)

### 推奨スペック（快適な開発）

- **CPU**: 6コア以上（Intel Core i7 / AMD Ryzen 7相当）
- **RAM**: 16GB以上（32GB推奨）
- **ストレージ**: 50GB以上の空き容量（NVMe SSD推奨）
- **OS**: 最新のOS

### 並列開発時の推奨スペック

複数のインスタンスを同時に起動する場合：

- **CPU**: 8コア以上
- **RAM**: 32GB以上（各インスタンスで約2-4GB使用）
- **ストレージ**: 100GB以上の空き容量

### メモリ使用量の目安

- 1インスタンス: 約2-4GB
- 3インスタンス: 約6-12GB
- Docker Desktop自体: 約2-4GB

合計で約8-16GBのRAMが必要です。

## 比較: Docker vs ネイティブ実行

| 項目 | Docker | ネイティブ実行 |
|------|--------|----------------|
| セットアップ | 初回ビルドが必要 | すぐに起動 |
| メモリ使用量 | やや多い（+2-4GB） | 少ない |
| 起動速度 | やや遅い | 速い |
| 環境の一貫性 | 高い | 環境依存 |
| ポート管理 | 自動 | 手動設定 |
| 依存関係の分離 | 完全 | システムと共有 |

## まとめ

Dockerを使った並列開発は、環境の分離と一貫性を重視する場合に最適です。ただし、メモリ使用量が増えるため、十分なリソースが必要です。

軽量な並列開発が必要な場合は、環境変数によるポート設定（前回の実装）の方が軽量で高速です。
