
# Arka.Core.psm1 — Noyau commun ARKA (WSL/tmux/catalog/notify)

Set-StrictMode -Version Latest

$script:ArkaVerbose = $false
function Set-ArkaVerbose([switch]$On) { $script:ArkaVerbose = [bool]$On }
function Write-ArkaInfo([string]$msg) { if ($script:ArkaVerbose) { Write-Host "[ARKA] $msg" -ForegroundColor DarkCyan } }
function Write-ArkaWarn([string]$msg) { Write-Warning "[ARKA] $msg" }
function Write-ArkaErr ([string]$msg) { Write-Error   "[ARKA] $msg" }

function ConvertTo-BashSingleQuoted {
  param([string]$Value)
  if ($null -eq $Value) { return "''" }
  $sq = [char]39; $dq = [char]34
  $replacement = [string]::Concat([string]$sq, [string]$dq, [string]$sq, [string]$sq, [string]$dq, [string]$sq)
  "'" + ($Value -replace [regex]::Escape([string]$sq), $replacement) + "'"
}

function Get-ArkaRepoRoot {
  param([string]$BaseScriptRoot)
  try {
    $root = Resolve-Path $BaseScriptRoot
    for ($i=0; $i -lt 6 -and $root -ne $null; $i++) {
      if (Test-Path (Join-Path $root ".openAi-provider") -PathType Container) { return $root }
      if (Test-Path (Join-Path $root ".git") -PathType Container)            { return $root }
      $parent = Split-Path $root -Parent
      if (-not $parent -or $parent -eq $root) { break }
      $root = $parent
    }
    return (Resolve-Path $BaseScriptRoot).Path
  } catch { return $BaseScriptRoot }
}

$script:ArkaSessionProviderCatalog = @()
$script:ArkaSessionRoleMap = @{}

function Import-ArkaProviderCatalog {
  param([string]$RepoRoot)
  $script:ArkaSessionProviderCatalog = @()
  $script:ArkaSessionRoleMap = @{}

  $root = Join-Path $RepoRoot ".openAi-provider"
  if (-not (Test-Path $root)) { return @() }

  Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
    $provider = $_.Name
    Get-ChildItem -LiteralPath $_.FullName -Directory | ForEach-Object {
      $roleFolder = $_.Name
      $roleYaml = Join-Path $_.FullName "role.yaml"
      $meta = @{
        Provider   = $provider
        RoleFolder = $roleFolder
        RoleName   = $roleFolder
        Cmd        = $null
      }
      if (Test-Path $roleYaml) {
        try {
          $raw = Get-Content -Raw -LiteralPath $roleYaml -ErrorAction Stop
          $y   = $raw | ConvertFrom-Yaml
          if ($y.name) { $meta.RoleName = [string]$y.name }
          if ($y.cmd)  { $meta.Cmd      = [string]$y.cmd  }
          if ($y.slug) { $meta.RoleFolder = [string]$y.slug }
        } catch {
          Write-ArkaWarn "role.yaml invalide: $roleYaml ($($_.Exception.Message))"
        }
      }
      $script:ArkaSessionProviderCatalog += [pscustomobject]$meta

      $provKey = $provider.ToLowerInvariant()
      $nameK   = "${provKey}:" + ($meta.RoleName.ToLowerInvariant())
      $slugK   = "${provKey}:" + ($meta.RoleFolder.ToLowerInvariant())
      $script:ArkaSessionRoleMap[$nameK] = $meta
      $script:ArkaSessionRoleMap[$slugK] = $meta
    }
  }
  return $script:ArkaSessionProviderCatalog
}

function Get-ArkaProviderCatalog {
  param([string]$RepoRoot)
  if ($script:ArkaSessionProviderCatalog.Count -gt 0) { return $script:ArkaSessionProviderCatalog }
  Import-ArkaProviderCatalog -RepoRoot $RepoRoot | Out-Null
  return $script:ArkaSessionProviderCatalog
}

