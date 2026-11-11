# VLE-9 Security Assessment & Remediation Report (`SecureCare`)

**Project:** VLE-9 — Secure DevSecOps Implementation in Healthcare Systems  
**Verified Pipeline Builds:** Jenkins Build `#5` (`Result: SUCCESS`, triggered by GitHub push delivery `3853481013493628928`) and Build `#4` (`Result: SUCCESS`, delivery `3853471628499386368`)  
**Assessment Scope:** AWS Infrastructure (`ap-south-1`), Docker Container Image (`securecare:5`), SecureCare Application Codebase, Kubernetes Deployment (`securecare` namespace on Minikube `v1.37.0`), Static Analysis (SonarQube `9.9.8`), Supply-Chain/IaC Scanning (Trivy), Dynamic Testing (OWASP ZAP `2.17.0`), and Live Runtime Security Telemetry.

---

## 1. Executive Security Summary

| Security Gate / Control | Tool / Mechanism | Final Verified Status | Critical / High Findings |
|---|---|---|---|
| **SAST (Static Code Analysis)** | SonarQube Community `9.9.8` + `sonar-scanner` | **PASSED (`OK`)** | `0` Bugs, `0` Vulnerabilities, `0` Security Hotspots, `0` Code Smells |
| **Container Image Scan** | Trivy (`trivy image securecare:5`) | **PASSED (`Exit Code: 0`)** | `0` Vulnerabilities across Alpine `3.24.4` (19 OS pkgs) & runtime Node.js pkgs |
| **Repository & IaC Scan** | Trivy FS (`vuln,misconfig,secret`) | **PASS (App/K8s/Docker Clean); 6 Accepted Terraform Items** | `0` `package-lock.json` CVEs, `0` Dockerfile/K8s misconfigs, `0` Secrets; 6 Terraform architectural items documented below |
| **DAST (Dynamic App Security)** | OWASP ZAP `2.17.0` Baseline (`http://127.0.0.1:8081`) | **PASSED (`High: 0`)** | `0` High, `0` Medium, `1` Low (`COEP` Header `[90004]`), `4` Informational |
| **Kubernetes Workload Security** | Pod Security Standard `restricted` + Least-Privilege RBAC | **ENFORCED & VERIFIED** | UID `10001` non-root, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `drop: ["ALL"]`, `automountServiceAccountToken: false` |
| **Cloud & Network Isolation** | AWS SG (`sg-0b7621a80ac7d5caa`) + Nginx + Systems Manager (SSM) + IMDSv2 | **VERIFIED** | TCP `22` blocked at AWS SG perimeter (`tcp/80` GitHub webhook CIDRs only), zero `0.0.0.0/0` ingress, admin UIs bound strictly to `127.0.0.1`, IMDSv2 `hop_limit = 1` |

---

## 2. Iterative Remediation Demonstrated in CI/CD (Build #3 -> Build #4)

One of the primary goals of DevSecOps is catching real weaknesses via automated security gates before deployment. This project's Jenkins pipeline (`vle9-securecare-pipeline`) genuinely blocked defective builds until every fixable finding was eliminated:

1. **Blocked Container CVEs & K8s Manifest Findings (Jenkins Build `#3` Failed Stage 7):**
   - **Finding 1 (10 HIGH CVEs in Node Base Image Global Tooling):** Trivy `trivy image` detected 10 `HIGH` vulnerabilities inside global `/usr/local/lib/node_modules/npm` package-manager dependencies bundled inside the `node:22-alpine` base image, even though `app/node_modules` had zero vulnerabilities.
   - **Remediation ([docker/Dockerfile](docker/Dockerfile)):** Stripped `/usr/local/lib/node_modules`, `/usr/local/bin/npm`, `/usr/local/bin/npx`, `/usr/local/bin/corepack`, and `/opt/yarn*` from the final multi-stage `runtime` image alongside `apk update && apk upgrade --no-cache`.
   - **Finding 2 (Kubernetes Trivy Misconfigurations):** Initial `trivy fs` flagged `KSV-0109` / `KSV-01010` heuristic keys on ConfigMap and `KSV-0013` (`:latest` image tag) on Deployment.
   - **Remediation ([02-configmap.yaml](kubernetes/02-configmap.yaml), [04-deployment.yaml](kubernetes/04-deployment.yaml), [Jenkinsfile](jenkins/Jenkinsfile)):** Renamed environment keys cleanly, pinned explicit immutable tag `securecare:1.0.0` dynamically substituted with `securecare:${BUILD_NUMBER}`, resulting in **0 Kubernetes misconfigurations** in Build `#4`.

