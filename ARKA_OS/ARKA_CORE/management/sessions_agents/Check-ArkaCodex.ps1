param([Parameter(Mandatory=$true)][string]$Project,[string]$Distro="Ubuntu",[string]$Provider="codex",[switch]$Verbose)
$scriptRoot=$PSScriptRoot; Import-Module (Join-Path $scriptRoot '..\modules\Arka.Core.psd1') -Force | Out-Null
if($Verbose){ Set-ArkaVerbose -On }
$rows=@(); $sessions=Get-ArkaSessions -Project $Project -Provider $Provider -Distro $Distro
foreach($s in $sessions){ $pane=Get-TmuxPaneInfo -Session $s.Session -Distro $Distro; $isCodex=($pane -and $pane.Cmd -match 'codex')
  $rows += [pscustomobject]@{ session=$s.Session; role=$s.Role; provider=$s.Provider; pane_pid=$pane?.Pid; pane_cmd=$pane?.Cmd; codex=[bool]$isCodex } }
$rows | ConvertTo-Json -Depth 4; if($rows | ? { -not $_.codex }){ exit 2 } else { exit 0 }