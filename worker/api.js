import * as OTPAuth from 'otpauth'

const publicAccountFields = `
  id, email, platform, username, login_url, account_type,
  label, category, plan, status, expires_at,
  last_used_at, notes, metadata, created_at, updated_at
`
const accountListFields = `
  ${publicAccountFields},
  CASE WHEN length(password_ciphertext) > 24 THEN 1 ELSE 0 END AS has_password
`
const accountStatuses = new Set(['Active', 'Inactive', 'Expiring Soon', 'Expired'])
const maximumBodyBytes = 16 * 1024
const maximumVaultBodyBytes = 32 * 1024
const maximumChatBodyBytes = 96 * 1024
const maximumUpstreamResponseBytes = 1024 * 1024
const upstreamTimeoutMilliseconds = 30 * 1000
const supportedApiModes = new Set(['openai-compatible', 'openai-responses', 'anthropic-messages'])
const vaultSecretTypes = new Set(['api_key', 'token', 'config', 'credential', 'other'])
const pluginFields = {
  spotify: { allowed: ['accountName', 'clientId', 'clientSecret', 'refreshToken', 'market'], required: ['accountName', 'clientId', 'clientSecret'] },
  facebook: { allowed: ['accountName', 'appId', 'appSecret', 'accessToken', 'pageId'], required: ['accountName', 'appId', 'appSecret'] },
  discord: { allowed: ['accountName', 'applicationId', 'botToken', 'publicKey', 'guildId'], required: ['accountName', 'applicationId', 'botToken'] },
  google_workspace: { allowed: ['accountName', 'clientId', 'clientSecret', 'refreshToken', 'workspaceDomain'], required: ['accountName', 'clientId', 'clientSecret'] },
}
const twoFactorChallengeLifetimeMilliseconds = 5 * 60 * 1000
const maximumTwoFactorAttempts = 5
const maximumAddressesPerUser = 50
const maximumAddressBatchSize = 10
const maximumCollisionRetries = 5
const maximumLocalPartLength = 64
const maximumEmailBodyDisplay = 64 * 1024
const emailRoutingSyncDelaysMilliseconds = [0, 250, 500, 1000, 2000]

// Curated readable word list for random address generation
const emailWordList = [
  'amber', 'aqua', 'aspen', 'birch', 'blaze', 'bloom', 'bolt', 'breeze',
  'brook', 'canyon', 'cedar', 'chill', 'cliff', 'cloud', 'coast', 'coral',
  'crane', 'creek', 'crest', 'crisp', 'dune', 'dawn', 'drift', 'ember',
  'fable', 'fern', 'field', 'flame', 'flint', 'flora', 'forge', 'frost',
  'glade', 'gleam', 'globe', 'grain', 'grove', 'haven', 'hawk', 'hazel',
  'heath', 'heron', 'hive', 'ivory', 'jade', 'lake', 'lark', 'leaf',
  'light', 'lilac', 'linen', 'lotus', 'lunar', 'maple', 'marsh', 'mesa',
  'mist', 'moss', 'nova', 'oasis', 'onyx', 'orbit', 'otter', 'palm',
  'pearl', 'petal', 'pine', 'plum', 'pond', 'prism', 'quail', 'quartz',
  'rain', 'rapid', 'raven', 'reed', 'ridge', 'river', 'robin', 'sage',
  'shore', 'silk', 'slate', 'snow', 'solar', 'spark', 'spire', 'stone',
  'storm', 'swift', 'thorn', 'tide', 'tiger', 'trail', 'tulip', 'vale',
  'vine', 'wave', 'wren', 'zephyr',
]

class ClientError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function isDevelopmentOrigin(origin) {
  if (!origin) return false

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && isLocalHostname(url.hostname)
  } catch {
    return false
  }
}

function isAllowedBrowserOrigin(origin, env) {
  if (!origin) return false
  const allowedOrigins = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowedOrigins.includes(origin)
    || (env.ALLOW_DEVELOPMENT_ORIGINS === 'true' && isDevelopmentOrigin(origin))
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin')
  if (!origin) return {}
  const localWorker = isLocalHostname(new URL(request.url).hostname)
  if (!localWorker && !isAllowedBrowserOrigin(origin, env)) return {}

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(data, status, request, env, additionalHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      ...corsHeaders(request, env),
      ...additionalHeaders,
    },
  })
}

function isAuthorized(request, env) {
  return request.headers.get('authorization') === `Bearer ${env.API_TOKEN}`
}

function toBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function toBase64Url(bytes) {
  return toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toBase64(new Uint8Array(digest))
}

async function hashBrowserSignature(request) {
  const value = new TextEncoder().encode(request.headers.get('user-agent') || 'unknown')
  const digest = await crypto.subtle.digest('SHA-256', value)
  return toBase64(new Uint8Array(digest))
}

async function hashClientIdentifier(request, env) {
  const address = request.headers.get('cf-connecting-ip') || 'local'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const value = new TextEncoder().encode(`${env.API_TOKEN}|${address}|${userAgent}`)
  const digest = await crypto.subtle.digest('SHA-256', value)
  return toBase64Url(new Uint8Array(digest))
}

function getDeviceType(request) {
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase()
  if (/smart-?tv|hbbtv|appletv|google ?tv|netcast|web0s|tizen|roku|aft[bmrt]/.test(userAgent)) return 'TV'
  if (/ipad|tablet|kindle|silk|playbook/.test(userAgent) || (/android/.test(userAgent) && !/mobile/.test(userAgent))) return 'Tablet'
  if (/iphone|ipod/.test(userAgent)) return 'iOS'
  if (/android/.test(userAgent)) return 'Android'
  return 'Web'
}

async function auditStatement(request, env, {
  userId = null,
  eventType,
  description,
  severity = 'info',
  metadata = {},
}) {
  const clientIdentifierHash = await hashClientIdentifier(request, env)
  const eventMetadata = eventType.startsWith('auth.')
    ? { ...metadata, deviceType: getDeviceType(request) }
    : metadata
  return env.DB.prepare(`
    INSERT INTO activity_logs (
      id, user_id, event_type, description, severity, metadata, client_identifier_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    eventType,
    description,
    severity,
    JSON.stringify(eventMetadata),
    clientIdentifierHash,
  )
}

async function writeAudit(request, env, entry) {
  const statement = await auditStatement(request, env, entry)
  await statement.run()
}

async function readJson(request, maximumBytes = maximumBodyBytes) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ClientError('Content-Type must be application/json', 415)
  }
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > maximumBytes) throw new ClientError('Request body is too large', 413)

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new ClientError('Request body is too large', 413)
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new ClientError('Request body must be a JSON object')
  }
}

function cleanText(value, field, maximum, fallback = '') {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new ClientError(`${field} must be text`)
  const cleaned = value.trim()
  if (cleaned.length > maximum) throw new ClientError(`${field} is too long`)
  return cleaned
}

function secretText(value, field, maximum) {
  if (typeof value !== 'string') throw new ClientError(`${field} must be text`)
  if (value.length > maximum) throw new ClientError(`${field} is too long`)
  if (!value.trim()) throw new ClientError(`${field} is required`)
  return value
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseOptionalLoginUrl(value) {
  const loginUrl = cleanText(value, 'Login URL', 2048)
  if (!loginUrl) return null

  try {
    if (new URL(loginUrl).protocol !== 'https:') throw new Error()
  } catch {
    throw new ClientError('Login URL must be a valid HTTPS URL')
  }
  return loginUrl
}

function getSessionToken(request, env) {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7)
    if (token !== env.API_TOKEN) return token
  }

  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/(?:^|;\s*)vault_session=([^;]+)/)
  return match?.[1] || null
}

function sessionCookie(request, token, maxAge) {
  const isLocal = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)
  const security = isLocal ? 'SameSite=Lax' : 'Domain=.vault.deze.me; Secure; SameSite=Strict'
  const lifetime = maxAge === null ? '' : `; Max-Age=${maxAge}`
  return `vault_session=${token}; Path=/; HttpOnly; ${security}${lifetime}`
}

async function verifyPassword(password, user) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64(user.password_salt),
      iterations: user.password_iterations,
    },
    key,
    256,
  )
  const actual = new Uint8Array(bits)
  const expected = fromBase64(user.password_hash)
  if (actual.length !== expected.length) return false

  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index]
  }
  return difference === 0
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256,
  )
  return {
    hash: toBase64(new Uint8Array(bits)),
    salt: toBase64(salt),
    iterations: 100000,
  }
}

async function getLoginClientKey(request, email) {
  const address = request.headers.get('cf-connecting-ip') || 'local'
  const value = new TextEncoder().encode(`${address}|${email}`)
  const digest = await crypto.subtle.digest('SHA-256', value)
  return toBase64Url(new Uint8Array(digest))
}

async function getLoginBlock(env, clientKey) {
  const attempt = await env.DB.prepare(`
    SELECT blocked_until FROM login_attempts
    WHERE client_key = ? AND datetime(blocked_until) > CURRENT_TIMESTAMP
  `).bind(clientKey).first()
  return attempt?.blocked_until || null
}

async function recordLoginFailure(env, clientKey) {
  const existing = await env.DB.prepare(`
    SELECT failures, window_started_at FROM login_attempts WHERE client_key = ?
  `).bind(clientKey).first()
  const now = Date.now()
  const windowStarted = existing ? new Date(`${existing.window_started_at}Z`).getTime() : 0
  const withinWindow = Number.isFinite(windowStarted) && now - windowStarted < 15 * 60 * 1000
  const failures = withinWindow ? existing.failures + 1 : 1
  const blockedUntil = failures >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null

  await env.DB.prepare(`
    INSERT INTO login_attempts (client_key, failures, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_key) DO UPDATE SET
      failures = excluded.failures,
      window_started_at = CASE
        WHEN ? = 1 THEN CURRENT_TIMESTAMP
        ELSE login_attempts.window_started_at
      END,
      blocked_until = excluded.blocked_until,
      updated_at = CURRENT_TIMESTAMP
  `).bind(clientKey, failures, blockedUntil, withinWindow ? 0 : 1).run()
}

async function currentUser(request, env) {
  const token = getSessionToken(request, env)
  if (!token) return null
  const tokenHash = await hashSessionToken(token)
  const browserHash = await hashBrowserSignature(request)
  return env.DB.prepare(`
    SELECT users.id, users.email, users.role, users.display_name, users.must_change_password,
      users.two_factor_enabled
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > CURRENT_TIMESTAMP
      AND sessions.user_agent_hash = ?
      AND users.is_active = 1
  `).bind(tokenHash, browserHash).first()
}

function createTotp(secret, label) {
  return new OTPAuth.TOTP({
    issuer: 'Vault',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })
}

function isValidTotpCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

function verifyTotpCode(secret, label, code) {
  if (!isValidTotpCode(code)) return false
  return createTotp(secret, label).validate({ token: code, window: 1 }) !== null
}

function parseAuthenticatorUri(value) {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const authenticator = OTPAuth.URI.parse(value.trim())
    if (!(authenticator instanceof OTPAuth.TOTP)) return null
    return {
      issuer: authenticator.issuer || 'Authenticator',
      accountName: authenticator.label,
      secret: authenticator.secret.base32,
      algorithm: authenticator.algorithm,
      digits: authenticator.digits,
      period: authenticator.period,
    }
  } catch {
    return null
  }
}

function normalizeAuthenticatorEntry(body) {
  const parsed = body.uri ? parseAuthenticatorUri(body.uri) : null
  if (body.uri && !parsed) throw new ClientError('Authenticator QR or setup URI is invalid')
  const issuer = cleanText(parsed?.issuer ?? body.issuer, 'Issuer', 120)
  const accountName = cleanText(parsed?.accountName ?? body.accountName, 'Account name', 254)
  const secret = String(parsed?.secret ?? body.secret ?? '').replace(/[\s-]/g, '').toUpperCase()
  const algorithm = String(parsed?.algorithm ?? body.algorithm ?? 'SHA1').toUpperCase()
  const digits = Number(parsed?.digits ?? body.digits ?? 6)
  const period = Number(parsed?.period ?? body.period ?? 30)
  if (!issuer || !accountName) throw new ClientError('Issuer and account name are required')
  if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 16 || secret.length > 256) throw new ClientError('Authenticator secret is invalid')
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) throw new ClientError('Authenticator algorithm is invalid')
  if (![6, 8].includes(digits)) throw new ClientError('Authenticator digits must be 6 or 8')
  if (!Number.isInteger(period) || period < 15 || period > 120) throw new ClientError('Authenticator period is invalid')
  try {
    new OTPAuth.Secret({ base32: secret })
  } catch {
    throw new ClientError('Authenticator secret is invalid')
  }
  return { issuer, accountName, secret, algorithm, digits, period }
}

async function listAuthenticatorEntries(request, env, user) {
  const result = await env.DB.prepare(`
    SELECT id, issuer, account_name, secret_ciphertext, secret_iv,
      algorithm, digits, period, created_at, updated_at
    FROM authenticator_entries
    WHERE user_id = ?
    ORDER BY issuer COLLATE NOCASE, account_name COLLATE NOCASE
  `).bind(user.id).all()
  const data = await Promise.all((result.results || []).map(async (entry) => ({
    id: entry.id,
    issuer: entry.issuer,
    accountName: entry.account_name,
    secret: await decryptCredential(entry.secret_ciphertext, entry.secret_iv, env.CREDENTIALS_ENCRYPTION_KEY),
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })))
  return json({ data }, 200, request, env)
}

async function createAuthenticatorEntry(request, env, user) {
  const entry = normalizeAuthenticatorEntry(await readJson(request))
  const id = crypto.randomUUID()
  const encrypted = await encryptPassword(entry.secret, env.CREDENTIALS_ENCRYPTION_KEY)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'authenticator.created',
    description: 'Authenticator entry created',
    metadata: { authenticatorId: id, issuer: entry.issuer },
  })
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO authenticator_entries
        (id, user_id, issuer, account_name, secret_ciphertext, secret_iv, algorithm, digits, period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, user.id, entry.issuer, entry.accountName, encrypted.ciphertext, encrypted.iv, entry.algorithm, entry.digits, entry.period),
    audit,
  ])
  return json({ data: { id, ...entry } }, 201, request, env)
}

async function deleteAuthenticatorEntry(request, env, user, id) {
  const existing = await env.DB.prepare('SELECT issuer FROM authenticator_entries WHERE id = ? AND user_id = ?').bind(id, user.id).first()
  if (!existing) return json({ error: 'Authenticator entry not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'authenticator.deleted',
    description: 'Authenticator entry deleted',
    metadata: { authenticatorId: id, issuer: existing.issuer },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM authenticator_entries WHERE id = ? AND user_id = ?').bind(id, user.id),
    audit,
  ])
  return json({ data: { id } }, 200, request, env)
}

async function issueSession(request, env, user, remember, clientKey, auditEvent = 'auth.login.succeeded') {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await hashSessionToken(token)
  const sessionId = crypto.randomUUID()
  const browserHash = await hashBrowserSignature(request)
  const lifetime = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString()
  const statements = [
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).bind(sessionId, user.id, tokenHash, expiresAt, browserHash),
    env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
  ]
  if (clientKey) statements.push(env.DB.prepare('DELETE FROM login_attempts WHERE client_key = ?').bind(clientKey))
  statements.push(await auditStatement(request, env, {
    userId: user.id,
    eventType: auditEvent,
    description: auditEvent === 'auth.two_factor.succeeded'
      ? 'Two-factor authentication succeeded'
      : auditEvent === 'auth.totp_login.succeeded'
        ? 'TOTP login succeeded'
        : 'Login succeeded',
  }))
  await env.DB.batch(statements)

  const isDevelopment = isDevelopmentOrigin(request.headers.get('origin'))
  return json({
    data: {
      ...(isDevelopment ? { token } : {}),
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        mustChangePassword: Boolean(user.must_change_password),
      },
    },
  }, 200, request, env, {
    'set-cookie': sessionCookie(request, token, lifetime),
  })
}

async function login(request, env) {
  const body = await readJson(request)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!isValidEmail(email) || !password || password.length > 1024) {
    await writeAudit(request, env, {
      eventType: 'auth.login.failed',
      description: 'Login failed',
      severity: 'warning',
      metadata: { reason: 'invalid_input' },
    })
    return json({ error: 'Invalid email or password' }, 401, request, env)
  }
  const clientKey = await getLoginClientKey(request, email)
  const blockedUntil = await getLoginBlock(env, clientKey)
  if (blockedUntil) {
    await writeAudit(request, env, {
      eventType: 'auth.login.failed',
      description: 'Login blocked by rate limit',
      severity: 'warning',
      metadata: { reason: 'rate_limited' },
    })
    return json({ error: 'Too many attempts. Try again later.' }, 429, request, env, {
      'retry-after': '900',
    })
  }
  const user = await env.DB.prepare(`
    SELECT id, email, password_hash, password_salt, password_iterations,
      role, display_name, must_change_password, two_factor_enabled
    FROM users
    WHERE email = ? AND is_active = 1
  `).bind(email).first()

  if (!user || !(await verifyPassword(password, user))) {
    await recordLoginFailure(env, clientKey)
    await writeAudit(request, env, {
      eventType: 'auth.login.failed',
      description: 'Login failed',
      severity: 'warning',
      metadata: { reason: 'invalid_credentials' },
    })
    return json({ error: 'Invalid email or password' }, 401, request, env)
  }

  if (user.two_factor_enabled) {
    const twoFactorRateLimitKey = await getLoginClientKey(request, `2fa-login:${user.id}`)
    if (await getLoginBlock(env, twoFactorRateLimitKey)) {
      await writeAudit(request, env, {
        userId: user.id,
        eventType: 'auth.two_factor.failed',
        description: 'Two-factor authentication blocked by rate limit',
        severity: 'warning',
        metadata: { reason: 'rate_limited' },
      })
      return json({ error: 'Too many attempts. Try again later.' }, 429, request, env, {
        'retry-after': '900',
      })
    }
    const challengeToken = `${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}.${body.remember ? '1' : '0'}`
    const tokenHash = await hashSessionToken(challengeToken)
    const browserHash = await hashBrowserSignature(request)
    const expiresAt = new Date(Date.now() + twoFactorChallengeLifetimeMilliseconds).toISOString()
    const audit = await auditStatement(request, env, {
      userId: user.id,
      eventType: 'auth.two_factor.challenge.created',
      description: 'Two-factor authentication required',
    })
    await env.DB.batch([
      env.DB.prepare('DELETE FROM two_factor_challenges WHERE user_id = ?').bind(user.id),
      env.DB.prepare(`
        INSERT INTO two_factor_challenges (id, user_id, token_hash, user_agent_hash, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), user.id, tokenHash, browserHash, expiresAt),
      env.DB.prepare('DELETE FROM two_factor_challenges WHERE datetime(expires_at) <= CURRENT_TIMESTAMP'),
      env.DB.prepare('DELETE FROM login_attempts WHERE client_key = ?').bind(clientKey),
      audit,
    ])
    return json({ data: { requiresTwoFactor: true, challengeToken, expiresAt } }, 200, request, env)
  }

  return issueSession(request, env, user, Boolean(body.remember), clientKey)
}

