output "vpc_id" {
  description = "Isolated VLE-9 VPC ID"
  value       = aws_vpc.vle9.id
}

output "subnet_id" {
  description = "VLE-9 public subnet ID"
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "Restricted security group ID (no SSH 22, no 0.0.0.0/0 ingress)"
  value       = aws_security_group.devsecops_sg.id
}

output "instance_id" {
  description = "EC2 instance ID for AWS SSM access and Ansible inventory"
  value       = aws_instance.devsecops_server.id
}

output "instance_type" {
  description = "Provisioned EC2 instance type"
  value       = aws_instance.devsecops_server.instance_type
}

output "instance_public_ip" {
  description = "Ephemeral public IPv4 used exclusively by GitHub webhook delivery to /github-webhook/"
  value       = aws_instance.devsecops_server.public_ip
}

output "instance_private_ip" {
  description = "Private IPv4 inside VLE-9 VPC"
  value       = aws_instance.devsecops_server.private_ip
}

output "ssm_transfer_bucket" {
  description = "Private encrypted S3 bucket used by Ansible aws_ssm connection plugin"
  value       = aws_s3_bucket.ssm_transfer.bucket
}

output "github_webhook_url" {
  description = "GitHub webhook endpoint URL proxied safely by Nginx to Jenkins /github-webhook/ only"
  value       = "http://${aws_instance.devsecops_server.public_ip}/github-webhook/"
}

output "ami_id" {
  description = "Ubuntu 24.04 LTS x86_64 AMI ID resolved via AWS SSM Parameter Store"
  value       = nonsensitive(data.aws_ssm_parameter.ubuntu_2404_ami.value)
}
