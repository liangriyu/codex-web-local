import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('ThreadComposer keeps mobile controls stable when the input is focused', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')

  assert.match(composer, /thread-composer-main-controls/)
  assert.match(composer, /thread-composer-config-group/)
  assert.match(composer, /thread-composer-action-group/)
  assert.match(composer, /thread-composer-actions-trigger[\s\S]*width:\s*2\.5rem;/)
  assert.match(composer, /thread-composer-actions-trigger[\s\S]*height:\s*2\.5rem;/)
  assert.match(composer, /thread-composer-voice-button[\s\S]*width:\s*2\.5rem;/)
  assert.match(composer, /thread-composer-submit[\s\S]*width:\s*2\.5rem;/)
  assert.match(composer, /thread-composer-actions-trigger-mark[\s\S]*text-xs/)
  assert.match(composer, /thread-composer-voice-icon[\s\S]*h-3 w-3/)
  assert.match(composer, /thread-composer-branch-icon[\s\S]*h-3 w-3/)
  assert.match(composer, /@media\s*\(max-width:\s*720px\)/)
  assert.match(composer, /thread-composer-input[\s\S]*font-size:\s*16px/)
  assert.match(composer, /thread-composer-controls[\s\S]*@apply\s+mt-3\s+flex\s+items-center\s+gap-4;/)
  assert.match(composer, /thread-composer-submit[\s\S]*min-width:\s*2\.5rem/)
  assert.match(composer, /thread-composer-stop[\s\S]*min-width:\s*2\.5rem/)
  assert.match(composer, /thread-composer-action-group[\s\S]*@apply\s+ml-auto\s+flex\s+items-center\s+gap-2;/)
  assert.match(composer, /thread-composer-status-group[\s\S]*@apply\s+ml-auto\s+flex\s+items-center\s+gap-1\.5;/)
  assert.match(composer, /thread-composer-controls[\s\S]*flex-direction:\s*column;/)
  assert.match(composer, /thread-composer-main-controls[\s\S]*width:\s*100%;/)
  assert.match(composer, /thread-composer-status-group[\s\S]*justify-content:\s*flex-start;/)
  assert.match(composer, /thread-composer-branch-text[\s\S]*truncate/)
  assert.match(composer, /thread-composer-branch-button[\s\S]*min-height:\s*2\.5rem;/)
  assert.doesNotMatch(composer, /thread-composer-branch-text,\s*[\r\n]+\s*\.thread-composer-branch-chevron\s*\{\s*display:\s*none;/)
})

test('App centers the project dropdown menu on mobile home screen', async () => {
  const app = await read('../src/App.vue')

  assert.match(app, /new-thread-folder-dropdown[\s\S]*@media\s*\(max-width:\s*720px\)/)
  assert.match(app, /new-thread-folder-dropdown[\s\S]*left:\s*50%/)
  assert.match(app, /new-thread-folder-dropdown[\s\S]*translateX\(-50%\)/)
  assert.match(app, /new-thread-folder-dropdown[\s\S]*width:\s*min\(20rem,\s*calc\(100vw - 1\.5rem\)\)/)
})
