import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('gateway and desktop state expose account profile list/switch model', async () => {
  const gateway = await read('../src/api/codexGateway.ts')
  const desktopState = await read('../src/composables/useDesktopState.ts')
  const types = await read('../src/types/codex.ts')

  assert.match(types, /export type UiAccountProfile = \{/)
  assert.match(gateway, /export async function listAccountProfiles\(\)/)
  assert.match(gateway, /export async function switchAccountProfile\(/)
  assert.match(gateway, /export async function addAccountProfile\(/)
  assert.match(gateway, /export async function removeAccountProfile\(/)
  assert.match(gateway, /export async function startChatgptAccountLogin\(\)/)
  assert.match(gateway, /account\/login\/start/)
  assert.match(gateway, /type:\s*'chatgpt'/)
  assert.match(gateway, /web-local\/account\/profiles\/list/)
  assert.match(gateway, /web-local\/account\/profiles\/switch/)
  assert.match(gateway, /web-local\/account\/profiles\/add/)
  assert.match(gateway, /web-local\/account\/profiles\/remove/)
  assert.match(desktopState, /const accountProfiles = ref<UiAccountProfile\[]>\(\[\]\)/)
  assert.match(desktopState, /const activeAccountProfileId = ref\(''\)/)
  assert.match(desktopState, /async function loadAccountProfiles\(/)
  assert.match(desktopState, /async function switchAccountProfile\(/)
  assert.match(desktopState, /async function addAccountProfile\(/)
  assert.match(desktopState, /async function removeAccountProfile\(/)
  assert.match(desktopState, /async function startAccountAlignment\(/)
})
