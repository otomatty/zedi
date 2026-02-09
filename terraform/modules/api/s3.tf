# C1-8: S3 bucket for media uploads (Presigned URL でクライアントが直接 PUT)
data "aws_caller_identity" "api" {}

locals {
  media_bucket_name = "zedi-${var.environment}-media-${data.aws_caller_identity.api.account_id}"
}

resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name

  tags = merge(var.tags, {
    Name = local.media_bucket_name
  })
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lambda が Presigned URL を発行し、クライアントが PUT。Lambda は GetObject で確認用にも利用可能に。
resource "aws_iam_role_policy" "lambda_s3_media" {
  name   = "zedi-${var.environment}-api-lambda-s3-media"
  role   = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "${aws_s3_bucket.media.arn}/*"
    }]
  })
}
