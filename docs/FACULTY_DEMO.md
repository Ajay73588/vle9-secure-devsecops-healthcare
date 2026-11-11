# VLE-9 Faculty Demonstration & Screen-Recording Guide

> **Prerequisites Before Recording:** Ensure the EC2 instance (`i-00a1616bf3dee5989`) is running and SSM port-forwarding tunnels are open via `.\scripts\start-ssm-tunnels.ps1` (see `docs/STOP_AND_RESUME.md`).

---

## Step-by-Step Recording Workflow (9 Checkpoints)

### 1. SecureCare Healthcare Application (`http://127.0.0.1:8081`)
- Show the **Sign-In Portal** (RBAC protected, zero hardcoded credentials in frontend JS).
- Log in as `dr.sharma` (Doctor role) or `admin.securecare` (Admin role).
- Show the **KPI Dashboard** (Synthetic Patients, Outpatient Appointments, Active Departments, Session Role).
- Demonstrate creating a **new synthetic patient** (e.g. `Diya Sen (Synthetic)`) and triggering an **input validation rejection** (e.g. entering `<script>` tags shows safe validation error `400`).
- Highlight the **100% Synthetic Data Only (Zero Real PHI)** badge and masked contact numbers.

### 2. Jenkins Successful 10-Stage Pipeline (`http://127.0.0.1:8080`)
- Open the `vle9-securecare-pipeline` job in Jenkins.
- Show the **Stage View** displaying all 10 green stages:
  1. Checkout Source Code
  2. Install Dependencies
  3. Run Application Tests
  4. Run SonarQube SAST
  5. Build Docker Image
  6. Run Trivy Image Scan
  7. Apply Security Gates
  8. Deploy to Kubernetes
  9. Run OWASP ZAP Baseline Scan
  10. Verify Application Health & Telemetry
- Briefly open Console Output showing real test passes, Quality Gate `OK`, Trivy `0` fixable Critical/High CVEs, and K8s rollout success.

### 3. SonarQube Static Code Analysis (`http://127.0.0.1:9000`)
- Open project **`vle9-securecare`** in SonarQube.
- Point out **Quality Gate: Passed**, `0` Bugs, `0` Vulnerabilities, `0` Security Hotspots (or reviewed status), and clean Measures summary.

### 4. Trivy Container Vulnerability Scan
- Show the captured Trivy output (`/opt/vle9/reports/trivy/latest-trivy-table.txt` or Jenkins build log / `screenshots/04-trivy-scan.png`).
- Explain how multi-stage `node:22-alpine` + `apk upgrade --no-cache` + non-root `USER 10001` minimizes attack surface and enforces zero fixable `HIGH`/`CRITICAL` CVEs.

### 5. Kubernetes Deployment on Minikube
- Show terminal output (or `screenshots/05-kubernetes-deployment.png`) verifying:
  - Namespace `securecare` enforcing Pod Security Standard `restricted`
  - `ServiceAccount` (`securecare-sa`), `Role`, and `RoleBinding`
  - `ConfigMap` and runtime `Secret`
  - `Deployment/securecare` (`2/2` Ready pods) and `Service/securecare-svc` (`NodePort 30080`)
  - `kubectl get pods,svc,endpoints,sa,roles,rolebindings -n securecare`

### 6. OWASP ZAP DAST Security Report
- Open the captured OWASP ZAP HTML report (`screenshots/06-owasp-zap-report.png` or `zap-report.html`).
- Point out `0` High-risk alerts and verified HTTP security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`).

### 7. Prometheus Targets & Alert Rules (`http://127.0.0.1:9090`)
- Open `Status -> Targets` (`http://127.0.0.1:9090/targets`) showing `securecare-app`, `node-exporter`, `cadvisor`, `alertmanager`, and `prometheus` all **UP**.
- Open `Alerts` (`http://127.0.0.1:9090/alerts`) showing the 6 configured availability, infrastructure, and security alert rules (`SecureCareAppDown`, `HighHostCPUUsage`, `HighHostMemoryUsage`, `HighHostDiskUsage`, `SecureCareFailedLoginSpike`, `SecureCareUnauthorizedAccessSpike`).

### 8. Grafana Monitoring & Security Dashboard (`http://127.0.0.1:3000`)
- Open the **`VLE-9 SecureCare DevSecOps & Security Overview`** dashboard.
- Show real live metrics: Application Availability (`UP`), Host CPU/Memory/Disk gauges, HTTP Request Rate & Latency, Security Telemetry (Logins & `401`/`403` events), and Container Memory Working Set.

### 9. GitHub Repository & Webhook Integration
- Open `https://github.com/Ajay73588/vle9-secure-devsecops-healthcare` in the browser.
- Show clean repository structure (`terraform/`, `ansible/`, `app/`, `docker/`, `kubernetes/`, `jenkins/`, `prometheus/`, `grafana/`, `docs/`, `screenshots/`), `.gitignore` excluding secrets/state, and **Settings -> Webhooks** showing green `200 OK` recent deliveries.

---

## Saved Evidence Screenshots
All genuine screenshots are stored in `screenshots/`:
- `01-securecare-app.png`
- `02-jenkins-pipeline.png`
- `03-sonarqube-analysis.png`
- `04-trivy-scan.png`
- `05-kubernetes-deployment.png`
- `06-owasp-zap-report.png`
- `07-prometheus-targets-alerts.png`
- `08-grafana-dashboard.png`
- `09-github-repo-webhook.png`
