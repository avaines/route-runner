resource "aws_sns_topic" "alerts" {
  name = "${local.resource_prefix}-alerts"
  tags = local.default_tags
}
resource "aws_sns_topic_subscription" "alerts" {
  count     = var.alert_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_cloudwatch_metric_alarm" "api" {
  for_each            = toset(["Errors", "Throttles"])
  alarm_name          = "${local.resource_prefix}-${lower(each.key)}"
  namespace           = "AWS/Lambda"
  metric_name         = each.key
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = local.default_tags
}
