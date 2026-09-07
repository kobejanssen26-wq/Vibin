# End-to-end smoke test against a running `wrangler dev` on :8787.
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8787/api"
$rand = Get-Random
function J($o) { $o | ConvertTo-Json -Depth 8 -Compress }

# --- session + CSRF helper ---
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
function Req($method, $path, $body) {
  $headers = @{}
  $csrf = ($sess.Cookies.GetCookies("http://127.0.0.1:8787") | Where-Object Name -eq "vibin_csrf").Value
  if ($csrf) { $headers["x-vibin-csrf"] = $csrf }
  $args = @{ Uri = "$base$path"; Method = $method; WebSession = $sess; Headers = $headers; ContentType = "application/json" }
  if ($body -ne $null) { $args.Body = (J $body) }
  Invoke-RestMethod @args
}

Write-Host "health:" (Req GET "/health" $null | J)

$email = "kobe+$rand@example.com"
$signup = Req POST "/auth/signup" @{ email = $email; password = "supersecret123"; displayName = "Kobe Janssen" }
Write-Host "signup user:" $signup.user.id $signup.user.email

$me = Req GET "/auth/session" $null
Write-Host "session ok:" ($me.user.email -eq $email)

$g = (Req POST "/groups" @{ name = "Smoke Test Crew" }).group
Write-Host "group:" $g.id "status=" $g.status

Req PUT "/groups/$($g.id)/settings" @{
  categories = @(); allActivities = $true; locationLabel = "Antwerpen";
  lat = $null; lng = $null; radiusKm = 50; budgetBand = "any";
  dateMode = "unknown"; dateSpecific = $null; timeBand = "unknown"; timeSpecific = $null
} | Out-Null
Write-Host "settings saved"

$start = (Req POST "/groups/$($g.id)/start" @{}).group
Write-Host "started status=" $start.status

$state = Req GET "/groups/$($g.id)/swipe" $null
Write-Host "deck size:" $state.deckSize "queue:" $state.queue.Count

# Solo group: one like should immediately match (and go to date_matching, date unknown)
$first = $state.queue[0].activity.id
$vote = Req POST "/groups/$($g.id)/swipe" @{ activityId = $first; value = "like" }
Write-Host "vote newMatch:" ($vote.newMatch -ne $null) "needsDateMatch:" $vote.newMatch.needsDateMatch

$dm = Req GET "/groups/$($g.id)/date-match" $null
Write-Host "date-match options:" $dm.options.Count "status:" $dm.status

$opt = $dm.options[0].id
$dv = Req POST "/groups/$($g.id)/date-match/vote" @{ optionId = $opt; value = "yes" }
Write-Host "date vote completed:" $dv.completed

$plans = (Req GET "/groups/$($g.id)/plans" $null).plans
Write-Host "plan:" $plans[0].activity.title "when:" $plans[0].startsAt "ics:" $plans[0].calendar.icsUrl

# --- authorization / IDOR check: a second user must NOT read group 1 ---
$sess2 = $sess; $sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Req POST "/auth/signup" @{ email = "mallory+$rand@example.com"; password = "supersecret123"; displayName = "Mallory" } | Out-Null
$denied = $false
try { Req GET "/groups/$($g.id)" $null } catch { $denied = ($_.Exception.Response.StatusCode.value__ -eq 403) }
Write-Host "IDOR blocked (expect True):" $denied

Write-Host "`nSMOKE TEST PASSED"
