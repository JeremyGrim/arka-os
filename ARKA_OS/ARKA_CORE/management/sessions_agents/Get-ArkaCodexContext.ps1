param([Parameter(Mandatory=$true)][Alias("Project")][string]$ProjectId,[string]$Distro="Ubuntu",[string]$Provider="codex",[string]$Pane="0.0",[int]$ScrollFrom=-300,[int]$ScrollStep=-300,[int]$ScrollMax=-3000,[switch]$Verbose)
$scriptRoot=$PSScriptRoot; Import-Module (Join-Path $scriptRoot '..\modules\Arka.Core.psd1') -Force | Out-Null
if($Verbose){ Set-ArkaVerbose -On }
$sessions=Get-ArkaSessions -Project $ProjectId -Provider $Provider -Distro $Distro; $results=@()
foreach($s in $sessions){ $role=$s.Role; $cap=Capture-TmuxPane -Session $s.Session -Pane $Pane -Lines ([math]::Abs($ScrollFrom)) -Distro $Distro; $ctx=$cap.StdOut; $uuid=$null
  if($ctx){ if($ctx -match 'codex.*\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b'){ $uuid=$Matches[1] } }
  $results += [pscustomobject]@{ session=$s.Session; role=$role; provider=$Provider; uuid=$uuid; context=$ctx } }
$results | ConvertTo-Json -Depth 4; exit 0