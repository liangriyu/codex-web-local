import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('rpc client source does not coerce missing params to null', async () => {
  const source = await readFile(new URL('../src/api/codexRpcClient.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /params:\s*params\s*\?\?\s*null/)
  assert.match(source, /const body: RpcRequestBody = \{ method \}/)
})

test('bridge source does not replace missing params with null before upstream rpc', async () => {
  const source = await readFile(new URL('../src/server/codexAppServerBridge.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /appServer\.rpc\(body\.method,\s*body\.params\s*\?\?\s*null\)/)
  assert.doesNotMatch(source, /readThreadIdFromRpcPayload\(body\.method,\s*body\.params\s*\?\?\s*null,\s*result\)/)
})
