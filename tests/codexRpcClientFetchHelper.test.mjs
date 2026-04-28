import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('codexRpcClient centralizes repeated fetch/json/http-error handling', async () => {
  const source = await readFile(new URL('../src/api/codexRpcClient.ts', import.meta.url), 'utf8')

  assert.match(source, /async function parseJsonPayload\(response: Response\): Promise<unknown>/)
  assert.match(source, /function assertHttpOk\(/)
  assert.match(source, /async function fetchJsonPayload\(/)
  assert.match(source, /fetchPersistedServerRequests\(\): Promise<unknown\[]>/)
  assert.match(source, /fetchSharedSessionSnapshots\(\): Promise<unknown\[]>/)
  assert.match(source, /fetchSharedSessionSnapshot\(sessionId: string\): Promise<unknown \| null>/)
  assert.match(source, /method: 'server-requests\/persisted'/)
  assert.match(source, /method: 'shared-sessions\/list'/)
  assert.match(source, /method: 'shared-sessions\/read'/)
})
