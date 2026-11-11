param(
  [string]$Region = "ap-south-1",
  [string]$InstanceId = ""
)

$ErrorActionPreference = "Stop"

function Test-LocalPortBusy([int]$Port) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $ar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(150) -and $tcp.Connected) {
      $tcp.Close()
      return $true
    }
    $tcp.Close()
  } catch {}
  return $false
}

function Get-FreeLocalPort([int]$PreferredPort) {
  $candidate = $PreferredPort
  if (Test-LocalPortBusy $candidate) {
    $candidate = $PreferredPort + 10000
    while (Test-LocalPortBusy $candidate) {
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

$tunnels = @(
  @{ Name = "SecureCare";   Remote = 8081; Local = (Get-FreeLocalPort 8081); Preferred = 8081 },
  @{ Name = "Jenkins";      Remote = 8080; Local = (Get-FreeLocalPort 8080); Preferred = 8080 },
  @{ Name = "SonarQube";    Remote = 9000; Local = (Get-FreeLocalPort 9000); Preferred = 9000 },
  @{ Name = "Grafana";      Remote = 3000; Local = (Get-FreeLocalPort 3000); Preferred = 3000 },
  @{ Name = "Prometheus";   Remote = 9090; Local = (Get-FreeLocalPort 9090); Preferred = 9090 },
  @{ Name = "Alertmanager"; Remote = 9093; Local = (Get-FreeLocalPort 9093); Preferred = 9093 }
)

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
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  foreach ($t in $tunnels) {
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
      if (Test-LocalPortBusy $t.Local) {
        $ready = $true
        break
      }
      Start-Sleep -Milliseconds 300
    }
    if (-not $ready) {
      Write-Warning "Tunnel for $($t.Name) (127.0.0.1:$($t.Local)) did not open within 35s."
    }
  }

  Write-Host "`nAll SSM tunnels are active. Open the URLs above in your browser. Press Ctrl+C to close tunnels when finished." -ForegroundColor Green
  while ($true) {
    Start-Sleep -Seconds 5
  }
} finally {
  foreach ($proc in $procs) {
    if ($proc) {
      $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
      foreach ($c in $children) {
        Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue
      }
      if (-not $proc.HasExited) {
        $proc.Kill()
      }
    }
  }
  Write-Host "All SSM tunnels closed."
}
