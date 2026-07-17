$line = [System.IO.File]::ReadAllLines((Resolve-Path '.env')) |
  Where-Object { $_ -match '^CLOUDFLARE_EMAIL_ROUTING_TOKEN=' } |
  Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
if (-not $token) { throw 'CLOUDFLARE_EMAIL_ROUTING_TOKEN is missing' }

$accountId = '4002cabf9107796667c42a5eed175298'
$response = Invoke-RestMethod `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/email/routing/addresses?verified=true" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Method Get

if (-not $response.success) { throw 'Cloudflare destination lookup failed' }
$verified = @($response.result | Where-Object { $_.verified })
"Verified forwarding destinations visible: $($verified.Count)"
$verified | ForEach-Object { $_.email }
