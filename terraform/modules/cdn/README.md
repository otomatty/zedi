# Zedi CDN Module

S3 + CloudFront でフロントエンド（静的サイト）を配信するモジュール。

- **S3**: プライベートバケット。CloudFront OAC からのみ GetObject 可。
- **CloudFront**: デフォルト `index.html`、SPA 用 403/404 → index.html。
- **ACM**: `domain_name` 指定時のみ us-east-1 で証明書リクエスト（Cloudflare の場合は DNS 検証を手動で追加）。
- **Route53**: `route53_zone_id` 指定時のみ Alias レコード作成（Cloudflare の場合は未使用）。

デプロイは Terraform 外で行う（例: GitHub Actions で `aws s3 sync dist/` + invalidation）。
