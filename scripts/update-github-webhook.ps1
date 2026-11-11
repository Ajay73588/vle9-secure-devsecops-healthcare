param(
  [string]$Region = "ap-south-1",
  [string]$Owner = "Ajay73588",
  [string]$Repo = "vle9-secure-devsecops-healthcare"
)

$ErrorActionPreference = "Stop"

$PublicIp = aws ec2 describe-instances `
  --region $Region `
  --filters "Name=tag:Name,Values=vle9-devsecops-server" "Name=instance-state-name,Values=running" `
  --query "Reservations[0].Instances[0].PublicIpAddress" `
  --output text

if (-not $PublicIp -or $PublicIp -eq "None") {
  Write-Error "Could not find a running VLE-9 EC2 public IP in $Region."
  exit 1
}

$WebhookUrl = "http://$PublicIp/github-webhook/"

$credIn = Join-Path $env:TEMP "vle9-gcred.txt"
[System.IO.File]::WriteAllText($credIn, "protocol=https`nhost=github.com`n`n", [System.Text.UTF8Encoding]::new($false))
$credOutput = cmd /c "git credential fill < `"$credIn`""
Remove-Item -Force $credIn -ErrorAction SilentlyContinue
$tokenLine = $credOutput | Select-String -Pattern '^password=(.+)$'
if (-not $tokenLine) {
  Write-Error "GitHub token not found in Windows Git Credential Manager."
  exit 1
}
$token = $tokenLine.Matches[0].Groups[1].Value

$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/vnd.github+json"
  "User-Agent"  = "vle9-webhook-updater"
}

$hooks = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/hooks" -Headers $headers
$existing = $hooks | Where-Object { $_.config.url -like "*/github-webhook/*" } | Select-Object -First 1

if ($existing) {
  $body = @{
    active = $true
    events = @("push")
    config = @{
      url          = $WebhookUrl
      content_type = "json"
      insecure_ssl = "0"
    }
  } | ConvertTo-Json -Depth 4
  $updated = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$Owner/$Repo/hooks/$($existing.id)" -Headers $headers -Body $body -ContentType "application/json"
  Write-Host "Updated GitHub webhook #$($updated.id) -> $($updated.config.url)" -ForegroundColor Green
} else {
  Write-Warning "No existing Jenkins webhook found on $Owner/$Repo."
}

