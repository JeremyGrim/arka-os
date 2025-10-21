param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Provider = 'codex',
  [string]$Distro = 'Ubuntu',
  [switch]$DryRun
)

$scriptRoot = $PSScriptRoot
$commonPath = Join-Path $scriptRoot 'common/ArkaSessionUtils.ps1'
if (-not (Test-Path $commonPath)) {
  Write-Error "ArkaSessionUtils.ps1 introuvable ($commonPath)."
  exit 3
}
. $commonPath

$startScript  = Join-Path $scriptRoot 'Start-ArkaEnv.ps1'

if (-not (Test-Path $startScript)) {
  Write-Error "Start-ArkaEnv.ps1 introuvable ($startScript)."
  exit 3
}

$repoRoot = Get-ArkaRepoRoot -BaseScriptRoot $scriptRoot
$script:ArkaRepoRoot = $repoRoot
$providerCatalog = Get-ArkaProviderCatalog -RepoRoot $repoRoot
Set-ArkaSessionContext -ProviderCatalog $providerCatalog

function Get-ArkaSessions {
  param(
    [string]$Provider,
    [string]$Project,
    [string]$Distro = 'Ubuntu'
  )

  $result = @()
  $ls = Invoke-ArkaWslCommand "tmux ls 2>/dev/null || true" $Distro
  if ($ls.Code -ne 0 -or -not $ls.Out) {
    return $result
  }

  foreach ($line in ($ls.Out -split "`n")) {
    if ($line -match '^([^:]+):') {
      $session = $Matches[1]
      $projectPart = $null
      $rolePart = $null
      $providerPart = $null

      $parsed = Resolve-ArkaSessionParts -SessionName $session
      if ($parsed) {
        $projectPart  = $parsed.Project
        $rolePart     = $parsed.Role
        $providerPart = $parsed.Provider
      } elseif ($session -match '^(?i)arka-(?<project>.+)-(?<role>[^-]+)$') {
        $projectPart  = $Matches['project']
        $rolePart     = $Matches['role']
        $providerPart = 'codex'
      } elseif ($session -match '^(?i)Arka-(?<project>.+)-(?<role>[^-]+)$') {
        $projectPart  = $Matches['project']
        $rolePart     = $Matches['role']
        $providerPart = 'codex'
        $session = "Arka-$projectPart-$rolePart"
      } else {
        continue
      }

      if ($Provider -and -not $providerPart.Equals($Provider, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }

      if ($Project -and -not $projectPart.Equals($Project, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }

      $result += [pscustomobject]@{
        Session  = $session
        Project  = $projectPart
        Role     = $rolePart
        Provider = $providerPart
      }
    }
  }

  return $result | Sort-Object Project, Role
}

function Select-ArkaRoles {
  param(
    [string]$Project,
    [string]$Provider,
    [array]$Catalog,
    [array]$ExistingRoles
  )

  if (-not $Catalog -or $Catalog.Count -eq 0) {
    Write-Warning "Aucun rôle disponible pour le provider $Provider."
    return @()
  }
  if (-not $ExistingRoles) { $ExistingRoles = @() }

  Write-Host ''
  Write-Host ("Sélection des agents {0}" -f $Provider) -ForegroundColor Cyan
  if ($Project) {
    Write-Host ("Projet : {0}" -f $Project) -ForegroundColor Cyan
  }
  Write-Host "Indique les numéros séparés par des virgules (ex: 1,3,5)." -ForegroundColor Cyan
  Write-Host ''

  $ordered = $Catalog | Sort-Object -Property RoleFolder
  for ($i = 0; $i -lt $ordered.Count; $i++) {
    $roleName = $ordered[$i].RoleFolder
    $marker = if ($ExistingRoles -contains $roleName) { '[en cours]' } else { '         ' }
    Write-Host ("{0,2}. {1} {2}" -f ($i + 1), $roleName, $marker)
  }
  Write-Host ''
  $raw = Read-Host 'Choix'
  if (-not $raw) { return @() }

  $indices = $raw -split '[,\s]+' | Where-Object { $_ } | ForEach-Object {
    if ($_ -as [int]) { [int]$_ } else { $null }
  } | Where-Object { $_ -ge 1 -and $_ -le $ordered.Count }

  $selected = @()
  foreach ($idx in $indices) {
    $selected += $ordered[$idx - 1].RoleFolder
  }
  return @($selected | Sort-Object -Unique)
}

function Select-ArkaSessions {
  param([array]$Sessions)

  if (-not $Sessions -or $Sessions.Count -eq 0) { return @() }

  Write-Host ''
  Write-Host 'Sessions disponibles' -ForegroundColor Cyan
  for ($i = 0; $i -lt $Sessions.Count; $i++) {
    $item = $Sessions[$i]
    Write-Host ("{0,2}. {1,-12} {2}" -f ($i + 1), $item.Role, $item.Session)
  }
  Write-Host ''
  $raw = Read-Host 'Numéro(s) séparés par des virgules'
  if (-not $raw) { return @() }

  $indices = $raw -split '[,\s]+' | Where-Object { $_ } | ForEach-Object {
    if ($_ -as [int]) { [int]$_ } else { $null }
  } | Where-Object { $_ -ge 1 -and $_ -le $Sessions.Count }

  $selected = @()
  foreach ($idx in $indices) {
    $selected += $Sessions[$idx - 1].Session
  }
  $unique = @($selected | ForEach-Object {
    if ($_ -ne $null) { $_.ToString().Trim() }
  } | Where-Object { $_ } | Sort-Object -Unique)
  if ($unique.Count -gt 0) {
    Write-Host ("Sélection : {0}" -f ($unique -join ', ')) -ForegroundColor DarkCyan
  }
  return @($unique)
}

function Send-TmuxText {
  param(
    [string]$Session,
    [string]$Text,
    [string]$Distro
  )

  $base64Text = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Text))
  $sessionEscaped = Escape-ArkaSingleQuote $Session
  $command = 'tmpfile=$(mktemp); echo ''{0}'' | base64 -d > $tmpfile; tmux load-buffer $tmpfile; tmux paste-buffer -t ''{1}''; rm -f $tmpfile' -f $base64Text, $sessionEscaped
  $result = Invoke-ArkaWslCommand $command $Distro
  if ($result.Code -ne 0) {
    $err = if ($result.Err) { $result.Err.Trim() } elseif ($result.Out) { $result.Out.Trim() } else { 'erreur inconnue' }
    Write-Warning ("Insertion tmux via paste-buffer échouée ({0}) : {1}" -f $Session, $err)
    $fallbackText = Escape-ArkaSingleQuote $Text
    $fallback = "tmux send-keys -t '$sessionEscaped' -l -- '$fallbackText'"
    $fallbackResult = Invoke-ArkaWslCommand $fallback $Distro
    if ($fallbackResult.Code -ne 0) {
      $fallbackErr = if ($fallbackResult.Err) { $fallbackResult.Err.Trim() } elseif ($fallbackResult.Out) { $fallbackResult.Out.Trim() } else { 'erreur inconnue' }
      Write-Warning ("Fallback tmux send-keys échoué ({0}) : {1}" -f $Session, $fallbackErr)
    }
  }
}

