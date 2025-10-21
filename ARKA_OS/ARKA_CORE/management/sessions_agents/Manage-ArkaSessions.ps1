param(
  [string]$Project,
  [string]$Provider = "codex",
  [string]$Distro = "Ubuntu",
  [int]$ScrollLines = 200
)

$scriptRoot = $PSScriptRoot
$commonPath = Join-Path $scriptRoot 'common/ArkaSessionUtils.ps1'
if (-not (Test-Path $commonPath)) {
  Write-Error "ArkaSessionUtils.ps1 introuvable ($commonPath)."
  exit 3
}
. $commonPath

$repoRoot = Get-ArkaRepoRoot -BaseScriptRoot $scriptRoot
$providerCatalog = Get-ArkaProviderCatalog -RepoRoot $repoRoot
Set-ArkaSessionContext -ProviderCatalog $providerCatalog

function Get-ArkaSessions {
  param(
    [string]$Provider,
    [string]$Project,
    [string]$Distro = "Ubuntu"
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
      $providerPart = $Provider
      $isLegacy = $false

      $parsed = Resolve-ArkaSessionParts -SessionName $session
      if ($parsed) {
        $projectPart = $parsed.Project
        $rolePart = $parsed.Role
        $providerPart = $parsed.Provider
        $isLegacy = $false
      } elseif ($session -match '^(?i)arka-(?<project>.+)-(?<role>[^-]+)$') {
        $projectPart = $Matches['project']
        $rolePart = $Matches['role']
        $isLegacy = $true
        if ($Provider -and $Provider -ne "codex") { continue }
        $providerPart = "codex"
      } elseif ($session -match '^(?i)Arka-(?<project>.+)-(?<role>[^-]+)$') {
        $projectPart  = $Matches['project']
        $rolePart     = $Matches['role']
        $providerPart = 'codex'
        $session = "Arka-$projectPart-$rolePart"
        $isLegacy = $true
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
        Session   = $session
        Project   = $projectPart
        Role      = $rolePart
        Provider  = $providerPart
        IsLegacy  = $isLegacy
      }
    }
  }

  return $result | Sort-Object Project, Role
}

function Select-ArkaSessions {
  param([array]$Sessions)

  if (-not $Sessions -or $Sessions.Count -eq 0) { return @() }

  Write-Host ""
  Write-Host "Sessions disponibles" -ForegroundColor Cyan
  for ($i = 0; $i -lt $Sessions.Count; $i++) {
    $item = $Sessions[$i]
    $tag = if ($item.IsLegacy) { "[legacy]" } else { "        " }
    Write-Host ("{0,2}. {1,-12} {2} {3}" -f ($i + 1), $item.Project, $item.Session, $tag)
  }
  Write-Host ""
  $raw = Read-Host "Numéro(s) séparés par des virgules"
  if (-not $raw) { return @() }

  $indices = $raw -split '[,\s]+' | Where-Object { $_ } | ForEach-Object {
    if ($_ -as [int]) { [int]$_ } else { $null }
  } | Where-Object { $_ -ge 1 -and $_ -le $Sessions.Count }

  $selected = @()
  foreach ($idx in $indices) {
    $selected += $Sessions[$idx - 1].Session
  }
  return @($selected | Sort-Object -Unique)
}

function Show-ArkaSessionPreview {
  param(
    [string]$Session,
    [string]$Pane = "0.0",
    [int]$ScrollLines = 200,
    [string]$Distro = "Ubuntu"
  )

  $scroll = -1 * [math]::Abs($ScrollLines)
  $target = Escape-ArkaSingleQuote "$($Session):$Pane"
  $cmd = "tmux capture-pane -t '$target' -p -e -J -S $scroll"
  $capture = Invoke-ArkaWslCommand $cmd $Distro

  if ($capture.Code -ne 0) {
    Write-Warning ("Impossible de capturer la session {0}: {1}" -f $Session, $capture.Err.Trim())
    return
  }

  Write-Host ""
  Write-Host ("------ Aperçu de {0} (dernier {1} lignes) ------" -f $Session, [math]::Abs($scroll)) -ForegroundColor Yellow
  Write-Host $capture.Out
  Write-Host ("------ Fin de l'aperçu {0} ------" -f $Session) -ForegroundColor Yellow
  Write-Host ""
}

function Join-ArkaSession {
  param(
    [string]$Session,
    [string]$Distro = "Ubuntu"
  )

  Write-Host ""
  Write-Host ("Connexion à {0} (Ctrl-b d pour détacher)" -f $Session) -ForegroundColor Green
  Write-Host ""

  & wsl -d $Distro -- tmux attach -t $Session
  $exit = $LASTEXITCODE
  if ($exit -ne 0) {
    Write-Warning ("tmux attach a retourné le code {0}." -f $exit)
  }
}

$sessions = Get-ArkaSessions -Provider $Provider -Project $Project -Distro $Distro
if (-not $sessions -or $sessions.Count -eq 0) {
  Write-Warning "Aucune session trouvée."
  exit 2
}

$chosen = Select-ArkaSessions -Sessions $sessions
if ($chosen -is [string]) { $chosen = @($chosen) }
if (-not $chosen -or $chosen.Count -eq 0) {
  Write-Warning "Aucune session sélectionnée."
  exit 0
}

if ($chosen.Count -gt 1) {
  Write-Host ("{0} sessions sélectionnées. Le mode aperçu est recommandé." -f $chosen.Count) -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Action ?" -ForegroundColor Cyan
Write-Host "  1. Afficher un aperçu (scrollback)"
Write-Host "  2. Rejoindre la session tmux"
Write-Host "  3. Annuler"
Write-Host ""
$choice = Read-Host "Choix"
switch ($choice) {
  "1" {
    foreach ($session in $chosen) {
      Show-ArkaSessionPreview -Session $session -ScrollLines $ScrollLines -Distro $Distro
    }
  }
  "2" {
    if ($chosen.Count -gt 1) {
      Write-Host "Plusieurs sessions sélectionnées. Merci de choisir laquelle rejoindre :" -ForegroundColor Yellow
      $single = Select-ArkaSessions -Sessions ($sessions | Where-Object { $chosen -contains $_.Session })
      if ($single -and $single.Count -ge 1) {
        Join-ArkaSession -Session $single[0] -Distro $Distro
      } else {
        Write-Warning "Aucune session choisie pour la connexion."
      }
    } else {
      Join-ArkaSession -Session $chosen[0] -Distro $Distro
    }
  }
  default {
    Write-Host "Action annulée."
  }
}
