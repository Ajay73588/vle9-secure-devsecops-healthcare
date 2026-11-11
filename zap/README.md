# OWASP ZAP Baseline DAST Configuration (VLE-9)

OWASP ZAP runs inside Docker (`ghcr.io/zaproxy/zaproxy:stable`) against the locally deployed SecureCare Kubernetes service (`http://127.0.0.1:8081` via `--network host`):

```bash
docker run --rm --network host -v /opt/vle9/reports/zap:/zap/wrk:rw \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://127.0.0.1:8081 \
  -r zap-report.html \
  -J zap-report.json \
  -w zap-summary.md
```

- Targets ONLY the controlled local deployment (`127.0.0.1:8081`).
- Never runs active attacks against external or public third-party hosts.
- Fails pipeline automatically if any **High** risk alerts are detected in `zap-report.json`.

