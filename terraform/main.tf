data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "ubuntu_2404_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

# ---------------------------------------------------------------------------
# Isolated VLE-9 VPC Networking (Zero Cost)
# ---------------------------------------------------------------------------
resource "aws_vpc" "vle9" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "vle9-vpc"
  }
}

resource "aws_internet_gateway" "vle9" {
  vpc_id = aws_vpc.vle9.id

  tags = {
    Name = "vle9-igw"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.vle9.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true # Ephemeral IPv4 only while running; $0/hr when stopped

  tags = {
    Name = "vle9-public-subnet"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vle9.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.vle9.id
  }

  tags = {
    Name = "vle9-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------
# Hardened Security Group (No SSH Port 22, No 0.0.0.0/0 Ingress)
# Admin, Jenkins UI, SonarQube, Grafana, Prometheus, and SecureCare use SSM
# ---------------------------------------------------------------------------
resource "aws_security_group" "devsecops_sg" {
  name        = "vle9-devsecops-sg"
  description = "Restricted SG for VLE-9: no SSH 22, no 0.0.0.0/0 ingress; GitHub webhook CIDRs only on TCP 80"
  vpc_id      = aws_vpc.vle9.id

  tags = {
    Name = "vle9-devsecops-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "github_webhook_http" {
  for_each = toset(var.github_webhook_ipv4_cidrs)

  security_group_id = aws_security_group.devsecops_sg.id
  description       = "GitHub webhook CIDR (${each.value}) to Nginx /github-webhook/ endpoint only"
  cidr_ipv4         = each.value
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "outbound_all" {
  security_group_id = aws_security_group.devsecops_sg.id
  description       = "Allow outbound HTTPS/HTTP/DNS/NTP for OS packages, Docker images, Trivy DB, and SSM"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# Private Encrypted S3 Bucket for Ephemeral Ansible AWS-SSM Transfers
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "ssm_transfer" {
  bucket        = "vle9-ssm-transfer-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Name = "vle9-ssm-transfer"
  }
}

resource "aws_s3_bucket_public_access_block" "ssm_transfer" {
  bucket                  = aws_s3_bucket.ssm_transfer.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ssm_transfer" {
  bucket = aws_s3_bucket.ssm_transfer.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "ssm_transfer" {
  bucket = aws_s3_bucket.ssm_transfer.id

  rule {
    id     = "expire-ephemeral-ansible-ssm-objects"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }
  }
}

resource "aws_s3_bucket_policy" "ssm_transfer_tls_only" {
  bucket = aws_s3_bucket.ssm_transfer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.ssm_transfer.arn,
          "${aws_s3_bucket.ssm_transfer.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Least-Privilege IAM Role & Instance Profile for SSM
# ---------------------------------------------------------------------------
resource "aws_iam_role" "ec2_ssm_role" {
  name = "vle9-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEC2AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_managed_core" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "ssm_s3_transfer_scoped" {
  name = "vle9-ssm-s3-transfer-scoped"
  role = aws_iam_role.ec2_ssm_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowScopedSSMTransferBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.ssm_transfer.arn,
          "${aws_s3_bucket.ssm_transfer.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_ssm_profile" {
  name = "vle9-ec2-ssm-profile"
  role = aws_iam_role.ec2_ssm_role.name
}

# ---------------------------------------------------------------------------
# Single Hardened EC2 Instance (t3a.large, 8 GiB RAM, Ubuntu 24.04 LTS x86_64)
# ---------------------------------------------------------------------------
resource "aws_instance" "devsecops_server" {
  ami                         = data.aws_ssm_parameter.ubuntu_2404_ami.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.devsecops_sg.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2_ssm_profile.name
  associate_public_ip_address = true
  ebs_optimized               = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # Enforce IMDSv2
    http_put_response_hop_limit = 1          # Block container access to host IAM metadata
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name = "vle9-devsecops-root-ebs"
    }
  }

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    hostnamectl set-hostname vle9-devsecops

    # Configure 4 GiB swapfile cushion for SonarQube + Minikube + ZAP spikes
    if [ ! -f /swapfile ]; then
      fallocate -l 4G /swapfile
      chmod 600 /swapfile
      mkswap /swapfile
      swapon /swapfile
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi

    # Required kernel parameters for SonarQube (Elasticsearch) & containers
    printf "vm.max_map_count=262144\nfs.file-max=65536\nvm.swappiness=10\n" > /etc/sysctl.d/99-vle9-devsecops.conf
    sysctl --system

    # Ensure SSM agent and Python3 are ready for Ansible over SSM
    systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service || true
    apt-get update -y
    apt-get install -y python3 python3-apt ca-certificates curl
  EOF

  tags = {
    Name = "vle9-devsecops-server"
  }
}
