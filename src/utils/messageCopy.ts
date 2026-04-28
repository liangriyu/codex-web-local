import type { UiMessage } from '../types/codex'

export type MessageCopyEnvironment = {
  clipboard?: {
    writeText(text: string): Promise<void>
  } | null
  document?: {
    body?: {
      appendChild(node: unknown): void
      removeChild(node: unknown): void
    } | null
    createElement(tagName: string): {
      value: string
      style?: Record<string, string> | CSSStyleDeclaration
      setAttribute?(name: string, value: string): void
      focus?(): void
      select?(): void
      setSelectionRange?(start: number, end: number): void
    }
    execCommand?(command: string): boolean
  } | null
}

export type MessageCopyPayload = {
  key: string
  text: string
}

function hasRenderableText(message: UiMessage | undefined): message is UiMessage {
  return Boolean(message && message.messageType !== 'worked' && message.text.trim().length > 0)
}

function isUserCopyMessage(message: UiMessage | undefined): message is UiMessage {
  return Boolean(message && message.role === 'user' && hasRenderableText(message))
}

function isAssistantCopyMessage(message: UiMessage | undefined): message is UiMessage {
  return Boolean(message && message.role === 'assistant' && hasRenderableText(message))
}

export function readMessageCopyPayload(
  messages: UiMessage[],
  index: number,
): MessageCopyPayload | null {
  const message = messages[index]
  if (!message) return null

  if (isUserCopyMessage(message)) {
    return {
      key: message.id,
      text: message.text,
    }
  }

  if (!isAssistantCopyMessage(message)) return null
  if (isAssistantCopyMessage(messages[index + 1])) return null

  const parts: string[] = []
  let start = index
  while (start >= 0 && isAssistantCopyMessage(messages[start])) {
    start -= 1
  }

  for (let cursor = start + 1; cursor <= index; cursor += 1) {
    const candidate = messages[cursor]
    if (!isAssistantCopyMessage(candidate)) continue
    parts.push(candidate.text)
  }

  if (parts.length === 0) return null
  return {
    key: message.id,
    text: parts.join('\n\n'),
  }
}

function resolveMessageCopyEnvironment(): MessageCopyEnvironment {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard ?? null : null,
    document: typeof document !== 'undefined' ? document : null,
  }
}

function copyWithHiddenTextarea(text: string, env: MessageCopyEnvironment): boolean {
  const doc = env.document
  if (!doc?.body) return false

  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.setAttribute?.('readonly', '')

  if (textarea.style) {
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
  }

  doc.body.appendChild(textarea)
  textarea.focus?.()
  textarea.select?.()
  textarea.setSelectionRange?.(0, text.length)

  try {
    return doc.execCommand?.('copy') ?? false
  } finally {
    doc.body.removeChild(textarea)
  }
}

export async function copyTextToClipboard(
  text: string,
  overrides: MessageCopyEnvironment = {},
): Promise<boolean> {
  const env = {
    ...resolveMessageCopyEnvironment(),
    ...overrides,
  }

  if (env.clipboard?.writeText) {
    try {
      await env.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the textarea-based fallback for Safari/WebView cases.
    }
  }

  return copyWithHiddenTextarea(text, env)
}