async function totpLogin(request, env) {
  const body = await readJson(request)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (!isValidEmail(email) || !isValidTotpCode(code)) {
    await writeAudit(request, env, {
      eventType: 'auth.totp_login.failed',
      description: 'TOTP login failed',
      severity: 'warning',
      metadata: { reason: 'invalid_input' },
    })
    return json({ error: 'Invalid email or code' }, 401, request, env)
  }

  const clientKey = await getLoginClientKey(request, email)
  if (await getLoginBlock(env, clientKey)) {
    await writeAudit(request, env, {
      eventType: 'auth.totp_login.failed',
      description: 'TOTP login blocked by rate limit',
      severity: 'warning',
      metadata: { reason: 'rate_limited' },
    })
    return json({ error: 'Too many attempts. Try again later.' }, 429, request, env, {
      'retry-after': '900',
    })
  }

  const user = await env.DB.prepare(`
    SELECT id, email, role, display_name, must_change_password,
      totp_secret_ciphertext, totp_secret_iv
    FROM users
    WHERE email = ? AND is_active = 1 AND two_factor_enabled = 1
  `).bind(email).first()

  let valid = false
  if (user?.totp_secret_ciphertext && user.totp_secret_iv) {
    try {
      const secret = await decryptCredential(
        user.totp_secret_ciphertext,
        user.totp_secret_iv,
        env.CREDENTIALS_ENCRYPTION_KEY,
      )
      valid = verifyTotpCode(secret, user.email, code)
    } catch {
      valid = false
    }
  }
  if (!valid) {
    await recordLoginFailure(env, clientKey)
    await writeAudit(request, env, {
      userId: user?.id || null,
      eventType: 'auth.totp_login.failed',
      description: 'TOTP login failed',
      severity: 'warning',
      metadata: { reason: 'invalid_credentials' },
    })
    return json({ error: 'Invalid email or code' }, 401, request, env)
  }

  return issueSession(request, env, user, Boolean(body.remember), clientKey, 'auth.totp_login.succeeded')
}

async function logout(request, env, user) {
  const token = getSessionToken(request, env)
  const statements = []
  if (token) {
    const tokenHash = await hashSessionToken(token)
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash))
  }
  statements.push(await auditStatement(request, env, {
    userId: user?.id || null,
    eventType: 'auth.logout',
    description: 'Logout completed',
  }))
  await env.DB.batch(statements)
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'set-cookie': sessionCookie(request, '', 0),
    },
  })
}

async function importEncryptionKey(encodedKey) {
  if (!encodedKey) throw new Error('Encryption key is not configured')
  const bytes = fromBase64(encodedKey)
  if (bytes.byteLength !== 32) throw new Error('Encryption key must be 32 bytes')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptPassword(password, encodedKey) {
  const key = await importEncryptionKey(encodedKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(password)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  }
}

async function decryptCredential(ciphertext, iv, encodedKey) {
  const key = await importEncryptionKey(encodedKey)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

async function twoFactorFailure(request, env, challenge, reason) {
  const statements = []
  if (challenge) {
    const rateLimitKey = await getLoginClientKey(request, `2fa-login:${challenge.user_id}`)
    await recordLoginFailure(env, rateLimitKey)
    statements.push(env.DB.prepare(`
      UPDATE two_factor_challenges SET attempts = attempts + 1
      WHERE id = ? AND attempts < ?
    `).bind(challenge.id, maximumTwoFactorAttempts))
  }
  statements.push(await auditStatement(request, env, {
    userId: challenge?.user_id || null,
    eventType: 'auth.two_factor.failed',
    description: 'Two-factor authentication failed',
    severity: 'warning',
    metadata: { reason },
  }))
  await env.DB.batch(statements)
}

async function completeTwoFactorLogin(request, env) {
  const body = await readJson(request)
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (!challengeToken || challengeToken.length > 256) {
    await twoFactorFailure(request, env, null, 'invalid_challenge')
    throw new ClientError('Challenge token is invalid')
  }

  const tokenHash = await hashSessionToken(challengeToken)
  const challenge = await env.DB.prepare(`
    SELECT two_factor_challenges.id, two_factor_challenges.user_id,
      two_factor_challenges.user_agent_hash, two_factor_challenges.expires_at,
      two_factor_challenges.attempts, users.email, users.role, users.display_name,
      users.must_change_password, users.is_active, users.two_factor_enabled,
      users.totp_secret_ciphertext, users.totp_secret_iv
    FROM two_factor_challenges
    INNER JOIN users ON users.id = two_factor_challenges.user_id
    WHERE two_factor_challenges.token_hash = ?
  `).bind(tokenHash).first()

  if (!challenge) {
    await twoFactorFailure(request, env, null, 'invalid_challenge')
    throw new ClientError('Challenge is invalid or expired', 401)
  }
  const rateLimitKey = await getLoginClientKey(request, `2fa-login:${challenge.user_id}`)
  if (await getLoginBlock(env, rateLimitKey)) {
    await writeAudit(request, env, {
      userId: challenge.user_id,
      eventType: 'auth.two_factor.failed',
      description: 'Two-factor authentication blocked by rate limit',
      severity: 'warning',
      metadata: { reason: 'rate_limited' },
    })
    throw new ClientError('Too many attempts. Try again later.', 429)
  }
  if (challenge.attempts >= maximumTwoFactorAttempts) {
    await twoFactorFailure(request, env, challenge, 'attempt_limit')
    throw new ClientError('Challenge attempt limit exceeded', 429)
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM two_factor_challenges WHERE id = ?').bind(challenge.id),
      await auditStatement(request, env, {
        userId: challenge.user_id,
        eventType: 'auth.two_factor.failed',
        description: 'Two-factor authentication failed',
        severity: 'warning',
        metadata: { reason: 'expired_challenge' },
      }),
    ])
    throw new ClientError('Challenge is invalid or expired', 401)
  }

  const browserHash = await hashBrowserSignature(request)
  if (browserHash !== challenge.user_agent_hash) {
    await twoFactorFailure(request, env, challenge, 'user_agent_mismatch')
    throw new ClientError('Challenge is invalid or expired', 401)
  }
  if (!challenge.is_active || !challenge.two_factor_enabled
    || !challenge.totp_secret_ciphertext || !challenge.totp_secret_iv) {
    await twoFactorFailure(request, env, challenge, 'two_factor_unavailable')
    throw new ClientError('Challenge is invalid or expired', 401)
  }

  const secret = await decryptCredential(
    challenge.totp_secret_ciphertext,
    challenge.totp_secret_iv,
    env.CREDENTIALS_ENCRYPTION_KEY,
  )
  if (!verifyTotpCode(secret, challenge.email, code)) {
    await twoFactorFailure(request, env, challenge, 'invalid_code')
    throw new ClientError('Two-factor code is invalid', 401)
  }

  const consumed = await env.DB.prepare('DELETE FROM two_factor_challenges WHERE id = ? AND attempts < ?')
    .bind(challenge.id, maximumTwoFactorAttempts).run()
  if (!consumed.meta?.changes) throw new ClientError('Challenge is invalid or expired', 401)

  const remember = challengeToken.endsWith('.1')
  return issueSession(request, env, {
    ...challenge,
    id: challenge.user_id,
  }, remember, rateLimitKey, 'auth.two_factor.succeeded')
}

async function getTwoFactorSettings(request, env, user) {
  const settings = await env.DB.prepare(`
    SELECT two_factor_enabled, two_factor_confirmed_at FROM users WHERE id = ?
  `).bind(user.id).first()
  return json({
    data: {
      enabled: Boolean(settings?.two_factor_enabled),
      confirmedAt: settings?.two_factor_confirmed_at || null,
    },
  }, 200, request, env)
}

async function setupTwoFactor(request, env, user) {
  const settings = await env.DB.prepare('SELECT email, two_factor_enabled FROM users WHERE id = ?')
    .bind(user.id).first()
  if (settings?.two_factor_enabled) throw new ClientError('Two-factor authentication is already enabled', 409)

  const secret = new OTPAuth.Secret({ size: 20 }).base32
  const encrypted = await encryptPassword(secret, env.CREDENTIALS_ENCRYPTION_KEY)
  const totp = createTotp(secret, settings.email)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'settings.two_factor.setup_started',
    description: 'Two-factor authentication setup started',
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users SET totp_secret_ciphertext = ?, totp_secret_iv = ?,
        two_factor_enabled = 0, two_factor_confirmed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(encrypted.ciphertext, encrypted.iv, user.id),
    audit,
  ])
  return json({ data: { secret, uri: totp.toString() } }, 200, request, env)
}

async function confirmTwoFactor(request, env, user) {
  const body = await readJson(request)
  const code = typeof body.code === 'string' ? body.code : ''
  const rateLimitKey = await getLoginClientKey(request, `2fa-confirm:${user.id}`)
  if (await getLoginBlock(env, rateLimitKey)) throw new ClientError('Too many attempts. Try again later.', 429)

  const settings = await env.DB.prepare(`
    SELECT email, totp_secret_ciphertext, totp_secret_iv, two_factor_enabled
    FROM users WHERE id = ? AND is_active = 1
  `).bind(user.id).first()
  if (!settings?.totp_secret_ciphertext || !settings.totp_secret_iv || settings.two_factor_enabled) {
    throw new ClientError('Two-factor setup is not pending', 409)
  }
  const secret = await decryptCredential(
    settings.totp_secret_ciphertext,
    settings.totp_secret_iv,
    env.CREDENTIALS_ENCRYPTION_KEY,
  )
  if (!verifyTotpCode(secret, settings.email, code)) {
    await recordLoginFailure(env, rateLimitKey)
    await writeAudit(request, env, {
      userId: user.id,
      eventType: 'settings.two_factor.confirm_failed',
      description: 'Two-factor authentication confirmation failed',
      severity: 'warning',
      metadata: { reason: 'invalid_code' },
    })
    throw new ClientError('Two-factor code is invalid', 400)
  }

  const confirmedAt = new Date().toISOString()
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'settings.two_factor.enabled',
    description: 'Two-factor authentication enabled',
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users SET two_factor_enabled = 1, two_factor_confirmed_at = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(confirmedAt, user.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE client_key = ?').bind(rateLimitKey),
    audit,
  ])
  return json({ data: { enabled: true, confirmedAt } }, 200, request, env)
}

async function disableTwoFactor(request, env, user) {
  const body = await readJson(request)
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const code = typeof body.code === 'string' ? body.code : ''
  if (!currentPassword || currentPassword.length > 1024) throw new ClientError('Current password is invalid')

  const rateLimitKey = await getLoginClientKey(request, `2fa-disable:${user.id}`)
  if (await getLoginBlock(env, rateLimitKey)) throw new ClientError('Too many attempts. Try again later.', 429)
  const settings = await env.DB.prepare(`
    SELECT email, password_hash, password_salt, password_iterations,
      totp_secret_ciphertext, totp_secret_iv, two_factor_enabled
    FROM users WHERE id = ? AND is_active = 1
  `).bind(user.id).first()

  let failureReason = null
  if (!settings || !(await verifyPassword(currentPassword, settings))) {
    failureReason = 'invalid_current_password'
  } else if (settings.two_factor_enabled) {
    const secret = await decryptCredential(
      settings.totp_secret_ciphertext,
      settings.totp_secret_iv,
      env.CREDENTIALS_ENCRYPTION_KEY,
    )
    if (!verifyTotpCode(secret, settings.email, code)) failureReason = 'invalid_code'
  }
  if (failureReason) {
    await recordLoginFailure(env, rateLimitKey)
    await writeAudit(request, env, {
      userId: user.id,
      eventType: 'settings.two_factor.disable_failed',
      description: 'Two-factor authentication disable failed',
      severity: 'warning',
      metadata: { reason: failureReason },
    })
    throw new ClientError(
      failureReason === 'invalid_code' ? 'Two-factor code is invalid' : 'Current password is incorrect',
      403,
    )
  }

  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'settings.two_factor.disabled',
    description: 'Two-factor authentication disabled',
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users SET totp_secret_ciphertext = NULL, totp_secret_iv = NULL,
        two_factor_enabled = 0, two_factor_confirmed_at = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(user.id),
    env.DB.prepare('DELETE FROM two_factor_challenges WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE client_key = ?').bind(rateLimitKey),
    audit,
  ])
  return json({ data: { enabled: false, confirmedAt: null } }, 200, request, env)
}

function isBlockedIpv4(hostname) {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((octet) => octet > 255)) return true
  const [first, second] = octets
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224
}

function isBlockedIpv6(hostname) {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!address.includes(':')) return false
  if (address === '::' || address === '::1') return true
  const firstGroup = Number.parseInt(address.split(':').find(Boolean) || '0', 16)
  if ((firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80) return true

  const mapped = address.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/)
  if (!mapped) return false
  if (mapped[1]) return isBlockedIpv4(mapped[1])
  const high = Number.parseInt(mapped[2], 16)
  const low = Number.parseInt(mapped[3], 16)
  return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
}

