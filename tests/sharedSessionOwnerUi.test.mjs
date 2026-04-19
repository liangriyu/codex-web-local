import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('desktop state exposes shared session owner, state, and takeover capability', async () => {
  const stateSource = await read('../src/composables/useDesktopState.ts')

  assert.match(stateSource, /UiSharedSessionOwner/)
  assert.match(stateSource, /UiSharedSessionState/)
  assert.match(stateSource, /const sharedSessionOwner = computed<UiSharedSessionOwner \| null>\(\(\) =>/)
  assert.match(stateSource, /const sharedSessionState = computed<UiSharedSessionState \| null>\(\(\) =>/)
  assert.match(stateSource, /const canTakeOver = computed<boolean>\(\(\) =>/)
  assert.match(stateSource, /sharedSessionOwner,/)
  assert.match(stateSource, /sharedSessionState,/)
  assert.match(stateSource, /canTakeOver,/)
})

test('App disables the composer when the shared session is controlled by another client and renders a takeover shell', async () => {
  const app = await read('../src/App.vue')

  assert.match(app, /const isSharedSessionComposerReadOnly = computed\(\(\) =>/)
  assert.match(app, /const sharedSessionReadOnlyReason = computed\(\(\) =>/)
  assert.match(app, /function onTakeOverSharedSession\(\): void \{/)
  assert.match(app, /content-shared-session-takeover/)
  assert.match(app, /v-if="isSharedSessionComposerReadOnly"/)
  assert.match(app, /接管控制权/)
  assert.match(app, /:disabled="isSendingMessage \|\| isLoadingMessages \|\| isSharedSessionComposerReadOnly"/)
})
