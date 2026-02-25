# Zedi REST API Module - Outputs

output "api_id" {
  description = "API Gateway HTTP API ID"
  value       = aws_apigatewayv2_api.main.id
}

output "authorizer_id" {
  description = "JWT authorizer ID for API Gateway routes"
  value       = aws_apigatewayv2_authorizer.jwt.id
}

output "api_execution_arn" {
  description = "API Gateway execution ARN for Lambda permissions"
  value       = aws_apigatewayv2_api.main.execution_arn
}

output "invoke_url" {
  description = "API Gateway invoke URL (no trailing slash)"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.main.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.main.arn
}
