# Zedi Realtime Module - Variables

################################################################################
# General
################################################################################

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

################################################################################
# Networking
################################################################################

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

################################################################################
# ECS Configuration
################################################################################

variable "task_cpu" {
  description = "CPU units for ECS task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory (MB) for ECS task"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 1
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 1234
}

variable "use_fargate_spot" {
  description = "Use Fargate Spot for cost savings (~70% discount)"
  type        = bool
  default     = true
}

################################################################################
# IAM Roles
################################################################################

variable "ecs_execution_role_arn" {
  description = "ECS Task Execution Role ARN"
  type        = string
}

variable "ecs_task_role_arn" {
  description = "ECS Task Role ARN"
  type        = string
}

################################################################################
# Dependencies
################################################################################

variable "redis_connection_string" {
  description = "Redis connection string (TLS enabled)"
  type        = string
}

variable "db_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret for DB credentials"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for authentication"
  type        = string
}

################################################################################
# SSL/TLS
################################################################################

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (optional, if empty uses HTTP)"
  type        = string
  default     = ""
}

################################################################################
# Auto Scaling
################################################################################

variable "enable_autoscaling" {
  description = "Enable ECS service auto scaling"
  type        = bool
  default     = false
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks (when autoscaling enabled)"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks (when autoscaling enabled)"
  type        = number
  default     = 4
}

################################################################################
# Monitoring
################################################################################

variable "enable_container_insights" {
  description = "Enable Container Insights for ECS cluster"
  type        = bool
  default     = false
}