function normalizeProviderBaseUrl(value) {
  const raw = cleanText(value, 'Base URL', 2048)
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new ClientError('Base URL must be a valid HTTPS URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ClientError('Base URL must be an HTTPS URL without credentials, query, or fragment')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const localName = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
  if (!hostname || localName || isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) {
    throw new ClientError('Base URL host is not allowed')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!/\/v\d+$/i.test(url.pathname)) url.pathname = `${url.pathname}/v1`
  return url.toString().replace(/\/$/, '')
}

function normalizeProviderId(value) {
  const providerId = cleanText(value, 'Provider ID', 50)
  if (!providerId || !/^[a-z0-9_-]+$/.test(providerId)) {
    throw new ClientError('Provider ID must contain only lowercase letters, numbers, hyphens, or underscores')
  }
  return providerId
}

function normalizeApiMode(value) {
  const apiMode = cleanText(value, 'API mode', 50)
  if (!supportedApiModes.has(apiMode)) throw new ClientError('API mode is not supported')
  return apiMode
}

function providerUrl(baseUrl, endpoint) {
  return `${baseUrl}/${endpoint}`
}

function providerHeaders(apiMode, apiKey, includeJson = false) {
  const headers = { accept: 'application/json' }
  if (apiMode === 'anthropic-messages') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }
  if (includeJson) headers['content-type'] = 'application/json'
  return headers
}

async function withUpstreamTimeout(operation) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMilliseconds)
  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > maximumUpstreamResponseBytes) {
    await response.body?.cancel()
    throw new ClientError('AI provider returned an oversized response', 502)
  }
  if (!response.body) throw new ClientError('AI provider returned an empty response', 502)

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumUpstreamResponseBytes) {
      await reader.cancel()
      throw new ClientError('AI provider returned an oversized response', 502)
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ClientError('AI provider returned an invalid response', 502)
  }
}

function normalizeModelIds(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : null
  if (!candidates) return { models: [], modelListAvailable: false }

  const models = [...new Set(candidates
    .map((model) => typeof model === 'string' ? model : model?.id ?? model?.name)
    .filter((id) => typeof id === 'string' && id.trim() && id.trim().length <= 200)
    .map((id) => id.trim()))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 200)
  return { models, modelListAvailable: true }
}

function extractResponsesOutput(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text) return payload.output_text
  if (!Array.isArray(payload?.output)) return undefined

  const text = payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((block) => {
      if (typeof block?.output_text === 'string') return block.output_text
      if (typeof block?.text === 'string') return block.text
      return ''
    })
    .join('')
  return text || undefined
}

async function discoverProviderModels(apiMode, baseUrl, apiKey) {
  let response
  try {
    response = await withUpstreamTimeout((signal) => fetch(providerUrl(baseUrl, 'models'), {
      method: 'GET',
      headers: providerHeaders(apiMode, apiKey),
      redirect: 'error',
      signal,
    }))
  } catch (error) {
    if (error?.name === 'AbortError') throw new ClientError('AI provider verification timed out', 504)
    throw new ClientError('Unable to reach AI provider for verification', 502)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new ClientError('AI provider verification failed', 400)
  }
  return normalizeModelIds(await readLimitedJson(response))
}

function parseMetadata(value) {
  if (value === undefined) return '{}'
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const metadata = JSON.stringify(value)
  return metadata.length <= 4096 ? metadata : null
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

async function syncAccountStatuses(env) {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE accounts
      SET status = 'Expired', updated_at = CURRENT_TIMESTAMP
      WHERE status <> 'Inactive'
        AND status <> 'Expired'
        AND expires_at IS NOT NULL
        AND datetime(expires_at) <= CURRENT_TIMESTAMP
    `),
    env.DB.prepare(`
      UPDATE accounts
      SET status = 'Expiring Soon', updated_at = CURRENT_TIMESTAMP
      WHERE status <> 'Inactive'
        AND status <> 'Expiring Soon'
        AND expires_at IS NOT NULL
        AND datetime(expires_at) > CURRENT_TIMESTAMP
        AND date(expires_at) <= date('now', '+5 days')
    `),
    env.DB.prepare(`
      UPDATE accounts
      SET status = 'Active', updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('Expired', 'Expiring Soon')
        AND (
          expires_at IS NULL
          OR date(expires_at) > date('now', '+5 days')
        )
    `),
  ])
}

async function findAccountByEmail(env, email) {
  return env.DB.prepare(`
    SELECT id, email, label, category, plan, status, expires_at, created_at
    FROM accounts
    WHERE email = ? COLLATE NOCASE
    LIMIT 1
  `).bind(email).first()
}

async function duplicateAccountResponse(request, env, user, account) {
  const detectedAt = new Date().toISOString()
  await writeAudit(request, env, {
    userId: user?.id || null,
    eventType: 'account.duplicate_detected',
    description: 'Duplicate account creation prevented',
    severity: 'warning',
    metadata: { accountId: account.id, email: account.email, detectedAt },
  })

  return json({
    error: 'This account has already been added',
    code: 'ACCOUNT_EMAIL_DUPLICATE',
    details: {
      email: account.email,
      detectedAt,
      existingAccount: account,
    },
  }, 409, request, env)
}

async function listAccounts(request, env, url) {
  await syncAccountStatuses(env)
  const query = url.searchParams.get('q')?.trim()
  const status = url.searchParams.get('status')?.trim()
  const category = url.searchParams.get('category')?.trim()
  const clauses = []
  const values = []

  if (query) {
    clauses.push('(email LIKE ? OR label LIKE ?)')
    values.push(`%${query}%`, `%${query}%`)
  }
  if (status) {
    clauses.push('status = ?')
    values.push(status)
  }
  if (category) {
    clauses.push('category = ?')
    values.push(category)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const statement = env.DB.prepare(
    `SELECT ${accountListFields} FROM accounts ${where} ORDER BY created_at DESC LIMIT 100`,
  ).bind(...values)
  const { results } = await statement.all()

  return json({ data: results, count: results.length }, 200, request, env)
}

async function getAccount(request, env, id) {
  await syncAccountStatuses(env)
  const account = await env.DB.prepare(
    `SELECT ${accountListFields} FROM accounts WHERE id = ?`,
  ).bind(id).first()

  return account
    ? json({ data: account }, 200, request, env)
    : json({ error: 'Account not found' }, 404, request, env)
}

async function getAccountDetails(request, env, id, user) {
  await syncAccountStatuses(env)
  const account = await env.DB.prepare(`
    SELECT ${publicAccountFields}, password_ciphertext, password_iv
    FROM accounts
    WHERE id = ?
  `).bind(id).first()
  if (!account) return json({ error: 'Account not found' }, 404, request, env)

  const password = await decryptCredential(
    account.password_ciphertext,
    account.password_iv,
    env.CREDENTIALS_ENCRYPTION_KEY,
  )
  delete account.password_ciphertext
  delete account.password_iv

  await writeAudit(request, env, {
    userId: user.id,
    eventType: 'account.details.viewed',
    description: 'Secured account details viewed',
    metadata: { accountId: id },
  })

  return json({
    data: {
      ...account,
      has_password: password ? 1 : 0,
      password: password || null,
    },
  }, 200, request, env)
}

async function createAccount(request, env, user) {
  const body = await readJson(request)
  const email = cleanText(body.email, 'Email', 254).toLowerCase()
  const username = cleanText(body.username, 'Username', 254)
  const password = typeof body.password === 'string' ? body.password : ''
  const expiresAt = parseOptionalDate(body.expiresAt)
  const loginUrl = parseOptionalLoginUrl(body.loginUrl)
  const metadata = parseMetadata(body.metadata)

  if (!email && !username) return json({ error: 'Email or username is required' }, 400, request, env)
  if (email && !isValidEmail(email)) return json({ error: 'Email is invalid' }, 400, request, env)
  if (password && (password.length < 8 || password.length > 1024)) return json({ error: 'Password must be empty or contain 8 to 1024 characters' }, 400, request, env)
  if (expiresAt === undefined) return json({ error: 'Expiration date is invalid' }, 400, request, env)
  if (metadata === null) return json({ error: 'Metadata must be an object' }, 400, request, env)
  if (body.status !== undefined && !accountStatuses.has(body.status)) return json({ error: 'Status is invalid' }, 400, request, env)

  await syncAccountStatuses(env)
  if (email) {
    const duplicate = await findAccountByEmail(env, email)
    if (duplicate) return duplicateAccountResponse(request, env, user, duplicate)
  }

  const id = crypto.randomUUID()
  const encrypted = await encryptPassword(password, env.CREDENTIALS_ENCRYPTION_KEY)

  try {
    const insert = env.DB.prepare(`
      INSERT INTO accounts (
        id, email, password_ciphertext, password_iv, platform, username,
        login_url, account_type, label, category, plan, status, expires_at,
        notes, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      email || null,
      encrypted.ciphertext,
      encrypted.iv,
      cleanText(body.platform, 'Platform', 80, 'Custom') || 'Custom',
      username || null,
      loginUrl,
      cleanText(body.accountType, 'Account type', 50, 'custom') || 'custom',
      cleanText(body.label, 'Label', 100, 'Account') || 'Account',
      cleanText(body.category, 'Category', 50, 'Personal') || 'Personal',
      cleanText(body.plan, 'Plan', 50, 'Free') || 'Free',
      expiresAt && new Date(expiresAt) <= new Date() ? 'Expired' : body.status || 'Active',
      expiresAt,
      cleanText(body.notes, 'Notes', 2000) || null,
      metadata,
    )
    const audit = await auditStatement(request, env, {
      userId: user?.id || null,
      eventType: 'account.created',
      description: 'Account created',
      metadata: { accountId: id },
    })
    await env.DB.batch([insert, audit])
  } catch (error) {
    if (email && String(error).includes('UNIQUE')) {
      const concurrentDuplicate = await findAccountByEmail(env, email)
      if (concurrentDuplicate) {
        return duplicateAccountResponse(request, env, user, concurrentDuplicate)
      }
    }
    throw error
  }

  return getAccount(request, env, id)
}

async function updateAccount(request, env, id, user) {
  const existing = await env.DB.prepare('SELECT id, email, username FROM accounts WHERE id = ?').bind(id).first()
  if (!existing) return json({ error: 'Account not found' }, 404, request, env)

  const body = await readJson(request)
  const email = body.email === undefined
    ? existing.email
    : cleanText(body.email, 'Email', 254).toLowerCase() || null
  const username = body.username === undefined
    ? existing.username
    : cleanText(body.username, 'Username', 254) || null
  if (!email && !username) return json({ error: 'Email or username is required' }, 400, request, env)
  if (email && !isValidEmail(email)) return json({ error: 'Email is invalid' }, 400, request, env)
  if (body.email !== undefined && email) {
    const duplicate = await findAccountByEmail(env, email)
    if (duplicate && duplicate.id !== id) {
      return duplicateAccountResponse(request, env, user, duplicate)
    }
  }
  const fields = []
  const values = []
  const allowed = {
    email: ['email', 254],
    platform: ['platform', 80],
    username: ['username', 254],
    accountType: ['account_type', 50],
    label: ['label', 100],
    category: ['category', 50],
    plan: ['plan', 50],
    status: ['status', 20],
    notes: ['notes', 2000],
  }

  for (const [input, [column, maximum]] of Object.entries(allowed)) {
    if (body[input] !== undefined) {
      fields.push(`${column} = ?`)
      const value = cleanText(body[input], input, maximum)
      if (input === 'email' && value && !isValidEmail(value)) return json({ error: 'Email is invalid' }, 400, request, env)
      if ((input === 'platform' || input === 'accountType') && !value) return json({ error: `${input} is required` }, 400, request, env)
      if (input === 'status' && !accountStatuses.has(value)) return json({ error: 'Status is invalid' }, 400, request, env)
      values.push(input === 'email' ? value.toLowerCase() || null : input === 'username' ? value || null : value)
    }
  }

  if (body.loginUrl !== undefined) {
    fields.push('login_url = ?')
    values.push(parseOptionalLoginUrl(body.loginUrl))
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = parseOptionalDate(body.expiresAt)
    if (expiresAt === undefined) return json({ error: 'Expiration date is invalid' }, 400, request, env)
    fields.push('expires_at = ?')
    values.push(expiresAt)
  }

  if (body.metadata !== undefined) {
    const metadata = parseMetadata(body.metadata)
    if (metadata === null) return json({ error: 'Metadata must be an object' }, 400, request, env)
    fields.push('metadata = ?')
    values.push(metadata)
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || (body.password && (body.password.length < 8 || body.password.length > 1024))) return json({ error: 'Password must be empty or contain 8 to 1024 characters' }, 400, request, env)
    const encrypted = await encryptPassword(body.password, env.CREDENTIALS_ENCRYPTION_KEY)
    fields.push('password_ciphertext = ?', 'password_iv = ?', 'password_version = password_version + 1')
    values.push(encrypted.ciphertext, encrypted.iv)
  }

  if (!fields.length) return json({ error: 'No supported fields supplied' }, 400, request, env)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  const update = env.DB.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).bind(...values)
  const audit = await auditStatement(request, env, {
    userId: user?.id || null,
    eventType: 'account.updated',
    description: 'Account updated',
    metadata: { accountId: id },
  })
  try {
    await env.DB.batch([update, audit])
  } catch (error) {
    if (body.email !== undefined && email && String(error).includes('UNIQUE')) {
      const duplicate = await findAccountByEmail(env, email)
      if (duplicate && duplicate.id !== id) {
        return duplicateAccountResponse(request, env, user, duplicate)
      }
    }
    throw error
  }
  return getAccount(request, env, id)
}

async function deleteAccount(request, env, id, user) {
  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first()
  if (!existing) return json({ error: 'Account not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user?.id || null,
    eventType: 'account.deleted',
    description: 'Account deleted',
    metadata: { accountId: id },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

async function listActivity(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT id, user_id, event_type, description, severity, metadata, created_at
    FROM activity_logs
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).all()
  const activity = results.map((entry) => {
    let metadata = {}
    try {
      metadata = JSON.parse(entry.metadata)
    } catch {
      // The schema enforces valid JSON; retain a safe fallback for legacy data.
    }
    return { ...entry, metadata }
  })
  return json({ data: activity, count: activity.length }, 200, request, env)
}

async function getEmailActivityStats(request, env, user, url) {
  const requestedDays = Number(url.searchParams.get('days') || 7)
  const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 7
  const startModifier = `-${days - 1} days`
  const bucketExpression = days === 1
    ? "strftime('%Y-%m-%dT%H:00:00Z', created_at)"
    : "substr(created_at, 1, 10)"
  const { results } = await env.DB.prepare(`
    SELECT ${bucketExpression} AS bucket,
      SUM(CASE WHEN event_type IN ('email.received', 'email.forwarded') THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN event_type = 'email.address.created' THEN 1 ELSE 0 END) AS generated
    FROM activity_logs
    WHERE user_id = ?
      AND event_type IN ('email.received', 'email.forwarded', 'email.address.created')
      AND datetime(created_at) >= datetime('now', 'start of day', ?)
    GROUP BY ${bucketExpression}
    ORDER BY bucket ASC
  `).bind(user.id, startModifier).all()
  const totalsByBucket = new Map(results.map((row) => [row.bucket, row]))
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const bucketCount = days === 1 ? 24 : days
  const data = Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(today)
    if (days === 1) date.setUTCHours(index)
    else date.setUTCDate(date.getUTCDate() - (days - 1 - index))
    const bucket = days === 1
      ? `${date.toISOString().slice(0, 13)}:00:00Z`
      : date.toISOString().slice(0, 10)
    const totals = totalsByBucket.get(bucket)
    return {
      day: bucket,
      received: Number(totals?.received || 0),
      generated: Number(totals?.generated || 0),
    }
  })

  return json({ data, days }, 200, request, env)
}

async function updateProfile(request, env, user) {
  const body = await readJson(request)
  const fields = []
  const values = []
  const changedFields = []

  if (body.email !== undefined) {
    const email = cleanText(body.email, 'Email', 254).toLowerCase()
    if (!isValidEmail(email)) return json({ error: 'A valid email is required' }, 400, request, env)
    fields.push('email = ?')
    values.push(email)
    changedFields.push('email')
  }
  if (body.displayName !== undefined) {
    const displayName = cleanText(body.displayName, 'Display name', 100)
    if (!displayName) return json({ error: 'Display name is required' }, 400, request, env)
    fields.push('display_name = ?')
    values.push(displayName)
    changedFields.push('displayName')
  }
  if (!fields.length) return json({ error: 'No supported fields supplied' }, 400, request, env)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(user.id)
  try {
    const audit = await auditStatement(request, env, {
      userId: user.id,
      eventType: 'settings.profile.updated',
      description: 'Profile updated',
      metadata: { changedFields },
    })
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values),
      audit,
    ])
  } catch (error) {
    if (String(error).includes('UNIQUE')) return json({ error: 'A user with this email already exists' }, 409, request, env)
    throw error
  }

  const updated = await env.DB.prepare(`
    SELECT id, email, role, display_name, must_change_password FROM users WHERE id = ?
  `).bind(user.id).first()
  return json({
    data: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      displayName: updated.display_name,
      mustChangePassword: Boolean(updated.must_change_password),
    },
  }, 200, request, env)
}

