# VLE-9 End-to-End Verification & Test Results

**Verification Scope:** Complete live verification across AWS (`ap-south-1`), Ansible host setup, Jenkins CI/CD (`Build #4`), SonarQube SAST, Trivy FS/Image scanning, Minikube Kubernetes deployment & RBAC, OWASP ZAP Baseline DAST, SecureCare API/RBAC/Validation behavior, Prometheus targets & firing alerts, and external network isolation.  
**Policy:** Every `PASS` entry below corresponds directly to executed live checks and saved reports (zero fabricated or assumed passes).

---

## 1. Master Verification Matrix

| Component / Requirement | Verification Method | Observed Result | Status |
|---|---|---|---|
| **EC2 Provisioning (`m7i-flex.large`)** | `aws ec2 describe-instances` & `terraform outputs` | Instance `i-00a1616bf3dee5989` running in `ap-south-1a`, private IP `10.90.1.121`, encrypted 40 GB `gp3` EBS (`vol-06faea913396a3863`) | **PASS** |
| **AWS SSM Connectivity** | `aws ssm describe-instance-information` & remote command execution | Agent `Online`; `start-session` port forwarding & `AWS-RunShellScript` operational | **PASS** |
| **Network Isolation & Closed SSH** | AWS SG inspection, `ss -tlnp`, external TCP/HTTP probes | SSH `22` closed; zero `0.0.0.0/0` ingress; TCP `22, 3000, 8081, 9000, 9090` unreachable externally; `:80` GET drops/returns `403` | **PASS** |
| **Ansible Idempotent Automation** | `ansible-playbook site.yml` (7 roles) | Executed all 7 roles cleanly (`ok=53, failed=0`) | **PASS** |
| **SecureCare Unit Tests & LCOV** | `npm run test:lcov` (Node test runner + pipeline Stage 3) | **5 / 5** suites passing; `89.30%` local line coverage, `97.10%` function coverage | **PASS** |
| **HTTP Security Headers** | `curl -i http://127.0.0.1:8081/` | Verified `CSP`, `COOP: same-origin`, `CORP: same-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Cache-Control` | **PASS** |
| **Auth, Validation, RBAC & Synthetic Data** | Live API calls against deployed K8s pods (`127.0.0.1:8081`) | Unauth `401`, wrong pass `401`, XSS -> `400`, Nurse create -> `403`, Doctor delete -> `403`, Doctor create -> `201`, Admin delete -> `200` | **PASS** |
| **SonarQube SAST (`vle9-securecare`)** | Stage 4 + Quality Gate API + UI ([03-sonarqube-analysis.png](screenshots/03-sonarqube-analysis.png)) | Quality Gate `OK` (`Passed`); `0` Bugs, `0` Vulnerabilities, `0` Hotspots, `0` Code Smells, `94.6%` new-code coverage | **PASS** |
| **Docker Image Hardening** | Multi-stage Dockerfile build (`securecare:4`, Alpine `3.24.4`) | Non-root UID `10001`, upgraded Alpine packages, `npm`/`npx`/`yarn` stripped from runtime image | **PASS** |
| **Trivy Container & Repo Scan** | Stage 6 & Stage 7 (`trivy-gate-4` exit code `0`) | **0 vulnerabilities** across 19 Alpine OS + 49 runtime Node.js packages; **0** Dockerfile/K8s/secret findings (6 Terraform lab design findings documented in [SECURITY_REPORT.md](SECURITY_REPORT.md)) | **PASS** |
| **Kubernetes Pod Security & RBAC** | `kubectl get` / `describe` / `auth can-i` on Minikube `v1.37.0` | `securecare` namespace enforces `restricted` PSS; `2/2` pods Running; `automountServiceAccountToken: false`; `can-i` verified narrow ConfigMap/Pod read-only permissions | **PASS** |
| **OWASP ZAP Baseline DAST** | Stage 9 (`ghcr.io/zaproxy/zaproxy:stable`, `ZAP 2.17.0`) | **`0` High**, **`0` Medium**, `1` Low (`COEP Header Missing` [90004]), `4` Informational | **PASS** |
| **GitHub Push Webhook -> Jenkins #4** | Real `git push` on `main` -> Webhook `#710422026` -> Jenkins #4 | Delivery `3853471628499386368` returned `200 OK`; Build `#4` (`Started by GitHub push by Ajay73588`) completed **`SUCCESS` (101.8s)** across all 10 stages | **PASS** |
| **Prometheus Targets & Alerting** | `/api/v1/targets`, `/api/v1/rules`, `/var/log/vle9-alerts.log` | All **5 targets** `up`; all **6 rules** healthy; `SecureCareUnauthorizedAccessSpike` (`15:59:10Z`) & `SecureCareFailedLoginSpike` (`16:00:55Z`) fired live through Alertmanager -> `/var/log/vle9-alerts.log` | **PASS** |
| **Grafana Dashboard** | `VLE-9 SecureCare DevSecOps & Security Overview` via SSM | Provisioned Prometheus datasource & dashboard rendering live metrics | **PASS** |

