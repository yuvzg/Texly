provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source       = "./modules/vpc"
  vpc_cidr     = var.vpc_cidr
  environment  = var.environment
  project_name = var.project_name
}

module "security_groups" {
  source       = "./modules/security_groups"
  vpc_id       = module.vpc.vpc_id
  environment  = var.environment
  project_name = var.project_name
}

module "rds" {
  source             = "./modules/rds"
  environment        = var.environment
  project_name       = var.project_name
  subnet_ids         = module.vpc.isolated_subnet_ids
  security_group_ids = [module.security_groups.rds_security_group_id]
}

module "redis" {
  source             = "./modules/redis"
  environment        = var.environment
  project_name       = var.project_name
  subnet_ids         = module.vpc.isolated_subnet_ids
  security_group_ids = [module.security_groups.redis_security_group_id]
}

module "ecs" {
  source             = "./modules/ecs"
  environment        = var.environment
  project_name       = var.project_name
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.security_groups.ecs_tasks_security_group_id]
}

module "compile_runner" {
  source                  = "./modules/compile_runner"
  environment             = var.environment
  project_name            = var.project_name
  vpc_id                  = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnet_ids
  redis_security_group_id = module.security_groups.redis_security_group_id
  instance_type           = var.environment == "production" ? "c6i.xlarge" : "t3.xlarge"
  min_size                = var.environment == "production" ? 2 : 1
  max_size                = 10
  desired_capacity        = var.environment == "production" ? 2 : 1
}


