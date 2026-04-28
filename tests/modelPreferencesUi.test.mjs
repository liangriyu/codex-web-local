import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('composer keeps current model metadata visible while model list is still loading', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')
  const desktopState = await read('../src/composables/useDesktopState.ts')

  assert.match(desktopState, /currentConfig = await getCurrentModelConfig\(\)/)
  assert.match(desktopState, /const modelIds = await getAvailableModelIds\(\)/)
  assert.doesNotMatch(
    desktopState,
    /Promise\.all\(\s*\[\s*getAvailableModelIds\(\)\s*,\s*getCurrentModelConfig\(\)\s*\]\s*\)/,
  )

  assert.match(composer, /props\.models\.length > 0/)
  assert.match(composer, /props\.selectedModel\.trim\(\)/)
  assert.match(composer, /props\.selectedReasoningEffort/)
  assert.match(composer, /support\.supported\.length === 0/)
})
