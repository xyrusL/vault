import assert from 'node:assert/strict'
import test from 'node:test'

import { emailRouting } from '../worker/api.js'

const env = {
  CLOUDFLARE_EMAIL_ROUTING_TOKEN: 'test-token',
  EMAIL_ROUTING_WORKER: 'vault-email-worker',
  EMAIL_ROUTING_ZONES: 'tpmail.deze.me=zone-deze,octagram.qzz.io=zone-octagram',
}

test('parses configured email hostnames into zone identifiers', () => {
  assert.deepEqual(
    [...emailRouting.parseZones(env)],
    [
      ['tpmail.deze.me', 'zone-deze'],
      ['octagram.qzz.io', 'zone-octagram'],
    ],
  )
})

test('creates a literal recipient rule targeting the email worker', async (t) => {
  let request
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options }
    return Response.json({ success: true, result: { id: 'rule-123' } })
  })

  const result = await emailRouting.createRule(
    env,
    'octagram.qzz.io',
    'new-mailbox@octagram.qzz.io',
  )

  assert.deepEqual(result, { ruleId: 'rule-123', zoneId: 'zone-octagram' })
  assert.equal(
    request.url,
    'https://api.cloudflare.com/client/v4/zones/zone-octagram/email/routing/rules',
  )
  assert.equal(request.options.method, 'POST')
  assert.deepEqual(JSON.parse(request.options.body), {
    name: 'Vault generated: new-mailbox@octagram.qzz.io',
    enabled: true,
    matchers: [{ type: 'literal', field: 'to', value: 'new-mailbox@octagram.qzz.io' }],
    actions: [{ type: 'worker', value: ['vault-email-worker'] }],
  })
})

test('deletes a stored routing rule and treats missing rules as already removed', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return new Response(null, { status: 404 })
  })

  await emailRouting.deleteRule(env, 'zone-octagram', 'rule-123')

  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].url,
    'https://api.cloudflare.com/client/v4/zones/zone-octagram/email/routing/rules/rule-123',
  )
  assert.equal(requests[0].options.method, 'DELETE')
})
