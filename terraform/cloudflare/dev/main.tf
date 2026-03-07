terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  backend "remote" {
    organization = "Saedgewell"
    workspaces {
      name = "cloudflare-dev"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
