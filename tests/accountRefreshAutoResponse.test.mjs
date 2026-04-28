import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bridge has auto-response branch for account/chatgptAuthTokens/refresh requests', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(bridge, /account\/chatgptAuthTokens\/refresh/)
  assert.match(bridge, /resolveChatgptAuthTokensRefreshPayload/)
  assert.match(bridge, /sendServerRequestReply\(requestId,\s*\{\s*result:\s*refreshResponse\s*\}\)/)
  assert.match(bridge, /listPendingServerRequests\(\): PendingServerRequest\[\]/)
})
