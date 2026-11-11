# Trivy Container Vulnerability Policy (VLE-9)

## Enforcement Rules
1. Every build runs `trivy image` against the freshly built `securecare` image in both JSON and table formats.
2. The Jenkins security gate executes:
   - Full vulnerability report (all severities) saved for auditability.
   - Policy enforcement scan: `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1` (plus separate check reporting any unfixed `CRITICAL`/`HIGH` CVEs explicitly in the build log and `SECURITY_REPORT.md`).
3. Base image hardening:
   - Uses minimal `node:22-alpine`.
   - Applies `apk update && apk upgrade --no-cache` during build.
   - Runs as non-root UID `10001`.
   - Removes dev dependencies (`npm ci --omit=dev`).

## Documented Exceptions
- Any unpatched upstream distro CVE without an available vendor fix is never hidden; it is recorded in `SECURITY_REPORT.md` with remediation tracking (upgrade base image once upstream patch is released).