async function updatePassword(request, env, user) {
  const body = await readJson(request)
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (!currentPassword || currentPassword.length > 1024) {
    return json({ error: 'Current password is invalid' }, 400, request, env)
  }
  if (newPassword.length < 8 || newPassword.length > 1024) {
    return json({ error: 'New password must contain 8 to 1024 characters' }, 400, request, env)
  }

  const credentials = await env.DB.prepare(`
    SELECT password_hash, password_salt, password_iterations FROM users
    WHERE id = ? AND is_active = 1
  `).bind(user.id).first()
  if (!credentials || !(await verifyPassword(currentPassword, credentials))) {
    await writeAudit(request, env, {
      userId: user.id,
      eventType: 'settings.password.failed',
      description: 'Password change failed',
      severity: 'warning',
      metadata: { reason: 'invalid_current_password' },
    })
    return json({ error: 'Current password is incorrect' }, 403, request, env)
  }

  const password = await hashPassword(newPassword)
  const token = getSessionToken(request, env)
  const tokenHash = token ? await hashSessionToken(token) : ''
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'settings.password.updated',
    description: 'Password updated',
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users SET
        password_hash = ?, password_salt = ?, password_iterations = ?,
        must_change_password = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(password.hash, password.salt, password.iterations, user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, tokenHash),
    audit,
  ])
  return json({ data: { passwordChanged: true, mustChangePassword: false } }, 200, request, env)
}

function presentAiConnection(connection) {
  if (!connection) return null
  let models = []
  try {
    models = JSON.parse(connection.models_json || '[]')
  } catch {
    models = []
  }
  if (!Array.isArray(models) || !models.length) models = [connection.model]
  return {
    id: connection.id,
    providerId: connection.provider_id,
    providerName: connection.provider_name,
    apiMode: connection.api_mode,
    baseUrl: connection.base_url,
    model: connection.model,
    models,
    status: connection.status,
    isActive: Boolean(connection.is_active),
    lastVerifiedAt: connection.last_verified_at,
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
  }
}

function presentConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  }
}

function presentMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    role: message.role,
    content: message.content,
    providerName: message.provider_name || null,
    model: message.model || null,
    createdAt: message.created_at,
  }
}

async function getAiConfig(request, env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, provider_id, provider_name, api_mode, base_url, model, models_json, status,
      is_active, last_verified_at, created_at, updated_at
    FROM ai_connections WHERE user_id = ?
    ORDER BY is_active DESC, updated_at DESC
  `).bind(user.id).all()
  const profiles = results.map(presentAiConnection)
  return json({ data: profiles.find((profile) => profile.isActive) || null, profiles }, 200, request, env)
}

async function getAiClientConfig(request, env, user, connectionId = null) {
  const connection = await env.DB.prepare(`
    SELECT id, provider_id, provider_name, api_mode, base_url, api_key_ciphertext, api_key_iv,
      model, models_json, status, is_active, last_verified_at, created_at, updated_at
    FROM ai_connections
    WHERE user_id = ? ${connectionId ? 'AND id = ?' : ''}
    ORDER BY is_active DESC, updated_at DESC LIMIT 1
  `).bind(user.id, ...(connectionId ? [connectionId] : [])).first()
  if (!connection) {
    return json({ data: null, profiles: [] }, connectionId ? 404 : 200, request, env)
  }

  let apiKey
  try {
    apiKey = await decryptCredential(
      connection.api_key_ciphertext,
      connection.api_key_iv,
      env.CREDENTIALS_ENCRYPTION_KEY,
    )
  } catch {
    throw new ClientError('AI provider credentials are unavailable', 503)
  }

  const { results } = await env.DB.prepare(`
    SELECT id, provider_id, provider_name, api_mode, base_url, model, models_json, status,
      is_active, last_verified_at, created_at, updated_at
    FROM ai_connections WHERE user_id = ?
    ORDER BY is_active DESC, updated_at DESC
  `).bind(user.id).all()
  return json({
    data: { ...presentAiConnection(connection), apiKey },
    profiles: results.map(presentAiConnection),
  }, 200, request, env)
}

async function verifyAiConnection(request, env) {
  const body = await readJson(request)
  const baseUrl = normalizeProviderBaseUrl(body.baseUrl)
  const providerId = normalizeProviderId(body.providerId)
  const providerName = cleanText(body.providerName, 'Provider name', 100, providerId) || providerId
  const apiMode = normalizeApiMode(body.apiMode)
  const apiKey = cleanText(body.apiKey, 'API key', 8192)

  let discovery
  try {
    discovery = await discoverProviderModels(apiMode, baseUrl, apiKey)
  } finally {
    body.apiKey = null
  }
  return json({
    data: {
      providerId,
      providerName,
      apiMode,
      baseUrl,
      models: discovery.models,
      modelListAvailable: discovery.modelListAvailable,
    },
  }, 200, request, env)
}

async function updateAiConfig(request, env, user, connectionId = null) {
  const body = await readJson(request)
  const baseUrl = normalizeProviderBaseUrl(body.baseUrl)
  const providerId = normalizeProviderId(body.providerId)
  const providerName = cleanText(body.providerName, 'Provider name', 100, providerId) || providerId
  const apiMode = normalizeApiMode(body.apiMode)
  const apiKey = cleanText(body.apiKey, 'API key', 8192)
  const model = cleanText(body.model, 'Model', 200)
  if (!model) throw new ClientError('Model is required')
  const models = [...new Set([
    model,
    ...(Array.isArray(body.models) ? body.models : []),
  ].map((item) => String(item || '').trim()).filter(Boolean))]
    .filter((item) => item.length <= 200)
    .slice(0, 500)
  const modelsJson = JSON.stringify(models)

  const encrypted = await encryptPassword(apiKey, env.CREDENTIALS_ENCRYPTION_KEY)
  body.apiKey = null
  if (connectionId) {
    const owned = await env.DB.prepare(
      'SELECT id FROM ai_connections WHERE id = ? AND user_id = ?',
    ).bind(connectionId, user.id).first()
    if (!owned) return json({ error: 'AI endpoint not found' }, 404, request, env)
  }
  const id = connectionId || crypto.randomUUID()
  const shouldActivate = !connectionId || Boolean(body.activate)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: connectionId ? 'ai.config.updated' : 'ai.config.created',
    description: connectionId ? 'AI provider configuration updated' : 'AI provider configuration created',
    metadata: { connectionId: id },
  })
  const statements = []
  if (shouldActivate) {
    statements.push(env.DB.prepare(
      'UPDATE ai_connections SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    ).bind(user.id))
  }
  statements.push(connectionId
    ? env.DB.prepare(`
      UPDATE ai_connections SET provider_id = ?, provider_name = ?, api_mode = ?,
        base_url = ?, api_key_ciphertext = ?, api_key_iv = ?, model = ?, models_json = ?, status = 'verified',
        last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        ${shouldActivate ? ', is_active = 1' : ''}
      WHERE id = ? AND user_id = ?
    `).bind(providerId, providerName, apiMode, baseUrl, encrypted.ciphertext, encrypted.iv, model, modelsJson, id, user.id)
    : env.DB.prepare(`
      INSERT INTO ai_connections (
        id, user_id, provider_id, provider_name, api_mode, base_url,
        api_key_ciphertext, api_key_iv, model, models_json, status, is_active, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 1, CURRENT_TIMESTAMP)
    `).bind(id, user.id, providerId, providerName, apiMode, baseUrl, encrypted.ciphertext, encrypted.iv, model, modelsJson))
  statements.push(audit)
  await env.DB.batch(statements)
  return getAiClientConfig(request, env, user, id)
}

async function activateAiConfig(request, env, user, connectionId) {
  const connection = await env.DB.prepare(
    'SELECT id FROM ai_connections WHERE id = ? AND user_id = ?',
  ).bind(connectionId, user.id).first()
  if (!connection) return json({ error: 'AI endpoint not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'ai.config.activated',
    description: 'AI provider configuration activated',
    metadata: { connectionId },
  })
  await env.DB.batch([
    env.DB.prepare('UPDATE ai_connections SET is_active = 0 WHERE user_id = ?').bind(user.id),
    env.DB.prepare('UPDATE ai_connections SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(connectionId, user.id),
    audit,
  ])
  return getAiClientConfig(request, env, user, connectionId)
}

async function deleteAiConfig(request, env, user, connectionId = null) {
  const connection = await env.DB.prepare(`
    SELECT id, is_active FROM ai_connections
    WHERE user_id = ? ${connectionId ? 'AND id = ?' : 'AND is_active = 1'} LIMIT 1
  `).bind(user.id, ...(connectionId ? [connectionId] : [])).first()
  if (!connection) return json({ error: 'AI endpoint not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'ai.config.deleted',
    description: 'AI provider configuration deleted',
    metadata: { connectionId: connection.id },
  })
  const statements = [
    env.DB.prepare('DELETE FROM ai_connections WHERE id = ? AND user_id = ?').bind(connection.id, user.id),
  ]
  if (connection.is_active) {
    statements.push(env.DB.prepare(`
      UPDATE ai_connections SET is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM ai_connections WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1)
    `).bind(user.id))
  }
  statements.push(audit)
  await env.DB.batch(statements)
  return getAiClientConfig(request, env, user)
}

async function listConversations(request, env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, title, created_at, updated_at
    FROM chat_conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 100
  `).bind(user.id).all()
  return json({ data: results.map(presentConversation), count: results.length }, 200, request, env)
}

async function getDashboardStats(request, env, user) {
  const [accounts, email, other] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_accounts,
        COUNT(DISTINCT COALESCE(NULLIF(platform, ''), 'Custom')) AS platforms,
        SUM(CASE WHEN status != 'Inactive' AND (
          expires_at IS NULL OR date(expires_at) > date('now', '+5 days')
        ) THEN 1 ELSE 0 END) AS active_accounts,
        SUM(CASE WHEN status != 'Inactive' AND expires_at IS NOT NULL
          AND date(expires_at) BETWEEN date('now') AND date('now', '+5 days')
          THEN 1 ELSE 0 END) AS expiring_soon,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactive_accounts,
        SUM(CASE WHEN status != 'Inactive' AND expires_at IS NOT NULL
          AND date(expires_at) < date('now') THEN 1 ELSE 0 END) AS expired_accounts
      FROM accounts
    `).first(),
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM generated_email_addresses WHERE user_id = ?) AS generated_emails,
        (SELECT COUNT(*) FROM generated_email_addresses WHERE user_id = ? AND status = 'active') AS active_emails,
        (SELECT COUNT(*) FROM received_emails WHERE user_id = ?) AS received_messages,
        (SELECT COUNT(*) FROM received_emails WHERE user_id = ? AND read_at IS NULL) AS unread_messages,
        (SELECT COALESCE(SUM(raw_size_bytes), 0) FROM received_emails WHERE user_id = ?) AS email_storage_bytes
    `).bind(user.id, user.id, user.id, user.id, user.id).first(),
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS notes,
        (SELECT COUNT(*) FROM authenticator_entries WHERE user_id = ?) AS authenticator_accounts,
        (SELECT COUNT(*) FROM vault_secrets WHERE user_id = ?) AS vault_items,
        (SELECT COUNT(*) FROM plugins WHERE user_id = ?) AS plugins,
        (SELECT COUNT(*) FROM plugins WHERE user_id = ? AND enabled = 1) AS enabled_plugins,
        (SELECT COUNT(*) FROM activity_logs WHERE user_id = ?) AS activity_events,
        (SELECT COUNT(*) FROM chat_conversations WHERE user_id = ?) AS saved_conversations
    `).bind(user.id, user.id, user.id, user.id, user.id, user.id, user.id).first(),
  ])
  const numeric = (value) => Number(value || 0)
  return json({
    data: {
      accounts: {
        total: numeric(accounts.total_accounts),
        platforms: numeric(accounts.platforms),
        active: numeric(accounts.active_accounts),
        expiringSoon: numeric(accounts.expiring_soon),
        inactive: numeric(accounts.inactive_accounts),
        expired: numeric(accounts.expired_accounts),
      },
      email: {
        generatedAddresses: numeric(email.generated_emails),
        activeAddresses: numeric(email.active_emails),
        receivedMessages: numeric(email.received_messages),
        unreadMessages: numeric(email.unread_messages),
        storageBytes: numeric(email.email_storage_bytes),
      },
      notes: numeric(other.notes),
      authenticatorAccounts: numeric(other.authenticator_accounts),
      vaultItems: numeric(other.vault_items),
      plugins: {
        configured: numeric(other.plugins),
        enabled: numeric(other.enabled_plugins),
      },
      activityEvents: numeric(other.activity_events),
      savedConversations: numeric(other.saved_conversations),
      generatedAt: new Date().toISOString(),
    },
  }, 200, request, env)
}

function chatMemoryExcerpt(content, query) {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  const matchAt = text.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, matchAt - 180)
  const excerpt = text.slice(start, start + 700)
  return `${start ? '...' : ''}${excerpt}${start + excerpt.length < text.length ? '...' : ''}`
}

async function searchChatMemory(request, env, user) {
  const url = new URL(request.url)
  const query = cleanText(url.searchParams.get('q'), 'Memory search', 200)
  if (!query || query.length < 2) throw new ClientError('Memory search must contain at least 2 characters')
  const excludeConversationId = cleanText(
    url.searchParams.get('excludeConversationId'),
    'Conversation ID',
    100,
  )
  const escaped = query.toLowerCase().replace(/[\\%_]/g, '\\$&')
  const pattern = `%${escaped}%`
  const { results } = await env.DB.prepare(`
    SELECT messages.id, messages.conversation_id, conversations.title,
      messages.role, messages.content, messages.created_at
    FROM chat_messages AS messages
    INNER JOIN chat_conversations AS conversations
      ON conversations.id = messages.conversation_id
    WHERE conversations.user_id = ?
      AND (? = '' OR conversations.id != ?)
      AND (
        LOWER(conversations.title) LIKE ? ESCAPE '\\'
        OR LOWER(messages.content) LIKE ? ESCAPE '\\'
      )
    ORDER BY messages.created_at DESC, messages.id DESC
    LIMIT 16
  `).bind(
    user.id,
    excludeConversationId,
    excludeConversationId,
    pattern,
    pattern,
  ).all()
  const data = (results || []).map((result) => ({
    messageId: result.id,
    conversationId: result.conversation_id,
    conversationTitle: result.title,
    role: result.role,
    excerpt: chatMemoryExcerpt(result.content, query),
    createdAt: result.created_at,
  }))
  return json({ data, count: data.length, query }, 200, request, env)
}

async function createConversation(request, env, user) {
  const body = await readJson(request)
  const title = cleanText(body.title, 'Title', 100, 'New conversation') || 'New conversation'
  const id = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO chat_conversations (id, user_id, title) VALUES (?, ?, ?)
  `).bind(id, user.id, title).run()
  const conversation = await env.DB.prepare(`
    SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = ?
  `).bind(id).first()
  return json({ data: presentConversation(conversation) }, 201, request, env)
}

