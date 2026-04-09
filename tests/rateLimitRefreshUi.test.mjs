import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('desktop state retries rate limit refresh when polling starts', async () => {
  const desktopState = await read('../src/composables/useDesktopState.ts')

  assert.match(desktopState, /function startPolling\(\): void \{/)
  assert.match(desktopState, /void refreshRateLimitUsage\(\)/)
})
