import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('theme styles define semantic tokens for both light and dark modes', async () => {
  const css = await read('../src/style.css')

  const requiredTokens = [
    '--color-bg-app',
    '--color-bg-surface',
    '--color-bg-elevated',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-text-muted',
    '--color-border-default',
    '--color-code-bg',
    '--color-code-text',
    '--color-chip-bg',
    '--color-chip-text',
    '--color-link',
    '--color-link-hover',
  ]

  for (const token of requiredTokens) {
    assert.match(css, new RegExp(`${token}:`), `missing light token ${token}`)
    assert.match(
      css,
      new RegExp(`html\\[data-theme='dark'\\][\\s\\S]*${token}:`),
      `missing dark token ${token}`,
    )
  }
})

test('high-traffic reading surfaces consume semantic theme tokens', async () => {
  const [conversation, composer, preview, layout, app, tree, nav, menuRow, controls] = await Promise.all([
    read('../src/components/content/ThreadConversation.vue'),
    read('../src/components/content/ThreadComposer.vue'),
    read('../src/components/content/CodePreviewPanel.vue'),
    read('../src/components/layout/DesktopLayout.vue'),
    read('../src/App.vue'),
    read('../src/components/sidebar/SidebarThreadTree.vue'),
    read('../src/components/sidebar/SidebarPrimaryNav.vue'),
    read('../src/components/sidebar/SidebarMenuRow.vue'),
    read('../src/components/sidebar/SidebarThreadControls.vue'),
  ])

  assert.match(conversation, /var\(--color-text-primary\)|var\(--color-text-secondary\)|var\(--color-code-bg\)/)
  assert.match(composer, /var\(--color-text-primary\)|var\(--color-chip-bg\)|var\(--color-bg-elevated\)/)
  assert.match(preview, /var\(--color-text-primary\)|var\(--color-text-secondary\)|var\(--color-bg-elevated\)/)
  assert.match(layout, /var\(--color-bg-app\)|var\(--color-bg-surface\)|var\(--color-text-primary\)/)
  assert.match(app, /var\(--color-bg-surface\)|var\(--color-bg-subtle\)|var\(--color-text-primary\)/)
  assert.match(tree, /var\(--color-text-primary\)|var\(--color-text-secondary\)|var\(--color-bg-subtle\)/)
  assert.match(nav, /var\(--color-text-primary\)|var\(--color-bg-subtle\)/)
  assert.match(menuRow, /var\(--color-text-secondary\)|var\(--color-text-muted\)/)
  assert.match(controls, /var\(--color-text-secondary\)|var\(--color-bg-subtle\)|var\(--color-border-default\)/)
})
