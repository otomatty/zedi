output "invoke_url" {
  description = "API Gateway invoke URL (no trailing slash); use as oidc_issuer and base for token_url, attributes_url"
  value       = trim(replace(aws_apigatewayv2_stage.default.invoke_url, "wss://", "https://"), "/")
}

output "api_id" {
  description = "API Gateway HTTP API id"
  value       = aws_apigatewayv2_api.main.id
}
