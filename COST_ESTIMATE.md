# VLE-9 AWS Cost Estimate (`ap-south-1` — Asia Pacific Mumbai)

> **Important:** All estimates below list **standard On-Demand AWS pricing** (assuming no Free Tier credit coverage) queried from the AWS Price List API for region `ap-south-1` on **2026-11-11**.

---

## 1. Account Restriction Discovery & Selected Instance (`ap-south-1`)

During initial provisioning, AWS rejected `t3a.large` with:
`InvalidParameterCombination: The specified instance type is not eligible for Free Tier.`

Inspecting `aws ec2 describe-instance-types --region ap-south-1 --filters "Name=free-tier-eligible,Values=true"` confirmed that this AWS account restricts launches to AWS Free-Plan-eligible instance types:

| Permitted x86_64 Type | vCPU | RAM | Standard List Rate (`ap-south-1`) | Continuous Monthly (730h) | Suitability for Full Stack |
|---|---:|---:|---:|---:|---|
| `t3.micro` / `t8i.micro` | 2 | 1 GiB | \$0.0112 / hr | \$8.18 / mo | Insufficient RAM |
| `t3.small` / `t8i.small` | 2 | 2 GiB | \$0.0224 / hr | \$16.35 / mo | Insufficient RAM |
| `c7i-flex.large` | 2 | 4 GiB | \$0.0848 / hr | \$61.90 / mo | Tight for SonarQube + Minikube + ZAP simultaneously |
| **`m7i-flex.large`** | **2** | **8 GiB** | **\$0.1008 / hr** | **\$73.55 / mo** | **Selected — Only permitted 8 GiB x86_64 type** |

- Steady-state stack RAM usage (Jenkins + SonarQube + Minikube + Prometheus + Alertmanager + Grafana + cAdvisor) is ~5.0–5.5 GiB, peaking at ~7 GiB during Trivy/OWASP ZAP scans.
- `m7i-flex.large` (2 vCPU, 8 GiB RAM, x86_64) is the **only** permitted x86_64 instance type in this account with 8 GiB RAM.

---

## 2. Complete Infrastructure Cost Breakdown (Standard List Rates)

| AWS Resource | Specification | Unit Rate (`ap-south-1`) | Running Hourly Cost | Continuous Monthly (730 hrs) | Cost When EC2 is **STOPPED** |
|---|---|---|---:|---:|---:|
| EC2 Compute | 1 × `m7i-flex.large` (2 vCPU, 8 GiB) | \$0.10075 / hr | \$0.1008 / hr | \$73.55 / mo | **\$0.00 / mo** |
| Public IPv4 Address | 1 × Ephemeral Public IPv4 (no Elastic IP) | \$0.0050 / hr | \$0.0050 / hr | \$3.65 / mo | **\$0.00 / mo** |
| EBS Root Volume | 40 GB `gp3` (3000 IOPS, 125 MB/s baseline) | \$0.0912 / GB-mo | ~\$0.0050 / hr | \$3.65 / mo | **\$3.65 / mo** |
| VPC, Subnet, IGW, SG, IAM | Standard VPC networking & IAM role | \$0.00 | \$0.00 | \$0.00 | **\$0.00** |
| SSM Session Manager | Standard EC2 instance management & port forwarding | \$0.00 | \$0.00 | \$0.00 | **\$0.00** |
| S3 SSM Transfer Bucket | <1 MB ephemeral Ansible transfer objects (1-day expiry) | \$0.025 / GB-mo | ~\$0.00 | <\$0.01 / mo | <\$0.01 / mo |
| NAT Gateway / ALB / EKS | **Explicitly avoided** | — | \$0.00 | \$0.00 | **\$0.00** |
| **Total Standard List Cost** | | | **~\$0.1058 / hr** | **~\$80.85 / mo** (if 24/7) | **~\$3.65 / mo** |

### Realistic Lab Usage Cost (Recommended Stop/Resume Pattern)
- **Tested Stop/Resume Behavior (`i-00a1616bf3dee5989`):** Stopping EC2 transitioned state to `stopped` (`PublicIp: null`), halting compute + IPv4 hourly charges while preserving the 40 GB encrypted `gp3` EBS volume (`vol-06faea913396a3863`); resuming restored SSM `Online` status and auto-started all services on reboot.
- **Active Lab / Demo Time (e.g., 15 hours total this month):**
  - Compute + Ephemeral Public IPv4 (list rate): `15 hrs × $0.1058/hr = $1.59` (may be offset by Free Plan credits if unused, though never assumed)
  - Monthly EBS Storage (40 GB `gp3`): `$3.65`
  - **Estimated Realistic Total for the Month:** **~\$5.24 / month** (if stopping immediately after lab/demo sessions).