function Send-ArkaWakeup {
  param(
    [array]$Sessions,
    [string]$Distro,
    [string]$Provider
  )

  if (-not $Sessions -or $Sessions.Count -eq 0) {
    Write-Host 'Aucun agent sélectionné.' -ForegroundColor DarkYellow
    return
  }

  foreach ($info in $Sessions) {
    $sessionName = $info.Session
    $parsed = Resolve-ArkaSessionParts -SessionName $sessionName
    $providerSegment = if ($parsed?.Provider) { $parsed.Provider } elseif ($info.Provider) { $info.Provider } elseif ($Provider) { $Provider } else { 'codex' }
    if (-not $providerSegment) { $providerSegment = 'codex' }
    $roleSegment = if ($parsed?.Role) { $parsed.Role } elseif ($info.Role) { $info.Role } else { $sessionName }
    $roleFolder = Resolve-ArkaRoleFolder -Provider $providerSegment -Role $roleSegment -ProviderCatalog $providerCatalog
    $roleFolderFormatted = ".{0}-{1}" -f $providerSegment, $roleFolder
    $relativeOnboarding = ".openAi-provider/{0}/onboarding.md" -f $roleFolderFormatted
    $relativeWakeup = ".openAi-provider/{0}/WAKEUP-LINK.md" -f $roleFolderFormatted

    $onboardingPath = $relativeOnboarding
    $repoBase = $script:ArkaRepoRoot
    if ($repoBase) {
      $onboardingAbs = [System.IO.Path]::Combine($repoBase, ".openAi-provider", $roleFolderFormatted, "onboarding.md")
      $wakeupAbs = [System.IO.Path]::Combine($repoBase, ".openAi-provider", $roleFolderFormatted, "WAKEUP-LINK.md")
    } else {
      $onboardingAbs = $relativeOnboarding
      $wakeupAbs = $relativeWakeup
    }

    if (-not (Test-Path $onboardingAbs)) {
      if (Test-Path $wakeupAbs) {
        $onboardingPath = $relativeWakeup
      } else {
        Write-Warning ("Fichier onboarding introuvable pour {0} ({1})." -f $sessionName, $roleFolderFormatted)
        continue
      }
    }

    $message = "Voici ton rôle et contexte projet, lis tous les docs et présente-moi ton rôle : {0}" -f $onboardingPath

    Send-TmuxText -Session $sessionName -Text $message -Distro $Distro
    $sessionEscaped = Escape-ArkaSingleQuote $sessionName
    Invoke-ArkaWslCommand "tmux send-keys -t '$sessionEscaped' Enter" $Distro | Out-Null
    Invoke-ArkaWslCommand "tmux send-keys -t '$sessionEscaped' Enter" $Distro | Out-Null
    Write-Host ("Wake-up envoyé à {0} ({1})" -f $sessionName, $onboardingPath) -ForegroundColor Green
  }
}

