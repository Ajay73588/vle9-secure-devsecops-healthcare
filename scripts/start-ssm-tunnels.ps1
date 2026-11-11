param(
  [string]$Region = "ap-south-1",
  [string]$InstanceId = ""
)

$ErrorActionPreference = "Stop"

function Get-ListeningPorts {
  return [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    ForEach-Object { $_.Port } |
    Select-Object -Unique
}

function Get-FreeLocalPort([int]$PreferredPort, [int[]]$ReservedPorts) {
  $busy = (Get-ListeningPorts) + $ReservedPorts
  $candidate = $PreferredPort
  if ($busy -contains $candidate) {
    $candidate = $PreferredPort + 10000
    while ($busy -contains $candidate) {
      $candidate++
    }
  }
  return $candidate
}

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

$specs = @(
  @{ Name = "SecureCare";   Remote = 8081; Preferred = 8081 },
  @{ Name = "Jenkins";      Remote = 8080; Preferred = 8080 },
  @{ Name = "SonarQube";    Remote = 9000; Preferred = 9000 },
  @{ Name = "Grafana";      Remote = 3000; Preferred = 3000 },
  @{ Name = "Prometheus";   Remote = 9090; Preferred = 9090 },
  @{ Name = "Alertmanager"; Remote = 9093; Preferred = 9093 }
)

$reserved = @()
$tunnels = @()
foreach ($s in $specs) {
  $localPort = Get-FreeLocalPort -PreferredPort $s.Preferred -ReservedPorts $reserved
  $reserved += $localPort
  $tunnels += @{ Name = $s.Name; Remote = $s.Remote; Local = $localPort; Preferred = $s.Preferred }
}

$procs = @()
try {
  foreach ($t in $tunnels) {
    $pJson = "{`"portNumber`":[`"$($t.Remote)`"],`"localPortNumber`":[`"$($t.Local)`"]}"
    $escapedJson = $pJson.Replace('"', '\"')
    $note = if ($t.Local -ne $t.Preferred) { " (local $($t.Preferred) busy; mapped to $($t.Local))" } else { "" }
    Write-Host "  - $($t.Name): http://127.0.0.1:$($t.Local) -> EC2:$($t.Remote)$note"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "aws"
    $psi.Arguments = "ssm start-session --target $InstanceId --region $Region --document-name AWS-StartPortForwardingSession --parameters `"$escapedJson`""
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.CreateNoWindow = $true
    $procs += [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Milliseconds 400
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  $openPorts = @{}
  while ([DateTime]::UtcNow -lt $deadline -and $openPorts.Count -lt $tunnels.Count) {
    $listening = Get-ListeningPorts
    foreach ($t in $tunnels) {
      if (-not $openPorts.ContainsKey($t.Name) -and ($listening -contains $t.Local)) {
        $openPorts[$t.Name] = $true
      }
    }
    if ($openPorts.Count -lt $tunnels.Count) {
      Start-Sleep -Milliseconds 300
    }
  }
  foreach ($t in $tunnels) {
    if (-not $openPorts.ContainsKey($t.Name)) {
      Write-Warning "Tunnel for $($t.Name) (127.0.0.1:$($t.Local)) did not bind within 45s."
    }
  }

  Write-Host "`nAll SSM tunnels are active. Open the URLs above in your browser. Press Ctrl+C to close tunnels when finished." -ForegroundColor Green
  while ($true) {
    Start-Sleep -Seconds 5
  }
} finally {
  foreach ($proc in $procs) {
    if ($proc) {
      cmd /c "taskkill /PID $($proc.Id) /T /F >nul 2>&1"
      if (-not $proc.HasExited) {
        $proc.Kill()
      }
    }
  }
  Write-Host "All SSM tunnels closed."
}
