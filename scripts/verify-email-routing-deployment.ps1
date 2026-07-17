$line = [System.IO.File]::ReadAllLines((Resolve-Path '.env')) |
  Where-Object { $_ -match '^CLOUDFLARE_EMAIL_ROUTING_TOKEN=' } |
  Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
if (-not $token) { throw 'CLOUDFLARE_EMAIL_ROUTING_TOKEN is missing' }

$zoneId = 'a8972358f3510337c411f40e7030b1fb'
$address = "vault-route-check-$([Guid]::NewGuid().ToString('N').Substring(0, 12))@octagram.qzz.io"
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}
$body = @{
  name = "Vault deployment verification: $address"
  enabled = $true
  matchers = @(@{ type = 'literal'; field = 'to'; value = $address })
  actions = @(@{ type = 'worker'; value = @('vault-email-worker') })
} | ConvertTo-Json -Depth 5
$ruleId = $null

try {
  $created = Invoke-RestMethod `
    -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/rules" `
    -Headers $headers `
    -Method Post `
    -Body $body
  if (-not $created.success -or -not $created.result.id) {
    throw 'Cloudflare did not create the verification rule'
  }
  $ruleId = $created.result.id
  'Temporary Worker routing rule creation: OK'
} finally {
  if ($ruleId) {
    $deleted = Invoke-RestMethod `
      -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/rules/$ruleId" `
      -Headers @{ Authorization = "Bearer $token" } `
      -Method Delete
    if (-not $deleted.success) { throw 'Cloudflare did not delete the verification rule' }
    'Temporary Worker routing rule cleanup: OK'
  }
}
