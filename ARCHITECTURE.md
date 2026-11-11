# VLE-9 Secure DevSecOps Architecture — SecureCare Healthcare System

## 1. System Overview

This project implements an independent, end-to-end DevSecOps pipeline for **SecureCare**, a synthetic healthcare records and outpatient appointment application running on hardened AWS infrastructure in `ap-south-1`.

```mermaid
flowchart LR
    Dev["Developer"] -->|"git push"| GH["GitHub Repository"]
    GH -->|"POST /github-webhook/ (GitHub CIDRs only)"| SG["AWS Security Group (TCP 80 Restricted)"]
    SG --> Nginx["Nginx Webhook Proxy (Denies All Other Paths)"]
    Nginx -->|"127.0.0.1:8080"| Jenkins["Jenkins LTS CI/CD"]

    Jenkins -->|"1-3. Checkout & Tests"| AppTests["Node.js Security & RBAC Tests"]
    Jenkins -->|"4. SAST"| Sonar["SonarQube Community (127.0.0.1:9000)"]
    Jenkins -->|"5. Build"| Docker["Multi-Stage Alpine Image (UID 10001)"]
    Jenkins -->|"6. Container Scan"| Trivy["Trivy Vulnerability Scanner"]
    Jenkins -->|"7. Enforce Gates"| Gates{"Quality & CVE Gates"}
    Gates -->|"Pass -> 8. Deploy"| K8s["Minikube Kubernetes (Restricted PSS + RBAC + Secrets)"]
    K8s -->|"9. DAST"| ZAP["OWASP ZAP Baseline Scan"]
    K8s -->|"10. /metrics"| Prom["Prometheus (127.0.0.1:9090)"]
    Host["Node Exporter + cAdvisor"] --> Prom
    Prom --> AM["Alertmanager (127.0.0.1:9093)"]
    Prom --> Graf["Grafana Dashboards (127.0.0.1:3000)"]

    Admin["Admin / Faculty Demo"] -->|"AWS SSM Port Forwarding (No SSH 22)"| Jenkins
    Admin -->|"AWS SSM Port Forwarding"| Sonar
    Admin -->|"AWS SSM Port Forwarding"| Graf
    Admin -->|"AWS SSM Port Forwarding"| K8s
```

---

## 2. Security-in-Depth Layers

| Layer | Security Controls Implemented |
|---|---|
| **Cloud & Network** | Isolated VPC (`10.90.0.0/16`); **SSH port 22 closed**; **zero `0.0.0.0/0` ingress**; TCP 80 restricted to GitHub official webhook CIDRs; Nginx blocks every URL except `POST /github-webhook/`; IMDSv2 enforced with `hop_limit = 1`; encrypted 40 GB `gp3` EBS volume; least-privilege IAM instance profile for AWS SSM only. |
| **Access & Admin** | All management and UI access (Jenkins, SonarQube, Grafana, Prometheus, Alertmanager, SecureCare) bound to `127.0.0.1` and accessed exclusively via encrypted AWS SSM Session Manager port forwarding. |
| **Application (SecureCare)** | 100% synthetic demo data (zero real PHI); runtime-only secrets via environment/Kubernetes Secret; `scrypt` password hashing with `timingSafeEqual`; HMAC-SHA256 signed `HttpOnly; SameSite=Strict` cookies; strict input validation & XSS prevention; `helmet` CSP/X-Frame-Options/nosniff/Permissions-Policy; zero PII/secrets in structured JSON logs. |
| **SAST & Container** | SonarQube automated static code analysis + Quality Gate check; multi-stage `node:22-alpine` Dockerfile with `apk upgrade`, non-root UID `10001`, `.dockerignore`; Trivy image vulnerability scan enforcing zero fixable HIGH/CRITICAL CVEs. |
| **Kubernetes (Minikube)** | Dedicated `securecare` namespace enforcing Kubernetes **Restricted** Pod Security Standard; least-privilege `ServiceAccount` + `Role` + `RoleBinding`; `automountServiceAccountToken: false`; `readOnlyRootFilesystem: true`; `capabilities.drop: ["ALL"]`; CPU/memory limits; readiness & liveness probes. |
| **DAST & Observability** | OWASP ZAP baseline scan against deployed Kubernetes service; Prometheus + Node Exporter + cAdvisor + Alertmanager + Grafana monitoring host resources, container health, HTTP traffic, failed logins, and 401/403 unauthorized access spikes. |

