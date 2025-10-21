<# =====================================================================
 Start-ArkaEnv.ps1
 Crée les sessions tmux arka-<project>-<role>-<provider> dans WSL et lance codex
 en "full access" (danger-full-access, approval never).

 Entrées :
  -Project      : tag projet (ex: "arka-labs-b")
  -Distro       : nom WSL (défaut: "Ubuntu")
  -Agents       : liste rôles (défaut: détection .openAi-provider ou gouvernance+projet)
  -Provider     : provider ciblé (défaut: "codex")
  -CodexCmd     : commande codex (défaut full access)
  -DryRun       : n’exécute pas, affiche seulement

 Sortie (stdout) : JSON
  [
    {"session":"arka-<project>-<role>-<provider>","created":true|false,"cmd":"...","error":null|"..."}
  ]

 Codes retour :
  0 = OK (au moins une session créée ou déjà présente)
  2 = Aucune session opérationnelle / erreur bloquante
===================================================================== #>

param(
  [Parameter(Mandatory=$true)][string]$Project,
  [string]$Distro = "Ubuntu",
  [string[]]$Agents = @("archiviste","scribd","leaddev","devops","agp","pmo","qa","uxui"),
  [string]$CodexCmd = 'codex --sandbox danger-full-access --ask-for-approval never',
  [string]$Provider = "codex",
  [switch]$DryRun
)

$aliasMap = @{
  "ld" = "LD"
  "leaddev" = "LD"
  "lead-dev" = "LD"
  "leaddevbatisseur" = "LD"
  "lead-dev-batisseur" = "LD"
  "core-archivist" = "Archiviste"
  "corearchivist" = "Archiviste"
  "archivist" = "Archiviste"
  "uxui" = "UX-UI"
  "ux-ui" = "UX-UI"
}

function Resolve-AgentAliasName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return $null }
  $slug = ($Name -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
  if ($aliasMap.ContainsKey($slug)) {
    return $aliasMap[$slug]
  }
  return $null
}

function Get-StartArkaNormalizedToken {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return ($Value -replace '[^A-Za-z0-9]+','').ToLowerInvariant()
}

function Convert-WindowsPathToWsl {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  $normalized = $Path -replace '\\','/'
  if ($normalized -match '^(?<drive>[A-Za-z]):/(?<rest>.*)$') {
    $drive = $Matches['drive'].ToLowerInvariant()
    $rest = $Matches['rest']
    return "/mnt/$drive/$rest"
  }
  return $normalized
}

# --- Helpers ---------------------------------------------------------
function Escape-BashSingleQuote([string]$Value) {
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

function Invoke-WSL([string]$cmd, [string]$DistroName) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName  = "wsl"
  $escaped = Escape-BashSingleQuote $cmd
  $psi.Arguments = "-d $DistroName -- bash -lc '$escaped'"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute        = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  [pscustomobject]@{
    Code   = $p.ExitCode
    StdOut = $p.StandardOutput.ReadToEnd().Trim()
    StdErr = $p.StandardError.ReadToEnd().Trim()
  }
}

function Ensure-WSLTool([string]$tool, [string]$DistroName) {
  $r = Invoke-WSL "command -v $tool >/dev/null 2>&1" $DistroName
  return ($r.Code -eq 0)
}

