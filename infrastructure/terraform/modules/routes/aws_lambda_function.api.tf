data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${local.lambdas_path}/dist"
  output_path = "${path.root}/.terraform/routes-api.zip"
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.resource_prefix}-api"
  retention_in_days = var.cloudwatch_log_retention_days
  tags              = local.default_tags
}
resource "aws_lambda_function" "api" {
  function_name                  = "${local.resource_prefix}-api"
  role                           = aws_iam_role.api.arn
  filename                       = data.archive_file.api.output_path
  source_code_hash               = data.archive_file.api.output_base64sha256
  runtime                        = var.lambda_runtime
  handler                        = "index.handler"
  architectures                  = ["arm64"]
  memory_size                    = 512
  timeout                        = 25
  reserved_concurrent_executions = var.lambda_reserved_concurrency
  publish                        = true
  environment {
    variables = merge(var.api_environment, { ROUTING_PARAMETER_NAME = aws_ssm_parameter.routing.name })
  }
  tags       = local.default_tags
  depends_on = [aws_iam_role_policy.api, aws_cloudwatch_log_group.api]
}
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}
resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "CloudFrontFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.app.arn
  function_url_auth_type = "AWS_IAM"
}
resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "CloudFrontInvokeViaUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.app.arn
  invoked_via_function_url = true
}
