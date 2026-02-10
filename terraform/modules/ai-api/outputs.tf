# Zedi AI API Module - Outputs

output "websocket_url" {
  description = "WebSocket API Gateway URL for streaming chat"
  value       = "${aws_apigatewayv2_api.ws.api_endpoint}/${aws_apigatewayv2_stage.ws_default.name}"
}

output "websocket_api_id" {
  description = "WebSocket API Gateway ID"
  value       = aws_apigatewayv2_api.ws.id
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.ai_api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.ai_api.arn
}

output "rate_limit_table_name" {
  description = "DynamoDB table name for rate limiting"
  value       = aws_dynamodb_table.rate_limit.name
}

output "ai_secrets_arn" {
  description = "ARN of the AI provider keys secret"
  value       = aws_secretsmanager_secret.ai_keys.arn
}
