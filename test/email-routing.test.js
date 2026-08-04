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
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    if (options?.method === 'POST') {
      return Response.json({ success: true, result: { id: 'rule-123' } })
    }
    return Response.json({
      success: true,
      result: {
        id: 'rule-123',
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: 'new-mailbox@octagram.qzz.io' }],
        actions: [{ type: 'worker', value: ['vault-email-worker'] }],
      },
    })
  })

  const result = await emailRouting.createRule(
    env,
    'octagram.qzz.io',
    'new-mailbox@octagram.qzz.io',
  )

  assert.deepEqual(result, { ruleId: 'rule-123', zoneId: 'zone-octagram' })
  assert.equal(
    requests[0].url,
    'https://api.cloudflare.com/client/v4/zones/zone-octagram/email/routing/rules',
  )
  assert.equal(requests[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: 'Vault generated: new-mailbox@octagram.qzz.io',
    enabled: true,
    matchers: [{ type: 'literal', field: 'to', value: 'new-mailbox@octagram.qzz.io' }],
    actions: [{ type: 'worker', value: ['vault-email-worker'] }],
  })
  assert.equal(
    requests[1].url,
    'https://api.cloudflare.com/client/v4/zones/zone-octagram/email/routing/rules/rule-123',
  )
  assert.equal(requests[1].options.method, undefined)
})

test('only considers an enabled matching Worker rule ready', () => {
  const readyRule = {
    id: 'rule-123',
    enabled: true,
    matchers: [{ type: 'literal', field: 'to', value: 'READY@octagram.qzz.io' }],
    actions: [{ type: 'worker', value: ['vault-email-worker'] }],
  }

  assert.equal(emailRouting.ruleIsReady(
    readyRule,
    'ready@octagram.qzz.io',
    'vault-email-worker',
  ), true)
  assert.equal(emailRouting.ruleIsReady(
    { ...readyRule, enabled: false },
    'ready@octagram.qzz.io',
    'vault-email-worker',
  ), false)
  assert.equal(emailRouting.ruleIsReady(
    { ...readyRule, actions: [{ type: 'worker', value: ['another-worker'] }] },
    'ready@octagram.qzz.io',
    'vault-email-worker',
  ), false)
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

test('reconciliation deletes Vault addresses whose Cloudflare rules are missing', async (t) => {
  const addresses = [
    {
      id: 'address-present',
      user_id: 'user-1',
      full_address: 'present@octagram.qzz.io',
      routing_rule_id: 'rule-present',
      routing_zone_id: 'zone-octagram',
    },
    {
      id: 'address-missing',
      user_id: 'user-1',
      full_address: 'missing@octagram.qzz.io',
      routing_rule_id: 'rule-missing',
      routing_zone_id: 'zone-octagram',
    },
  ]
  const batches = []
  const database = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) {
          this.values = values
          return this
        },
        async all() {
          return { results: addresses }
        },
      }
    },
    async batch(statements) {
      batches.push(statements)
    },
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    success: true,
    result: [{ id: 'rule-present' }],
    result_info: { total_pages: 1 },
  }))

  const removed = await emailRouting.reconcile({
    ...env,
    DB: database,
  })

  assert.deepEqual(removed, ['address-missing'])
  assert.equal(batches.length, 1)
  assert.match(batches[0][0].sql, /DELETE FROM generated_email_addresses/)
  assert.deepEqual(batches[0][0].values, ['user-1', 'address-missing'])
})

test('reconciliation never deletes addresses when Cloudflare is unavailable', async (t) => {
  let batchCalled = false
  const database = {
    prepare() {
      return {
        bind() { return this },
        async all() {
          return {
            results: [{
              id: 'address-1',
              user_id: 'user-1',
              full_address: 'safe@octagram.qzz.io',
              routing_rule_id: 'rule-1',
              routing_zone_id: 'zone-octagram',
            }],
          }
        },
      }
    },
    async batch() {
      batchCalled = true
    },
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json(
    { success: false, errors: [{ message: 'Unavailable' }] },
    { status: 503 },
  ))

  await assert.rejects(
    emailRouting.reconcile({ ...env, DB: database }),
    /Email routing is temporarily unavailable/,
  )
  assert.equal(batchCalled, false)
})