async function deleteConversation(request, env, user, id) {
  const conversation = await env.DB.prepare(`
    SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first()
  if (!conversation) return json({ error: 'Conversation not found' }, 404, request, env)

  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'chat.conversation.deleted',
    description: 'Chat conversation deleted',
    metadata: { conversationId: id },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chat_conversations WHERE id = ? AND user_id = ?').bind(id, user.id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

async function presentNote(note, env) {
  return {
    id: note.id,
    title: await decryptCredential(note.title_ciphertext, note.title_iv, env.CREDENTIALS_ENCRYPTION_KEY),
    content: await decryptCredential(note.content_ciphertext, note.content_iv, env.CREDENTIALS_ENCRYPTION_KEY),
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  }
}

async function getNoteRecord(env, userId, id) {
  return env.DB.prepare(`
    SELECT id, title_ciphertext, title_iv, content_ciphertext, content_iv, created_at, updated_at
    FROM notes
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first()
}

async function listNotes(request, env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, title_ciphertext, title_iv, content_ciphertext, content_iv, created_at, updated_at
    FROM notes
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 500
  `).bind(user.id).all()
  const notes = await Promise.all((results || []).map((note) => presentNote(note, env)))
  return json({ data: notes, count: notes.length }, 200, request, env)
}

async function createNote(request, env, user) {
  const body = await readJson(request)
  const title = cleanText(body.title, 'Title', 200) || 'Untitled note'
  const content = cleanText(body.content, 'Content', 12000)
  const id = crypto.randomUUID()
  const [encryptedTitle, encryptedContent] = await Promise.all([
    encryptPassword(title, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(content, env.CREDENTIALS_ENCRYPTION_KEY),
  ])
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'note.created',
    description: 'Note created',
    metadata: { noteId: id },
  })
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO notes (id, user_id, title_ciphertext, title_iv, content_ciphertext, content_iv)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, user.id, encryptedTitle.ciphertext, encryptedTitle.iv, encryptedContent.ciphertext, encryptedContent.iv),
    audit,
  ])
  return json({ data: await presentNote(await getNoteRecord(env, user.id, id), env) }, 201, request, env)
}

async function updateNote(request, env, user, id) {
  const existing = await getNoteRecord(env, user.id, id)
  if (!existing) return json({ error: 'Note not found' }, 404, request, env)

  const body = await readJson(request)
  if (body.title === undefined && body.content === undefined) throw new ClientError('Title or content is required')
  const current = await presentNote(existing, env)
  const title = body.title === undefined ? current.title : cleanText(body.title, 'Title', 200) || 'Untitled note'
  const content = body.content === undefined ? current.content : cleanText(body.content, 'Content', 12000)
  const [encryptedTitle, encryptedContent] = await Promise.all([
    encryptPassword(title, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(content, env.CREDENTIALS_ENCRYPTION_KEY),
  ])
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'note.updated',
    description: 'Note updated',
    metadata: { noteId: id },
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE notes
      SET title_ciphertext = ?, title_iv = ?, content_ciphertext = ?, content_iv = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(encryptedTitle.ciphertext, encryptedTitle.iv, encryptedContent.ciphertext, encryptedContent.iv, id, user.id),
    audit,
  ])
  return json({ data: await presentNote(await getNoteRecord(env, user.id, id), env) }, 200, request, env)
}

async function deleteNote(request, env, user, id) {
  const existing = await getNoteRecord(env, user.id, id)
  if (!existing) return json({ error: 'Note not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'note.deleted',
    description: 'Note deleted',
    metadata: { noteId: id },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, user.id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

async function getVaultSecretRecord(env, userId, id) {
  return env.DB.prepare(`
    SELECT id, name_ciphertext, name_iv, value_ciphertext, value_iv,
      notes_ciphertext, notes_iv, secret_type, created_at, updated_at
    FROM vault_secrets
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first()
}

async function presentVaultSecret(secret, env, includeValue = false) {
  const name = await decryptCredential(secret.name_ciphertext, secret.name_iv, env.CREDENTIALS_ENCRYPTION_KEY)
  return {
    id: secret.id,
    name,
    type: secret.secret_type,
    hasValue: Boolean(secret.value_ciphertext),
    createdAt: secret.created_at,
    updatedAt: secret.updated_at,
    ...(includeValue ? {
      value: await decryptCredential(secret.value_ciphertext, secret.value_iv, env.CREDENTIALS_ENCRYPTION_KEY),
      notes: await decryptCredential(secret.notes_ciphertext, secret.notes_iv, env.CREDENTIALS_ENCRYPTION_KEY),
    } : {}),
  }
}

async function listVaultSecrets(request, env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, name_ciphertext, name_iv, value_ciphertext, value_iv,
      notes_ciphertext, notes_iv, secret_type, created_at, updated_at
    FROM vault_secrets
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 500
  `).bind(user.id).all()
  const secrets = await Promise.all((results || []).map((secret) => presentVaultSecret(secret, env)))
  return json({ data: secrets, count: secrets.length }, 200, request, env)
}

async function getVaultSecret(request, env, user, id) {
  const secret = await getVaultSecretRecord(env, user.id, id)
  if (!secret) return json({ error: 'Vault item not found' }, 404, request, env)
  return json({ data: await presentVaultSecret(secret, env, true) }, 200, request, env)
}

async function createVaultSecret(request, env, user) {
  const body = await readJson(request, maximumVaultBodyBytes)
  const name = cleanText(body.name, 'Name', 200)
  const value = secretText(body.value, 'Secret value', 12000)
  const notes = cleanText(body.notes, 'Notes', 2000)
  const type = cleanText(body.type, 'Type', 32, 'other') || 'other'
  if (!name) throw new ClientError('Name is required')
  if (!vaultSecretTypes.has(type)) throw new ClientError('Secret type is invalid')
  const id = crypto.randomUUID()
  const [encryptedName, encryptedValue, encryptedNotes] = await Promise.all([
    encryptPassword(name, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(value, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(notes, env.CREDENTIALS_ENCRYPTION_KEY),
  ])
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'vault.secret.created',
    description: 'Vault secret created',
    metadata: { secretId: id, type },
  })
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO vault_secrets (
        id, user_id, name_ciphertext, name_iv, value_ciphertext, value_iv,
        notes_ciphertext, notes_iv, secret_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, user.id, encryptedName.ciphertext, encryptedName.iv,
      encryptedValue.ciphertext, encryptedValue.iv, encryptedNotes.ciphertext,
      encryptedNotes.iv, type,
    ),
    audit,
  ])
  return json({ data: await presentVaultSecret(await getVaultSecretRecord(env, user.id, id), env) }, 201, request, env)
}

async function updateVaultSecret(request, env, user, id) {
  const existing = await getVaultSecretRecord(env, user.id, id)
  if (!existing) return json({ error: 'Vault item not found' }, 404, request, env)
  const body = await readJson(request, maximumVaultBodyBytes)
  const current = await presentVaultSecret(existing, env, true)
  const name = body.name === undefined ? current.name : cleanText(body.name, 'Name', 200)
  const value = body.value === undefined ? current.value : secretText(body.value, 'Secret value', 12000)
  const notes = body.notes === undefined ? current.notes : cleanText(body.notes, 'Notes', 2000)
  const type = body.type === undefined ? current.type : cleanText(body.type, 'Type', 32)
  if (!name) throw new ClientError('Name is required')
  if (!vaultSecretTypes.has(type)) throw new ClientError('Secret type is invalid')
  const [encryptedName, encryptedValue, encryptedNotes] = await Promise.all([
    encryptPassword(name, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(value, env.CREDENTIALS_ENCRYPTION_KEY),
    encryptPassword(notes, env.CREDENTIALS_ENCRYPTION_KEY),
  ])
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'vault.secret.updated',
    description: 'Vault secret updated',
    metadata: { secretId: id, type },
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE vault_secrets
      SET name_ciphertext = ?, name_iv = ?, value_ciphertext = ?, value_iv = ?,
        notes_ciphertext = ?, notes_iv = ?, secret_type = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      encryptedName.ciphertext, encryptedName.iv, encryptedValue.ciphertext,
      encryptedValue.iv, encryptedNotes.ciphertext, encryptedNotes.iv, type,
      id, user.id,
    ),
    audit,
  ])
  return json({ data: await presentVaultSecret(await getVaultSecretRecord(env, user.id, id), env) }, 200, request, env)
}

async function deleteVaultSecret(request, env, user, id) {
  const existing = await getVaultSecretRecord(env, user.id, id)
  if (!existing) return json({ error: 'Vault item not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'vault.secret.deleted',
    description: 'Vault secret deleted',
    metadata: { secretId: id },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM vault_secrets WHERE id = ? AND user_id = ?').bind(id, user.id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

function validatePluginConfig(platform, value) {
  const definition = pluginFields[platform]
  if (!definition) throw new ClientError('Plugin platform is invalid')
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClientError('Plugin configuration must be an object')
  }
  const unknownField = Object.keys(value).find((field) => !definition.allowed.includes(field))
  if (unknownField) throw new ClientError(`Plugin configuration field ${unknownField} is invalid`)
  const config = Object.fromEntries(definition.allowed
    .filter((field) => value[field] !== undefined)
    .map((field) => [field, secretText(value[field], field, field === 'accountName' ? 200 : 8000)]))
  const missingField = definition.required.find((field) => !config[field])
  if (missingField) throw new ClientError(`${missingField} is required`)
  return config
}

async function getPluginRecord(env, userId, id) {
  return env.DB.prepare(`
    SELECT id, platform, config_ciphertext, config_iv, enabled, created_at, updated_at
    FROM plugins
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first()
}

async function presentPlugin(plugin, env, includeConfig = false) {
  const decrypted = await decryptCredential(plugin.config_ciphertext, plugin.config_iv, env.CREDENTIALS_ENCRYPTION_KEY)
  const config = JSON.parse(decrypted)
  return {
    id: plugin.id,
    platform: plugin.platform,
    accountName: config.accountName || `${plugin.platform.replaceAll('_', ' ')} account`,
    enabled: Boolean(plugin.enabled),
    configuredFields: Object.keys(config).filter((field) => field !== 'accountName' && Boolean(config[field])),
    createdAt: plugin.created_at,
    updatedAt: plugin.updated_at,
    ...(includeConfig ? { config } : {}),
  }
}

async function listPlugins(request, env, user) {
  const { results } = await env.DB.prepare(`
    SELECT id, platform, config_ciphertext, config_iv, enabled, created_at, updated_at
    FROM plugins
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
  `).bind(user.id).all()
  const plugins = await Promise.all((results || []).map((plugin) => presentPlugin(plugin, env)))
  return json({ data: plugins, count: plugins.length }, 200, request, env)
}

async function getPlugin(request, env, user, id) {
  const plugin = await getPluginRecord(env, user.id, id)
  if (!plugin) return json({ error: 'Plugin not found' }, 404, request, env)
  return json({ data: await presentPlugin(plugin, env, true) }, 200, request, env)
}

async function createPlugin(request, env, user) {
  const body = await readJson(request, maximumVaultBodyBytes)
  const platform = cleanText(body.platform, 'Platform', 32)
  const config = validatePluginConfig(platform, body.config)
  const encryptedConfig = await encryptPassword(JSON.stringify(config), env.CREDENTIALS_ENCRYPTION_KEY)
  const id = crypto.randomUUID()
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'plugin.created',
    description: 'Plugin configured',
    metadata: { pluginId: id, platform },
  })
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO plugins (id, user_id, platform, config_ciphertext, config_iv, enabled)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(id, user.id, platform, encryptedConfig.ciphertext, encryptedConfig.iv),
    audit,
  ])
  return json({ data: await presentPlugin(await getPluginRecord(env, user.id, id), env) }, 201, request, env)
}

async function updatePlugin(request, env, user, id) {
  const existing = await getPluginRecord(env, user.id, id)
  if (!existing) return json({ error: 'Plugin not found' }, 404, request, env)
  const body = await readJson(request, maximumVaultBodyBytes)
  if (body.config === undefined && body.enabled === undefined) {
    throw new ClientError('Plugin configuration or enabled status is required')
  }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw new ClientError('Enabled must be true or false')
  }
  const current = await presentPlugin(existing, env, true)
  const config = body.config === undefined ? current.config : validatePluginConfig(existing.platform, body.config)
  const enabled = body.enabled === undefined ? current.enabled : body.enabled
  const encryptedConfig = await encryptPassword(JSON.stringify(config), env.CREDENTIALS_ENCRYPTION_KEY)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'plugin.updated',
    description: 'Plugin configuration updated',
    metadata: { pluginId: id, platform: existing.platform, enabled },
  })
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE plugins
      SET config_ciphertext = ?, config_iv = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(encryptedConfig.ciphertext, encryptedConfig.iv, enabled ? 1 : 0, id, user.id),
    audit,
  ])
  return json({ data: await presentPlugin(await getPluginRecord(env, user.id, id), env) }, 200, request, env)
}

