import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('shared session UI contract adds front-end snapshot types and gateway readers', async () => {
  const [typesSource, rpcClientSource, gatewaySource] = await Promise.all([
    read('../src/types/codex.ts'),
    read('../src/api/codexRpcClient.ts'),
    read('../src/api/codexGateway.ts'),
  ])

  assert.match(typesSource, /export type UiSharedSessionSnapshot = \{/)
  assert.match(typesSource, /export type UiSharedSessionState =/)
  assert.match(typesSource, /pendingApprovalKinds: UiSharedSessionApprovalKind\[]/)
  assert.match(typesSource, /pendingAttentionCount: number/)
  assert.match(rpcClientSource, /export async function fetchSharedSessionSnapshots\(\): Promise<unknown\[]>/)
  assert.match(rpcClientSource, /export async function fetchSharedSessionSnapshot\(sessionId: string\): Promise<unknown \| null>/)
  assert.match(gatewaySource, /function normalizeSharedSessionSnapshot\(value: unknown\): UiSharedSessionSnapshot \| null/)
  assert.match(gatewaySource, /export async function getSharedSessionSnapshots\(\): Promise<UiSharedSessionSnapshot\[]>/)
  assert.match(gatewaySource, /export async function getSharedSessionSnapshot\(sessionId: string\): Promise<UiSharedSessionSnapshot \| null>/)
})

test('useDesktopState exposes shared session snapshot reader state without coupling to live approvals', async () => {
  const stateSource = await read('../src/composables/useDesktopState.ts')

  assert.match(stateSource, /const sharedSessionSnapshots = ref<UiSharedSessionSnapshot\[]>\(\[\]\)/)
  assert.match(stateSource, /const sharedSessionSnapshotByThreadId = computed<Record<string, UiSharedSessionSnapshot>>/)
  assert.match(stateSource, /const selectedSharedSessionSnapshot = computed<UiSharedSessionSnapshot \| null>/)
  assert.match(stateSource, /async function refreshSharedSessionSnapshots\(options: \{ silent\?: boolean \} = \{\}\): Promise<void>/)
  assert.match(stateSource, /void refreshSharedSessionSnapshots\(\{ silent: true \}\)/)
  assert.match(stateSource, /sharedSessionSnapshots,/)
  assert.match(stateSource, /sharedSessionSnapshotByThreadId,/)
  assert.match(stateSource, /selectedSharedSessionSnapshot,/)
  assert.match(stateSource, /refreshSharedSessionSnapshots,/)
})
