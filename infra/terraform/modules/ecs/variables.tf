variable "environment" {
  type        = string
  description = "Deployment environment"
}

variable "project_name" {
  type        = string
  description = "Project name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for task execution"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security group IDs for ECS tasks"
}