---

## 2. Detailed Evidence Highlights

### 2.1 Live SecureCare API & RBAC Check Log (`http://127.0.0.1:8081`)
Executed directly against the Kubernetes-deployed `securecare:4` pods via Nginx localhost proxy:
1. Unauthenticated `GET /api/patients` (`x5`): `401 401 401 401 401`
2. Invalid password `POST /api/auth/login` (`x3`): `401 401 401`
3. Doctor XSS payload `POST /api/patients` (`<script>alert(1)</script>`): **`HTTP 400`**
4. Nurse RBAC boundary `POST /api/patients`: **`HTTP 403`**
5. Doctor RBAC boundary `DELETE /api/patients/SC-1006`: **`HTTP 403`**
6. Doctor synthetic record creation `POST /api/patients`: **`HTTP 201`** (`SC-1007`)
7. Admin cleanup `DELETE /api/patients/SC-1007`: **`HTTP 200`**

### 2.2 Kubernetes Security & RBAC Output Summary
- **Namespace:** `securecare` (`pod-security.kubernetes.io/enforce=restricted`, `audit=restricted`, `warn=restricted`)
- **Workloads:** `deployment.apps/securecare` `2/2` (`10.244.0.3:3000`, `10.244.0.4:3000`), `service/securecare-svc` `NodePort 3000:30080/TCP`
- **Pod Security Context (`securecare-77b4d497b6-mb7fj`):**
  - `serviceAccount: securecare-sa`, `automountServiceAccountToken: false`
  - `runAsNonRoot: true`, `runAsUser: 10001`, `runAsGroup: 10001`, `fsGroup: 10001`, `seccompProfile: RuntimeDefault`
  - `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`
- **Least-Privilege `kubectl auth can-i` Matrix (`system:serviceaccount:securecare:securecare-sa`):**
  - `get configmaps/securecare-config -n securecare` -> **`yes`**
  - `list pods -n securecare` -> **`yes`**
  - `list secrets -n securecare` -> **`no`**
  - `list pods -n kube-system` -> **`no`**

### 2.3 Prometheus Scrape Targets & Live Security Alerting
- **Active Scrape Targets (`health: up`):**
  1. `prometheus` (`http://127.0.0.1:9090/metrics`)
  2. `node-exporter` (`http://127.0.0.1:9100/metrics`)
  3. `cadvisor` (`http://127.0.0.1:8085/metrics`)
  4. `alertmanager` (`http://127.0.0.1:9093/metrics`)
  5. `securecare-app` (`http://127.0.0.1:8081/metrics`)
- **Alert Rules Health (`6/6 health: ok`):** `SecureCareAppDown`, `HighHostCPUUsage`, `HighHostMemoryUsage`, `HighHostDiskUsage`, `SecureCareUnauthorizedAccessSpike`, `SecureCareFailedLoginSpike`.
- **Alertmanager End-to-End Verification:** Sending the unauthorized-access and failed-login bursts drove **both** security rules cleanly through Alertmanager (`alertmanager` active state) and into `/var/log/vle9-alerts.log` via `vle9-alert-sink`:
  1. `SecureCareUnauthorizedAccessSpike` (`severity: high`, fired `2026-11-11T15:59:10Z` — `7.45` 401/403 events in 5m)
  2. `SecureCareFailedLoginSpike` (`severity: high`, fired `2026-11-11T16:00:55Z` — `3.21` failed login events in 5m)
  3. Earlier `SecureCareAppDown` lifecycle verified both `firing` (`15:40:25Z`) and `resolved` (`15:58:25Z`) notifications after Jenkins Build `#4` rolled out healthy pods.
