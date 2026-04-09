import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('ThreadComposer renders weekly quota as a pill and 5h quota as a ring', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')

  assert.match(composer, /quotaDisplayRows/)
  assert.match(composer, /v-for="row in quotaDisplayRows"/)
  assert.match(composer, /row.kind === 'pill'/)
  assert.match(composer, /row.kind === 'ring'/)
  assert.match(composer, /thread-composer-quota-pill/)
  assert.match(composer, /thread-composer-quota-ring/)
  assert.match(composer, /:data-level="row.level"/)
  assert.match(composer, /windowLabel/)
  assert.match(composer, /row.displayLabel/)
  assert.match(composer, /ringStyle/)
  assert.match(composer, /return secondDuration - firstDuration/)
})