function Send-ArkaMessage {
  param(
    [array]$Sessions,
    [string]$Distro,
    [string]$Message
  )

  if (-not $Sessions -or $Sessions.Count -eq 0) {
    Write-Host 'Aucun agent sélectionné.' -ForegroundColor DarkYellow
    return
  }
  if (-not $Message) {
    Write-Host 'Message vide, rien à envoyer.' -ForegroundColor DarkYellow
    return
  }

  foreach ($info in $Sessions) {
    Send-TmuxText -Session $info.Session -Text $Message -Distro $Distro
    $sessionEscaped = Escape-ArkaSingleQuote $info.Session
    Invoke-ArkaWslCommand "tmux send-keys -t '$sessionEscaped' Enter" $Distro | Out-Null
    Write-Host ("Message envoyé à {0}" -f $info.Session) -ForegroundColor Green
  }
}

function Remove-ArkaSessions {
  param(
    [array]$SessionNames,
    [string]$Distro
  )

  if (-not $SessionNames -or $SessionNames.Count -eq 0) {
    Write-Host 'Aucune session sélectionnée.' -ForegroundColor DarkYellow
    return
  }

  foreach ($sessionName in $SessionNames) {
    $escaped = Escape-ArkaSingleQuote $sessionName
    $result = Invoke-ArkaWslCommand "tmux kill-session -t '$escaped'" $Distro
    if ($result.Code -eq 0) {
      Write-Host ("Session {0} arrêtée." -f $sessionName) -ForegroundColor Green
    } else {
      $message = if ($result.Err) { $result.Err.Trim() } elseif ($result.Out) { $result.Out.Trim() } else { 'erreur inconnue' }
      Write-Warning ("Échec arrêt {0} : {1}" -f $sessionName, $message)
    }
  }
}

