import type { RpcNotification } from '../../api/codexGateway'
import type { UiMessage, UiServerRequest, UiThreadContextUsage } from '../../types/codex'

const TOKEN_METHOD_CANDIDATES = new Set([
  'thread/tokenUsage/updated',
  'token_count',
  'tokenCount',
])

export type TurnActivityState = {
  label: string
  details: string[]
}

export type TurnStartedInfo = {
  threadId: string
  turnId: string
  startedAtMs: number
}

export type TurnCompletedInfo = {
  threadId: string
  turnId: string
  completedAtMs: number
  startedAtMs?: number
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseIsoTimestamp(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function sanitizeDisplayText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

export function extractThreadIdFromNotification(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  const directThreadId = readString(params.threadId)
  if (directThreadId) return directThreadId
  const snakeThreadId = readString(params.thread_id)
  if (snakeThreadId) return snakeThreadId

  const conversationId = readString(params.conversationId)
  if (conversationId) return conversationId
  const snakeConversationId = readString(params.conversation_id)
  if (snakeConversationId) return snakeConversationId

  const thread = asRecord(params.thread)
  const nestedThreadId = readString(thread?.id)
  if (nestedThreadId) return nestedThreadId

  const turn = asRecord(params.turn)
  const turnThreadId = readString(turn?.threadId)
  if (turnThreadId) return turnThreadId
  const turnSnakeThreadId = readString(turn?.thread_id)
  if (turnSnakeThreadId) return turnSnakeThreadId

  return ''
}

export function readTurnErrorMessage(notification: RpcNotification): string {
  if (notification.method !== 'turn/completed') return ''
  const params = asRecord(notification.params)
  const turn = asRecord(params?.turn)
  if (!turn || turn.status !== 'failed') return ''
  const errorPayload = asRecord(turn.error)
  return readString(errorPayload?.message)
}

export function readTurnDiffUpdate(notification: RpcNotification): { threadId: string; turnId: string; diff: string } | null {
  if (notification.method !== 'turn/diff/updated') return null
  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = readString(params.threadId)
  const turnId = readString(params.turnId)
  const diff = readString(params.diff)
  if (!threadId || !turnId) return null
  return { threadId, turnId, diff }
}

export function readThreadContextUsage(
  notification: RpcNotification,
  fallbackThreadId: string,
): { threadId: string; usage: UiThreadContextUsage } | null {
  const params = asRecord(notification.params)
  if (!params) return null

  const hasTokenPayloadHint =
    params.tokenUsage !== undefined ||
    params.token_usage !== undefined ||
    params.info !== undefined
  if (!TOKEN_METHOD_CANDIDATES.has(notification.method) && !hasTokenPayloadHint) {
    return null
  }

  const threadId = readString(params.threadId) || readString(params.thread_id) || fallbackThreadId
  if (!threadId) return null

  const tokenUsage =
    asRecord(params.tokenUsage) ??
    asRecord(params.token_usage) ??
    asRecord(asRecord(params.info))
  if (!tokenUsage) return null

  const lastBreakdown =
    asRecord(tokenUsage.last) ??
    asRecord(tokenUsage.last_token_usage)
  const totalBreakdown =
    asRecord(tokenUsage.total) ??
    asRecord(tokenUsage.total_token_usage)

  const readBreakdownTokens = (breakdown: Record<string, unknown> | null): number | null => {
    if (!breakdown) return null
    return (
      readNumber(breakdown.inputTokens) ??
      readNumber(breakdown.input_tokens) ??
      readNumber(breakdown.totalTokens) ??
      readNumber(breakdown.total_tokens)
    )
  }

  const usedTokens =
    readBreakdownTokens(lastBreakdown) ??
    readBreakdownTokens(totalBreakdown)
  const totalTokens =
    readNumber(tokenUsage.modelContextWindow) ??
    readNumber(tokenUsage.model_context_window)
  if (usedTokens === null || totalTokens === null || totalTokens <= 0) return null

  const normalizedUsedTokens = Math.min(Math.max(usedTokens, 0), totalTokens)
  const usedPercent = Math.min(Math.max((normalizedUsedTokens / totalTokens) * 100, 0), 100)
  return {
    threadId,
    usage: {
      usedTokens: normalizedUsedTokens,
      totalTokens,
      usedPercent,
      remainingPercent: Math.max(0, 100 - usedPercent),
    },
  }
}

export function normalizeServerRequest(params: unknown, globalScope: string): UiServerRequest | null {
  const row = asRecord(params)
  if (!row) return null

  const id = row.id
  const method = readString(row.method)
  const requestParams = row.params
  if (typeof id !== 'number' || !Number.isInteger(id) || !method) {
    return null
  }

  const requestParamRecord = asRecord(requestParams)
  const threadId =
    readString(requestParamRecord?.threadId) ||
    readString(requestParamRecord?.thread_id) ||
    readString(requestParamRecord?.conversationId) ||
    readString(requestParamRecord?.conversation_id) ||
    globalScope
  const turnId = readString(requestParamRecord?.turnId)
  const itemId = readString(requestParamRecord?.itemId)
  const receivedAtIso = readString(row.receivedAtIso) || new Date().toISOString()

  return {
    id,
    method,
    threadId,
    turnId,
    itemId,
    receivedAtIso,
    params: requestParams ?? null,
  }
}

export function readTurnActivity(notification: RpcNotification): { threadId: string; activity: TurnActivityState } | null {
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  if (notification.method === 'turn/started') {
    return {
      threadId,
      activity: {
        label: 'Thinking',
        details: [],
      },
    }
  }

  if (notification.method === 'item/started') {
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    const itemType = sanitizeDisplayText(readString(item?.type)).toLowerCase()
    if (itemType === 'reasoning') {
      return {
        threadId,
        activity: {
          label: 'Thinking',
          details: [],
        },
      }
    }
    if (itemType === 'agentmessage') {
      return {
        threadId,
        activity: {
          label: 'Writing response',
          details: [],
        },
      }
    }
  }

  if (
    notification.method === 'item/reasoning/summaryTextDelta' ||
    notification.method === 'item/reasoning/summaryPartAdded'
  ) {
    return {
      threadId,
      activity: {
        label: 'Thinking',
        details: [],
      },
    }
  }

  if (notification.method === 'item/agentMessage/delta') {
    return {
      threadId,
      activity: {
        label: 'Writing response',
        details: [],
      },
    }
  }

  return null
}

export function readTurnStartedInfo(notification: RpcNotification): TurnStartedInfo | null {
  if (notification.method !== 'turn/started') {
    return null
  }

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId =
    readString(turnPayload?.id) ||
    readString(params.turnId) ||
    `${threadId}:unknown`
  if (!turnId) return null

  const startedAtMs =
    parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
    parseIsoTimestamp(readString(params.startedAt)) ??
    parseIsoTimestamp(notification.atIso) ??
    Date.now()

  return {
    threadId,
    turnId,
    startedAtMs,
  }
}

export function readTurnCompletedInfo(notification: RpcNotification): TurnCompletedInfo | null {
  if (notification.method !== 'turn/completed') {
    return null
  }

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId =
    readString(turnPayload?.id) ||
    readString(params.turnId) ||
    `${threadId}:unknown`
  if (!turnId) return null

  const completedAtMs =
    parseIsoTimestamp(readString(turnPayload?.completedAt)) ??
    parseIsoTimestamp(readString(params.completedAt)) ??
    parseIsoTimestamp(notification.atIso) ??
    Date.now()

  const startedAtMs =
    parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
    parseIsoTimestamp(readString(params.startedAt)) ??
    undefined

  return {
    threadId,
    turnId,
    completedAtMs,
    startedAtMs,
  }
}

export function liveReasoningMessageId(reasoningItemId: string): string {
  return `${reasoningItemId}:live-reasoning`
}

export function readReasoningStartedItemId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/started') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'reasoning') return ''
    return readString(item.id)
  }

  return ''
}

