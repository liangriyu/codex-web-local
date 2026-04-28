import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('code preview panel keeps historical bare-hunk diffs renderable', async () => {
  const source = await read('../src/components/content/CodePreviewPanel.vue')

  assert.match(source, /function parseDiffHunkHeader\(rawLine: string\)/)
  assert.match(source, /rawLine\.trim\(\) === '@@'/)
  assert.match(source, /let oldLine: number \| null = null/)
  assert.match(source, /let newLine: number \| null = null/)
  assert.match(source, /newLine !== null/)
})

test('historical diff preview forwards turn totals to the header chip', async () => {
  const [app, conversation] = await Promise.all([
    read('../src/App.vue'),
    read('../src/components/content/ThreadConversation.vue'),
  ])

  assert.match(app, /const headerDiffTotals = computed\(\(\) => \{/)
  assert.match(app, /previewPanel\.value\?\.kind === 'diff'/)
  assert.match(app, /totalAdditions: payload\.totalAdditions/)
  assert.match(app, /totalDeletions: payload\.totalDeletions/)
  assert.match(app, /headerDiffTotals\.additions/)
  assert.match(app, /headerDiffTotals\.deletions/)

  assert.match(conversation, /readMessageFileChanges\(message\)\?\.totalAdditions \?\? change\.additions/)
  assert.match(conversation, /readMessageFileChanges\(message\)\?\.totalDeletions \?\? change\.deletions/)
})
