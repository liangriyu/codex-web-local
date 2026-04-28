import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('ThreadComposer keeps the desktop branch popover while exposing a mobile branch sheet', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')

  assert.match(composer, /thread-composer-branch-menu/)
  assert.match(composer, /@media\s*\(max-width:\s*720px\)/)
  assert.match(composer, /thread-composer-status-group[\s\S]*justify-end/)
  assert.match(composer, /thread-composer-status-group[\s\S]*width:\s*auto/)
  assert.match(composer, /thread-composer-branch-button[\s\S]*width:\s*2\.5rem/)
  assert.match(composer, /thread-composer-branch-button[\s\S]*height:\s*2\.5rem/)
  assert.match(composer, /thread-composer-branch-text[\s\S]*display:\s*none/)
  assert.match(composer, /thread-composer-branch-chevron[\s\S]*display:\s*none/)
  assert.match(composer, /thread-composer-branch-sheet/)
  assert.match(composer, /thread-composer-branch-sheet-backdrop/)
  assert.match(composer, /thread-composer-branch-sheet[\s\S]*position:\s*fixed/)
  assert.match(composer, /thread-composer-branch-sheet[\s\S]*left:\s*12px/)
  assert.match(composer, /thread-composer-branch-sheet[\s\S]*right:\s*12px/)
})
