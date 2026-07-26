param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port,

  [ValidateSet("UDP", "TCP", "Both")]
  [string]$Protocol = "Both"
)

$ErrorActionPreference = "SilentlyContinue"

function Get-PidsFromNetstat {
  param(
    [int]$Port,
    [ValidateSet("UDP", "TCP")]
    [string]$Protocol
  )

  $pattern = if ($Protocol -eq "UDP") {
    "^\s*UDP\s+\S+:$Port\s+\S+\s+(\d+)\s*$"
  } else {
    "^\s*TCP\s+\S+:$Port\s+\S+\s+\S+\s+(\d+)\s*$"
  }

  netstat -ano -p $Protocol | ForEach-Object {
    if ($_ -match $pattern) {
      [int]$Matches[1]
    }
  }
}

$protocols = if ($Protocol -eq "Both") { @("UDP", "TCP") } else { @($Protocol) }
$processIds = @(
  foreach ($proto in $protocols) {
    Get-PidsFromNetstat -Port $Port -Protocol $proto
  }
) | Where-Object { $_ -gt 0 } | Select-Object -Unique

if (-not $processIds) {
  Write-Output "No process found listening on $Protocol port $Port."
  exit 0
}

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $name = if ($process) { $process.ProcessName } else { "unknown" }

  try {
    Stop-Process -Id $processId -Force -ErrorAction Stop
    Write-Output "Stopped PID $processId ($name) on port $Port."
  } catch {
    Write-Output "Failed to stop PID $processId ($name): $($_.Exception.Message)"
    exit 1
  }
}

exit 0