export function readReasoningDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/reasoning/summaryTextDelta') {
    const itemId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!itemId || !delta) return null
    return { messageId: liveReasoningMessageId(itemId), delta }
  }

  return null
}

export function readReasoningSectionBreakMessageId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/reasoning/summaryPartAdded') {
    const itemId = readString(params.itemId)
    if (!itemId) return ''
    return liveReasoningMessageId(itemId)
  }

  return ''
}

export function readReasoningCompletedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'reasoning') return ''
    return liveReasoningMessageId(readString(item.id))
  }

  return ''
}

export function readAgentMessageStartedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/started') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'agentMessage') return ''
    return readString(item.id)
  }

  return ''
}

export function readAgentMessageDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/agentMessage/delta') {
    const messageId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!messageId || !delta) return null
    return { messageId, delta }
  }

  return null
}

export function readAgentMessageCompleted(notification: RpcNotification): UiMessage | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'agentMessage') return null
    const id = readString(item.id)
    const text = readString(item.text)
    const turnId = readString(params.turnId)
    if (!id || !text) return null
    return {
      id,
      role: 'assistant',
      text,
      turnId,
      messageType: 'agentMessage.live',
    }
  }

  return null
}

export function isAgentContentEvent(notification: RpcNotification): boolean {
  if (notification.method === 'item/agentMessage/delta') {
    return true
  }

  const params = asRecord(notification.params)
  if (!params) return false

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    return item?.type === 'agentMessage'
  }

  return false
}
