output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}

output "public_subnet_ids" {
  value       = [aws_subnet.public_a.id, aws_subnet.public_b.id]
  description = "Public subnet IDs"
}

output "private_subnet_ids" {
  value       = [aws_subnet.private_app_a.id, aws_subnet.private_app_b.id]
  description = "Private app subnet IDs"
}

output "isolated_subnet_ids" {
  value       = [aws_subnet.isolated_db_a.id, aws_subnet.isolated_db_b.id]
  description = "Isolated database subnet IDs"
}