function Show-ArkaSessions {
  param([array]$Sessions)

  if (-not $Sessions -or $Sessions.Count -eq 0) {
    Write-Host 'Aucune session tmux active.' -ForegroundColor DarkYellow
    return
  }

  Write-Host ''
  Write-Host 'Sessions actives :' -ForegroundColor Cyan
  $Sessions | Sort-Object Project, Role | ForEach-Object {
    Write-Host ("- {0,-12} {1} ({2})" -f $_.Role, $_.Session, $_.Provider)
  }
}

function Convert-ArkaSelectedSessions {
  param(
    [array]$Sessions,
    [string[]]$SelectedNames
  )

  if (-not $Sessions -or $Sessions.Count -eq 0) { return @() }
  if (-not $SelectedNames -or $SelectedNames.Count -eq 0) { return @() }

  $hash = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($name in $SelectedNames) {
    if ($null -ne $name) {
      $trimmed = $name.ToString().Trim()
      if ($trimmed) { [void]$hash.Add($trimmed) }
    }
  }

  $result = @()
  foreach ($item in $Sessions) {
    if ($item) {
      $sessionName = $item.Session
      if ($sessionName) {
        $sessionKey = $sessionName.ToString().Trim()
        if ($hash.Contains($sessionKey)) { $result += $item }
      }
    }
  }
  return @($result)
}

function Invoke-ArkaStartAgents {
  param(
    [string]$Project,
    [string]$Provider,
    [string]$Distro,
    [switch]$DryRun
  )

  $sessions = Get-ArkaSessions -Provider $Provider -Project $Project -Distro $Distro
  $existingRoles = @($sessions | ForEach-Object { $_.Role })
  $providerRoles = $providerCatalog | Where-Object { $_.Provider -ieq $Provider }

  if (-not $providerRoles -or $providerRoles.Count -eq 0) {
    Write-Host ("Aucun rôle configuré pour le provider {0}." -f $Provider) -ForegroundColor DarkYellow
    return
  }

  $selectedRoles = Select-ArkaRoles -Project $Project -Provider $Provider -Catalog $providerRoles -ExistingRoles $existingRoles
  if (-not $selectedRoles -or $selectedRoles.Count -eq 0) {
    Write-Host 'Aucun rôle sélectionné, opération annulée.' -ForegroundColor DarkYellow
    return
  }

  $params = @{
    Project  = $Project
    Provider = $Provider
    Distro   = $Distro
    Agents   = $selectedRoles
  }
  if ($DryRun) {
    $params.DryRun = $true
  }

  Write-Host ''
  Write-Host ("[Start-ArkaEnv] Agents : {0}" -f ($selectedRoles -join ', ')) -ForegroundColor Cyan
  $output = & $startScript @params
  if ($null -eq $output) { return }

  $text = ($output | Out-String).Trim()
  if (-not $text) { return }

  try {
    $parsed = $text | ConvertFrom-Json -ErrorAction Stop
    $entries = @($parsed)
    $wakeupTargets = @()
    for ($idx = 0; $idx -lt $entries.Count; $idx++) {
      $entry = $entries[$idx]
      $status = if ($entry.created) { 'OK' } else { 'présent' }
      if ($entry.error) {
        Write-Warning ("{0} : {1}" -f $entry.session, $entry.error)
      } else {
        Write-Host ("{0} : {1}" -f $entry.session, $status)
        if (-not [string]::IsNullOrWhiteSpace($entry.session) -and -not $entry.error) {
          $roleSegment = $null
          if ($idx -lt $selectedRoles.Count) {
            $roleSegment = $selectedRoles[$idx]
          } else {
            $prefix = "arka-$Project-"
            $suffix = "-$Provider"
            $sessionName = [string]$entry.session
            if (
              $sessionName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -and
              $sessionName.EndsWith($suffix, [System.StringComparison]::OrdinalIgnoreCase)
            ) {
              $middleLength = $sessionName.Length - $prefix.Length - $suffix.Length
              if ($middleLength -gt 0) {
                $roleSegment = $sessionName.Substring($prefix.Length, $middleLength)
              }
            }
          }
          if ([string]::IsNullOrWhiteSpace($roleSegment)) {
            $roleSegment = $entry.session
          }
          $wakeupTargets += [pscustomobject]@{
            Session  = $entry.session
            Project  = $Project
            Role     = $roleSegment
            Provider = $Provider
          }
        }
      }
    }
    if (-not $DryRun -and $wakeupTargets.Count -gt 0) {
      $refreshedSessions = Get-ArkaSessions -Provider $Provider -Project $Project -Distro $Distro
      $mappedTargets = @()
      foreach ($target in $wakeupTargets) {
        $match = $refreshedSessions | Where-Object { $_.Session -eq $target.Session }
        if ($match) {
          $mappedTargets += $match
        } else {
          Write-Warning ("Session {0} introuvable lors de la vérification tmux." -f $target.Session)
        }
      }

      if ($mappedTargets.Count -eq 0) {
        Write-Warning "Aucune session active détectée après Start-ArkaEnv."
        return
      }

      Write-Host ''
      Write-Host ("[Wakeup] Onboarding automatique : {0}" -f ($mappedTargets.Role -join ', ')) -ForegroundColor DarkCyan
      Send-ArkaWakeup -Sessions $mappedTargets -Distro $Distro -Provider $Provider
    }
  } catch {
    Write-Output $text
  }
}

