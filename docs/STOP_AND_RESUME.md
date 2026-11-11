# VLE-9 Safe Stop & Resume Operations Guide (`ap-south-1`)

> **CRITICAL:** Always **STOP** your EC2 instance (`stop-instances`) after demonstrations — **NEVER terminate** it (`terminate-instances`), or you will permanently lose your 40 GB EBS volume, Jenkins configuration, SonarQube database, Minikube cluster, and Grafana dashboards.

---

## 1. Instance Details & Cost Behavior

- **EC2 Instance ID:** `i-00a1616bf3dee5989`
- **Instance Type:** `m7i-flex.large` (2 vCPU, 8 GiB RAM, x86_64)
- **Region:** `ap-south-1` (Mumbai)
- **EBS Storage:** 40 GB encrypted `gp3` volume

| State | EC2 Compute | Ephemeral Public IPv4 | 40 GB `gp3` EBS | Total Cost |
|---|---:|---:|---:|---:|
| **Running** | \$0.1008 / hr | \$0.0050 / hr | \$3.65 / mo | **~\$0.1058 / hr** + \$3.65/mo |
| **Stopped** | **\$0.00 / hr** | **\$0.00 / hr** | **\$3.65 / mo** | **\$3.65 / mo only** |

All Docker containers (SonarQube, Prometheus, Alertmanager, Grafana, Node Exporter, cAdvisor), Jenkins (`systemd`), Nginx (`systemd`), and Minikube (`vle9-minikube.service`) have persistent storage on the EBS volume and auto-restart policies configured.

---

## 2. How to Safely Stop After Your Demo (Windows PowerShell)

1. Close any active SSM port-forwarding terminal (`Ctrl+C`).
2. Stop the EC2 instance (preserves EBS data, stops compute + IPv4 charges):

```powershell
aws ec2 stop-instances --instance-ids i-00a1616bf3dee5989 --region ap-south-1
aws ec2 wait instance-stopped --instance-ids i-00a1616bf3dee5989 --region ap-south-1
aws ec2 describe-instances --instance-ids i-00a1616bf3dee5989 --region ap-south-1 --query "Reservations[0].Instances[0].State.Name"
```

Expected output: `"stopped"`.

---

## 3. How to Resume Before a Demo (Windows PowerShell)

1. Start the EC2 instance and wait until SSM is online:

```powershell
aws ec2 start-instances --instance-ids i-00a1616bf3dee5989 --region ap-south-1
aws ec2 wait instance-status-ok --instance-ids i-00a1616bf3dee5989 --region ap-south-1
aws ssm describe-instance-information --filters "Key=InstanceIds,Values=i-00a1616bf3dee5989" --region ap-south-1 --query "InstanceInformationList[0].PingStatus"
```

2. Wait ~60–90 seconds for `jenkins`, `docker` Compose services (SonarQube, Prometheus, Grafana), and `vle9-minikube.service` to finish booting automatically.

3. *(Optional, if testing GitHub push webhooks)* Because an ephemeral public IP changes after stop/start, run the helper script from `C:\Users\LENOVO\Downloads\vle 9`:

```powershell
.\scripts\update-github-webhook.ps1
```

4. Re-open all encrypted AWS SSM port-forwarding tunnels (in PowerShell from `C:\Users\LENOVO\Downloads\vle 9`):

```powershell
.\scripts\start-ssm-tunnels.ps1
```

5. Open in your browser (via local SSM tunnels):
   - **SecureCare App:** `http://127.0.0.1:8081`
   - **Jenkins CI/CD:** `http://127.0.0.1:8080`
   - **SonarQube SAST:** `http://127.0.0.1:9000`
   - **Grafana Dashboard:** `http://127.0.0.1:3000`
   - **Prometheus Targets:** `http://127.0.0.1:9090/targets`

6. Verify services over SSM from PowerShell:

```powershell
aws ssm send-command --instance-ids i-00a1616bf3dee5989 --region ap-south-1 `
  --document-name "AWS-RunShellScript" `
  --parameters 'commands=["systemctl is-active jenkins docker nginx vle9-minikube","docker ps --format \"table {{.Names}}\\t{{.Status}}\"","su -s /bin/bash jenkins -c \"HOME=/var/lib/jenkins kubectl get pods -n securecare\"","curl -fsS http://127.0.0.1:8081/health"]'
```
