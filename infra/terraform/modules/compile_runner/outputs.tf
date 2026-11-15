output "compile_runner_security_group_id" {
  description = "Security group ID of compile runner nodes"
  value       = aws_security_group.compile_runner.id
}

output "autoscaling_group_name" {
  description = "Auto Scaling Group name for compile fleet"
  value       = aws_autoscaling_group.compile_runner.name
}

output "launch_template_id" {
  description = "Launch template ID for compile runner instances"
  value       = aws_launch_template.compile_runner.id
}

output "iam_role_arn" {
  description = "IAM Role ARN of compile runner instances"
  value       = aws_iam_role.compile_runner.arn
}

