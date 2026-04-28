import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/content/CodePreviewPanel.vue', import.meta.url), 'utf8')

test('adds mobile-only sizing and contrast overrides for the diff preview panel', () => {
  assert.match(
    source,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.content-code-preview\s*\{[\s\S]*?min-height:\s*min\(58dvh,\s*34rem\);[\s\S]*?max-height:\s*68dvh;/,
  )

  assert.match(
    source,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.content-code-preview-body[\s\S]*?\.workspace-diff-panel[\s\S]*?background:\s*var\(--color-bg-elevated\);/,
  )

  assert.match(
    source,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.workspace-diff-item-body\s*\{[\s\S]*?background:\s*var\(--color-bg-surface\);/,
  )

  assert.match(
    source,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.diff-line-text[\s\S]*?\.code-line-text[\s\S]*?color:\s*var\(--color-text-primary\);/,
  )
})
