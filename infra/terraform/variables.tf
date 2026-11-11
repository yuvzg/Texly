variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Target deployment environment (staging, production)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name prefix for tags and resources"
  type        = string
  default     = "texly"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

