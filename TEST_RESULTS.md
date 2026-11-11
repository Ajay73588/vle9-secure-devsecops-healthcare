# VLE-9 End-to-End Verification & Test Results

**Verification Scope:** Complete live verification across AWS (`ap-south-1`), Ansible host setup, Jenkins CI/CD (`Build #4` & `Build #5`), SonarQube SAST, Trivy FS/Image scanning, Minikube Kubernetes deployment & RBAC, OWASP ZAP Baseline DAST, SecureCare API/RBAC/Validation behavior, Prometheus targets & firing alerts, live SSM port-forwarding across all 6 dashboards, and full EC2 Safe Stop & Resume recovery.  
**Policy:** Every `PASS` entry below corresponds directly to executed live checks and saved reports (zero fabricated or assumed passes; zero secret values printed).

---

## 1. Master Verification Matrix

| Component / Requirement | Verification Method | Observed Result | Status |
|---|---|---|---|
| **EC2 Provisioning (`m7i-flex.large`)** | `aws ec2 describe-instances` & `terraform outputs` | Instance `i-00a1616bf3dee5989` running in `ap-south-1a`, private IP `10.90.1.121`, ephemeral public IP `13.207.196.161`, encrypted 40 GB `gp3` EBS (`vol-06faea913396a3863`) | **PASS** |
| **AWS SSM Connectivity & Tunnels** | `describe-instance-information` & `.\scripts\start-ssm-tunnels.ps1` | Agent `Online` (`3.3.4793.0`); staggered SSM script bound all 6 ports (`18081`, `18080`, `9000`, `13000`, `9090`, `9093`) with **0 warnings** and returned **`HTTP 200`** across all 6 UIs | **PASS** |
| **Network Isolation & Perimeter SG** | `describe-security-groups`, `ss -tlnp`, external probes | `sg-0b7621a80ac7d5caa` permits only `tcp/80` from 7 GitHub CIDRs; SSH `22` blocked at AWS perimeter; admin daemons bind strictly to `127.0.0.1`; `:80` rejects non-webhook routes (`403`) | **PASS** |
| **Ansible Idempotent Automation** | `ansible-playbook site.yml` (7 roles) | Executed all 7 roles cleanly (`ok=53, failed=0`) | **PASS** |
| **SecureCare Unit Tests & LCOV** | `npm test` & `npm run test:lcov` | **5 / 5** suites passing (`1.71s`); `94.6%` SonarQube new-code coverage (`75.7%` combined) | **PASS** |
| **HTTP Security Headers** | `curl -i http://127.0.0.1:8081/` & ZAP checks | Verified `CSP`, `COOP: same-origin`, `CORP: same-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Cache-Control` | **PASS** |
| **Auth, Validation, RBAC & Live Logins** | Live API calls against deployed K8s pods (`127.0.0.1:8081`) | Verified `admin.securecare`, `dr.sharma`, and `nurse.patel` logins return `HTTP 200` with matching pod `securecare-secrets`; unauth `401`, wrong pass `401`, XSS -> `400`, Nurse create -> `403`, Doctor delete -> `403` | **PASS** |
| **Dashboard Auth Checks** | Authenticated HTTP API probes on localhost (`127.0.0.1`) | Jenkins (`vle9admin` `:8080`), SonarQube (`admin` `:9000`), and Grafana (`admin` `:3000`) all returned `HTTP 200` | **PASS** |
| **SonarQube SAST (`vle9-securecare`)** | Stage 4 + Quality Gate API (`/api/measures/component`) | Quality Gate `OK` (`Passed`); `0` Bugs, `0` Vulnerabilities, `0` Hotspots, `0` Code Smells, `94.6%` new coverage (`1,751` NCLOC) | **PASS** |
| **Docker Image Hardening** | Multi-stage Dockerfile (`securecare:5`, Alpine `3.24.4`) | Non-root UID `10001`, upgraded Alpine packages, `npm`/`npx`/`yarn` stripped from runtime image | **PASS** |
| **Trivy Container & Repo Scan** | Stage 6 & Stage 7 (`trivy-report-5.json`, `trivy-fs-5.json`) | **0 image vulnerabilities** across `securecare:5` (19 Alpine OS + runtime Node.js packages); **0** App/Dockerfile/K8s/secret findings (+6 Terraform lab architectural items documented in [SECURITY_REPORT.md](SECURITY_REPORT.md)) | **PASS** |
| **Kubernetes Pod Security & RBAC** | `sudo -u jenkins -H bash -lc 'kubectl ...'` on Minikube `v1.37.0` | `securecare` namespace enforces `restricted` PSS; `deployment/securecare` (`securecare:5`) `2/2` Running; `automountServiceAccountToken: false`; `can-i` verified narrow ConfigMap/Pod read-only limits | **PASS** |
| **OWASP ZAP Baseline DAST** | Stage 9 (`ghcr.io/zaproxy/zaproxy:stable`, `ZAP 2.17.0`) | **`0` High**, **`0` Medium**, `1` Low (`COEP Header Missing` `[90004]`), `4` Informational | **PASS** |
| **GitHub Push Webhook -> Jenkins #5** | Real `git push` on `main` -> Webhook `#710422026` -> Jenkins #5 | Delivery `3853481013493628928` (`push`) returned `200 OK`; Build **`#5`** completed **`SUCCESS` (108.99s)** across all 10 stages (after Build `#4`, `101.84s`, delivery `3853471628499386368`) | **PASS** |
| **Prometheus Targets & Alerting** | `/api/v1/targets`, `/api/v1/rules`, Alertmanager `/api/v2/status`, `/var/log/vle9-alerts.log` | All **5 targets** `up`; all **6 rules** healthy; Alertmanager `ready`; 20 webhook notification lines logged (`SecureCareAppDown`, `SecureCareUnauthorizedAccessSpike`, `SecureCareFailedLoginSpike`) | **PASS** |
| **Grafana Dashboard** | `VLE-9 SecureCare DevSecOps & Security Overview` via SSM | Provisioned Prometheus datasource & dashboard (`uid: vle9-securecare-overview`) rendering all 11 panels cleanly | **PASS** |
| **Safe Stop & Resume Cycle** | `stop-instances` -> `start-instances` -> `update-github-webhook.ps1` | EC2 transitioned `stopped` (`PublicIp: null`) -> `running` (`13.207.196.161`); systemd/Docker/Minikube/`vle9-refresh-k8s-proxy.sh`/K8s `2/2` auto-recovered without manual intervention; webhook `ping` `3853481986286960640` returned `200 OK` | **PASS** |

