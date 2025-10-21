if (-not (Get-Variable -Name ArkaSessionProviderCatalog -Scope Script -ErrorAction SilentlyContinue)) {
  $script:ArkaSessionProviderCatalog = @()
}
if (-not (Get-Variable -Name ArkaSessionRoleMap -Scope Script -ErrorAction SilentlyContinue)) {
  $script:ArkaSessionRoleMap = @{}
}
if (-not (Get-Variable -Name ArkaSessionAliasMap -Scope Script -ErrorAction SilentlyContinue)) {
  $script:ArkaSessionAliasMap = @{
    "ld" = "LD"
    "leaddev" = "LD"
    "lead-dev" = "LD"
    "leaddevbatisseur" = "LD"
    "lead-dev-batisseur" = "LD"
  }
}

function Escape-ArkaSingleQuote {
  param([string]$Value)
  if ($null -eq $Value) { return '' }

  $singleQuote = [char]39
  $doubleQuote = [char]34
  $replacement = [string]::Concat(
    [string]$singleQuote,
    [string]$doubleQuote,
    [string]$singleQuote,
    [string]$doubleQuote,
    [string]$singleQuote
  )

  return $Value.Replace([string]$singleQuote, $replacement)
}

function Invoke-ArkaWslCommand {
  param(
    [string]$Command,
    [string]$DistroName = 'Ubuntu'
  )

  $escapedCmd = Escape-ArkaSingleQuote $Command
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName  = 'wsl'
  $psi.Arguments = "-d $DistroName -- bash -lc '$escapedCmd'"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute        = $false

  $process = [System.Diagnostics.Process]::Start($psi)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  [pscustomobject]@{
    Code = $process.ExitCode
    Out  = $stdout
    Err  = $stderr
  }
}

function Get-ArkaRepoRoot {
  param([string]$BaseScriptRoot)

  if (-not $BaseScriptRoot) { return $null }
  try {
    $level1 = Split-Path -Path $BaseScriptRoot -Parent
    $level2 = if ($level1) { Split-Path -Path $level1 -Parent } else { $null }
    $level3 = if ($level2) { Split-Path -Path $level2 -Parent } else { $null }
    if (-not $level3) { return $null }
    return (Resolve-Path $level3).Path
  } catch {
    return $null
  }
}

