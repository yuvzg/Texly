terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  # Production state backend: S3 + DynamoDB state locking
  # Run `terraform init -backend-config=...` or migrate when remote bucket is created
  backend "s3" {
    bucket         = "texly-terraform-state"
    key            = "environments/production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "texly-terraform-locks"
  }
}