---

## 2. Detailed Evidence Highlights

### 2.1 Live SecureCare API & RBAC Check Log (`http://127.0.0.1:8081`)
Executed directly against the Kubernetes-deployed `securecare` pods (`securecare:4` RBAC/XSS matrix + `securecare:5` all-role live logins):
1. Unauthenticated `GET /api/patients` (`x5`): `401 401 401 401 401`
2. Invalid password `POST /api/auth/login` (`x3`): `401 401 401`
3. Doctor XSS payload `POST /api/patients` (`<script>alert(1)</script>`): **`HTTP 400`**
4. Nurse RBAC boundary `POST /api/patients`: **`HTTP 403`**
5. Doctor RBAC boundary `DELETE /api/patients/SC-1006`: **`HTTP 403`**
6. Doctor synthetic record creation `POST /api/patients`: **`HTTP 201`** (`SC-1007`)
7. Admin cleanup `DELETE /api/patients/SC-1007`: **`HTTP 200`**
8. All 3 role logins (`admin.securecare`, `dr.sharma`, `nurse.patel`) verified against live `securecare:5` pods: **`HTTP 200`**

### 2.2 Kubernetes Security & RBAC Output Summary
- **Namespace:** `securecare` (`pod-security.kubernetes.io/enforce=restricted`, `audit=restricted`, `warn=restricted`)
- **Workloads:** `deployment.apps/securecare` (`securecare:5`) `2/2` (`securecare-6466b496c7-k6fqd` `10.244.0.4:3000`, `securecare-6466b496c7-zpf4f` `10.244.0.2:3000`), `service/securecare-svc` `NodePort 3000:30080/TCP`
- **Pod Security Context:**
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