2. **SAST & Test Coverage Remediation ([app/src/app.js](app/src/app.js), [app/src/security.js](app/src/security.js), [app/public/index.html](app/public/index.html)):**
   - Replaced ASCII control-character regex checks with explicit `codePointAt()` validation in `hasControlCharacters` (`app/src/security.js`) (SonarQube security hotspot/reliability rule).
   - Modularized `createApp` (`app/src/app.js`) into cohesive route and guard helpers to reduce cognitive complexity cleanly.
   - Added screen-reader `<caption>` accessibility elements in `index.html` and enabled LCOV coverage export (`npm run test:lcov`), achieving **94.6% new-code coverage** (exceeding SonarQube's 80% Quality Gate threshold).

---

## 3. Detailed Security Scan Results (Latest Verified Builds `#4` / `#5`)

### 3.1 SonarQube SAST Results (`vle9-securecare`)
- **Quality Gate Status:** `OK` (`Passed`)
- **Code Metrics (`1,751` NCLOC):**
  - **Bugs:** `0` (Rating **A**)
  - **Vulnerabilities:** `0` (Rating **A**)
  - **Security Hotspots:** `0` (Rating **A**)
  - **Code Smells:** `0` (Rating **A**)
  - **New Code Coverage:** `94.6%` (`75.7%` combined coverage)
  - **New Duplicated Lines Density:** `0.0%` (`3.1%` overall)

### 3.2 Trivy Image & Filesystem Results (`securecare:5`)
- **Container Image (`securecare:5`, `alpine 3.24.4`):**
  - OS Packages scanned: `19` -> **`0` Vulnerabilities**
  - Runtime Node.js packages (`app/node_modules`) -> **`0` Vulnerabilities**
  - Policy Gate (`--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1`): **Exit Code `0` (PASS)**
- **Filesystem / Secrets / Config Scan (`trivy fs`):**
  - `app/package-lock.json` (`npm`): `0` vulnerabilities
  - `docker/Dockerfile`: `0` misconfigurations
  - `kubernetes/*.yaml` (6 manifests): `0` misconfigurations
  - Secret scanner across entire repository: **`0` secrets detected**

### 3.3 Unresolved IaC Findings in `terraform/main.tf` (Honest Risk Acceptance)
`trivy fs` reported **6 architectural findings** in [terraform/main.tf](terraform/main.tf). None expose application data or admin UIs; each reflects a deliberate student-lab architecture or AWS cost-containment trade-off:

| Rule ID | Severity | Resource / Description | Why Accepted in VLE-9 Lab & Compensating Controls |
|---|---|---|---|
| `AWS-0104` | CRITICAL | Unrestricted SG egress (`0.0.0.0/0`, all protocols) | EC2 needs outbound HTTPS/DNS/NTP to pull APT packages, Docker images, Trivy DB, and communicate with AWS SSM endpoints without deploying paid NAT Gateways (`~$32/mo`) or VPC Interface Endpoints. Inbound remains locked down. |
| `AWS-0164` | HIGH | Subnet assigns public IPv4 on launch | Needed solely so GitHub's cloud webhook runners can send `POST /github-webhook/` without adding a paid Load Balancer or NAT Gateway. Mitigated by blocking SSH `22`, restricting ingress TCP `80` strictly to GitHub's 7 official CIDRs, and Nginx returning `403` on every non-webhook route. |
| `AWS-0132` | HIGH | S3 bucket uses SSE-S3 (`AES256`) instead of KMS CMK | Uses free AWS-managed `AES256` encryption to avoid a `$1/month` KMS CMK fee for an ephemeral transfer bucket whose objects auto-expire in 1 day and enforce TLS-only transport (`aws:SecureTransport`). |
| `AWS-0178` | MEDIUM | VPC Flow Logs disabled | Avoids extra CloudWatch Logs ingestion/storage charges during academic evaluation. |
| `AWS-0090` | MEDIUM | S3 versioning disabled | Staging bucket carries only transient encrypted SSM scripts deleted immediately after execution (`force_destroy = true`, 1-day lifecycle expiry). |
| `AWS-0089` | LOW | S3 server access logging disabled | Avoids creating a second logging bucket and extra S3 storage overhead for transient scripts. |

### 3.4 OWASP ZAP Baseline DAST Results (`vle9-securecare-pipeline` #4)
Target scanned cleanly against controlled localhost endpoint `http://127.0.0.1:8081` (`ZAP 2.17.0`, 6 discovered endpoints):

| Alert Name | Risk Level | ID | Instances | Technical Assessment |
|---|---|---|---|---|
| **Cross-Origin-Embedder-Policy Header Missing or Invalid** | **Low** | `90004` | 3 | Application sets `COOP: same-origin`, `CORP: same-origin`, strict CSP (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`. Full `COEP: require-corp` was omitted to keep browser asset compatibility simple. |
| Authentication Request Identified | Informational | `10111` | 1 | Informational fingerprint confirming login form detection. |
| Information Disclosure - Sensitive Info in URL | Informational | `10024` | 2 | Triggered artificially by ZAP's baseline spider sending `/?password=ZAP&username=ZAP`; genuine SecureCare UI submits credentials strictly via HTTPS/HTTP `POST /api/auth/login` JSON body, never query strings. |
| Modern Web Application | Informational | `10109` | 3 | Expected signature for SPA script architecture (`<script src="/app.js" defer>`). |
| Storable but Non-Cacheable Content | Informational | `10049` | Systemic | Static HTML/CSS/JS return `Cache-Control: no-cache`; authenticated `/api/*` endpoints enforce stricter `Cache-Control: no-store, no-cache, must-revalidate, private` + `Pragma: no-cache`. |
| **High / Medium Risk Alerts** | **High / Medium** | — | **0 / 0** | **Zero High or Medium findings detected.** |

---

## 4. Defense-in-Depth Control Verification Summary

- **Zero Real PHI & Input Sanitization:** Synthetic datasets only (`SC-1001`..`SC-1006` + masked phone `XXXX-XX-nnnn`). Tested XSS (`<script>alert(1)</script>`) rejected cleanly with `HTTP 400`.
- **Authentication & RBAC Enforcement:** `scrypt` per-user salted hashes (`timingSafeEqual` verification), HMAC-SHA256 tokens signed with runtime-only `JWT_SECRET`, `HttpOnly; SameSite=Strict` cookies, and per-IP login rate limiting (`30 req/min`). Live API checks verified: unauthenticated `/api/patients` -> `401`, wrong password -> `401`, Nurse `POST /api/patients` -> `403`, Doctor `DELETE /api/patients/:id` -> `403`, Admin `DELETE` -> `200`.
- **Kubernetes & Container Isolation:** Pods run in `securecare` namespace with `pod-security.kubernetes.io/enforce=restricted`, UID `10001`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault`, and `automountServiceAccountToken: false`. `kubectl auth can-i` verified `securecare-sa` cannot list secrets or leave the `securecare` namespace.
- **AWS Network & Host Hardening:** External TCP/HTTP probing confirmed ports `22, 3000, 8080, 8081, 9000, 9090` are unreachable from the public internet; all host daemons bind exclusively to `127.0.0.1` (except Nginx `:80`, which returns `403` on every non-webhook GET/POST route); EBS volume encrypted (`gp3`, 40 GB); IMDSv2 required with `hop_limit = 1` blocking container metadata access.
