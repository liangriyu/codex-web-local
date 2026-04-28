import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('thread file-change fallback client contract wires rpc client and gateway fallback readers', async () => {
  const [rpcClientSource, gatewaySource] = await Promise.all([
    read('../src/api/codexRpcClient.ts'),
    read('../src/api/codexGateway.ts'),
  ])

  assert.match(rpcClientSource, /export async function fetchThreadFileChangesFallback\(\s*threadId: string,\s*options: RpcCallOptions = \{\},\s*\): Promise<unknown \| null>/)
  assert.match(rpcClientSource, /\/codex-api\/thread-file-changes\/fallback\?\$\{query\.toString\(\)\}/)

  assert.match(gatewaySource, /fetchThreadFileChangesFallback as fetchThreadFileChangesFallbackRequest/)
  assert.match(gatewaySource, /function normalizeTurnFileChangesFallback\(value: unknown\): UiTurnFileChanges \| null/)
  assert.match(gatewaySource, /const threadReadFileChanges = normalizeLatestTurnFileChangesV2\(payload\)/)
  assert.match(gatewaySource, /const fileChanges = threadReadFileChanges \?\? await getThreadFileChangesFallbackV2\(threadId, options\)/)
})
