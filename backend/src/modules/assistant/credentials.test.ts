import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptUserKey, decryptUserKey } from './credentials'
test('Personal API keys are randomized, authenticated and bound to their owner', () => {
  const previous = process.env.AI_KEYS_ENCRYPTION_KEY
  process.env.AI_KEYS_ENCRYPTION_KEY = 'fixture-master-secret-at-least-32-characters'
  try {
    const key = 'sk-fixture-user-secret', encrypted = encryptUserKey('owner', key)
    assert.ok(!encrypted.includes(key))
    assert.notEqual(encrypted, encryptUserKey('owner', key))
    assert.equal(decryptUserKey('owner', encrypted), key)
    assert.throws(() => decryptUserKey('another-user', encrypted))
    const parts = encrypted.split('.'); const bytes = Buffer.from(parts[2], 'base64'); bytes[0] ^= 1; parts[2] = bytes.toString('base64')
    assert.throws(() => decryptUserKey('owner', parts.join('.')))
  } finally { if (previous === undefined) delete process.env.AI_KEYS_ENCRYPTION_KEY; else process.env.AI_KEYS_ENCRYPTION_KEY = previous }
})
