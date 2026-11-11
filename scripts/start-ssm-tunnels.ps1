param(
  [string]$Region = "ap-south-1",
  [string]$InstanceId = ""
)

$ErrorActionPreference = "Stop"

if (-not $InstanceId) {
  $InstanceId = aws ec2 describe-instances `
    --region $Region `
    --filters "Name=tag:Name,Values=vle9-devsecops-server" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" `
    --output text
}

if (-not $InstanceId -or $InstanceId -eq "None") {
  Write-Error "No running VLE-9 EC2 instance found in $Region. Start the instance first."
  exit 1
}

Write-Host "Starting AWS SSM Port Forwarding tunnels for instance $InstanceId ($Region)..." -ForegroundColor Cyan

$tunnels = @(
  @{ Name = "SecureCare";   Remote = 8081; Local = 8081 },
  @{ Name = "Jenkins";      Remote = 8080; Local = 8080 },
  @{ Name = "SonarQube";    Remote = 9000; Local = 9000 },
  @{ Name = "Grafana";      Remote = 3000; Local = 3000 },
  @{ Name = "Prometheus";   Remote = 9090; Local = 9090 },
  @{ Name = "Alertmanager"; Remote = 9093; Local = 9093 }
)

$jobs = @()
foreach ($t in $tunnels) {
  $paramsJson = "{`"portNumber`":[`"$($t.Remote)`"],`"localPortNumber`":[`"$($t.Local)`"]}"
  Write-Host "  - $($t.Name): http://127.0.0.1:$($t.Local) -> EC2:$($t.Remote)"
  $job = Start-Job -Name "ssm-$($t.Name)" -ScriptBlock {
    param($inst, $reg, $pJson)
    aws ssm start-session --target $inst --region $reg --document-name AWS-StartPortForwardingSession --parameters $pJson
  } -ArgumentList $InstanceId, $Region, $paramsJson
  $jobs += $job
}

Write-Host "`nAll tunnels started. Press Ctrl+C to close tunnels when finished." -ForegroundColor Green
try {
  while ($true) {
    Start-Sleep -Seconds 5
  }
} finally {
  $jobs | Stop-Job -PassThru | Remove-Job -Force
  Write-Host "All SSM tunnels closed."
}

