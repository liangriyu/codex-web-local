import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bridge no longer exposes mobile auth relay endpoints', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.doesNotMatch(bridge, /\/api\/auth\/chatgpt\/mobile\/start/)
  assert.doesNotMatch(bridge, /\/api\/auth\/chatgpt\/mobile\/status/)
  assert.doesNotMatch(bridge, /\/auth\/chatgpt\/callback/)
  assert.doesNotMatch(bridge, /codex_web_local_mobile_direct_auth_available/)
  assert.doesNotMatch(bridge, /codex_web_local_public_base_url/)

  assert.match(bridge, /\/codex-api\/account-profiles/)
  assert.match(bridge, /\/codex-api\/account-profiles\/switch/)
})

test('runtime config no longer parses PUBLIC_BASE_URL', async () => {
  const runtimeConfig = await read('../src/cli/runtimeConfig.ts')

  assert.doesNotMatch(runtimeConfig, /PUBLIC_BASE_URL/)
  assert.doesNotMatch(runtimeConfig, /publicBaseUrl/)
})
