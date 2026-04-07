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

test('thread conversation renders file change cards inside the message v-for branch', async () => {
  const source = await read('../src/components/content/ThreadConversation.vue')
  const { descriptor } = parseSfc(source)
  const ast = baseParse(descriptor.template.content)

  let fileChangeCardNode = null
  let messageLoopLiNode = null

  walk(ast, [], (node, parents) => {
    if (node.type !== NodeTypes.ELEMENT || node.tag !== 'article') return
    if (!directiveExp(node, 'if').includes('readMessageFileChanges(message)')) return
    fileChangeCardNode = node
    messageLoopLiNode = [...parents].reverse().find(
      (parent) =>
        parent.type === NodeTypes.ELEMENT
        && parent.tag === 'li'
        && directiveExp(parent, 'for').includes('messages'),
    ) ?? null
  })

  assert.ok(fileChangeCardNode, 'expected a file-change-card article in the template')
  assert.ok(messageLoopLiNode, 'expected the card to live under the message v-for li')
  assert.equal(directiveExp(fileChangeCardNode, 'if'), 'readMessageFileChanges(message) && !hasPendingFileChangeApproval')
})

test('thread conversation does not keep a thread-tail latest file-change card outside the message loop', async () => {
  const source = await read('../src/components/content/ThreadConversation.vue')
  const { descriptor } = parseSfc(source)
  const ast = baseParse(descriptor.template.content)

  const topLevelTailCards = []

  for (const child of ast.children) {
    if (!child || child.type !== NodeTypes.ELEMENT || child.tag !== 'li') continue
    if (directiveExp(child, 'for').includes('(message, messageIndex) in messages')) continue

    walk(child, [], (node) => {
      if (node.type !== NodeTypes.ELEMENT || node.tag !== 'article') return
      if (!elementClass(node).includes('file-change-card')) return
      topLevelTailCards.push(node)
    })
  }

  assert.equal(topLevelTailCards.length, 0)
})
