$line = [System.IO.File]::ReadAllLines((Resolve-Path '.env')) |
  Where-Object { $_ -match '^CLOUDFLARE_EMAIL_ROUTING_TOKEN=' } |
  Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
if (-not $token) { throw 'CLOUDFLARE_EMAIL_ROUTING_TOKEN is missing' }

$headers = @{ Authorization = "Bearer $token" }
$zones = @{
  'deze.me' = '60be8001944d6c2354d8ccedc81bf06a'
  'octagram.qzz.io' = 'a8972358f3510337c411f40e7030b1fb'
}

foreach ($entry in $zones.GetEnumerator()) {
  try {
    $response = Invoke-RestMethod `
      -Uri "https://api.cloudflare.com/client/v4/zones/$($entry.Value)/email/routing/rules" `
      -Headers $headers `
      -Method Get
    if ($response.success) {
      "$($entry.Key): access OK, $(@($response.result).Count) routing rules visible"
    } else {
      "$($entry.Key): Cloudflare returned success=false"
    }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    "$($entry.Key): access failed (HTTP $status)"
  }
}
