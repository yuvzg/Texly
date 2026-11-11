output "endpoint" {
  value       = aws_db_instance.postgres.endpoint
  description = "RDS connection endpoint"
}

output "address" {
  value       = aws_db_instance.postgres.address
  description = "RDS connection hostname"
}

output "port" {
  value       = aws_db_instance.postgres.port
  description = "RDS connection port"
}