async function deletePlugin(request, env, user, id) {
  const existing = await getPluginRecord(env, user.id, id)
  if (!existing) return json({ error: 'Plugin not found' }, 404, request, env)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'plugin.deleted',
    description: 'Plugin removed',
    metadata: { pluginId: id, platform: existing.platform },
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM plugins WHERE id = ? AND user_id = ?').bind(id, user.id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

async function listConversationMessages(request, env, user, id) {
  const conversation = await env.DB.prepare(`
    SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first()
  if (!conversation) return json({ error: 'Conversation not found' }, 404, request, env)

  const { results } = await env.DB.prepare(`
    SELECT id, conversation_id, role, content, provider_name, model, created_at
    FROM chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(id).all()
  return json({ data: results.map(presentMessage), count: results.length }, 200, request, env)
}

async function saveChatExchange(request, env, user) {
  const body = await readJson(request, maximumChatBodyBytes)
  const message = cleanText(body.message, 'Message', 20000)
  const assistantContent = cleanText(body.assistantContent, 'Assistant response', 50000)
  const providerName = cleanText(body.providerName, 'Provider name', 100)
  const model = cleanText(body.model, 'Model', 200)
  if (!message) throw new ClientError('Message is required')
  if (!assistantContent) throw new ClientError('Assistant response is required')

  let conversation = null
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (typeof body.conversationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.conversationId)) {
      throw new ClientError('Conversation ID is invalid')
    }
    conversation = await env.DB.prepare(`
      SELECT id, title, created_at, updated_at
      FROM chat_conversations WHERE id = ? AND user_id = ?
    `).bind(body.conversationId, user.id).first()
    if (!conversation) return json({ error: 'Conversation not found' }, 404, request, env)
  }

  const conversationId = conversation?.id || crypto.randomUUID()
  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()
  const statements = []
  if (!conversation) {
    statements.push(env.DB.prepare(`
      INSERT INTO chat_conversations (id, user_id, title) VALUES (?, ?, ?)
    `).bind(conversationId, user.id, message.slice(0, 100)))
  } else {
    statements.push(env.DB.prepare(`
      UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(conversationId, user.id))
  }
  statements.push(
    env.DB.prepare(`
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, 'user', ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `).bind(userMessageId, conversationId, message),
    env.DB.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, role, content, provider_name, model, created_at
      ) VALUES (?, ?, 'assistant', ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now', '+0.001 seconds'))
    `).bind(assistantMessageId, conversationId, assistantContent, providerName, model),
  )
  await env.DB.batch(statements)

  const [savedConversation, userMessage, assistantMessage] = await Promise.all([
    env.DB.prepare(`
      SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = ?
    `).bind(conversationId).first(),
    env.DB.prepare(`
      SELECT id, conversation_id, role, content, provider_name, model, created_at FROM chat_messages WHERE id = ?
    `).bind(userMessageId).first(),
    env.DB.prepare(`
      SELECT id, conversation_id, role, content, provider_name, model, created_at FROM chat_messages WHERE id = ?
    `).bind(assistantMessageId).first(),
  ])
  return json({
    data: {
      conversation: presentConversation(savedConversation),
      user: presentMessage(userMessage),
      assistant: presentMessage(assistantMessage),
    },
  }, 201, request, env)
}

async function createChatCompletion(request, env, user) {
  const body = await readJson(request, maximumChatBodyBytes)
  const message = cleanText(body.message, 'Message', 20000)
  if (!message) throw new ClientError('Message is required')

  let conversation = null
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (typeof body.conversationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.conversationId)) {
      throw new ClientError('Conversation ID is invalid')
    }
    conversation = await env.DB.prepare(`
      SELECT id, title, created_at, updated_at
      FROM chat_conversations WHERE id = ? AND user_id = ?
    `).bind(body.conversationId, user.id).first()
    if (!conversation) return json({ error: 'Conversation not found' }, 404, request, env)
  }

  const connection = await env.DB.prepare(`
    SELECT provider_name, api_mode, base_url, api_key_ciphertext, api_key_iv, model
    FROM ai_connections WHERE user_id = ? AND status = 'verified' AND is_active = 1
  `).bind(user.id).first()
  if (!connection) return json({ error: 'AI provider is not configured' }, 409, request, env)

  let history = []
  if (conversation) {
    const { results } = await env.DB.prepare(`
      SELECT role, content FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 30
    `).bind(conversation.id).all()
    history = results.reverse()
  }

  let apiKey
  try {
    apiKey = await decryptCredential(
      connection.api_key_ciphertext,
      connection.api_key_iv,
      env.CREDENTIALS_ENCRYPTION_KEY,
    )
  } catch {
    throw new ClientError('AI provider credentials are unavailable', 503)
  }

  let upstreamData
  try {
    upstreamData = await withUpstreamTimeout(async (signal) => {
      const anthropic = connection.api_mode === 'anthropic-messages'
      const responses = connection.api_mode === 'openai-responses'
      const messages = [...history, { role: 'user', content: message }]
      const response = await fetch(providerUrl(
        connection.base_url,
        anthropic ? 'messages' : responses ? 'responses' : 'chat/completions',
      ), {
        method: 'POST',
        headers: providerHeaders(connection.api_mode, apiKey, true),
        body: JSON.stringify(anthropic
          ? { model: connection.model, max_tokens: 4096, messages }
          : responses
            ? { model: connection.model, input: messages, stream: false }
            : { model: connection.model, messages, stream: false }),
        redirect: 'error',
        signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new ClientError('AI provider rejected the completion request', 502)
      }
      return readLimitedJson(response)
    })
  } catch (error) {
    if (error instanceof ClientError) throw error
    if (error?.name === 'AbortError') throw new ClientError('AI provider request timed out', 504)
    throw new ClientError('Unable to reach AI provider', 502)
  } finally {
    apiKey = null
  }

  const assistantContent = connection.api_mode === 'anthropic-messages'
    ? upstreamData?.content
      ?.filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
    : connection.api_mode === 'openai-responses'
      ? extractResponsesOutput(upstreamData)
      : upstreamData?.choices?.[0]?.message?.content
  if (typeof assistantContent !== 'string' || !assistantContent) {
    throw new ClientError('AI provider returned an invalid response', 502)
  }

  const conversationId = conversation?.id || crypto.randomUUID()
  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()
  const statements = []
  if (!conversation) {
    statements.push(env.DB.prepare(`
      INSERT INTO chat_conversations (id, user_id, title) VALUES (?, ?, ?)
    `).bind(conversationId, user.id, message.slice(0, 100)))
  } else {
    statements.push(env.DB.prepare(`
      UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(conversationId, user.id))
  }
  statements.push(
    env.DB.prepare(`
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, 'user', ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `).bind(userMessageId, conversationId, message),
    env.DB.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, role, content, provider_name, model, created_at
      ) VALUES (?, ?, 'assistant', ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now', '+0.001 seconds'))
    `).bind(assistantMessageId, conversationId, assistantContent, connection.provider_name, connection.model),
  )
  await env.DB.batch(statements)

  conversation = await env.DB.prepare(`
    SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = ?
  `).bind(conversationId).first()
  const assistant = await env.DB.prepare(`
    SELECT id, conversation_id, role, content, provider_name, model, created_at FROM chat_messages WHERE id = ?
  `).bind(assistantMessageId).first()
  return json({
    data: {
      conversation: presentConversation(conversation),
      assistant: presentMessage(assistant),
    },
  }, 200, request, env)
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '""'
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function presentBackupAccount(account) {
  return {
    platform: account.platform,
    accountType: account.account_type,
    label: account.label,
    category: account.category,
    username: account.username,
    email: account.email,
    loginUrl: account.login_url,
    plan: account.plan,
    status: account.status,
    expiresAt: account.expires_at,
    lastUsedAt: account.last_used_at,
    notes: account.notes,
    metadata: typeof account.metadata === 'string' ? JSON.parse(account.metadata) : account.metadata,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  }
}

async function exportBackup(request, env, url, user) {
  await syncAccountStatuses(env)
  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  if (format !== 'json' && format !== 'csv') {
    return json({ error: 'Format must be json or csv' }, 400, request, env)
  }
  const accountFields = format === 'json'
    ? `${publicAccountFields}, password_ciphertext, password_iv`
    : publicAccountFields
  const accountResult = await env.DB.prepare(`
    SELECT ${accountFields} FROM accounts ORDER BY created_at DESC
  `).all()
  const filename = `vault-backup.${format}`
  const backupAccounts = (accountResult.results || []).map(presentBackupAccount)
  if (format === 'json') {
    const [vaultResult, noteResult, authenticatorResult] = await Promise.all([
      env.DB.prepare(`
        SELECT id, name_ciphertext, name_iv, value_ciphertext, value_iv,
          notes_ciphertext, notes_iv, secret_type, created_at, updated_at
        FROM vault_secrets WHERE user_id = ? ORDER BY created_at DESC
      `).bind(user.id).all(),
      env.DB.prepare(`
        SELECT id, title_ciphertext, title_iv, content_ciphertext, content_iv, created_at, updated_at
        FROM notes WHERE user_id = ? ORDER BY created_at DESC
      `).bind(user.id).all(),
      env.DB.prepare(`
        SELECT issuer, account_name, secret_ciphertext, secret_iv, algorithm, digits, period, created_at, updated_at
        FROM authenticator_entries WHERE user_id = ? ORDER BY created_at DESC
      `).bind(user.id).all(),
    ])
    const [accountsWithPasswords, vaultSecrets, notes, authenticators] = await Promise.all([
      Promise.all((accountResult.results || []).map(async (account) => ({
        ...presentBackupAccount(account),
        password: await decryptCredential(account.password_ciphertext, account.password_iv, env.CREDENTIALS_ENCRYPTION_KEY),
      }))),
      Promise.all((vaultResult.results || []).map((secret) => presentVaultSecret(secret, env, true))),
      Promise.all((noteResult.results || []).map((note) => presentNote(note, env))),
      Promise.all((authenticatorResult.results || []).map(async (entry) => ({
        issuer: entry.issuer,
        accountName: entry.account_name,
        secret: await decryptCredential(entry.secret_ciphertext, entry.secret_iv, env.CREDENTIALS_ENCRYPTION_KEY),
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      }))),
    ])
    await writeAudit(request, env, {
      userId: user.id,
      eventType: 'backup.exported',
      description: 'Encrypted backup data exported',
      metadata: {
        accounts: backupAccounts.length,
        vaultSecrets: vaultSecrets.length,
        notes: notes.length,
        authenticators: authenticators.length,
      },
    })
    return json({
      format: 'vault-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      accounts: accountsWithPasswords,
      vaultSecrets,
      notes,
      authenticators,
    }, 200, request, env, {
      'content-disposition': `attachment; filename="${filename}"`,
    })
  }

  const columns = ['platform', 'accountType', 'label', 'category', 'username', 'email', 'loginUrl', 'plan', 'status', 'expiresAt', 'lastUsedAt', 'notes', 'createdAt', 'updatedAt']
  const csv = [
    columns.map(escapeCsv).join(','),
    ...backupAccounts.map((account) => columns.map((column) => escapeCsv(account[column])).join(',')),
  ].join('\r\n')
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      ...corsHeaders(request, env),
    },
  })
}

// --- Email helpers ---

function parseConfiguredEmailDomains(env) {
  return String(env.EMAIL_DOMAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function parseEmailRoutingZones(env) {
  return new Map(String(env.EMAIL_ROUTING_ZONES || '')
    .split(',')
    .map((entry) => entry.trim().split('=').map((value) => value.trim()))
    .filter(([hostname, zoneId]) => hostname && zoneId)
    .map(([hostname, zoneId]) => [hostname.toLowerCase(), zoneId]))
}

function normalizeForwardingAddress(value) {
  const address = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) return null
  return address
}

async function emailRoutingRequest(env, zoneId, path = '', options = {}, allowNotFound = false) {
  if (!env.CLOUDFLARE_EMAIL_ROUTING_TOKEN) {
    throw new ClientError('Email routing is not configured', 503)
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules${path}`,
    {
      ...options,
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_EMAIL_ROUTING_TOKEN}`,
        'content-type': 'application/json',
        ...options.headers,
      },
    },
  )
  const result = await response.json().catch(() => null)
  if (allowNotFound && response.status === 404) return null
  if (!response.ok || !result?.success) {
    const detail = result?.errors?.[0]?.message
    console.error('Email Routing API request failed', response.status, detail || 'Unknown error')
    throw new ClientError('Email routing is temporarily unavailable', 503)
  }
  return result.result
}

function emailRoutingRuleIsReady(rule, fullAddress, workerName) {
  return Boolean(
    rule?.id
      && rule.enabled === true
      && rule.matchers?.some((matcher) =>
        matcher.type === 'literal'
        && matcher.field === 'to'
        && String(matcher.value || '').toLowerCase() === fullAddress.toLowerCase())
      && rule.actions?.some((action) =>
        action.type === 'worker'
        && action.value?.includes(workerName)),
  )
}

async function waitForEmailRoutingRule(env, zoneId, ruleId, fullAddress) {
  for (const delay of emailRoutingSyncDelaysMilliseconds) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const rule = await emailRoutingRequest(
      env,
      zoneId,
      `/${encodeURIComponent(ruleId)}`,
      {},
      true,
    )
    if (emailRoutingRuleIsReady(rule, fullAddress, env.EMAIL_ROUTING_WORKER)) return rule
  }
  throw new ClientError('Email routing could not be synchronized. Try generating the address again.', 503)
}

async function createEmailRoutingRule(env, hostname, fullAddress) {
  const zoneId = parseEmailRoutingZones(env).get(hostname.toLowerCase())
  if (!zoneId || !env.EMAIL_ROUTING_WORKER) {
    throw new ClientError('Email routing is not configured for this domain', 503)
  }

  const rule = await emailRoutingRequest(env, zoneId, '', {
    method: 'POST',
    body: JSON.stringify({
      name: `Vault generated: ${fullAddress}`,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: fullAddress }],
      actions: [{ type: 'worker', value: [env.EMAIL_ROUTING_WORKER] }],
    }),
  })
  if (!rule?.id) throw new ClientError('Email routing did not return a rule identifier', 503)
  const ruleId = String(rule.id)
  try {
    await waitForEmailRoutingRule(env, zoneId, ruleId, fullAddress)
    return { ruleId, zoneId }
  } catch (error) {
    try {
      await deleteEmailRoutingRule(env, zoneId, ruleId)
    } catch (cleanupError) {
      console.error('Failed to remove unsynchronized Email Routing rule', cleanupError)
    }
    throw error
  }
}

async function deleteEmailRoutingRule(env, zoneId, ruleId) {
  if (!zoneId || !ruleId) return
  if (!env.CLOUDFLARE_EMAIL_ROUTING_TOKEN) {
    throw new ClientError('Email routing is not configured', 503)
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${env.CLOUDFLARE_EMAIL_ROUTING_TOKEN}` },
    },
  )
  if (response.ok || response.status === 404) return

  const result = await response.json().catch(() => null)
  console.error(
    'Email Routing rule deletion failed',
    response.status,
    result?.errors?.[0]?.message || 'Unknown error',
  )
  throw new ClientError('Email routing is temporarily unavailable', 503)
}

async function listEmailRoutingRules(env, zoneId) {
  if (!env.CLOUDFLARE_EMAIL_ROUTING_TOKEN) {
    throw new ClientError('Email routing is not configured', 503)
  }

  const rules = []
  let page = 1
  let totalPages = 1
  do {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules?page=${page}&per_page=100`,
      { headers: { authorization: `Bearer ${env.CLOUDFLARE_EMAIL_ROUTING_TOKEN}` } },
    )
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.success || !Array.isArray(result.result)) {
      const detail = result?.errors?.[0]?.message
      console.error('Email Routing rule listing failed', response.status, detail || 'Unknown error')
      throw new ClientError('Email routing is temporarily unavailable', 503)
    }
    rules.push(...result.result)
    totalPages = Math.max(1, Number(result.result_info?.total_pages) || 1)
    page += 1
  } while (page <= totalPages)

  return rules
}

async function reconcileEmailRoutingRules(env, userId = null) {
  const query = `
    SELECT id, user_id, full_address, routing_rule_id, routing_zone_id
    FROM generated_email_addresses
    WHERE routing_rule_id IS NOT NULL AND routing_zone_id IS NOT NULL
      ${userId ? 'AND user_id = ?' : ''}
  `
  const { results } = userId
    ? await env.DB.prepare(query).bind(userId).all()
    : await env.DB.prepare(query).all()
  if (!results?.length) return []

  const rulesByZone = new Map()
  for (const zoneId of new Set(results.map((address) => address.routing_zone_id))) {
    const rules = await listEmailRoutingRules(env, zoneId)
    rulesByZone.set(zoneId, new Set(rules.map((rule) => String(rule.id))))
  }

  const missing = results.filter((address) =>
    !rulesByZone.get(address.routing_zone_id)?.has(String(address.routing_rule_id)))
  if (!missing.length) return []

  const missingByUser = new Map()
  for (const address of missing) {
    const addresses = missingByUser.get(address.user_id) || []
    addresses.push(address)
    missingByUser.set(address.user_id, addresses)
  }
  for (const [ownerId, addresses] of missingByUser) {
    const ids = addresses.map((address) => address.id)
    const placeholders = ids.map(() => '?').join(', ')
    const remove = env.DB.prepare(`
      DELETE FROM generated_email_addresses
      WHERE user_id = ? AND id IN (${placeholders})
    `).bind(ownerId, ...ids)
    const audit = env.DB.prepare(`
      INSERT INTO activity_logs (
        id, user_id, event_type, description, severity, metadata, client_identifier_hash
      ) VALUES (?, ?, 'email.addresses.reconciled', ?, 'info', ?, ?)
    `).bind(
      crypto.randomUUID(),
      ownerId,
      `${ids.length} email address${ids.length === 1 ? '' : 'es'} removed after Cloudflare synchronization`,
      JSON.stringify({
        addressIds: ids,
        addresses: addresses.map((address) => address.full_address),
        reason: 'cloudflare_rule_missing',
      }),
      await digestClientIdentifier(`email-routing-reconciliation|${ownerId}`),
    )
    await env.DB.batch([remove, audit])
  }

  return missing.map((address) => address.id)
}

async function digestClientIdentifier(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(digest))
}

export const emailRouting = {
  parseZones: parseEmailRoutingZones,
  ruleIsReady: emailRoutingRuleIsReady,
  createRule: createEmailRoutingRule,
  deleteRule: deleteEmailRoutingRule,
  listRules: listEmailRoutingRules,
  reconcile: reconcileEmailRoutingRules,
}

async function listVerifiedForwardingDestinations(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_EMAIL_ROUTING_TOKEN) {
    return { available: false, destinations: [] }
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/routing/addresses?verified=true`,
    { headers: { authorization: `Bearer ${env.CLOUDFLARE_EMAIL_ROUTING_TOKEN}` } },
  )
  if (!response.ok) throw new ClientError('Forwarding destinations are temporarily unavailable', 503)

  const result = await response.json()
  if (!result?.success) throw new ClientError('Forwarding destinations are temporarily unavailable', 503)
  const destinations = (result.result || [])
    .filter((item) => item.verified)
    .map((item) => ({
      id: String(item.id),
      address: normalizeForwardingAddress(item.email),
      verifiedAt: item.modified || item.created || null,
    }))
    .filter((item) => item.address)
  return { available: true, destinations }
}

async function createForwardingDestination(request, env, user) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_EMAIL_ROUTING_TOKEN) {
    throw new ClientError('Forwarding is not configured', 503)
  }
  const body = await readJson(request)
  const address = normalizeForwardingAddress(body.email)
  if (!address) throw new ClientError('Enter a valid forwarding email address')

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/routing/addresses`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_EMAIL_ROUTING_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: address }),
    },
  )
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.success || !result.result?.id) {
    const detail = result?.errors?.[0]?.message
    console.error('Forwarding destination creation failed', response.status, detail || 'Unknown error')
    throw new ClientError(
      response.status === 409 ? 'This forwarding destination already exists' : 'Unable to add forwarding destination',
      response.status === 409 ? 409 : 503,
    )
  }

  await writeAudit(request, env, {
    userId: user.id,
    eventType: 'email.forwarding_destination.created',
    description: 'Email forwarding destination added',
    metadata: { address },
  })
  return json({
    data: {
      id: String(result.result.id),
      address,
      verified: Boolean(result.result.verified),
    },
    verificationRequired: !result.result.verified,
  }, 201, request, env)
}

