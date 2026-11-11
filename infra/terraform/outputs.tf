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

