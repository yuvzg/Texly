variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where compile nodes reside"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for compile fleet (private or isolated subnets)"
  type        = list(string)
}

variable "redis_security_group_id" {
  description = "Redis security group ID for egress authorization"
  type        = string
}

variable "ami_id" {
  description = "AMI ID for compile nodes (pre-baked with Docker Engine and TeX Live cache)"
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type for compile runner (e.g. c6i.xlarge, t3.xlarge)"
  type        = string
  default     = "c6i.xlarge"
}

variable "min_size" {
  description = "Minimum number of compile runner instances"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of compile runner instances"
  type        = number
  default     = 10
}

variable "desired_capacity" {
  description = "Desired number of compile runner instances"
  type        = number
  default     = 2
}

variable "work_volume_size_gb" {
  description = "Size in GB of the dedicated compile work EBS volume"
  type        = number
  default     = 50
}

variable "sandbox_image" {
  description = "Docker image digest or tag for LaTeX sandbox container"
  type        = string
  default     = "texly/texlive:dev"
}

variable "concurrency" {
  description = "Concurrent compile jobs per compile runner node"
  type        = number
  default     = 3
}

variable "redis_url" {
  description = "Redis connection URL for compile queue"
  type        = string
  default     = "redis://localhost:6379"
}