async function validateForwardingSettings(env, deliveryMode, destinationId, forwardTo) {
  if (deliveryMode === 'vault') {
    return { deliveryMode: 'vault', destinationId: null, forwardTo: null }
  }
  if (deliveryMode !== 'forward') throw new ClientError('Delivery mode must be vault or forward')

  const normalizedAddress = normalizeForwardingAddress(forwardTo)
  if (!destinationId || !normalizedAddress) throw new ClientError('Select a verified forwarding destination')
  const { available, destinations } = await listVerifiedForwardingDestinations(env)
  if (!available) throw new ClientError('Forwarding is not configured', 503)
  const destination = destinations.find((item) => item.id === destinationId && item.address === normalizedAddress)
  if (!destination) throw new ClientError('Forwarding destination is not verified')
  return { deliveryMode: 'forward', destinationId: destination.id, forwardTo: destination.address }
}

function generateRandomLocalPart() {
  const values = crypto.getRandomValues(new Uint8Array(3))
  const word1 = emailWordList[values[0] % emailWordList.length]
  const word2 = emailWordList[values[1] % emailWordList.length]
  const suffix = values[2] % 100
  return `${word1}-${word2}-${suffix}`
}

function normalizeEmailLocalPart(value) {
  const local = value.trim().toLowerCase()
  if (!local) throw new ClientError('Local part is required')
  if (local.length > maximumLocalPartLength) throw new ClientError('Local part is too long')
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(local) && !/^[a-z0-9]$/.test(local)) {
    throw new ClientError('Local part must contain only lowercase letters, digits, periods, underscores, or hyphens, and must not start or end with punctuation')
  }
  if (/\.{2,}/.test(local)) throw new ClientError('Local part must not contain consecutive dots')
  return local
}

function presentEmailAddress(address) {
  return {
    id: address.id,
    localPart: address.local_part,
    fullAddress: address.full_address,
    domainId: address.domain_id,
    hostname: address.hostname || null,
    generationMode: address.generation_mode,
    status: address.status,
    deliveryMode: address.delivery_mode || 'vault',
    forwardTo: address.forward_to || null,
    forwardDestinationId: address.forward_destination_id || null,
    lastMessageAt: address.last_message_at,
    messageCount: address.message_count ?? 0,
    unreadCount: address.unread_count ?? 0,
    storageBytes: address.storage_bytes ?? 0,
    createdAt: address.created_at,
    updatedAt: address.updated_at,
  }
}

function presentEmailMessage(message) {
  let headers = {}
  try {
    headers = JSON.parse(message.headers_json || '{}')
  } catch {
    // retain safe fallback
  }
  return {
    id: message.id,
    addressId: message.generated_email_id,
    sender: message.sender,
    recipient: message.recipient,
    subject: message.subject,
    textBody: message.text_body,
    headers,
    receivedAt: message.received_at,
    readAt: message.read_at,
    rawSizeBytes: message.raw_size_bytes ?? 0,
    createdAt: message.created_at,
  }
}

async function listEmailDomains(request, env) {
  const configured = parseConfiguredEmailDomains(env)
  if (!configured.length) return json({ data: [], count: 0 }, 200, request, env)

  const placeholders = configured.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id, hostname, enabled, health_status, last_checked_at, created_at, updated_at
    FROM email_domains
    WHERE hostname IN (${placeholders}) AND enabled = 1 AND health_status = 'available'
    ORDER BY hostname ASC
  `).bind(...configured).all()

  const data = results.map((domain) => ({
    id: domain.id,
    hostname: domain.hostname,
    enabled: Boolean(domain.enabled),
    healthStatus: domain.health_status,
    lastCheckedAt: domain.last_checked_at,
    createdAt: domain.created_at,
    updatedAt: domain.updated_at,
  }))
  return json({ data, count: data.length }, 200, request, env)
}

async function listEmailAddresses(request, env, user) {
  try {
    await reconcileEmailRoutingRules(env, user.id)
  } catch (error) {
    console.error('Email Routing reconciliation failed while listing addresses', error)
  }
  const { results } = await env.DB.prepare(`
    SELECT
      a.id, a.local_part, a.full_address, a.domain_id, a.generation_mode,
      a.status, a.delivery_mode, a.forward_to, a.forward_destination_id,
      a.last_message_at, a.created_at, a.updated_at,
      d.hostname,
      COALESCE(mc.total, 0) AS message_count,
      COALESCE(uc.unread, 0) AS unread_count,
      COALESCE(sc.storage_bytes, 0) AS storage_bytes
    FROM generated_email_addresses a
    LEFT JOIN email_domains d ON d.id = a.domain_id
    LEFT JOIN (
      SELECT generated_email_id, COUNT(*) AS total
      FROM received_emails GROUP BY generated_email_id
    ) mc ON mc.generated_email_id = a.id
    LEFT JOIN (
      SELECT generated_email_id, COUNT(*) AS unread
      FROM received_emails WHERE read_at IS NULL
      GROUP BY generated_email_id
    ) uc ON uc.generated_email_id = a.id
    LEFT JOIN (
      SELECT generated_email_id, SUM(raw_size_bytes) AS storage_bytes
      FROM received_emails GROUP BY generated_email_id
    ) sc ON sc.generated_email_id = a.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT 200
  `).bind(user.id).all()

  const data = results.map(presentEmailAddress)
  return json({ data, count: data.length }, 200, request, env)
}

async function createEmailAddresses(request, env, user) {
  const body = await readJson(request)
  const mode = body.mode === 'custom' ? 'custom' : 'random_words'
  const domainId = cleanText(body.domainId, 'Domain ID', 100)
  if (!domainId) throw new ClientError('Domain ID is required')
  const delivery = await validateForwardingSettings(
    env,
    body.deliveryMode || 'vault',
    body.forwardDestinationId,
    body.forwardTo,
  )

  let count = typeof body.count === 'number' ? Math.floor(body.count) : 1
  if (count < 1) count = 1
  if (count > maximumAddressBatchSize) throw new ClientError(`Maximum ${maximumAddressBatchSize} addresses per request`)

  const configured = parseConfiguredEmailDomains(env)
  const domain = await env.DB.prepare(`
    SELECT id, hostname FROM email_domains
    WHERE id = ? AND enabled = 1 AND health_status = 'available'
  `).bind(domainId).first()
  if (!domain || !configured.includes(domain.hostname)) {
    throw new ClientError('Domain is unavailable', 404)
  }

  const existingCount = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM generated_email_addresses WHERE user_id = ?',
  ).bind(user.id).first()
  if ((existingCount?.total || 0) + count > maximumAddressesPerUser) {
    throw new ClientError(`Address limit of ${maximumAddressesPerUser} reached`, 409)
  }

  const created = []
  for (let index = 0; index < count; index += 1) {
    let localPart
    let fullAddress
    let inserted = false

    if (mode === 'custom') {
      const prefix = typeof body.prefix === 'string' ? body.prefix : ''
      localPart = normalizeEmailLocalPart(prefix)
      fullAddress = `${localPart}@${domain.hostname}`

      const existing = await env.DB.prepare(
        'SELECT id FROM generated_email_addresses WHERE full_address = ? COLLATE NOCASE',
      ).bind(fullAddress).first()
      if (existing) throw new ClientError(`Address ${fullAddress} already exists`, 409)

      const id = crypto.randomUUID()
      const routing = await createEmailRoutingRule(env, domain.hostname, fullAddress)
      try {
        const insert = env.DB.prepare(`
          INSERT INTO generated_email_addresses
            (id, user_id, domain_id, local_part, full_address, generation_mode, status,
              delivery_mode, forward_to, forward_destination_id, routing_rule_id, routing_zone_id)
          VALUES (?, ?, ?, ?, ?, 'custom', 'active', ?, ?, ?, ?, ?)
        `).bind(
          id, user.id, domain.id, localPart, fullAddress,
          delivery.deliveryMode, delivery.forwardTo, delivery.destinationId,
          routing.ruleId, routing.zoneId,
        )
        const audit = await auditStatement(request, env, {
          userId: user.id,
          eventType: 'email.address.created',
          description: 'Email address created',
          metadata: { addressId: id, fullAddress, mode: 'custom', routingRuleId: routing.ruleId },
        })
        await env.DB.batch([insert, audit])
      } catch (error) {
        try {
          await deleteEmailRoutingRule(env, routing.zoneId, routing.ruleId)
        } catch (cleanupError) {
          console.error('Failed to remove orphaned Email Routing rule', cleanupError)
        }
        if (String(error).includes('UNIQUE')) {
          throw new ClientError(`Address ${fullAddress} already exists`, 409)
        }
        throw error
      }

      const row = await env.DB.prepare(`
        SELECT a.*, d.hostname, 0 AS message_count, 0 AS unread_count
        FROM generated_email_addresses a
        LEFT JOIN email_domains d ON d.id = a.domain_id
        WHERE a.id = ?
      `).bind(id).first()
      if (row) created.push(presentEmailAddress(row))
    } else {
      // random_words with collision retry
      for (let attempt = 0; attempt < maximumCollisionRetries; attempt += 1) {
        localPart = generateRandomLocalPart()
        fullAddress = `${localPart}@${domain.hostname}`
        const existing = await env.DB.prepare(
          'SELECT id FROM generated_email_addresses WHERE full_address = ? COLLATE NOCASE',
        ).bind(fullAddress).first()
        if (existing) continue

        const id = crypto.randomUUID()
        let routing
        try {
          routing = await createEmailRoutingRule(env, domain.hostname, fullAddress)
          const insert = env.DB.prepare(`
            INSERT INTO generated_email_addresses
              (id, user_id, domain_id, local_part, full_address, generation_mode, status,
                delivery_mode, forward_to, forward_destination_id, routing_rule_id, routing_zone_id)
            VALUES (?, ?, ?, ?, ?, 'random_words', 'active', ?, ?, ?, ?, ?)
          `).bind(
            id, user.id, domain.id, localPart, fullAddress,
            delivery.deliveryMode, delivery.forwardTo, delivery.destinationId,
            routing.ruleId, routing.zoneId,
          )
          const audit = await auditStatement(request, env, {
            userId: user.id,
            eventType: 'email.address.created',
            description: 'Email address created',
            metadata: { addressId: id, fullAddress, mode: 'random_words', routingRuleId: routing.ruleId },
          })
          await env.DB.batch([insert, audit])
          inserted = true
        } catch (error) {
          if (routing) {
            try {
              await deleteEmailRoutingRule(env, routing.zoneId, routing.ruleId)
            } catch (cleanupError) {
              console.error('Failed to remove orphaned Email Routing rule', cleanupError)
            }
          }
          if (String(error).includes('UNIQUE')) continue
          throw error
        }
        if (inserted) {
          const row = await env.DB.prepare(`
            SELECT a.*, d.hostname, 0 AS message_count, 0 AS unread_count
            FROM generated_email_addresses a
            LEFT JOIN email_domains d ON d.id = a.domain_id
            WHERE a.id = ?
          `).bind(id).first()
          if (row) created.push(presentEmailAddress(row))
          break
        }
      }
      if (!inserted) throw new ClientError('Unable to generate a unique address, try again', 409)
    }
  }

  return json({
    data: created,
    count: created.length,
    provisioning: { status: 'ready', provider: 'cloudflare-email-routing' },
  }, 201, request, env)
}

async function deleteEmailAddress(request, env, user, addressId) {
  const address = await env.DB.prepare(`
    SELECT id, full_address, routing_rule_id, routing_zone_id
    FROM generated_email_addresses WHERE id = ? AND user_id = ?
  `).bind(addressId, user.id).first()
  if (!address) return json({ error: 'Address not found' }, 404, request, env)

  await deleteEmailRoutingRule(env, address.routing_zone_id, address.routing_rule_id)

  const remove = env.DB.prepare(
    'DELETE FROM generated_email_addresses WHERE id = ? AND user_id = ?',
  ).bind(addressId, user.id)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'email.address.deleted',
    description: 'Email address deleted',
    metadata: { addressId, fullAddress: address.full_address },
  })
  await env.DB.batch([remove, audit])

  return json({ data: { id: addressId } }, 200, request, env)
}

async function deleteEmailAddresses(request, env, user) {
  const body = await readJson(request)
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])]
  if (!ids.length || ids.length > 200 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new ClientError('Select between 1 and 200 valid email addresses')
  }

  const placeholders = ids.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id, routing_rule_id, routing_zone_id FROM generated_email_addresses
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(user.id, ...ids).all()
  const ownedIds = results.map((address) => address.id)
  if (ownedIds.length !== ids.length) throw new ClientError('One or more email addresses were not found', 404)

  for (const address of results) {
    await deleteEmailRoutingRule(env, address.routing_zone_id, address.routing_rule_id)
  }

  const ownedPlaceholders = ownedIds.map(() => '?').join(', ')
  const remove = env.DB.prepare(`
    DELETE FROM generated_email_addresses
    WHERE user_id = ? AND id IN (${ownedPlaceholders})
  `).bind(user.id, ...ownedIds)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'email.addresses.deleted',
    description: `${ownedIds.length} email addresses deleted`,
    metadata: { addressIds: ownedIds, count: ownedIds.length },
  })
  await env.DB.batch([remove, audit])

  return json({ data: { ids: ownedIds }, count: ownedIds.length }, 200, request, env)
}

async function getEmailAddress(request, env, user, addressId) {
  const row = await env.DB.prepare(`
    SELECT a.*, d.hostname,
      COALESCE((SELECT COUNT(*) FROM received_emails WHERE generated_email_id = a.id), 0) AS message_count,
      COALESCE((SELECT COUNT(*) FROM received_emails WHERE generated_email_id = a.id AND read_at IS NULL), 0) AS unread_count,
      COALESCE((SELECT SUM(raw_size_bytes) FROM received_emails WHERE generated_email_id = a.id), 0) AS storage_bytes
    FROM generated_email_addresses a
    LEFT JOIN email_domains d ON d.id = a.domain_id
    WHERE a.id = ? AND a.user_id = ?
  `).bind(addressId, user.id).first()
  if (!row) return json({ error: 'Address not found' }, 404, request, env)
  return json({ data: presentEmailAddress(row) }, 200, request, env)
}

async function updateEmailAddress(request, env, user, addressId) {
  const address = await env.DB.prepare(`
    SELECT id, status, delivery_mode, forward_to, forward_destination_id
    FROM generated_email_addresses WHERE id = ? AND user_id = ?
  `).bind(addressId, user.id).first()
  if (!address) return json({ error: 'Address not found' }, 404, request, env)

  const body = await readJson(request)
  const newStatus = body.status === undefined ? address.status : cleanText(body.status, 'Status', 20)
  if (!['active', 'disabled'].includes(newStatus)) throw new ClientError('Status must be active or disabled')
  const delivery = await validateForwardingSettings(
    env,
    body.deliveryMode || address.delivery_mode || 'vault',
    body.forwardDestinationId ?? address.forward_destination_id,
    body.forwardTo ?? address.forward_to,
  )

  const update = env.DB.prepare(`
    UPDATE generated_email_addresses
    SET status = ?, delivery_mode = ?, forward_to = ?, forward_destination_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(
    newStatus, delivery.deliveryMode, delivery.forwardTo, delivery.destinationId,
    addressId, user.id,
  )
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'email.address.settings_changed',
    description: 'Email address delivery settings changed',
    metadata: {
      addressId,
      previousStatus: address.status,
      newStatus,
      previousDeliveryMode: address.delivery_mode,
      deliveryMode: delivery.deliveryMode,
      forwardTo: delivery.forwardTo,
    },
  })
  await env.DB.batch([update, audit])
  return getEmailAddress(request, env, user, addressId)
}

async function listEmailMessages(request, env, user, url) {
  const addressId = url.searchParams.get('address')?.trim()
  const clauses = ['e.user_id = ?']
  const values = [user.id]

  if (addressId) {
    const address = await env.DB.prepare(
      'SELECT id FROM generated_email_addresses WHERE id = ? AND user_id = ?',
    ).bind(addressId, user.id).first()
    if (!address) return json({ error: 'Address not found' }, 404, request, env)
    clauses.push('e.generated_email_id = ?')
    values.push(addressId)
  }

  const where = clauses.join(' AND ')
  const { results } = await env.DB.prepare(`
    SELECT e.id, e.generated_email_id, e.sender, e.recipient, e.subject,
      '' AS text_body, e.headers_json, e.received_at, e.read_at, e.raw_size_bytes,
      e.created_at
    FROM received_emails e
    WHERE ${where}
    ORDER BY e.received_at DESC, e.id DESC
    LIMIT 200
  `).bind(...values).all()

  const data = results.map((message) => {
    const presented = presentEmailMessage(message)
    delete presented.textBody
    return presented
  })
  return json({ data, count: data.length }, 200, request, env)
}

