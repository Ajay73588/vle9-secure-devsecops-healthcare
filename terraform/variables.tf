variable "aws_region" {
  description = "AWS region for VLE-9 isolated infrastructure"
  type        = string
  default     = "ap-south-1"
}

variable "availability_zone" {
  description = "Availability Zone inside ap-south-1"
  type        = string
  default     = "ap-south-1a"
}

variable "vpc_cidr" {
  description = "CIDR block for isolated VLE-9 VPC"
  type        = string
  default     = "10.90.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for VLE-9 public subnet"
  type        = string
  default     = "10.90.1.0/24"
}

variable "instance_type" {
  description = "Cheapest permitted x86_64 instance in this account with 8 GiB RAM (free-tier-eligible=true policy)"
  type        = string
  default     = "m7i-flex.large"
}

variable "root_volume_size_gb" {
  description = "Encrypted gp3 root EBS volume size in GiB"
  type        = number
  default     = 40
}

variable "github_webhook_ipv4_cidrs" {
  description = "Official GitHub webhook source IPv4 CIDRs (from https://api.github.com/meta) allowed to reach Nginx /github-webhook/"
  type        = list(string)
  default = [
    "9.234.106.48/28",
    "9.234.98.160/28",
    "9.234.98.176/28",
    "192.30.252.0/22",
    "185.199.108.0/22",
    "140.82.112.0/20",
    "143.55.64.0/20"
  ]
}

