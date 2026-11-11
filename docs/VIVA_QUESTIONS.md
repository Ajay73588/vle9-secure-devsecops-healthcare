# VLE-9 Viva Preparation Guide — Secure DevSecOps in Healthcare Systems

## 1. What Does DevSecOps Mean?
**DevSecOps** (Development, Security, and Operations) shifts security **"left"** into every phase of the software delivery lifecycle rather than treating security as a final manual gate before release.
In this project, security checks run automatically on every `git push`:
- **Pre-build / Code:** Input validation, RBAC, runtime secret injection, and SonarQube SAST.
- **Image Build:** Multi-stage minimal Alpine container running as non-root UID `10001` + Trivy CVE scan.
- **Deployment:** Kubernetes Restricted Pod Security Standards, least-privilege RBAC, and isolated Secrets.
- **Post-deploy:** OWASP ZAP DAST baseline scan + Prometheus/Alertmanager/Grafana runtime security alerting.

---

## 2. Why Do Healthcare Systems Need Strong Security?
Healthcare applications handle **Protected Health Information (PHI)** (patient demographics, medical history, appointments). Even though **SecureCare** uses 100% synthetic demo data, real healthcare platforms must satisfy strict privacy and compliance mandates (e.g., HIPAA, DISHA/DPDP principles):
- **Confidentiality:** Role-Based Access Control (Admin / Doctor / Nurse), masked identifiers, `scrypt` password hashing, signed `HttpOnly` sessions, and zero sensitive data in logs.
- **Integrity:** Input validation against XSS/injection so clinical notes and records cannot be tampered with.
- **Availability:** Kubernetes readiness/liveness probes, rolling updates, and Prometheus downtime alerts ensure clinical workflows stay reachable.
- **Auditability:** Structured JSON audit logs and security telemetry counters (`401`/`403` spikes, failed login counters).

---

## 3. SAST vs. DAST

| Dimension | SAST (Static Application Security Testing) | DAST (Dynamic Application Security Testing) |
|---|---|---|
| **Tool Used** | **SonarQube** (`sonar-scanner`) | **OWASP ZAP** (`zap-baseline.py`) |
| **Testing Mode** | White-box (analyzes source code without running the app) | Black-box (probes the live running HTTP application) |
| **Finds** | Hardcoded secrets, code smells, injection patterns, weak crypto, bugs | Missing HTTP security headers, XSS exposure, cookie flags, server leaks, misconfigurations |
| **Pipeline Stage** | Stage 4 (before Docker build) | Stage 9 (after Kubernetes deployment) |

---

## 4. SonarQube vs. OWASP ZAP in Our Pipeline
- **SonarQube** inspects `app/src/` and `app/public/` statically using `sonar-scanner` and evaluates a **Quality Gate** (bugs, vulnerabilities, security hotspots, code coverage/duplication). If the Quality Gate returns anything other than `OK`, Jenkins Stage 7 fails the build.
- **OWASP ZAP** runs inside Docker against the live Kubernetes-deployed SecureCare endpoint (`http://127.0.0.1:8081`), spidering pages and validating response headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`, `Cache-Control`, `HttpOnly`/`SameSite` cookies). High-risk alerts fail the pipeline.

---

## 5. Docker Image Hardening & Trivy Scanning
- **Dockerfile Hardening:**
  - Multi-stage build separates `npm ci` build steps from the lean runtime container (`node:22-alpine`).
  - Runs `apk update && apk upgrade --no-cache` to pull the latest Alpine security patches.
  - Creates and runs under non-root UID/GID `10001` (`USER 10001:10001`).
  - Excludes tests, docs, `.git`, and secrets via `.dockerignore`.
- **Trivy Scanning:**
  - `trivy image` scans OS packages (Alpine `musl`, `openssl`, etc.) and Node.js dependencies (`package-lock.json`) for known CVEs.
  - Jenkins Stage 7 enforces zero fixable `HIGH` or `CRITICAL` vulnerabilities (`--exit-code 1`).

---

## 6. Kubernetes RBAC, Restricted Security & Secrets
- **Namespace Policy:** `securecare` enforces Pod Security Standard **`restricted`** (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, `readOnlyRootFilesystem: true`, `seccompProfile: RuntimeDefault`).
- **RBAC:** Dedicated `ServiceAccount` (`securecare-sa` with `automountServiceAccountToken: false`), narrow `Role` (`securecare-readonly-role` allowing only `get` on `securecare-config` and `get`/`list` on `pods` in `securecare`), bound via `RoleBinding`. Zero `cluster-admin` privileges.
- **Secrets:** `JWT_SECRET` and user credentials live in Jenkins Credentials and are injected at deploy time into Kubernetes `Secret` (`securecare-secrets`) via `envFrom`, never committed to GitHub.

---

## 7. Prometheus, Alertmanager & Grafana
- **Prometheus** scrapes host metrics (`node_exporter` on `:9100`), container/Minikube metrics (`cAdvisor` on `:8085`), Alertmanager (`:9093`), and SecureCare `/metrics` (`:8081`).
- **Custom Security Metrics** exposed by SecureCare (`prom-client`):
  - `securecare_auth_login_attempts_total{outcome="success"|"failure"}`
  - `securecare_unauthorized_access_total{route,status_code}`
  - `securecare_http_requests_total` & `securecare_http_request_duration_seconds`
- **Alertmanager Rules (`alert_rules.yml`):** Fire alerts on `SecureCareAppDown`, `HighHostCPUUsage`, `HighHostMemoryUsage`, `HighHostDiskUsage`, `SecureCareFailedLoginSpike`, and `SecureCareUnauthorizedAccessSpike`.
- **Grafana** visualizes these live metrics on a pre-provisioned dashboard (`VLE-9 SecureCare DevSecOps & Security Overview`) accessed securely via AWS SSM port forwarding.

---

## 8. End-to-End Architecture & Jenkins 10-Stage Flow
1. Developer pushes code to GitHub (`Ajay73588/vle9-secure-devsecops-healthcare`).
2. GitHub sends `POST /github-webhook/` from an official GitHub webhook CIDR through AWS Security Group (port 80 restricted) -> Nginx (denies every path except `/github-webhook/`) -> Jenkins (`127.0.0.1:8080`).
3. Jenkins executes 10 stages: Checkout -> `npm ci` -> `npm test` -> SonarQube SAST -> Docker Build -> Trivy Scan -> Security Gates -> Minikube K8s Deploy -> OWASP ZAP Baseline DAST -> Live Health & Prometheus Target Verification.
4. All admin UIs (Jenkins, SonarQube, Grafana, Prometheus, SecureCare) remain closed to the public internet (**SSH port 22 blocked at AWS SG perimeter**) and are accessed strictly via **AWS Systems Manager (SSM)** encrypted port forwarding (`.\scripts\start-ssm-tunnels.ps1`).
