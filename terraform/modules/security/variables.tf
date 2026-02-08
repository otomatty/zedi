# Zedi Security Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# =============================================================================
# Cognito Settings
# =============================================================================

variable "callback_urls" {
  description = "List of allowed callback URLs for OAuth"
  type        = list(string)
  default     = ["http://localhost:30000/callback"]
}

variable "logout_urls" {
  description = "List of allowed logout URLs"
  type        = list(string)
  default     = ["http://localhost:30000"]
}

# -----------------------------------------------------------------------------
# Federated Identity Providers (Google, GitHub)
# Set these to enable "Sign in with Google" / "Sign in with GitHub"
# -----------------------------------------------------------------------------

variable "google_client_id" {
  description = "Google OAuth 2.0 Client ID for Cognito federated sign-in"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth App Client ID for Cognito OIDC IdP"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth App Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

# GitHub は OIDC discovery を提供しないため、enable_github_idp=true のときは
# github_proxy_base_url にプロキシ API の URL を渡す必要があります（cognito-github-proxy モジュールの invoke_url）。
variable "enable_github_idp" {
  description = "Create GitHub as OIDC IdP (requires github_proxy_base_url from cognito-github-proxy module)"
  type        = bool
  default     = false
}

variable "github_proxy_base_url" {
  description = "Base URL of the Cognito GitHub OAuth proxy (e.g. from module.cognito_github_proxy.invoke_url); required when enable_github_idp=true"
  type        = string
  default     = ""
}

variable "enable_mfa" {
  description = "Enable MFA (OPTIONAL or REQUIRED)"
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "REQUIRED"], var.enable_mfa)
    error_message = "enable_mfa must be one of: OFF, OPTIONAL, REQUIRED."
  }
}

# =============================================================================
# Token Settings
# =============================================================================

variable "access_token_validity_hours" {
  description = "Access token validity in hours"
  type        = number
  default     = 1
}

variable "id_token_validity_hours" {
  description = "ID token validity in hours"
  type        = number
  default     = 1
}

variable "refresh_token_validity_days" {
  description = "Refresh token validity in days"
  type        = number
  default     = 30
}
