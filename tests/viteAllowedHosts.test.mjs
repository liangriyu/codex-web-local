import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loadConfigFromFile } from 'vite'

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

test('vite server disables host allowlist checks by default', async () => {
  const loaded = await loadConfigFromFile()
  const allowedHosts = loaded?.config.server?.allowedHosts

  assert.equal(loaded?.path, configFile)
  assert.equal(allowedHosts, true)
})
