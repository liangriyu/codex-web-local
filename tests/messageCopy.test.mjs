import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { copyTextToClipboard, readMessageCopyPayload } from '../src/utils/messageCopy.ts'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('copyTextToClipboard uses Clipboard API when available', async () => {
  const writes = []

  const result = await copyTextToClipboard('## hello\n- world', {
    clipboard: {
      async writeText(text) {
        writes.push(text)
      },
    },
  })

  assert.equal(result, true)
  assert.deepEqual(writes, ['## hello\n- world'])
})

test('copyTextToClipboard falls back to hidden textarea copy when Clipboard API is unavailable', async () => {
  const commands = []
  const appended = []
  const removed = []
  const textarea = {
    value: '',
    style: {},
    setAttribute() {},
    focus() {},
    selectCalled: false,
    selectionRange: null,
    select() {
      this.selectCalled = true
    },
    setSelectionRange(start, end) {
      this.selectionRange = [start, end]
    },
  }

  const result = await copyTextToClipboard('plain text', {
    document: {
      body: {
        appendChild(node) {
          appended.push(node)
        },
        removeChild(node) {
          removed.push(node)
        },
      },
      createElement(tag) {
        assert.equal(tag, 'textarea')
        return textarea
      },
      execCommand(command) {
        commands.push(command)
        return true
      },
    },
  })

  assert.equal(result, true)
  assert.equal(textarea.value, 'plain text')
  assert.equal(textarea.selectCalled, true)
  assert.deepEqual(textarea.selectionRange, [0, 'plain text'.length])
  assert.deepEqual(commands, ['copy'])
  assert.deepEqual(appended, [textarea])
  assert.deepEqual(removed, [textarea])
})

test('readMessageCopyPayload merges consecutive assistant messages and hides non-tail copy buttons', () => {
  const messages = [
    { id: 'user-1', role: 'user', text: '问题 1' },
    { id: 'assistant-1', role: 'assistant', text: '第一段' },
    { id: 'assistant-2', role: 'assistant', text: '第二段' },
    { id: 'worked-1', role: 'system', text: '2s', messageType: 'worked' },
    { id: 'assistant-3', role: 'assistant', text: '第三段' },
    { id: 'system-1', role: 'system', text: '提示' },
  ]

  assert.deepEqual(readMessageCopyPayload(messages, 0), {
    key: 'user-1',
    text: '问题 1',
  })
  assert.equal(readMessageCopyPayload(messages, 1), null)
  assert.deepEqual(readMessageCopyPayload(messages, 2), {
    key: 'assistant-2',
    text: '第一段\n\n第二段',
  })
  assert.equal(readMessageCopyPayload(messages, 3), null)
  assert.deepEqual(readMessageCopyPayload(messages, 4), {
    key: 'assistant-3',
    text: '第三段',
  })
  assert.equal(readMessageCopyPayload(messages, 5), null)
})

test('ThreadConversation renders user copy actions outside the bubble and assistant actions inline', async () => {
  const [conversation, uiText] = await Promise.all([
    read('../src/components/content/ThreadConversation.vue'),
    read('../src/i18n/uiText.ts'),
  ])

  assert.match(conversation, /copyTextToClipboard/)
  assert.match(conversation, /readMessageCopyPayload/)
  assert.match(conversation, /message-copy-button/)
  assert.match(conversation, /message-copy-external/)
  assert.match(conversation, /message-content-actions/)
  assert.match(conversation, /\(message,\s*messageIndex\)\s+in\s+messages/)
  assert.match(conversation, /const copyPayload = readMessageCopyPayload\(props\.messages,\s*messageIndex\)/)
  assert.match(conversation, /message\.role === 'user'/)
  assert.match(conversation, /message\.role !== 'user'/)
  assert.match(conversation, /copiedMessageKey/)
  assert.match(conversation, /threadConversation\.copyMessage/)
  assert.match(conversation, /threadConversation\.copied/)
  assert.doesNotMatch(conversation, /top-0 right-0/)
  assert.match(uiText, /'threadConversation\.copy'/)
  assert.match(uiText, /'threadConversation\.copied'/)
  assert.match(uiText, /'threadConversation\.copyMessage'/)
})
