terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Replace organization and workspace with your Terraform Cloud settings
  backend "remote" {
    organization = "Saedgewell"

    workspaces {
      name = "cloudflare"
    }
  }
}

# API token: set in Terraform Cloud as Terraform variable cloudflare_api_token (sensitive)
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
