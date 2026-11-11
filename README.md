# VLE-9: Secure DevSecOps Implementation in Healthcare Systems (`SecureCare`)

Independent end-to-end DevSecOps implementation featuring a hardened synthetic healthcare web application (**SecureCare**) automated across **Terraform**, **Ansible**, **Jenkins**, **SonarQube**, **Docker**, **Trivy**, **Kubernetes (Minikube)**, **OWASP ZAP**, **Prometheus**, **Alertmanager**, and **Grafana** on AWS (`ap-south-1`).

---

## Repository Structure

```text
.
├── ansible/        # Automated host & tool provisioning over AWS SSM
├── app/            # SecureCare Node.js/Express healthcare application & unit tests
├── docker/         # Multi-stage non-root Alpine Dockerfile
├── docs/           # Faculty demo guide, Viva prep, Stop/Resume instructions
├── grafana/        # Provisioned Prometheus datasource & SecureCare overview dashboard
├── jenkins/        # 10-stage declarative DevSecOps Jenkinsfile
├── kubernetes/     # Restricted PSS Namespace, RBAC, ConfigMap, Deployment, Service
├── monitoring/     # Docker Compose stack for Prometheus, Alertmanager, cAdvisor, Grafana
├── prometheus/     # Scrape configs and security/infrastructure alert rules
├── screenshots/    # Genuine captured evidence screenshots
├── scripts/        # SSM port-forwarding and webhook sync helpers
├── sonarqube/      # SonarQube Community Compose stack & project properties
├── terraform/      # Isolated VPC, IAM SSM profile, encrypted EBS, t3a.large EC2
├── trivy/          # Container vulnerability policy & scan docs
└── zap/            # OWASP ZAP baseline DAST instructions
```

---

## Quick Documentation Links

- [Architecture Overview](ARCHITECTURE.md)
- [AWS Cost Estimate](COST_ESTIMATE.md)
- [Execution Progress Tracker](VLE9_PROGRESS.md)
- [Stop & Resume Guide](docs/STOP_AND_RESUME.md)
- [Faculty Demo & Viva Guide](docs/FACULTY_DEMO.md)
- [Security Report](SECURITY_REPORT.md)

