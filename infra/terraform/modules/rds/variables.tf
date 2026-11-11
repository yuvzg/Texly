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
  description = "Security groups allowed to connect to RDS"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t4g.medium"
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage in GB"
  default     = 20
}

variable "max_allocated_storage" {
  type        = number
  description = "Autoscaling max storage in GB"
  default     = 100
}

variable "database_name" {
  type        = string
  description = "Initial database name"
  default     = "texly"
}