function Get-ArkaProviderCatalog {
  param([string]$RepoRoot)

  $catalog = @()
  if (-not $RepoRoot) { return $catalog }

  $providerRoot = Join-Path $RepoRoot '.openAi-provider'
  if (-not (Test-Path $providerRoot)) { return $catalog }

  Get-ChildItem -Path $providerRoot -Directory -Force | ForEach-Object {
    if ($_.Name -match '^\.(?<provider>[^-]+)-(?<role>.+)$') {
      $provider = $Matches['provider']
      $roleFolder = $Matches['role']
      $roleKey = ($roleFolder -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
      if (-not $roleKey) { $roleKey = $roleFolder.ToLowerInvariant() }
      $catalog += [pscustomobject]@{
        Provider   = $provider
        RoleFolder = $roleFolder
        RoleKey    = $roleKey
      }
    }
  }
  return $catalog
}

function New-ArkaProviderRoleMap {
  param([array]$ProviderCatalog)

  $map = @{}
  if (-not $ProviderCatalog) { return $map }

  foreach ($entry in $ProviderCatalog) {
    $provKey = $entry.Provider.ToLowerInvariant()
    if ($map.ContainsKey($provKey)) {
      $map[$provKey] += $entry.RoleFolder
    } else {
      $map[$provKey] = @($entry.RoleFolder)
    }
  }

  foreach ($key in @($map.Keys)) {
    $map[$key] = @($map[$key] | Sort-Object { $_.Length } -Descending)
  }

  return $map
}

function Set-ArkaSessionContext {
  param([array]$ProviderCatalog)

  $script:ArkaSessionProviderCatalog = if ($ProviderCatalog) { $ProviderCatalog } else { @() }
  $script:ArkaSessionRoleMap = New-ArkaProviderRoleMap -ProviderCatalog $script:ArkaSessionProviderCatalog
}

function Resolve-ArkaAliasValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $slug = ($Value -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
  if ($script:ArkaSessionAliasMap.ContainsKey($slug)) {
    return $script:ArkaSessionAliasMap[$slug]
  }
  return $null
}

function Find-ArkaCatalogEntry {
  param(
    [array]$Catalog,
    [string]$ProviderKey,
    [string]$AgentName,
    [string]$AgentSlug
  )

  if (-not $Catalog) { return $null }
  $agentLower = $AgentName.ToLowerInvariant()
  $candidates = $Catalog | Where-Object { $_.Provider.ToLowerInvariant() -eq $ProviderKey }
  if (-not $candidates) { return $null }

  $best = $null
  foreach ($entry in $candidates) {
    $roleKey = $entry.RoleKey
    $roleFolderLower = $entry.RoleFolder.ToLowerInvariant()
    if ($roleFolderLower -eq $agentLower) { return $entry }
    if ($roleKey -eq $AgentSlug) { return $entry }
    if ($AgentSlug -and $roleKey -and $AgentSlug.Contains($roleKey)) {
      if (-not $best -or $roleKey.Length -lt $best.RoleKey.Length) {
        $best = $entry
      }
    } elseif ($roleKey -and $roleKey.Contains($AgentSlug)) {
      if (-not $best -or $roleKey.Length -lt $best.RoleKey.Length) {
        $best = $entry
      }
    } elseif ($roleFolderLower -and $agentLower.Contains($roleFolderLower)) {
      if (-not $best -or $entry.RoleFolder.Length -lt $best.RoleFolder.Length) {
        $best = $entry
      }
    }
  }
  return $best
}

function Resolve-ArkaRoleFolder {
  param(
    [string]$Provider,
    [string]$Role,
    [array]$ProviderCatalog
  )

  if (-not $Role) { return $null }
  if (-not $ProviderCatalog) { $ProviderCatalog = $script:ArkaSessionProviderCatalog }
  if (-not $ProviderCatalog) { return $Role }

  $providerKey = if ($Provider) { $Provider.ToLowerInvariant() } else { 'codex' }
  $roleKey = ($Role -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
  if (-not $roleKey) {
    $roleKey = $Role.ToLowerInvariant()
  }

  $match = $ProviderCatalog | Where-Object {
    $_.Provider.ToLowerInvariant() -eq $providerKey -and (
      $_.RoleFolder.Equals($Role, [System.StringComparison]::OrdinalIgnoreCase) -or
      $_.RoleKey -eq $roleKey
    )
  }

  if ($match -and $match.Count -ge 1) {
    return $match[0].RoleFolder
  }

  $aliasValue = Resolve-ArkaAliasValue $Role
  if ($aliasValue) { return $aliasValue }

  $aliasEntry = Find-ArkaCatalogEntry -Catalog $ProviderCatalog -ProviderKey $providerKey -AgentName $Role -AgentSlug $roleKey
  if ($aliasEntry) { return $aliasEntry.RoleFolder }
  return $Role
}

function Resolve-ArkaSessionParts {
  param(
    [string]$SessionName,
    [hashtable]$RoleMap
  )

  if ([string]::IsNullOrWhiteSpace($SessionName)) { return $null }
  if (-not $SessionName.StartsWith('arka-', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }

  $body = $SessionName.Substring(5)
  if ([string]::IsNullOrEmpty($body)) { return $null }

  $segments = $body -split '-'
  if ($segments.Count -lt 3) { return $null }

  $lastHyphen = $body.LastIndexOf('-')
  if ($lastHyphen -lt 0) { return $null }

  $providerPart = $body.Substring($lastHyphen + 1)
  if ([string]::IsNullOrEmpty($providerPart)) { return $null }

  $beforeProvider = $body.Substring(0, $lastHyphen)

  $rolePart = $null
  $projectPart = $null

  if (-not $RoleMap) {
    $RoleMap = $script:ArkaSessionRoleMap
  }
  if (-not $RoleMap) {
    $RoleMap = @{}
  }

  $provKey = $providerPart.ToLowerInvariant()
  $roleCandidates = if ($RoleMap.ContainsKey($provKey)) { $RoleMap[$provKey] } else { @() }

  foreach ($candidate in $roleCandidates) {
    $suffix = '-' + $candidate
    if ($beforeProvider.EndsWith($suffix, [System.StringComparison]::OrdinalIgnoreCase)) {
      $rolePart = $candidate
      $projectPart = $beforeProvider.Substring(0, $beforeProvider.Length - $suffix.Length)
      break
    }
    if ($beforeProvider.Equals($candidate, [System.StringComparison]::OrdinalIgnoreCase)) {
      $rolePart = $candidate
      $projectPart = ''
      break
    }
  }

  if (-not $rolePart) {
    $roleSeparator = $beforeProvider.LastIndexOf('-')
    if ($roleSeparator -ge 0) {
      $projectPart = $beforeProvider.Substring(0, $roleSeparator)
      $rolePart = $beforeProvider.Substring($roleSeparator + 1)
    } else {
      $projectPart = ''
      $rolePart = $beforeProvider
    }
  }

  $projectPart = $projectPart.Trim('-').Trim()
  if ([string]::IsNullOrWhiteSpace($projectPart)) {
    $projectPart = $beforeProvider
  }

  return [pscustomobject]@{
    Project  = $projectPart
    Role     = $rolePart
    Provider = $providerPart
  }
}
