# Quick end-to-end check against the LIVE deployment using an existing account.
param(
  [string]$Base = "https://mingo.kobe-janssen26.workers.dev",
  [string]$Email = "live-check-a@example.com",
  [string]$Password = "supersecret123"
)
$ErrorActionPreference = "Stop"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
function Req($m, $p, $b) {
  $h = @{}
  $csrf = ($s.Cookies.GetCookies($Base) | Where-Object Name -eq "mingo_csrf").Value
  if ($csrf) { $h["x-mingo-csrf"] = $csrf }
  $a = @{ Uri = "$Base/api$p"; Method = $m; WebSession = $s; Headers = $h; ContentType = "application/json" }
  if ($null -ne $b) { $a.Body = ($b | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod @a
}
$me = Req POST "/auth/login" @{ email = $Email; password = $Password }
Write-Host "logged in as" $me.user.displayName
$g = (Req POST "/groups" @{ name = "Prod Check $(Get-Random)" }).group
Write-Host "group" $g.id $g.status
Req PUT "/groups/$($g.id)/settings" @{
  categories = @(); allActivities = $true; locationLabel = "Antwerpen"; lat = $null; lng = $null
  radiusKm = 50; budgetBand = "any"; dateMode = "unknown"; dateSpecific = $null; timeBand = "unknown"; timeSpecific = $null
} | Out-Null
$start = (Req POST "/groups/$($g.id)/start" @{}).group
Write-Host "started:" $start.status
$state = Req GET "/groups/$($g.id)/swipe"
Write-Host "deck:" $state.deckSize "first card:" $state.queue[0].activity.title
$v = Req POST "/groups/$($g.id)/swipe" @{ activityId = $state.queue[0].activity.id; value = "like" }
Write-Host "match:" ($null -ne $v.newMatch) "needsDate:" $v.newMatch.needsDateMatch
$dm = Req GET "/groups/$($g.id)/date-match"
$dv = Req POST "/groups/$($g.id)/date-match/vote" @{ optionId = $dm.options[1].id; value = "yes" }
Write-Host "date completed:" $dv.completed
$plan = (Req GET "/groups/$($g.id)/plans").plans[0]
Write-Host "PLAN:" $plan.activity.title "@ " $plan.startsAt
Write-Host "`nPROD CHECK PASSED"
