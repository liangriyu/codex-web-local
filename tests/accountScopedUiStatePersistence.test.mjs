import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('ui state persistence is scoped by active account profile', async () => {
  const storage = await read('../src/composables/desktop-state/storage.ts')
  const desktopState = await read('../src/composables/useDesktopState.ts')

  assert.match(storage, /export function loadSelectedThreadId\(profileId = ''\): string/)
  assert.match(storage, /export function saveSelectedThreadId\(threadId: string, profileId = ''\): void/)
  assert.match(storage, /export function loadThreadScrollStateMap\(profileId = ''\): Record<string, ThreadScrollState>/)
  assert.match(storage, /export function saveThreadScrollStateMap\(state: Record<string, ThreadScrollState>, profileId = ''\): void/)
  assert.match(storage, /export function loadThreadContextUsageMap\(profileId = ''\): Record<string, UiThreadContextUsage>/)
  assert.match(storage, /export function saveThreadContextUsageMap\(state: Record<string, UiThreadContextUsage>, profileId = ''\): void/)

  assert.match(desktopState, /loadSelectedThreadId\(activeAccountProfileId\.value\)/)
  assert.match(desktopState, /saveSelectedThreadId\(nextThreadId, activeAccountProfileId\.value\)/)
  assert.match(desktopState, /loadThreadScrollStateMap\(activeAccountProfileId\.value\)/)
  assert.match(desktopState, /saveThreadScrollStateMap\(.*activeAccountProfileId\.value\)/)
  assert.match(desktopState, /loadThreadContextUsageMap\(activeAccountProfileId\.value\)/)
  assert.match(desktopState, /saveThreadContextUsageMap\(.*activeAccountProfileId\.value\)/)
})
