import PostalMime from 'postal-mime'

const maximumRawMessageBytes = 2 * 1024 * 1024
const maximumTextBodyCharacters = 200_000
const selectedHeaderNames = [
  'date',
  'message-id',
  'in-reply-to',
  'references',
  'reply-to',
  'content-type',
]

function configuredDomains(env) {
  return new Set(String(env.EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean))
}

function normalizeAddress(value) {
  const address = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) return null
  return address
}

function clamp(value, maximum) {
  return String(value || '').replaceAll('\0', '').slice(0, maximum)
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const result = await crypto.subtle.digest('SHA-256', bytes)
  return toBase64Url(new Uint8Array(result))
}

async function readMessage(raw) {
  const reader = raw.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumRawMessageBytes) {
      await reader.cancel()
      throw new Error('Message exceeds the 2 MB size limit')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function selectedHeaders(email) {
  const headers = {}
  for (const name of selectedHeaderNames) {
    const value = email.headers?.find((header) => header.key?.toLowerCase() === name)?.value
    if (value) headers[name] = clamp(value, 2_000)
  }
  return headers
}

async function writeDeliveryAudit(env, ownerId, generatedEmailId, sender, recipient, event = 'received') {
  const forwarded = event === 'forwarded'
  await env.DB.prepare(`
    INSERT INTO activity_logs (
      id, user_id, event_type, description, severity, metadata, client_identifier_hash
    ) VALUES (?, ?, ?, ?, 'info', ?, ?)
  `).bind(
    crypto.randomUUID(),
    ownerId,
    forwarded ? 'email.forwarded' : 'email.received',
    forwarded ? 'Incoming email forwarded' : 'Incoming email received',
    JSON.stringify({ generatedEmailId, sender: clamp(sender, 254), recipient }),
    await digest(`email-worker|${recipient}`),
  ).run()
}

export default {
  async email(message, env) {
    const recipient = normalizeAddress(message.to)
    const sender = normalizeAddress(message.from)
    if (!recipient || !sender) {
      message.setReject('Malformed sender or recipient address')
      return
    }

    const domain = recipient.slice(recipient.lastIndexOf('@') + 1)
    if (!configuredDomains(env).has(domain)) {
      message.setReject('Recipient domain is not configured')
      return
    }

    const mailbox = await env.DB.prepare(`
      SELECT generated_email_addresses.id, generated_email_addresses.user_id,
        generated_email_addresses.status, generated_email_addresses.delivery_mode,
        generated_email_addresses.forward_to, email_domains.enabled, email_domains.health_status
      FROM generated_email_addresses
      INNER JOIN email_domains ON email_domains.id = generated_email_addresses.domain_id
      WHERE generated_email_addresses.full_address = ? COLLATE NOCASE
      LIMIT 1
    `).bind(recipient).first()

    if (!mailbox) {
      message.setReject('Recipient address is not registered')
      return
    }
    if (mailbox.status !== 'active' || !mailbox.enabled || mailbox.health_status !== 'available') {
      message.setReject('Recipient address is not accepting mail')
      return
    }

    if (mailbox.delivery_mode === 'forward') {
      const destination = normalizeAddress(mailbox.forward_to)
      if (!destination) {
        message.setReject('Forwarding destination is unavailable')
        return
      }
      try {
        await message.forward(destination)
        const forwardedAt = new Date().toISOString()
        await env.DB.prepare(`
          UPDATE generated_email_addresses
          SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(forwardedAt, mailbox.id).run()
        await writeDeliveryAudit(
          env, mailbox.user_id, mailbox.id, sender, recipient, 'forwarded',
        )
      } catch {
        message.setReject('Message could not be forwarded')
      }
      return
    }

    let raw
    let email
    try {
      raw = await readMessage(message.raw)
      email = await PostalMime.parse(raw)
    } catch (error) {
      message.setReject(clamp(error?.message || 'Message could not be parsed', 180))
      return
    }

    const providerMessageId = clamp(email.messageId || '', 998) || null
    const deduplicationKey = providerMessageId
      ? `message-id:${await digest(providerMessageId.toLowerCase())}`
      : `raw:${await digest(raw)}`
    const receivedAt = new Date().toISOString()
    const subject = clamp(email.subject || '', 998)
    const textBody = clamp(email.text || htmlToText(email.html), maximumTextBodyCharacters)
    const headersJson = JSON.stringify(selectedHeaders(email))
    const id = crypto.randomUUID()

    const insert = await env.DB.prepare(`
      INSERT OR IGNORE INTO received_emails (
        id, generated_email_id, user_id, deduplication_key, provider_message_id,
        sender, recipient, subject, text_body, headers_json, received_at, delivery_status,
        raw_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)
    `).bind(
      id,
      mailbox.id,
      mailbox.user_id,
      deduplicationKey,
      providerMessageId,
      sender,
      recipient,
      subject,
      textBody,
      headersJson,
      receivedAt,
      raw.byteLength,
    ).run()

    if (!insert.meta?.changes) return

    await env.DB.prepare(`
      UPDATE generated_email_addresses
      SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(receivedAt, mailbox.id).run()
    await writeDeliveryAudit(env, mailbox.user_id, mailbox.id, sender, recipient)
  },
}