function Show-ArkaMenu {
  param(
    [string]$Project,
    [string]$Provider,
    [int]$SessionCount
  )

  Write-Host ''
  Write-Host ("Projet : {0} | Provider : {1}" -f $Project, $Provider) -ForegroundColor Cyan
  Write-Host ("Sessions actives : {0}" -f $SessionCount)
  Write-Host '1. Ajouter / démarrer des agents'
  Write-Host '2. Retirer des agents (kill-session)'
  Write-Host '3. Lister les sessions actives'
  Write-Host '4. Envoyer un wake-up onboarding'
  Write-Host '5. Quitter'
  Write-Host ''
  return (Read-Host 'Choix')
}

function Pause-ArkaPrompt {
  Read-Host 'Appuie sur Entrée pour continuer'
}

$keepRunning = $true
while ($keepRunning) {
  $sessions = Get-ArkaSessions -Provider $Provider -Project $Project -Distro $Distro
  $choice = Show-ArkaMenu -Project $Project -Provider $Provider -SessionCount ($sessions.Count)

  switch ($choice) {
    '1' {
      Invoke-ArkaStartAgents -Project $Project -Provider $Provider -Distro $Distro -DryRun:$DryRun
    }
    '2' {
      if (-not $sessions -or $sessions.Count -eq 0) {
        Write-Host 'Aucune session à retirer.' -ForegroundColor DarkYellow
      } else {
        $selected = Select-ArkaSessions -Sessions $sessions
        if ($selected.Count -gt 0) {
          Remove-ArkaSessions -SessionNames $selected -Distro $Distro
        }
      }
    }
    '3' {
      Show-ArkaSessions -Sessions $sessions
      Pause-ArkaPrompt
    }
    '4' {
      if (-not $sessions -or $sessions.Count -eq 0) {
        Write-Host 'Aucune session disponible.' -ForegroundColor DarkYellow
      } else {
        $selectedNames = Select-ArkaSessions -Sessions $sessions
        $selectedInfos = Convert-ArkaSelectedSessions -Sessions $sessions -SelectedNames $selectedNames
        if ($selectedInfos.Count -gt 0) {
          Write-Host ("Ciblage wake-up : {0}" -f (($selectedInfos | ForEach-Object { $_.Session }) -join ', ')) -ForegroundColor Cyan
          Send-ArkaWakeup -Sessions $selectedInfos -Distro $Distro -Provider $Provider
        } else {
          Write-Host 'Aucune session sélectionnée, opération annulée.' -ForegroundColor DarkYellow
        }
      }
    }
    '5' { $keepRunning = $false }
    'q' { $keepRunning = $false }
    'Q' { $keepRunning = $false }
    default {
      Write-Host 'Sélection inconnue.' -ForegroundColor DarkYellow
    }
  }
}

Write-Host 'Gestion terminée.' -ForegroundColor Cyan