function Find-ArkaRoleMeta {
  param([string]$Provider, [string]$Role)
  $prov = $Provider.ToLowerInvariant()
  $r    = $Role.ToLowerInvariant()
  $key1 = "${prov}:${r}"
  if ($script:ArkaSessionRoleMap.ContainsKey($key1)) { return $script:ArkaSessionRoleMap[$key1] }
  $slug = ($Role -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
  $key2 = "${prov}:${slug}"
  if ($script:ArkaSessionRoleMap.ContainsKey($key2)) { return $script:ArkaSessionRoleMap[$key2] }
  return $null
}

function Invoke-ArkaWSL {
  param(
    [Parameter(Mandatory=$true)][string]$Command,
    [string]$Distro = "Ubuntu",
    [int]$TimeoutSeconds = 0
  )
  $escaped = ConvertTo-BashSingleQuoted $Command
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName  = "wsl"
  $psi.Arguments = "-d $Distro -- bash -lc $escaped"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute        = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  if ($TimeoutSeconds -gt 0) {
    if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
      try { $p.Kill() } catch {}
      return [pscustomobject]@{ Code=124; StdOut=""; StdErr="Timeout after $TimeoutSeconds s" }
    }
  } else { $p.WaitForExit() }
  return [pscustomobject]@{
    Code   = $p.ExitCode
    StdOut = $p.StandardOutput.ReadToEnd().Trim()
    StdErr = $p.StandardError.ReadToEnd().Trim()
  }
}

function Test-ArkaWSLTool {
  param([string]$Tool, [string]$Distro = "Ubuntu")
  $r = Invoke-ArkaWSL -Command "command -v $Tool >/dev/null 2>&1" -Distro $Distro
  return ($r.Code -eq 0)
}

function Get-ArkaSessionName {
  param([string]$Project, [string]$Role, [string]$Provider)
  "arka-$Project-$Role-$Provider"
}

function Resolve-ArkaSessionParts {
  param([string]$SessionName)
  if (-not $SessionName) { return $null }
  if ($SessionName -match '^(?i)arka-(?<project>.+)-(?<role>[^-]+)-(?<provider>[^-]+)$') {
    return [pscustomobject]@{
      Project  = $Matches['project']
      Role     = $Matches['role']
      Provider = $Matches['provider']
      IsLegacy = $false
    }
  }
  if ($SessionName -match '^(?i)Arka-(?<project>.+)-(?<role>[^-]+)$') {
    return [pscustomobject]@{
      Project  = $Matches['project']
      Role     = $Matches['role']
      Provider = 'codex'
      IsLegacy = $true
    }
  }
  return $null
}

function Get-ArkaSessions {
  param([string]$Project,[string]$Provider="codex",[string]$Distro="Ubuntu")
  $ls = Invoke-ArkaWSL -Distro $Distro -Command 'tmux list-sessions -F "#{session_name}" 2>/dev/null || true'
  if ($ls.Code -ne 0) { return @() }
  $names = @($ls.StdOut -split "`n" | Where-Object { $_ })
  $out = @()
  foreach ($n in $names) {
    $parts = Resolve-ArkaSessionParts -SessionName $n
    if (-not $parts) { continue }
    if ($Project  -and $parts.Project  -ne $Project)   { continue }
    if ($Provider -and $parts.Provider -ne $Provider)  { continue }
    $out += [pscustomobject]@{ Session=$n; Project=$parts.Project; Role=$parts.Role; Provider=$parts.Provider; IsLegacy=$parts.IsLegacy }
  }
  return $out
}