function Get-ArkaProviderCatalog {
  param(
    [string]$BaseScriptRoot
  )

  $catalog = @()
  if (-not $BaseScriptRoot) {
    return $catalog
  }

  try {
    $script:StartArkaEnvRepoRoot = (Resolve-Path (Join-Path $BaseScriptRoot '..\..\..')).Path
  } catch {
    $script:StartArkaEnvRepoRoot = $null
  }

  try {
    $repoRoot = (Resolve-Path (Join-Path $BaseScriptRoot '..\..\..')).Path
  } catch {
    return $catalog
  }

  $providerRoot = Join-Path $repoRoot ".openAi-provider"
  if (-not (Test-Path $providerRoot)) {
    return $catalog
  }

  Get-ChildItem -Path $providerRoot -Directory | ForEach-Object {
    if ($_.Name -match '^\.(?<provider>[^-]+)-(?<role>.+)$') {
      $provider = $Matches['provider']
      $roleFolder = $Matches['role']
      $roleKey = ($roleFolder -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
      if (-not $roleKey) {
        $roleKey = $roleFolder.ToLowerInvariant()
      }
      $roleToken = Get-StartArkaNormalizedToken $roleFolder
      $catalog += [pscustomobject]@{
        Provider   = $provider
        RoleFolder = $roleFolder
        RoleKey    = $roleKey
        RoleToken  = $roleToken
      }
    }
  }

  return $catalog
}

$providerCatalog = Get-ArkaProviderCatalog -BaseScriptRoot $PSScriptRoot
$providerLookup = @{}
foreach ($entry in $providerCatalog) {
  $providerKey = $entry.Provider.ToLowerInvariant()
  $roleFolderKey = "$providerKey`:$($entry.RoleFolder.ToLowerInvariant())"
  $roleSlugKey = "$providerKey`:$($entry.RoleKey)"
  $providerLookup[$roleFolderKey] = $entry
  $providerLookup[$roleSlugKey] = $entry
}

$repoRootWindows = $null
try {
  $current = Get-Item $PSScriptRoot
  while ($current) {
    $candidate = $current.FullName
    $hasProvider = Test-Path (Join-Path $candidate '.openAi-provider')
    $hasGit = Test-Path (Join-Path $candidate '.git')
    if ($hasProvider -or $hasGit) {
      $repoRootWindows = $candidate
      break
    }
    if (-not $current.Parent -or $current.Parent.FullName -eq $candidate) { break }
    $current = $current.Parent
  }
} catch {
  $repoRootWindows = $null
}
$script:StartArkaEnvRepoRoot = $repoRootWindows
$repoRootWsl = Convert-WindowsPathToWsl $repoRootWindows
$tmuxDirOption = ''
if ($repoRootWsl) {
  $escapedRepo = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($repoRootWsl)
  $tmuxDirOption = "-c '$escapedRepo'"
}

function Find-ArkaProviderRoleEntry {
  param(
    [string]$ProviderKey,
    [string]$AgentName,
    [string]$AgentSlug
  )

  if (-not $providerCatalog) { return $null }
  $candidates = $providerCatalog | Where-Object { $_.Provider.ToLowerInvariant() -eq $ProviderKey }
  if (-not $candidates) { return $null }

  $agentLower = $AgentName.ToLowerInvariant()
  $agentToken = Get-StartArkaNormalizedToken $AgentName
  $agentSlugToken = Get-StartArkaNormalizedToken $AgentSlug
  $best = $null
  foreach ($candidate in $candidates) {
    $roleFolderLower = $candidate.RoleFolder.ToLowerInvariant()
    if ($roleFolderLower -eq $agentLower) { return $candidate }
    if ($candidate.RoleKey -eq $AgentSlug) { return $candidate }
    if ($candidate.RoleToken -and $agentToken -and $candidate.RoleToken -eq $agentToken) { return $candidate }
    if ($candidate.RoleToken -and $agentSlugToken -and $candidate.RoleToken -eq $agentSlugToken) { return $candidate }
    if ($agentToken -and $candidate.RoleToken -and $agentToken.Contains($candidate.RoleToken)) {
      if (-not $best -or $candidate.RoleToken.Length -lt $best.RoleToken.Length) {
        $best = $candidate
      }
    } elseif ($candidate.RoleToken -and $agentToken -and $candidate.RoleToken.Contains($agentToken)) {
      if (-not $best -or $candidate.RoleToken.Length -lt $best.RoleToken.Length) {
        $best = $candidate
      }
    } elseif ($AgentSlug -and $candidate.RoleKey -and $AgentSlug.Contains($candidate.RoleKey)) {
      if (-not $best -or $candidate.RoleKey.Length -lt $best.RoleKey.Length) {
        $best = $candidate
      }
    } elseif ($roleFolderLower -and $agentLower.Contains($roleFolderLower)) {
      if (-not $best -or $candidate.RoleFolder.Length -lt $best.RoleFolder.Length) {
        $best = $candidate
      }
    }
  }
  return $best
}

$usingDefaultAgents = -not $PSBoundParameters.ContainsKey('Agents') -or -not $Agents -or $Agents.Count -eq 0
if ($usingDefaultAgents) {
  $defaultAgents = @("archiviste","scribd","leaddev","devops","agp","pmo","qa","uxui")
} else {
  $defaultAgents = $Agents
}

if ($defaultAgents.Count -gt 0) {
  $resolvedAgents = @()
  foreach ($agentName in $defaultAgents) {
    $name = $agentName.ToString()
    $aliasName = Resolve-AgentAliasName $name
    if ($aliasName) {
      $resolvedAgents += $aliasName
      continue
    }
    $providerKey = $Provider.ToLowerInvariant()
    $lookupKey = "$providerKey`:$($name.ToLowerInvariant())"
    $roleEntry = $null
    if ($providerLookup.ContainsKey($lookupKey)) {
      $roleEntry = $providerLookup[$lookupKey]
    } else {
      $agentSlug = ($name -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
      if (-not $agentSlug) {
        $agentSlug = $name.ToLowerInvariant()
      }
      $slugKey = "$providerKey`:$agentSlug"
      if ($providerLookup.ContainsKey($slugKey)) {
        $roleEntry = $providerLookup[$slugKey]
      } else {
        $roleEntry = Find-ArkaProviderRoleEntry -ProviderKey $providerKey -AgentName $name -AgentSlug $agentSlug
      }
    }
    if ($roleEntry) {
      $resolvedAgents += $roleEntry.RoleFolder
    } else {
      $resolvedAgents += $name
    }
  }

  if ($resolvedAgents.Count -gt 0) {
    $Agents = $resolvedAgents
  } else {
    $Agents = @("archiviste","scribd","leaddev","devops","agp","pmo","qa","uxui")
  }
}

# --- Préchecks -------------------------------------------------------
$results = @()

# Vérifier WSL + tmux
$wslOk = (Get-Command wsl -ErrorAction SilentlyContinue) -ne $null
if (-not $wslOk) {
  $results += [pscustomobject]@{session="(global)"; created=$false; cmd=$null; error="WSL introuvable (wsl.exe)"; }
  $results | ConvertTo-Json -Depth 5
  exit 2
}
if (-not (Ensure-WSLTool "tmux" $Distro)) {
  $results += [pscustomobject]@{session="(global)"; created=$false; cmd=$null; error="tmux absent dans WSL ($Distro)"; }
  $results | ConvertTo-Json -Depth 5
  exit 2
}

# Déterminer commande de session (fallback bash -l si codex absent)
$codexExists = (Invoke-WSL "command -v ${($CodexCmd.Split(' ')[0])} >/dev/null 2>&1" $Distro).Code -eq 0
$sessionCmd  = if ($codexExists) { $CodexCmd } else { "bash -l" }

# --- Création / lancement -------------------------------------------
foreach ($agent in $Agents) {
  $agentName = $agent.ToString()
  $aliasName = Resolve-AgentAliasName $agentName
  if ($aliasName) {
    $agentName = $aliasName
  }
  $providerKey = $Provider.ToLowerInvariant()
  $lookupKey = "$providerKey`:$($agentName.ToLowerInvariant())"
  $roleEntry = $null
  if ($providerLookup.ContainsKey($lookupKey)) {
    $roleEntry = $providerLookup[$lookupKey]
  } else {
    $agentSlug = ($agentName -replace '[^A-Za-z0-9]+','-').ToLowerInvariant().Trim('-')
    if (-not $agentSlug) {
      $agentSlug = $agentName.ToLowerInvariant()
    }
    $slugKey = "$providerKey`:$agentSlug"
    if ($providerLookup.ContainsKey($slugKey)) {
      $roleEntry = $providerLookup[$slugKey]
    } else {
      $roleEntry = Find-ArkaProviderRoleEntry -ProviderKey $providerKey -AgentName $agentName -AgentSlug $agentSlug
    }
  }

  $roleSegment = if ($roleEntry) { $roleEntry.RoleFolder } else { $agentName }
  $session = "arka-$Project-$roleSegment-$Provider"
  $escapedSession = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($session)

  # Existe déjà ?
  $has = Invoke-WSL "tmux has-session -t '$escapedSession' 2>/dev/null" $Distro
  if ($has.Code -eq 0) {
    $results += [pscustomobject]@{session=$session; created=$false; cmd=$sessionCmd; error=$null}
    continue
  }

  if ($DryRun) {
    $results += [pscustomobject]@{session=$session; created=$true; cmd=$sessionCmd; error=$null}
    continue
  }

  # Quoting sûr : passer par bash -lc et garder la commande complète (avec options)
  $escapedCmd = [System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent($sessionCmd)
  if ($tmuxDirOption) {
    $startCommand = "tmux new-session -d $tmuxDirOption -s '$escapedSession' 'exec bash -lc ""$escapedCmd""'"
  } else {
    $startCommand = "tmux new-session -d -s '$escapedSession' 'exec bash -lc ""$escapedCmd""'"
  }
  $start = Invoke-WSL $startCommand $Distro

  if ($start.Code -eq 0) {
    $results += [pscustomobject]@{session=$session; created=$true; cmd=$sessionCmd; error=$null}
  } else {
    $results += [pscustomobject]@{session=$session; created=$false; cmd=$sessionCmd; error=$start.StdErr}
  }
}

# --- Sortie JSON & exit code ----------------------------------------
$results | ConvertTo-Json -Depth 5

# Code retour : 0 si au moins une session OK (created ou existante, sans error)
$ok = $results | Where-Object { $_.error -eq $null }
if ($ok.Count -gt 0) { exit 0 } else { exit 2 }
