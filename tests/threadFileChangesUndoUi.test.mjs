import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { baseParse, NodeTypes } from '@vue/compiler-dom'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function elementClass(node) {
  return node.props.find((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class')?.value?.content ?? ''
}

function directiveExp(node, name) {
  return node.props.find((prop) => prop.type === NodeTypes.DIRECTIVE && prop.name === name)?.exp?.content ?? ''
}

function walk(node, parents, visit) {
  visit(node, parents)
  if (!node.children) return
  for (const child of node.children) {
    if (child && typeof child === 'object') {
      walk(child, [...parents, node], visit)
    }
  }
}

function collectFragments(node) {
  const fragments = []
  walk(node, [], (current) => {
    if (current.type === NodeTypes.TEXT) {
      fragments.push(current.content)
      return
    }
    if (current.type === NodeTypes.INTERPOLATION) {
      fragments.push(current.content.content)
    }
  })
  return fragments
}

function findFirst(root, predicate) {
  let found = null
  walk(root, [], (node, parents) => {
    if (found) return
    if (predicate(node, parents)) {
      found = node
    }
  })
  return found
}

test('thread conversation exposes undo/reapply actions only for the latest reversible file-change card', async () => {
  const [conversationSource, uiText] = await Promise.all([
    read('../src/components/content/ThreadConversation.vue'),
    read('../src/i18n/uiText.ts'),
  ])

  const { descriptor } = parseSfc(conversationSource)
  assert.ok(descriptor.template, 'expected a template block in ThreadConversation.vue')
  const ast = baseParse(descriptor.template.content)

  const fileChangeCard = findFirst(ast, (node) =>
    node.type === NodeTypes.ELEMENT
    && node.tag === 'article'
    && elementClass(node).includes('file-change-card'),
  )
  assert.ok(fileChangeCard, 'expected the file-change card to still be rendered inline with messages')

  const undoAction = findFirst(fileChangeCard, (node) =>
    node.type === NodeTypes.ELEMENT
    && node.tag === 'button'
    && collectFragments(node).some((fragment) =>
      fragment.includes('threadConversation.undoLatestFileChange')
      || fragment.includes('撤销本次变更')
      || fragment.includes('回退本次变更'),
    ),
  )
  const reapplyAction = findFirst(fileChangeCard, (node) =>
    node.type === NodeTypes.ELEMENT
    && node.tag === 'button'
    && collectFragments(node).some((fragment) =>
      fragment.includes('threadConversation.reapplyLatestFileChange')
      || fragment.includes('重新应用本次变更'),
    ),
  )
  const viewDiffAction = findFirst(fileChangeCard, (node) =>
    node.type === NodeTypes.ELEMENT
    && node.tag === 'button'
    && collectFragments(node).some((fragment) =>
      fragment.includes('threadConversation.viewFileChangeDiff')
      || fragment.includes('查看 Diff'),
    ),
  )

  assert.ok(undoAction, 'expected a revert action on the latest reversible file-change card')
  assert.ok(reapplyAction, 'expected a reapply action after reverting the latest reversible file-change card')
  assert.ok(viewDiffAction, 'expected an explicit view-diff button inside the file-change card')

  assert.ok(uiText.includes('threadConversation.undoLatestFileChange'))
  assert.ok(uiText.includes('threadConversation.reapplyLatestFileChange'))
  assert.ok(uiText.includes('threadConversation.viewFileChangeDiff'))

  const latestStateGuard = findFirst(fileChangeCard, (node) =>
    node.type === NodeTypes.ELEMENT
    && (
      directiveExp(node, 'if').includes('canUndo')
      || directiveExp(node, 'if').includes('canReapply')
      || directiveExp(node, 'if').includes('isReverted')
      || directiveExp(node, 'else-if').includes('canReapply')
    ),
  )
  assert.ok(latestStateGuard, 'expected the action copy to switch based on the latest reversible state')
})
