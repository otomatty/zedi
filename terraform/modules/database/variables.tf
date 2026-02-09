# Zedi Database Module - Variables

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
# Network
# =============================================================================

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block for security group rules"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for DB subnet group"
  type        = list(string)
}

# =============================================================================
# Database Settings
# =============================================================================

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "zedi"
}

variable "master_username" {
  description = "Master username for the database"
  type        = string
  default     = "zedi_admin"
}

variable "instance_count" {
  description = "Number of Aurora instances"
  type        = number
  default     = 1
}

# =============================================================================
# Serverless v2 Scaling
# =============================================================================

variable "min_capacity" {
  description = "Minimum ACU for Aurora Serverless v2 (0 = scale-to-zero with auto-pause, 0.5 to 128)"
  type        = number
  default     = 0.5

  validation {
    condition     = var.min_capacity >= 0 && var.min_capacity <= 128
    error_message = "min_capacity must be between 0 and 128."
  }
}

variable "max_capacity" {
  description = "Maximum ACU for Aurora Serverless v2 (0.5 to 128, or 0 when min_capacity=0)"
  type        = number
  default     = 4

  validation {
    condition     = var.max_capacity >= 0 && var.max_capacity <= 128
    error_message = "max_capacity must be between 0 and 128."
  }
}

variable "seconds_until_auto_pause" {
  description = "Seconds of inactivity before auto-pause when min_capacity=0 (300-86400). Set only for dev/test; leave null for prod."
  type        = number
  default     = null

  validation {
    condition     = var.seconds_until_auto_pause == null || (var.seconds_until_auto_pause >= 300 && var.seconds_until_auto_pause <= 86400)
    error_message = "seconds_until_auto_pause must be between 300 and 86400 when set."
  }
}

# =============================================================================
# Backup
# =============================================================================

variable "backup_retention_period" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}
