$line = [System.IO.File]::ReadAllLines((Resolve-Path '.env')) |
  Where-Object { $_ -match '^CLOUDFLARE_EMAIL_ROUTING_TOKEN=' } |
  Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
if (-not $token) { throw 'CLOUDFLARE_EMAIL_ROUTING_TOKEN is missing' }

$token | npx wrangler secret put CLOUDFLARE_EMAIL_ROUTING_TOKEN --config wrangler.api.jsonc
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run db:migrations
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx wrangler d1 execute vault-db --remote --config wrangler.api.jsonc --command "UPDATE generated_email_addresses SET routing_rule_id = '204e53d8bf164e739158cf9fe8f5b283', routing_zone_id = 'a8972358f3510337c411f40e7030b1fb' WHERE full_address = 'henrycaval@octagram.qzz.io';"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run api:deploy
exit $LASTEXITCODE
