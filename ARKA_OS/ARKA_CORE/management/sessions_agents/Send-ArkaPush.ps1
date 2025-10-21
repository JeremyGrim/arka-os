param(
  [Parameter(Mandatory=$true)][string]$Project,
  [Parameter(Mandatory=$true)][string]$Agent,
  [string]$Provider="codex",
  [string]$SessionName,
  [string]$Endpoint="http://localhost:3100/dispatch",
  [string]$NtId="NT-A2A-MESSAGE_TO_RESULT",
  [string]$IntentKey="AUTO_FROM_MESSAGE",
  [string]$ResourceType="message",
  [Parameter(Mandatory=$true)][string]$ResourcePointer,
[string[]]$Constraints=@("NO_TIME","EXECUTE_NOW","NOTIFY_SILENT","CONTINUE_ON_SILENCE","NO_ACK_REQUIRED","KEEP_CHAIN_ACTIVE","STATUS_EVERY:15m"),
  [string]$FromAgent,
  [string]$MessageId,[string]$WorkflowId,[string]$CorrelationId,[hashtable]$ExtraMetadata,
  [switch]$DryRun,[switch]$Quiet,[switch]$Trace
)

$errors = @()
if([string]::IsNullOrWhiteSpace($NtId)){ $errors += 'nt_id requis' }
if([string]::IsNullOrWhiteSpace($IntentKey)){ $errors += 'intent.key requis' }
if([string]::IsNullOrWhiteSpace($ResourceType)){ $errors += 'resource.type requis' }
if([string]::IsNullOrWhiteSpace($ResourcePointer)){ $errors += 'resource.pointer requis' }
if([string]::IsNullOrWhiteSpace($Agent)){ $errors += 'to_agent requis' }

if($errors.Count -gt 0){
  Write-Error "[ARKA] Payload notify invalide: $($errors -join '; ')"
  exit 2
}

if(-not $SessionName){ $SessionName="arka-$Project-$Agent-$Provider" }

$notify = @{
  nt_id      = $NtId
  intent     = @{ key = $IntentKey }
  resource   = @{ type = $ResourceType; pointer = $ResourcePointer }
  constraints= $Constraints
  from_agent = $FromAgent
  to_agent   = $Agent
}

$metadata = $ExtraMetadata ?? @{}
if(($Constraints | Where-Object { $_ -eq 'NOTIFY_SILENT' }).Count -gt 0 -and -not $metadata.ContainsKey('silent')){
  $metadata['silent'] = $true
}
$body=@{
  type=notify;nt_id=$notify.nt_id; intent=$notify.intent; resource=$notify.resource; constraints=$notify.constraints;
  from_agent=$notify.from_agent; to_agent=$notify.to_agent;
  message_id= if($MessageId){$MessageId}else{[guid]::NewGuid().ToString("N")};
  workflow_id= if($WorkflowId){$WorkflowId}else{"W-" + (Get-Date -Format "yyyyMMddHHmmss")};
  correlation_id= if($CorrelationId){$CorrelationId}else{"C-" + (Get-Date -Format "yyyyMMddHHmmss")};
  project=$Project; provider=$Provider; session=$SessionName; metadata=$metadata
}
$json=$body | ConvertTo-Json -Depth 10
if($DryRun){ if(-not $Quiet){ Write-Host "[dry-run] POST $Endpoint`n$json" -ForegroundColor DarkYellow }; exit 0 }
try{
  $resp=Invoke-RestMethod -Method Post -Uri $Endpoint -ContentType "application/json" -Body $json -TimeoutSec 300
  if(-not $Quiet){ Write-Host ("Push envoyé vers {0}" -f $Endpoint) -ForegroundColor Green; Write-Host ("message_id : {0}" -f $body.message_id); if($resp){ Write-Host ("Réponse : {0}" -f ($resp | ConvertTo-Json -Depth 5)) } }
  exit 0
}catch{ Write-Error ("[ARKA] Échec envoi push : {0}" -f $_.Exception.Message); exit 2 }
