# Zedi Realtime Module - Outputs

################################################################################
# ECR Repository
################################################################################

output "ecr_repository_url" {
  description = "ECR repository URL for Hocuspocus image"
  value       = aws_ecr_repository.hocuspocus.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN"
  value       = aws_ecr_repository.hocuspocus.arn
}

################################################################################
# ECS Cluster
################################################################################

output "ecs_cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

################################################################################
# ECS Service
################################################################################

output "ecs_service_id" {
  description = "ECS service ID"
  value       = aws_ecs_service.hocuspocus.id
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.hocuspocus.name
}

################################################################################
# Load Balancer
################################################################################

output "alb_id" {
  description = "ALB ID"
  value       = aws_lb.main.id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID (for Route53 alias records)"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "Target group ARN"
  value       = aws_lb_target_group.hocuspocus.arn
}

################################################################################
# WebSocket URLs
################################################################################

output "websocket_url" {
  description = "WebSocket URL for Hocuspocus (ws:// for dev, wss:// for prod)"
  value       = var.acm_certificate_arn != "" ? "wss://${aws_lb.main.dns_name}" : "ws://${aws_lb.main.dns_name}"
}

output "http_url" {
  description = "HTTP/HTTPS URL for ALB"
  value       = var.acm_certificate_arn != "" ? "https://${aws_lb.main.dns_name}" : "http://${aws_lb.main.dns_name}"
}

################################################################################
# Security Groups
################################################################################

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "ecs_tasks_security_group_id" {
  description = "ECS tasks security group ID"
  value       = aws_security_group.ecs_tasks.id
}

################################################################################
# CloudWatch
################################################################################

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for ECS"
  value       = aws_cloudwatch_log_group.ecs.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN for ECS"
  value       = aws_cloudwatch_log_group.ecs.arn
}
