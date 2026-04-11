import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('desktop state retries transient thread/resume failures for mobile new-session flow', async () => {
  const desktopState = await read('../src/composables/useDesktopState.ts')

  assert.match(desktopState, /function isResumeRetryableError\(/)
  assert.match(desktopState, /error\.code === 'network_error'/)
  assert.match(desktopState, /error\.status >= 500/)
  assert.match(desktopState, /error\.method !== 'thread\/resume'/)
  assert.match(desktopState, /shouldRetry:\s*isResumeRetryableError/)
})
