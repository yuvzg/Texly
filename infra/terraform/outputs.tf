output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "VPC ID"
}

output "rds_endpoint" {
  value       = module.rds.endpoint
  description = "RDS connection endpoint"
}

output "redis_endpoint" {
  value       = module.redis.primary_endpoint_address
  description = "Redis cluster primary endpoint"
}

output "ecs_cluster_name" {
  value       = module.ecs.cluster_name
  description = "ECS cluster name"
}

output "compile_runner_security_group_id" {
  value       = module.compile_runner.compile_runner_security_group_id
  description = "Compile runner security group ID"
}

output "compile_runner_asg_name" {
  value       = module.compile_runner.autoscaling_group_name
  description = "Compile runner Auto Scaling Group name"
}


