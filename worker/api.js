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
const maximumChatBodyBytes = 96 * 1024
const maximumUpstreamResponseBytes = 1024 * 1024
const upstreamTimeoutMilliseconds = 30 * 1000
const supportedApiModes = new Set(['openai-compatible', 'openai-responses', 'anthropic-messages'])
const twoFactorChallengeLifetimeMilliseconds = 5 * 60 * 1000
const maximumTwoFactorAttempts = 5

class ClientError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function isDevelopmentOrigin(origin) {
  if (!origin) return false

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
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
  return allowedOrigins.includes(origin) || isDevelopmentOrigin(origin)
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin')
  if (!origin) return {}
  const localWorker = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)
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

async function auditStatement(request, env, {
  userId = null,
  eventType,
  description,
  severity = 'info',
  metadata = {},
}) {
  const clientIdentifierHash = await hashClientIdentifier(request, env)
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
    JSON.stringify(metadata),
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
  const bytes = Uint8Array.from(atob(encodedKey), (character) => character.charCodeAt(0))
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
  if (octets.some((octet) => octet < 0 || octet > 255)) return true
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
        AND datetime(expires_at) <= datetime('now', '+30 days')
    `),
    env.DB.prepare(`
      UPDATE accounts
      SET status = 'Active', updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('Expired', 'Expiring Soon')
        AND (
          expires_at IS NULL
          OR datetime(expires_at) > datetime('now', '+30 days')
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
  return {
    providerId: connection.provider_id,
    providerName: connection.provider_name,
    apiMode: connection.api_mode,
    baseUrl: connection.base_url,
    model: connection.model,
    status: connection.status,
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
    createdAt: message.created_at,
  }
}

async function getAiConfig(request, env, user) {
  const connection = await env.DB.prepare(`
    SELECT provider_id, provider_name, api_mode, base_url, model, status,
      last_verified_at, created_at, updated_at
    FROM ai_connections WHERE user_id = ?
  `).bind(user.id).first()
  return json({ data: presentAiConnection(connection) }, 200, request, env)
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

async function updateAiConfig(request, env, user) {
  const body = await readJson(request)
  const baseUrl = normalizeProviderBaseUrl(body.baseUrl)
  const providerId = normalizeProviderId(body.providerId)
  const providerName = cleanText(body.providerName, 'Provider name', 100, providerId) || providerId
  const apiMode = normalizeApiMode(body.apiMode)
  const apiKey = cleanText(body.apiKey, 'API key', 8192)
  const model = cleanText(body.model, 'Model', 200)
  if (!model) throw new ClientError('Model is required')

  let discovery
  try {
    discovery = await discoverProviderModels(apiMode, baseUrl, apiKey)
    if (discovery.modelListAvailable && !discovery.models.includes(model)) {
      throw new ClientError('Selected model was not returned by the AI provider')
    }
  } finally {
    body.apiKey = null
  }

  const encrypted = await encryptPassword(apiKey, env.CREDENTIALS_ENCRYPTION_KEY)
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'ai.config.updated',
    description: 'AI provider configuration updated',
  })
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO ai_connections (
        user_id, provider_id, provider_name, api_mode, base_url, api_key_ciphertext, api_key_iv,
        model, status, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        provider_name = excluded.provider_name,
        api_mode = excluded.api_mode,
        base_url = excluded.base_url,
        api_key_ciphertext = excluded.api_key_ciphertext,
        api_key_iv = excluded.api_key_iv,
        model = excluded.model,
        status = 'verified',
        last_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(user.id, providerId, providerName, apiMode, baseUrl, encrypted.ciphertext, encrypted.iv, model),
    audit,
  ])
  return getAiConfig(request, env, user)
}

async function deleteAiConfig(request, env, user) {
  const audit = await auditStatement(request, env, {
    userId: user.id,
    eventType: 'ai.config.deleted',
    description: 'AI provider configuration deleted',
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_connections WHERE user_id = ?').bind(user.id),
    audit,
  ])
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
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

async function listConversationMessages(request, env, user, id) {
  const conversation = await env.DB.prepare(`
    SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first()
  if (!conversation) return json({ error: 'Conversation not found' }, 404, request, env)

  const { results } = await env.DB.prepare(`
    SELECT id, conversation_id, role, content, created_at
    FROM chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(id).all()
  return json({ data: results.map(presentMessage), count: results.length }, 200, request, env)
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
    SELECT api_mode, base_url, api_key_ciphertext, api_key_iv, model
    FROM ai_connections WHERE user_id = ? AND status = 'verified'
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
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, 'assistant', ?, strftime('%Y-%m-%d %H:%M:%f', 'now', '+0.001 seconds'))
    `).bind(assistantMessageId, conversationId, assistantContent),
  )
  await env.DB.batch(statements)

  conversation = await env.DB.prepare(`
    SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = ?
  `).bind(conversationId).first()
  const assistant = await env.DB.prepare(`
    SELECT id, conversation_id, role, content, created_at FROM chat_messages WHERE id = ?
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

async function exportBackup(request, env, url) {
  await syncAccountStatuses(env)
  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  if (format !== 'json' && format !== 'csv') {
    return json({ error: 'Format must be json or csv' }, 400, request, env)
  }
  const { results } = await env.DB.prepare(
    `SELECT ${publicAccountFields} FROM accounts ORDER BY created_at DESC`,
  ).all()
  const filename = `vault-backup.${format}`
  const backupAccounts = results.map(presentBackupAccount)
  if (format === 'json') {
    return json({ version: 1, exportedAt: new Date().toISOString(), accounts: backupAccounts }, 200, request, env, {
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

export default {
  async scheduled(_event, env) {
    await syncAccountStatuses(env)
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('origin')
    const localWorker = ['localhost', '127.0.0.1'].includes(url.hostname)

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
      if (url.pathname === '/v1/ai/verify' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await verifyAiConnection(request, env)
      }
      if (url.pathname === '/v1/chat/conversations') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        if (request.method === 'GET') return await listConversations(request, env, authenticatedUser)
        if (request.method === 'POST') return await createConversation(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
        if (!authenticatedUser) return json({ error: 'User session required' }, 403, request, env)
        return await createChatCompletion(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/accounts') {
        if (request.method === 'GET') return await listAccounts(request, env, url)
        if (request.method === 'POST') return await createAccount(request, env, authenticatedUser)
      }
      if (url.pathname === '/v1/activity' && request.method === 'GET') return await listActivity(request, env)
      if (url.pathname === '/v1/backup/export' && request.method === 'GET') return await exportBackup(request, env, url)
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
