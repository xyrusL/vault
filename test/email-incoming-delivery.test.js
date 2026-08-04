import assert from 'node:assert/strict'
import test from 'node:test'

import emailWorker from '../vault-worker.js'

function createDatabase(mailbox) {
  const statements = []
  return {
    statements,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values
          return this
        },
        async first() {
          return mailbox
        },
        async run() {
          statements.push(this)
          return { meta: { changes: 1 } }
        },
      }
      return statement
    },
  }
}

test('Email Worker stores a real MIME message for an active generated address', async () => {
  const database = createDatabase({
    id: 'address-1',
    user_id: 'user-1',
    status: 'active',
    delivery_mode: 'vault',
    forward_to: null,
    enabled: 1,
    health_status: 'available',
  })
  const rejected = []
  const raw = [
    'From: Sender <sender@example.com>',
    'To: test@octagram.qzz.io',
    'Subject: Vault delivery test ABC12345',
    'Message-ID: <vault-test-abc12345@example.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'End-to-end incoming delivery test.',
  ].join('\r\n')

  await emailWorker.email({
    from: 'sender@example.com',
    to: 'test@octagram.qzz.io',
    raw: new Blob([raw]).stream(),
    setReject(reason) { rejected.push(reason) },
  }, {
    DB: database,
    EMAIL_DOMAINS: 'octagram.qzz.io',
  })

  assert.deepEqual(rejected, [])
  const insert = database.statements.find((statement) => statement.sql.includes('INSERT OR IGNORE INTO received_emails'))
  assert.ok(insert)
  assert.equal(insert.values[1], 'address-1')
  assert.equal(insert.values[5], 'sender@example.com')
  assert.equal(insert.values[6], 'test@octagram.qzz.io')
  assert.equal(insert.values[7], 'Vault delivery test ABC12345')
  assert.equal(insert.values[8].trim(), 'End-to-end incoming delivery test.')
  assert.ok(database.statements.some((statement) => statement.sql.includes('SET last_message_at = ?')))
  assert.ok(database.statements.some((statement) => statement.values.includes('email.received')))
})

test('Email Worker hands an incoming message to a verified forwarding destination', async () => {
  const database = createDatabase({
    id: 'address-2',
    user_id: 'user-1',
    status: 'active',
    delivery_mode: 'forward',
    forward_to: 'owner@example.net',
    enabled: 1,
    health_status: 'available',
  })
  const forwarded = []
  const rejected = []

  await emailWorker.email({
    from: 'sender@example.com',
    to: 'forward@octagram.qzz.io',
    raw: new Blob(['unused']).stream(),
    async forward(destination) { forwarded.push(destination) },
    setReject(reason) { rejected.push(reason) },
  }, {
    DB: database,
    EMAIL_DOMAINS: 'octagram.qzz.io',
  })

  assert.deepEqual(rejected, [])
  assert.deepEqual(forwarded, ['owner@example.net'])
  assert.ok(database.statements.some((statement) => statement.sql.includes('SET last_message_at = ?')))
  assert.ok(database.statements.some((statement) => statement.values.includes('email.forwarded')))
})
