# Terraform Backend Configuration
# S3 + DynamoDB for state management

terraform {
  backend "s3" {
    bucket         = "zedi-terraform-state-590183877893"
    key            = "zedi/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "zedi-terraform-lock"
  }
}