async function getEmailMessage(request, env, user, messageId) {
  const message = await env.DB.prepare(`
    SELECT id, generated_email_id, sender, recipient, subject,
      text_body, headers_json, received_at, read_at, raw_size_bytes, created_at
    FROM received_emails
    WHERE id = ? AND user_id = ?
  `).bind(messageId, user.id).first()
  if (!message) return json({ error: 'Message not found' }, 404, request, env)

  if (message.text_body && message.text_body.length > maximumEmailBodyDisplay) {
    message.text_body = message.text_body.slice(0, maximumEmailBodyDisplay)
  }
  return json({ data: presentEmailMessage(message) }, 200, request, env)
}

async function refreshAddressLastMessage(env, addressId, userId) {
  await env.DB.prepare(`
    UPDATE generated_email_addresses
    SET last_message_at = (
      SELECT MAX(received_at) FROM received_emails
      WHERE generated_email_id = ? AND user_id = ?
    ), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(addressId, userId, addressId, userId).run()
}

async function deleteOwnedEmailMessages(request, env, user, ids) {
  const placeholders = ids.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id, generated_email_id, raw_size_bytes
    FROM received_emails
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(user.id, ...ids).all()
  if (results.length !== ids.length) throw new ClientError('One or more email messages were not found', 404)

  const bytesReclaimed = results.reduce((total, message) => total + (message.raw_size_bytes || 0), 0)
  const addressIds = [...new Set(results.map((message) => message.generated_email_id))]
  const remove = env.DB.prepare(`
    DELETE FROM received_emails
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(user.id, ...ids)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: ids.length === 1 ? 'email.message.deleted' : 'email.messages.deleted',
    description: `${ids.length} email message${ids.length === 1 ? '' : 's'} deleted`,
    metadata: { messageIds: ids, addressIds, count: ids.length, bytesReclaimed },
  })
  await env.DB.batch([remove, audit])
  for (const addressId of addressIds) await refreshAddressLastMessage(env, addressId, user.id)

  return json({
    data: { ids, addressIds, bytesReclaimed },
    count: ids.length,
  }, 200, request, env)
}

async function deleteEmailMessage(request, env, user, messageId) {
  return deleteOwnedEmailMessages(request, env, user, [messageId])
}

async function deleteEmailMessages(request, env, user) {
  const body = await readJson(request)
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])]
  if (!ids.length || ids.length > 200 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new ClientError('Select between 1 and 200 valid email messages')
  }
  return deleteOwnedEmailMessages(request, env, user, ids)
}

async function markEmailMessageRead(request, env, user, messageId) {
  const message = await env.DB.prepare(`
    SELECT id, read_at FROM received_emails WHERE id = ? AND user_id = ?
  `).bind(messageId, user.id).first()
  if (!message) return json({ error: 'Message not found' }, 404, request, env)

  if (!message.read_at) {
    await env.DB.prepare(
      'UPDATE received_emails SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    ).bind(messageId, user.id).run()
  }

  const updated = await env.DB.prepare(`
    SELECT id, generated_email_id, sender, recipient, subject,
      text_body, headers_json, received_at, read_at, raw_size_bytes, created_at
    FROM received_emails
    WHERE id = ? AND user_id = ?
  `).bind(messageId, user.id).first()
  if (updated.text_body && updated.text_body.length > maximumEmailBodyDisplay) {
    updated.text_body = updated.text_body.slice(0, maximumEmailBodyDisplay)
  }
  return json({ data: presentEmailMessage(updated) }, 200, request, env)
}

export default {
  async scheduled(_event, env) {
    await Promise.all([
      syncAccountStatuses(env),
      reconcileEmailRoutingRules(env),
    ])
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('origin')
    const localWorker = isLocalHostname(url.hostname)

    if (origin && !localWorker && !isAllowedBrowserOrigin(origin, env)) {
      return json({ error: 'This site is not allowed to access the login service' }, 403, request, env)
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('API is healthy', {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
        },
      })
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }

    const mutatingRequest = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    const cookieAuthenticated = !request.headers.has('authorization')
    const trustedBrowserOrigin = isAllowedBrowserOrigin(origin, env) || localWorker
    const publicAuthenticationRequest = url.pathname === '/v1/auth/login'
      || url.pathname === '/v1/auth/2fa'
      || url.pathname === '/v1/auth/totp-login'
    if (mutatingRequest && !publicAuthenticationRequest && cookieAuthenticated && !trustedBrowserOrigin) {
      return json({ error: 'Forbidden' }, 403, request, env)
    }

    if (url.pathname === '/v1/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first()
        return json({ status: 'ok', service: 'vault-api' }, 200, request, env)
      } catch {
        return json({ status: 'unavailable' }, 503, request, env)
      }
    }

    if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
      try {
        return await login(request, env)
      } catch (error) {
        if (error instanceof ClientError) {
          await writeAudit(request, env, {
            eventType: 'auth.login.failed',
            description: 'Login request rejected',
            severity: 'warning',
            metadata: { reason: 'invalid_request' },
          })
          return json({ error: error.message }, error.status, request, env)
        }
        console.error('Login failed', error)
        return json({ error: 'Unable to sign in' }, 500, request, env)
      }
    }

    if (!url.pathname.startsWith('/v1/')) return json({ error: 'Not found' }, 404, request, env)
    if (!env.API_TOKEN || !env.CREDENTIALS_ENCRYPTION_KEY) return json({ error: 'Service is not configured' }, 503, request, env)
    if (url.pathname === '/v1/auth/totp-login' && request.method === 'POST') {
      try {
        return await totpLogin(request, env)
      } catch (error) {
        if (error instanceof ClientError) {
          await writeAudit(request, env, {
            eventType: 'auth.totp_login.failed',
            description: 'TOTP login request rejected',
            severity: 'warning',
            metadata: { reason: 'invalid_request' },
          })
          return json({ error: error.message }, error.status, request, env)
        }
        return json({ error: 'Unable to sign in' }, 500, request, env)
      }
    }
    if (url.pathname === '/v1/auth/2fa' && request.method === 'POST') {
      try {
        return await completeTwoFactorLogin(request, env)
      } catch (error) {
        if (error instanceof ClientError) {
          if (error.status === 400 && error.message !== 'Challenge token is invalid') {
            await writeAudit(request, env, {
              eventType: 'auth.two_factor.failed',
              description: 'Two-factor authentication request rejected',
              severity: 'warning',
              metadata: { reason: 'invalid_request' },
            })
          }
          return json({ error: error.message }, error.status, request, env)
        }
        return json({ error: 'Unable to complete two-factor authentication' }, 500, request, env)
      }
    }
    const tokenAuthorized = isAuthorized(request, env)
    const authenticatedUser = tokenAuthorized ? null : await currentUser(request, env)
    if (!tokenAuthorized && !authenticatedUser) return json({ error: 'Unauthorized' }, 401, request, env)

    try {
      if (url.pathname === '/v1/auth/logout' && request.method === 'POST') return await logout(request, env, authenticatedUser)
      if (url.pathname === '/v1/auth/me' && request.method === 'GET') {
        const user = authenticatedUser
        if (!user) return json({ error: 'Unauthorized' }, 401, request, env)
        return json({
          data: {
            id: user.id,
            email: user.email,
            role: user.role,
            displayName: user.display_name,
            mustChangePassword: Boolean(user.must_change_password),
            twoFactorEnabled: Boolean(user.two_factor_enabled),
          },
        }, 200, request, env)
      }
      if (url.pathname === '/v1/ai/config') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await getAiConfig(request, env, authenticatedUser)
        if (request.method === 'PUT') return await updateAiConfig(request, env, authenticatedUser)
        if (request.method === 'DELETE') return await deleteAiConfig(request, env, authenticatedUser)
      }
      const aiConfigMatch = url.pathname.match(/^\/v1\/ai\/config\/([0-9a-f-]+)$/i)
      if (aiConfigMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'PUT') return await updateAiConfig(request, env, authenticatedUser, aiConfigMatch[1])
        if (request.method === 'DELETE') return await deleteAiConfig(request, env, authenticatedUser, aiConfigMatch[1])
      }
      const aiActivateMatch = url.pathname.match(/^\/v1\/ai\/config\/([0-9a-f-]+)\/activate$/i)
      if (aiActivateMatch && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await activateAiConfig(request, env, authenticatedUser, aiActivateMatch[1])
      }
      if (url.pathname === '/v1/ai/client-config' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await getAiClientConfig(request, env, authenticatedUser)
      }
      const aiClientConfigMatch = url.pathname.match(/^\/v1\/ai\/client-config\/([0-9a-f-]+)$/i)
      if (aiClientConfigMatch && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await getAiClientConfig(request, env, authenticatedUser, aiClientConfigMatch[1])
      }
      if (url.pathname === '/v1/ai/verify' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await verifyAiConnection(request, env)
      }
      if (url.pathname === '/v1/chat/conversations') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listConversations(request, env, authenticatedUser)
        if (request.method === 'POST') return await createConversation(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/chat/memory/search' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await searchChatMemory(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/dashboard/stats' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await getDashboardStats(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await createChatCompletion(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/chat/exchanges' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await saveChatExchange(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/notes') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listNotes(request, env, authenticatedUser)
        if (request.method === 'POST') return await createNote(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/vault') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listVaultSecrets(request, env, authenticatedUser)
        if (request.method === 'POST') return await createVaultSecret(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/plugins') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listPlugins(request, env, authenticatedUser)
        if (request.method === 'POST') return await createPlugin(request, env, authenticatedUser)
      }
      const pluginMatch = url.pathname.match(/^\/v1\/plugins\/([0-9a-f-]+)$/i)
      if (pluginMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await getPlugin(request, env, authenticatedUser, pluginMatch[1])
        if (request.method === 'PATCH') return await updatePlugin(request, env, authenticatedUser, pluginMatch[1])
        if (request.method === 'DELETE') return await deletePlugin(request, env, authenticatedUser, pluginMatch[1])
      }
      const vaultMatch = url.pathname.match(/^\/v1\/vault\/([0-9a-f-]+)$/i)
      if (vaultMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await getVaultSecret(request, env, authenticatedUser, vaultMatch[1])
        if (request.method === 'PATCH') return await updateVaultSecret(request, env, authenticatedUser, vaultMatch[1])
        if (request.method === 'DELETE') return await deleteVaultSecret(request, env, authenticatedUser, vaultMatch[1])
      }
      const noteMatch = url.pathname.match(/^\/v1\/notes\/([0-9a-f-]+)$/i)
      if (noteMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'PATCH') return await updateNote(request, env, authenticatedUser, noteMatch[1])
        if (request.method === 'DELETE') return await deleteNote(request, env, authenticatedUser, noteMatch[1])
      }
      if (url.pathname === '/v1/accounts') {
        if (request.method === 'GET') return await listAccounts(request, env, url)
        if (request.method === 'POST') return await createAccount(request, env, authenticatedUser)
  }

  if (url.pathname === '/v1/authenticator') {
    if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
    if (request.method === 'GET') return await listAuthenticatorEntries(request, env, authenticatedUser)
    if (request.method === 'POST') return await createAuthenticatorEntry(request, env, authenticatedUser)
  }

  const authenticatorMatch = url.pathname.match(/^\/v1\/authenticator\/([^/]+)$/)
  if (authenticatorMatch && request.method === 'DELETE') {
    if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
    return await deleteAuthenticatorEntry(request, env, authenticatedUser, decodeURIComponent(authenticatorMatch[1]))
  }
      if (url.pathname === '/v1/activity' && request.method === 'GET') return await listActivity(request, env)
      if (url.pathname === '/v1/activity/email-stats' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await getEmailActivityStats(request, env, authenticatedUser, url)
      }
      if (url.pathname === '/v1/backup/export' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await exportBackup(request, env, url, authenticatedUser)
      }
      if (url.pathname === '/v1/settings/profile' && request.method === 'PATCH') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await updateProfile(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/settings/password' && request.method === 'PATCH') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await updatePassword(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/settings/2fa') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await getTwoFactorSettings(request, env, authenticatedUser)
        if (request.method === 'DELETE') return await disableTwoFactor(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/settings/2fa/setup' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await setupTwoFactor(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/settings/2fa/confirm' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await confirmTwoFactor(request, env, authenticatedUser)
      }

      if (url.pathname === '/v1/email/domains' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await listEmailDomains(request, env)
      }
      if (url.pathname === '/v1/email/addresses') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listEmailAddresses(request, env, authenticatedUser)
        if (request.method === 'POST') return await createEmailAddresses(request, env, authenticatedUser)
        if (request.method === 'DELETE') return await deleteEmailAddresses(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/email/forwarding-destinations' && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        const result = await listVerifiedForwardingDestinations(env)
        return json({ data: result.destinations, available: result.available }, 200, request, env)
      }
      if (url.pathname === '/v1/email/forwarding-destinations' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await createForwardingDestination(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/email/messages') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listEmailMessages(request, env, authenticatedUser, url)
        if (request.method === 'DELETE') return await deleteEmailMessages(request, env, authenticatedUser)
      }

      const emailAddressMatch = url.pathname.match(/^\/v1\/email\/addresses\/([0-9a-f-]+)$/i)
      if (emailAddressMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') {
          return await getEmailAddress(request, env, authenticatedUser, emailAddressMatch[1])
        }
        if (request.method === 'PATCH') {
          return await updateEmailAddress(request, env, authenticatedUser, emailAddressMatch[1])
        }
        if (request.method === 'DELETE') {
          return await deleteEmailAddress(request, env, authenticatedUser, emailAddressMatch[1])
        }
      }

      const emailMessageMatch = url.pathname.match(/^\/v1\/email\/messages\/([0-9a-f-]+)$/i)
      if (emailMessageMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') {
          return await getEmailMessage(request, env, authenticatedUser, emailMessageMatch[1])
        }
        if (request.method === 'DELETE') {
          return await deleteEmailMessage(request, env, authenticatedUser, emailMessageMatch[1])
        }
      }

      const emailMessageReadMatch = url.pathname.match(/^\/v1\/email\/messages\/([0-9a-f-]+)\/read$/i)
      if (emailMessageReadMatch && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await markEmailMessageRead(request, env, authenticatedUser, emailMessageReadMatch[1])
      }

      const match = url.pathname.match(/^\/v1\/accounts\/([0-9a-f-]+)$/i)
      const detailsMatch = url.pathname.match(/^\/v1\/accounts\/([0-9a-f-]+)\/details$/i)
      if (detailsMatch && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await getAccountDetails(request, env, detailsMatch[1], authenticatedUser)
      }
      if (match) {
        if (request.method === 'GET' && url.searchParams.get('details') === '1') {
          if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
          return await getAccountDetails(request, env, match[1], authenticatedUser)
        }
        if (request.method === 'GET') return await getAccount(request, env, match[1])
        if (request.method === 'PATCH') return await updateAccount(request, env, match[1], authenticatedUser)
        if (request.method === 'DELETE') return await deleteAccount(request, env, match[1], authenticatedUser)
      }

      const conversationMatch = url.pathname.match(/^\/v1\/chat\/conversations\/([0-9a-f-]+)$/i)
      if (conversationMatch) {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'DELETE') {
          return await deleteConversation(request, env, authenticatedUser, conversationMatch[1])
        }
      }

      const messagesMatch = url.pathname.match(/^\/v1\/chat\/conversations\/([0-9a-f-]+)\/messages$/i)
      if (messagesMatch && request.method === 'GET') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await listConversationMessages(request, env, authenticatedUser, messagesMatch[1])
      }

      return json({ error: 'Not found' }, 404, request, env)
    } catch (error) {
      if (error instanceof ClientError) return json({ error: error.message }, error.status, request, env)
      return json({ error: 'Internal server error' }, 500, request, env)
    }
  },
}
