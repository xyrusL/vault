import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../migrations/0018_create_ai_connection_profiles.sql', import.meta.url), 'utf8')
const worker = await readFile(new URL('../worker/api.js', import.meta.url), 'utf8')
const modelMigration = await readFile(new URL('../migrations/0019_add_ai_profile_models.sql', import.meta.url), 'utf8')

test('AI connection migration preserves the existing endpoint as an active profile', () => {
  assert.match(migration, /id TEXT PRIMARY KEY/)
  assert.match(migration, /is_active INTEGER NOT NULL/)
  assert.match(migration, /FROM ai_connections_legacy/)
  assert.match(migration, /is_active\s*\)\s*SELECT[\s\S]*1\s*FROM ai_connections_legacy/)
  assert.match(migration, /ai_connections_one_active_per_user_idx/)
})

test('AI configuration API supports profile editing, activation, and deletion', () => {
  assert.match(worker, /async function updateAiConfig\(request, env, user, connectionId = null\)/)
  assert.match(worker, /async function activateAiConfig/)
  assert.match(worker, /aiConfigMatch/)
  assert.match(worker, /aiActivateMatch/)
  assert.match(worker, /aiStatusMatch/)
  assert.match(worker, /async function updateAiConfigStatus/)
  assert.match(worker, /aiClientConfigMatch/)
  assert.match(worker, /profiles: results\.map\(presentAiConnection\)/)
})

test('AI profiles persist discovered model catalogs', () => {
  assert.match(modelMigration, /ADD COLUMN models_json/)
  assert.match(worker, /models_json/)
  assert.match(worker, /modelsJson/)
  assert.match(worker, /models,/)
})
