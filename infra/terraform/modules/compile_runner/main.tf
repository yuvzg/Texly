# Data source for latest Amazon Linux 2023 or Ubuntu AMI if not explicitly provided
data "aws_ami" "ubuntu" {
  count       = var.ami_id == "" ? 1 : 0
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  ami_id = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu[0].id
}

# 1. Security Group: 0 Inbound rules, egress to Redis (6379) and HTTPS (443) only
resource "aws_security_group" "compile_runner" {
  name        = "${var.project_name}-${var.environment}-compile-runner-sg"
  description = "Controls traffic for isolated compile runner instances. Zero inbound access."
  vpc_id      = var.vpc_id

  # Strict zero inbound access
  # No ingress blocks defined

  # Egress 1: Redis for BullMQ queue polling
  egress {
    description     = "Redis queue access"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.redis_security_group_id]
  }

  # Egress 2: HTTPS for SSM, CloudWatch, and R2/S3 presigned URLs
  egress {
    description = "Outbound HTTPS for AWS services and R2 presigned URLs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-compile-runner-sg"
    Environment = var.environment
  }
}

# Allow compile runner nodes to communicate with Redis on port 6379
resource "aws_security_group_rule" "redis_ingress_from_runner" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.compile_runner.id
  security_group_id        = var.redis_security_group_id
  description              = "Redis access from compile runner nodes"
}

# 2. IAM Role & Instance Profile (No DB, No S3 bucket credentials, only SSM and CloudWatch)
resource "aws_iam_role" "compile_runner" {
  name = "${var.project_name}-${var.environment}-compile-runner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
  }
}

# Attach SSM policy for secure session management (no SSH keypairs needed)
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.compile_runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Attach CloudWatch agent policy for metrics and logs
resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.compile_runner.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# Lifecycle hook permission policy for graceful draining
resource "aws_iam_policy" "lifecycle_drain" {
  name        = "${var.project_name}-${var.environment}-compile-runner-lifecycle-policy"
  description = "Allows compile runner instances to complete Auto Scaling lifecycle actions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "autoscaling:CompleteLifecycleAction",
          "autoscaling:RecordLifecycleActionHeartbeat"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lifecycle_drain" {
  role       = aws_iam_role.compile_runner.name
  policy_arn = aws_iam_policy.lifecycle_drain.arn
}

resource "aws_iam_instance_profile" "compile_runner" {
  name = "${var.project_name}-${var.environment}-compile-runner-profile"
  role = aws_iam_role.compile_runner.name
}

# 3. EC2 Launch Template
resource "aws_launch_template" "compile_runner" {
  name_prefix   = "${var.project_name}-${var.environment}-runner-"
  image_id      = local.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.compile_runner.arn
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.compile_runner.id]
    delete_on_termination       = true
  }

  # Root volume: 20 GB gp3
  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  # Dedicated compilation work volume: 50 GB gp3 for /var/compile
  block_device_mappings {
    device_name = "/dev/xvdf"
    ebs {
      volume_size           = var.work_volume_size_gb
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      delete_on_termination = true
      encrypted             = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    redis_url     = var.redis_url
    concurrency   = var.concurrency
    sandbox_image = var.sandbox_image
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.project_name}-${var.environment}-compile-runner"
      Environment = var.environment
      Role        = "compile-runner"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 4. Auto Scaling Group
resource "aws_autoscaling_group" "compile_runner" {
  name_prefix         = "${var.project_name}-${var.environment}-runner-asg-"
  vpc_zone_identifier = var.subnet_ids

  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity

  health_check_type         = "EC2"
  health_check_grace_period = 300
  default_cooldown          = 180

  launch_template {
    id      = aws_launch_template.compile_runner.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_capacity]
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-${var.environment}-compile-runner"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
}

# 5. Lifecycle Hook for Graceful Scale-in Draining
resource "aws_autoscaling_lifecycle_hook" "terminating" {
  name                   = "${var.project_name}-${var.environment}-compile-runner-terminating-hook"
  autoscaling_group_name = aws_autoscaling_group.compile_runner.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
  default_result         = "CONTINUE"
  heartbeat_timeout      = 120
}

# 6. Scaling Policy: Target-tracking on compile_queue_waiting_per_slot (target: 1.0)
resource "aws_autoscaling_policy" "queue_depth_tracking" {
  name                   = "${var.project_name}-${var.environment}-compile-queue-scaling"
  autoscaling_group_name = aws_autoscaling_group.compile_runner.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    customized_metric_specification {
      metrics {
        label = "CompileQueueWaitingPerSlot"
        id    = "m1"
        metric_stat {
          metric {
            metric_name = "compile_queue_waiting_per_slot"
            namespace   = "Texly/CompileFleet"
          }
          stat = "Average"
        }
        return_data = true
      }
    }
    target_value     = 1.0
    disable_scale_in = false
  }
}

# 7. CloudWatch Alarms for Operational Health
resource "aws_cloudwatch_metric_alarm" "high_queue_depth" {
  alarm_name          = "${var.project_name}-${var.environment}-compile-queue-depth-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "compile_queue_waiting_per_slot"
  namespace           = "Texly/CompileFleet"
  period              = 60
  statistic           = "Average"
  threshold           = 2.0
  alarm_description   = "Compile queue depth per slot exceeds 2 for 2 minutes"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "high_compile_duration" {
  alarm_name          = "${var.project_name}-${var.environment}-compile-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "compile_duration_p95"
  namespace           = "Texly/CompileFleet"
  period              = 300
  statistic           = "Average"
  threshold           = 60000 # 60 seconds
  alarm_description   = "Compilation duration p95 exceeds 60 seconds"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "high_disk_usage" {
  alarm_name          = "${var.project_name}-${var.environment}-compile-disk-usage-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "used_percent"
  namespace           = "Texly/CompileFleet"
  period              = 300
  statistic           = "Average"
  threshold           = 85.0
  alarm_description   = "Work directory /var/compile disk usage exceeds 85%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.compile_runner.name
  }

  tags = {
    Environment = var.environment
  }
}
