variable "environment" {
  type        = string
  description = "Deployment environment"
}

variable "project_name" {
  type        = string
  description = "Project name"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Isolated database subnet IDs"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups allowed to connect to Redis"
}

variable "node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.t4g.small"
}

