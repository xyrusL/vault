$line = [System.IO.File]::ReadAllLines((Resolve-Path '.env')) |
  Where-Object { $_ -match '^CLOUDFLARE_EMAIL_ROUTING_TOKEN=' } |
  Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
if (-not $token) { throw 'CLOUDFLARE_EMAIL_ROUTING_TOKEN is missing' }

$token | npx wrangler secret put CLOUDFLARE_EMAIL_ROUTING_TOKEN --config wrangler.api.jsonc
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run api:deploy
exit $LASTEXITCODE
