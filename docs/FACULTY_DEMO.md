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

### 2. Jenkins Successful 10-Stage Pipeline (`http://127.0.0.1:8080` or mapped local SSM port)
- Open the `vle9-securecare-pipeline` job in Jenkins.
- Click **Full Stage View** to display Build `#4` with all 10 green stages (and optionally point out Build `#3` stopping cleanly at Stage 7 before remediation):
  1. Checkout Source Code
  2. Install Dependencies
  3. Run Application Tests
  4. Run SonarQube SAST
  5. Build Docker Image
  6. Run Trivy FS & Image Scan
  7. Apply Security Gates
  8. Deploy to Kubernetes
  9. Run OWASP ZAP Baseline Scan
  10. Verify Application Health & Telemetry
- Briefly open Console Output showing real test passes, Quality Gate `OK`, Trivy `0` fixable Critical/High CVEs, and K8s rollout success.

### 3. SonarQube Static Code Analysis (`http://127.0.0.1:9000`)
- Open project **`vle9-securecare`** (`SecureCare Healthcare Portal (VLE-9)`) in SonarQube.
- Point out **Quality Gate: Passed**, `0` Bugs, `0` Vulnerabilities, `0` Security Hotspots, `0` Code Smells, and `94.6%` New Code Coverage.

### 4. Trivy Container & Repo Vulnerability Scan
- Show the captured Trivy output (`screenshots/04-trivy-scan.png` or `/opt/vle9/reports/trivy/latest-trivy-table.txt`).
- Point out **`0` Vulnerabilities** across `alpine 3.24.4` (19 OS packages) and all 49 Node.js production packages, **`0` Dockerfile/Kubernetes/Secret** findings, and note the 6 Terraform architectural items honestly documented in `SECURITY_REPORT.md`.

### 5. Kubernetes Deployment on Minikube
- Show terminal output (`screenshots/05-kubernetes-deployment.png`) verifying:
  - Namespace `securecare` enforcing Pod Security Standard `restricted`
  - `ServiceAccount` (`securecare-sa`, `automountServiceAccountToken: false`), `Role`, and `RoleBinding`
  - `kubectl auth can-i` narrow read-only permissions (denies listing secrets or cross-namespace pods)
  - `Deployment/securecare` (`2/2` Ready pods) and `Service/securecare-svc` (`NodePort 30080`)

### 6. OWASP ZAP DAST Security Report
- Open the captured OWASP ZAP HTML report (`screenshots/06-owasp-zap-report.png` or `/opt/vle9/reports/zap/latest-zap-report.html`).
- Point out **`0` High** and **`0` Medium** alerts (`1` Low `COEP Header Missing`, `4` Informational) alongside verified security headers (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`).

### 7. Prometheus Targets & Alert Rules (`http://127.0.0.1:9090`)
- Open `Status -> Targets` (`http://127.0.0.1:9090/targets`) showing `securecare-app`, `node-exporter`, `cadvisor`, `alertmanager`, and `prometheus` all **UP**.
- Open `Alerts` (`http://127.0.0.1:9090/alerts`) showing the 6 configured availability, infrastructure, and security alert rules (`SecureCareAppDown`, `HighHostCPUUsage`, `HighHostMemoryUsage`, `HighHostDiskUsage`, `SecureCareFailedLoginSpike`, `SecureCareUnauthorizedAccessSpike`).

### 8. Grafana Monitoring & Security Dashboard (`http://127.0.0.1:3000` or mapped local SSM port)
- Open the **`VLE-9 SecureCare DevSecOps & Security Overview`** dashboard.
- Show real live metrics: Application Availability (`UP`), Host CPU/Memory/Disk gauges, HTTP Request Rate & Latency, Security Telemetry (Logins & `401`/`403` events), and Host Services & Minikube Memory Working Set.

### 9. GitHub Repository & Webhook Integration
- Open `https://github.com/Ajay73588/vle9-secure-devsecops-healthcare` in the browser.
- Show clean repository structure, `.gitignore` excluding secrets/state, and **Settings -> Webhooks** showing green `200 OK` push deliveries triggering Jenkins automatically.

---

## Saved Evidence Screenshots (`screenshots/`)

- [01-securecare-app.png](../screenshots/01-securecare-app.png) — SecureCare Dashboard (Doctor RBAC Session & Synthetic Patient/Appointment Tables)
- [02-jenkins-pipeline.png](../screenshots/02-jenkins-pipeline.png) — Jenkins Full Stage View (Build `#4` 10/10 Green Stages + Build `#3` Gate Enforcement)
- [03-sonarqube-analysis.png](../screenshots/03-sonarqube-analysis.png) — SonarQube `vle9-securecare` Passed Quality Gate & `0` Issues
- [04-trivy-scan.png](../screenshots/04-trivy-scan.png) — Trivy Filesystem & Container Image `securecare:4` (`0` CVEs)
- [05-kubernetes-deployment.png](../screenshots/05-kubernetes-deployment.png) — Minikube `restricted` PSS, RBAC & `2/2` Pods Verification
- [06-owasp-zap-report.png](../screenshots/06-owasp-zap-report.png) — OWASP ZAP `2.17.0` Baseline DAST HTML Report (`0` High / `0` Medium)
- [07-prometheus-targets.png](../screenshots/07-prometheus-targets.png) — Prometheus All 5 Active Scrape Targets (`UP`)
- [07b-prometheus-alerts.png](../screenshots/07b-prometheus-alerts.png) — Prometheus 6 Security & Infrastructure Alert Rules
- [08-grafana-dashboard.png](../screenshots/08-grafana-dashboard.png) — Grafana `VLE-9 SecureCare DevSecOps & Security Overview` Live Dashboard
- [09-github-repo.png](../screenshots/09-github-repo.png) — GitHub Repository Structure (`Ajay73588/vle9-secure-devsecops-healthcare`)
- [09b-github-webhook-deliveries.png](../screenshots/09b-github-webhook-deliveries.png) — GitHub Webhook `#710422026` `200 OK` Push Deliveries & Jenkins Build Cause