function New-ArkaSession {
  param([Parameter(Mandatory=$true)][string]$Project,[Parameter(Mandatory=$true)][string]$Role,[string]$Provider="codex",[string]$Distro="Ubuntu",[string]$DefaultCmd="bash -l",[string]$CodexCmd=$null,[string]$RepoRoot=$null)
  if (-not (Test-ArkaWSLTool -Tool "tmux" -Distro $Distro)) {
    return [pscustomobject]@{ Session="(global)"; Created=$false; Cmd=$null; Error="tmux non disponible dans $Distro" }
  }
  $session = Get-ArkaSessionName -Project $Project -Role $Role -Provider $Provider
  $has = Invoke-ArkaWSL -Distro $Distro -Command "tmux has-session -t ${session} 2>/dev/null"
  if ($has.Code -eq 0) { return [pscustomobject]@{ Session=$session; Created=$false; Cmd=$null; Error=$null } }
  $cmd = $DefaultCmd
  if ($CodexCmd) { $cmd = $CodexCmd } elseif ($RepoRoot) {
    $null = Get-ArkaProviderCatalog -RepoRoot $RepoRoot
    $meta = Find-ArkaRoleMeta -Provider $Provider -Role $Role
    if ($meta -and $meta.Cmd) { $cmd = [string]$meta.Cmd }
  }
  $start = Invoke-ArkaWSL -Distro $Distro -Command ("tmux new-session -d -s {0} '{1}'" -f $session, $cmd)
  if ($start.Code -eq 0) { return [pscustomobject]@{ Session=$session; Created=$true; Cmd=$cmd; Error=$null } }
  else { return [pscustomobject]@{ Session=$session; Created=$false; Cmd=$cmd; Error=$start.StdErr } }
}

function Send-TmuxKeys { param([string]$Session,[string]$Keys,[string]$Distro="Ubuntu")
  $cmd = "tmux send-keys -t ${Session} -- " + $Keys; return Invoke-ArkaWSL -Distro $Distro -Command $cmd }

function Capture-TmuxPane { param([string]$Session,[string]$Pane="0.0",[int]$Lines=300,[string]$Distro="Ubuntu")
  $cmd = "tmux capture-pane -p -t ${Session}:${Pane} -S -${Lines}"; return Invoke-ArkaWSL -Distro $Distro -Command $cmd }

function Get-TmuxPaneInfo { param([string]$Session,[string]$Pane="0.0",[string]$Distro="Ubuntu")
  $cmd = "tmux display-message -p -t ${Session}:${Pane} '#{pane_pid} #{pane_current_command}'"
  $r = Invoke-ArkaWSL -Distro $Distro -Command $cmd
  if ($r.Code -ne 0) { return $null }
  $parts = $r.StdOut -split '\s+'; [pscustomobject]@{ Pid=$parts[0]; Cmd=($parts | Select-Object -Skip 1 -Join ' ') }
}

function New-ArkaNotifyPayload {
  param(
    [string]$NtId = "NT-A2A-MESSAGE_TO_RESULT",
    [string]$IntentKey = "AUTO_FROM_MESSAGE",
    [string]$ResourceType = "message",
    [Parameter(Mandatory=$true)][string]$ResourcePointer,
    [string[]]$Constraints = @("NO_TIME","EXECUTE_NOW","NOTIFY_SILENT","CONTINUE_ON_SILENCE","NO_ACK_REQUIRED","KEEP_CHAIN_ACTIVE","STATUS_EVERY:15m"),
    [string]$FromAgent,
    [Parameter(Mandatory=$true)][string]$ToAgent
  )
  $payload = @{
    nt_id      = $NtId
    intent     = @{ key = $IntentKey }
    resource   = @{ type = $ResourceType; pointer = $ResourcePointer }
    constraints= $Constraints
    from_agent = $FromAgent
    to_agent   = $ToAgent
  }
  return $payload
}

function Validate-ArkaNotifyPayload {
  param([hashtable]$Payload)
  $errors = @()
  if (-not $Payload.nt_id) { $errors += 'nt_id requis' }
  if (-not $Payload.intent -or -not $Payload.intent.key) { $errors += 'intent.key requis' }
  if (-not $Payload.resource -or -not $Payload.resource.type -or -not $Payload.resource.pointer) { $errors += 'resource.type et resource.pointer requis' }
  if (-not $Payload.to_agent) { $errors += 'to_agent requis' }
  return ,$errors
}

if ($MyInvocation.MyCommand.Module) {
  Export-ModuleMember -Function *-Arka*,Get-*,New-*,Send-*,Capture-*
}
