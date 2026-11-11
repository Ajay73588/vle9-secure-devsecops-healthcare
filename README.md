# VLE-9: Secure DevSecOps Implementation in Healthcare Systems (`SecureCare`)

Independent end-to-end DevSecOps implementation featuring a hardened synthetic healthcare web application (**SecureCare**) automated across **Terraform**, **Ansible**, **Jenkins**, **SonarQube**, **Docker**, **Trivy**, **Kubernetes (Minikube)**, **OWASP ZAP**, **Prometheus**, **Alertmanager**, and **Grafana** on AWS (`ap-south-1`).

---

## Live Verification Snapshot (Jenkins Build `#4`)

- **AWS Infrastructure (`ap-south-1`):** 1 × `m7i-flex.large` (`2 vCPU, 8 GiB RAM`) EC2 instance (`i-00a1616bf3dee5989`), 40 GB encrypted `gp3` EBS, **SSH port `22` closed**, zero `0.0.0.0/0` ingress, IMDSv2 enforced (`hop_limit = 1`), all admin UIs strictly behind **AWS SSM Session Manager** port forwarding.
- **GitHub Webhook CI/CD Trigger:** Webhook `#710422026` on `Ajay73588/vle9-secure-devsecops-healthcare` (`main`) -> **Jenkins Build `#4`** (`Result: SUCCESS`, all 10 declarative stages green).
- **SonarQube SAST (`vle9-securecare`):** Quality Gate **`OK` (`Passed`)** — `0` Bugs, `0` Vulnerabilities, `0` Security Hotspots, `0` Code Smells, `94.6%` new-code coverage.
- **Trivy Scan (`securecare:4`):** **`0` Vulnerabilities** across Alpine `3.24.4` (`19` OS pkgs) and `49` runtime Node.js packages; **`0`** Dockerfile/Kubernetes/Secret misconfigurations (6 Terraform lab architectural checks documented honestly in [SECURITY_REPORT.md](SECURITY_REPORT.md)).
- **Kubernetes Security (Minikube `v1.37.0`):** `namespace/securecare` enforcing **`restricted`** Pod Security Standard, `2/2` non-root pods (`UID 10001`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`, `automountServiceAccountToken: false`), least-privilege `ServiceAccount`/`Role`/`RoleBinding`.
- **OWASP ZAP DAST (`2.17.0`):** **`0` High**, **`0` Medium**, `1` Low (`COEP Header Missing` [90004]), `4` Informational.
- **Monitoring & Alerting:** Prometheus (`5/5` targets `up`), Alertmanager (tested live `SecureCareUnauthorizedAccessSpike` firing to `/var/log/vle9-alerts.log`), Node Exporter, cAdvisor, and Grafana `VLE-9 SecureCare DevSecOps & Security Overview` dashboard.

---

## Repository Structure

```text
.
├── ansible/        # Automated 7-role host & tool provisioning over AWS SSM
├── app/            # SecureCare Node.js/Express healthcare application & unit tests
├── docker/         # Multi-stage non-root Alpine Dockerfile (UID 10001, npm stripped)
├── docs/           # Faculty demo guide, Viva prep, Safe Stop & Resume workflow
├── grafana/        # Provisioned Prometheus datasource & SecureCare overview dashboard
├── jenkins/        # 10-stage declarative DevSecOps Jenkinsfile
├── kubernetes/     # Restricted PSS Namespace, RBAC, ConfigMap, Deployment, Service
├── monitoring/     # Docker Compose stack for Prometheus, Alertmanager, cAdvisor, Grafana
├── prometheus/     # Scrape configs and 6 availability, host & security alert rules
├── screenshots/    # Genuine screenshots captured from live services & scan outputs
├── scripts/        # SSM port-forwarding and GitHub webhook sync PowerShell helpers
├── sonarqube/      # SonarQube Community Compose stack & LCOV project properties
├── terraform/      # Isolated VPC, IAM SSM profile, encrypted EBS, m7i-flex.large EC2
├── trivy/          # Container vulnerability policy & scan gate documentation
└── zap/            # OWASP ZAP baseline DAST instructions
```

---

## Quick Access via AWS SSM Port Forwarding

All dashboards bind strictly to `127.0.0.1` on the EC2 host. From PowerShell in the project root:

```powershell
# Ensure EC2 instance i-00a1616bf3dee5989 is running first, then open encrypted tunnels:
.\scripts\start-ssm-tunnels.ps1
```

If any default local port (e.g., `8080` or `3000`) is occupied by another service on Windows, [start-ssm-tunnels.ps1](scripts/start-ssm-tunnels.ps1) automatically maps an alternate local port (`18080`, `13000`, etc.) and prints the exact clickable URLs.

---

## Documentation & Submission Artifacts

- [Architecture Overview](ARCHITECTURE.md)
- [Execution Progress Tracker](VLE9_PROGRESS.md)
- [AWS Cost Estimate (No Free Tier Assumed)](COST_ESTIMATE.md)
- [End-to-End Test & Verification Results](TEST_RESULTS.md)
- [Security Assessment & Remediation Report](SECURITY_REPORT.md)
- [Faculty Demonstration & Recording Guide](docs/FACULTY_DEMO.md)
- [Viva Preparation Q&A Guide](docs/VIVA_QUESTIONS.md)
- [Safe Stop & Resume Operations Guide](docs/STOP_AND_RESUME.md)
