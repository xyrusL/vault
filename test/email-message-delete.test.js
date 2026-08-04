import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../worker/api.js', import.meta.url), 'utf8')
const viewSource = await readFile(new URL('../src/dashboard/EmailGeneratorView.jsx', import.meta.url), 'utf8')

test('message API exposes recorded raw size and authenticated delete routes', () => {
  assert.match(apiSource, /rawSizeBytes: message\.raw_size_bytes \?\? 0/)
  assert.match(apiSource, /if \(request\.method === 'DELETE'\) return await deleteEmailMessages/)
  assert.match(apiSource, /return await deleteEmailMessage\(request, env, authenticatedUser/)
  assert.match(apiSource, /WHERE user_id = \? AND id IN/)
})

test('message deletion recalculates last message time and reports reclaimed bytes', () => {
  assert.match(apiSource, /SELECT MAX\(received_at\) FROM received_emails/)
  assert.match(apiSource, /bytesReclaimed/)
  assert.match(apiSource, /email\.message\.deleted/)
})

test('email UI confirms deletion and displays recorded storage sizes', () => {
  assert.match(viewSource, /messagesToDelete/)
  assert.match(viewSource, /rawSizeBytes/)
  assert.match(viewSource, /recorded storage will be reclaimed/)
  assert.match(viewSource, /Delete message/)
})

test('email UI refreshes cached messages and explains forwarding history', () => {
  assert.doesNotMatch(viewSource, /if \(!emailGeneratorCache\) refreshAll\(\)/)
  assert.match(viewSource, /useEffect\(\(\) => \{\s*refreshAll\(\)/)
  assert.match(viewSource, /loadMessages\(\)\.catch/)
  assert.match(viewSource, /Earlier Vault messages remain available/)
  assert.match(viewSource, /Stored messages/)
})
