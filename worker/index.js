const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.google.com; connect-src 'self' https://api.vault.deze.me; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: jsonHeaders })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health' && request.method === 'GET') {
      try {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS tableCount FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        ).first()

        return json({
          status: 'ok',
          database: 'vault',
          connected: true,
          tableCount: Number(result?.tableCount ?? 0),
        })
      } catch {
        return json({ status: 'error', connected: false }, 503)
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404)
    }

    const response = await env.ASSETS.fetch(request)
    const securedResponse = new Response(response.body, response)
    for (const [name, value] of Object.entries(securityHeaders)) {
      securedResponse.headers.set(name, value)
    }
    return securedResponse
  },
}
