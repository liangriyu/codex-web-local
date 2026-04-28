import type { UiMessage, UiPersistedServerRequest, UiServerRequest } from '../types/codex'

type SharedSessionOwner = 'web' | 'terminal'

type SharedSessionState = 'idle' | 'running' | 'needs_attention' | 'failed' | 'interrupted' | 'stale_owner'

type SharedTimelineEntry =
  | {
      id: string
      kind: 'user_message'
      text: string
      createdAtIso: string
    }
  | {
      id: string
      kind: 'assistant_message'
      text: string
      createdAtIso: string
    }
  | {
      id: string
      kind: 'turn_summary'
      text: string
      createdAtIso: string
      turnId: string
      status: 'running' | 'needs_attention' | 'completed' | 'failed' | 'interrupted'
    }
  | {
      id: string
      kind: 'attention'
      text: string
      createdAtIso: string
      attentionKind: 'approval' | 'attention' | 'error'
    }

type SharedSessionSnapshot = {
  sessionId: string
  sourceThreadId: string
  sourceConversationId: string | null
  title: string
  cwd: string | null
  owner: SharedSessionOwner
  ownerInstanceId: string | null
  ownerLeaseExpiresAtIso: string | null
  state: SharedSessionState
  activeTurnId: string | null
  updatedAtIso: string
  timeline: SharedTimelineEntry[]
  latestTurnSummary: {
    turnId: string
    status: 'running' | 'needs_attention' | 'completed' | 'failed' | 'interrupted'
    summary: string | null
    startedAtIso: string | null
    completedAtIso: string | null
  } | null
  attention: {
    pendingApprovalCount: number
    pendingApprovalKinds: Array<'command' | 'file_change'>
    pendingAttentionCount: number
    latestErrorMessage: string | null
    requiresReturnToOwner: boolean
  }
  capabilities: {
    canViewHistory: boolean
    canRequestTakeover: boolean
    canApproveInCurrentClient: boolean
  }
}

export type SharedSessionProjectorMessage = Pick<UiMessage, 'id' | 'role' | 'text'> & {
  createdAtIso?: string | null
}

export type SharedSessionProjectorRequest = Pick<
  UiServerRequest,
  'id' | 'method' | 'threadId' | 'turnId' | 'itemId' | 'receivedAtIso' | 'params'
>

export type SharedSessionProjectorPersistedRequest = Pick<
  UiPersistedServerRequest,
  | 'id'
  | 'method'
  | 'threadId'
  | 'turnId'
  | 'itemId'
  | 'cwd'
  | 'receivedAtIso'
  | 'resolvedAtIso'
  | 'resolutionKind'
  | 'dismissedAtIso'
  | 'dismissedReason'
  | 'dismissedBy'
  | 'params'
>

export type SharedSessionProjectorInput = {
  sessionId: string
  sourceThreadId: string
  sourceConversationId?: string | null
  title: string
  cwd?: string | null
  owner: SharedSessionOwner
  ownerInstanceId?: string | null
  ownerLeaseExpiresAtIso?: string | null
  messages: SharedSessionProjectorMessage[]
  inProgress: boolean
  activeTurnId?: string | null
  pendingServerRequests?: SharedSessionProjectorRequest[]
  persistedServerRequests?: SharedSessionProjectorPersistedRequest[]
  latestErrorMessage?: string | null
  updatedAtIso?: string
  turnStartedAtIso?: string | null
  turnCompletedAtIso?: string | null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isOwnerLeaseExpired(ownerLeaseExpiresAtIso: string | null, now = new Date()): boolean {
  const expiresAtIso = readText(ownerLeaseExpiresAtIso)
  if (!expiresAtIso) return false
  const expiresAtMs = new Date(expiresAtIso).getTime()
  if (Number.isNaN(expiresAtMs)) return false
  return expiresAtMs <= now.getTime()
}

function normalizeTimelineCreatedAt(message: SharedSessionProjectorMessage, fallbackIso: string): string {
  const createdAtIso = readText(message.createdAtIso)
  return createdAtIso || fallbackIso
}

function buildTimelineEntries(
  messages: SharedSessionProjectorMessage[],
  fallbackIso: string,
): SharedTimelineEntry[] {
  return messages
    .map((message): SharedTimelineEntry | null => {
      const text = readText(message.text)
      if (!text) return null

      if (message.role === 'user') {
        return {
          id: message.id,
          kind: 'user_message',
          text,
          createdAtIso: normalizeTimelineCreatedAt(message, fallbackIso),
        }
      }

      if (message.role === 'assistant') {
        return {
          id: message.id,
          kind: 'assistant_message',
          text,
          createdAtIso: normalizeTimelineCreatedAt(message, fallbackIso),
        }
      }

      return null
    })
    .filter((entry): entry is SharedTimelineEntry => entry !== null)
}

function normalizeApprovalKind(method: string): 'command' | 'file_change' | null {
  if (method === 'item/commandExecution/requestApproval') return 'command'
  if (method === 'item/fileChange/requestApproval') return 'file_change'
  return null
}

function isApprovalMethod(method: string): boolean {
  return normalizeApprovalKind(method) !== null
}

function isActivePersistedRequest(request: SharedSessionProjectorPersistedRequest): boolean {
  return !request.resolvedAtIso && !request.dismissedAtIso && readText(request.method).length > 0
}

function readPendingApprovalKinds(
  pendingServerRequests: SharedSessionProjectorRequest[],
  persistedServerRequests: SharedSessionProjectorPersistedRequest[],
): Array<'command' | 'file_change'> {
  const kinds: Array<'command' | 'file_change'> = []
  const seen = new Set<'command' | 'file_change'>()

  for (const request of pendingServerRequests) {
    const method = readText(request.method)
    if (!method) continue
    const kind = normalizeApprovalKind(method)
    if (!kind) continue
    if (seen.has(kind)) continue
    seen.add(kind)
    kinds.push(kind)
  }

  for (const request of persistedServerRequests.filter(isActivePersistedRequest)) {
    const kind = normalizeApprovalKind(request.method)
    if (!kind) continue
    if (seen.has(kind)) continue
    seen.add(kind)
    kinds.push(kind)
  }

  return kinds
}

function countActiveApprovals(
  pendingServerRequests: SharedSessionProjectorRequest[],
  persistedServerRequests: SharedSessionProjectorPersistedRequest[],
): number {
  const activePersistedRequests = persistedServerRequests.filter(isActivePersistedRequest)

  return pendingServerRequests.filter((request) => isApprovalMethod(readText(request.method))).length
    + activePersistedRequests.filter((request) => isApprovalMethod(request.method)).length
}

function countActiveAttentionRequests(
  pendingServerRequests: SharedSessionProjectorRequest[],
  persistedServerRequests: SharedSessionProjectorPersistedRequest[],
): number {
  const activePersistedRequests = persistedServerRequests.filter(isActivePersistedRequest)

  return pendingServerRequests.filter((request) => {
    const method = readText(request.method)
    return method.length > 0 && !isApprovalMethod(method)
  }).length
    + activePersistedRequests.filter((request) => !isApprovalMethod(request.method)).length
}

function buildState(
  inProgress: boolean,
  pendingApprovalCount: number,
  pendingAttentionCount: number,
  latestErrorMessage: string | null,
  ownerLeaseExpiresAtIso: string | null,
): SharedSessionState {
  if (latestErrorMessage) return 'failed'
  if (pendingApprovalCount > 0 || pendingAttentionCount > 0) return 'needs_attention'
  if (inProgress) return 'running'
  if (isOwnerLeaseExpired(ownerLeaseExpiresAtIso)) return 'stale_owner'
  return 'idle'
}

function buildLatestTurnSummary(
  activeTurnId: string | null,
  state: SharedSessionState,
  input: SharedSessionProjectorInput,
): SharedSessionSnapshot['latestTurnSummary'] {
  if (!activeTurnId || state === 'idle') return null

  const summaryTextByState: Record<Exclude<SharedSessionState, 'idle'>, string> = {
    running: '当前 turn 正在运行',
    needs_attention: '当前 turn 需要处理',
    failed: '当前 turn 执行失败',
    interrupted: '当前 turn 已中断',
    stale_owner: '当前 turn 需要重新接管',
  }

  const statusByState: Record<Exclude<SharedSessionState, 'idle'>, 'running' | 'completed' | 'failed' | 'interrupted'> = {
    running: 'running',
    needs_attention: 'running',
    failed: 'failed',
    interrupted: 'interrupted',
    stale_owner: 'interrupted',
  }

  const runningLikeState = state === 'running' || state === 'needs_attention'
  const completedAtIso = readText(input.turnCompletedAtIso)
  const startedAtIso = readText(input.turnStartedAtIso) || readText(input.updatedAtIso) || null

  return {
    turnId: activeTurnId,
    status: statusByState[state] ?? 'completed',
    summary: summaryTextByState[state] ?? '当前 turn 已完成',
    startedAtIso,
    completedAtIso: runningLikeState ? null : completedAtIso || null,
  }
}

function buildCapabilities(owner: SharedSessionOwner, state: SharedSessionState) {
  return {
    canViewHistory: true,
    canRequestTakeover: state === 'stale_owner',
    canApproveInCurrentClient: owner === 'web' && state !== 'stale_owner',
  }
}

export function buildSharedSessionSnapshot(input: SharedSessionProjectorInput): SharedSessionSnapshot {
  const updatedAtIso = readText(input.updatedAtIso) || new Date(0).toISOString()
  const latestErrorMessage = readText(input.latestErrorMessage) || null
  const pendingServerRequests = Array.isArray(input.pendingServerRequests) ? input.pendingServerRequests : []
  const persistedServerRequests = Array.isArray(input.persistedServerRequests) ? input.persistedServerRequests : []
  const pendingApprovalCount = countActiveApprovals(pendingServerRequests, persistedServerRequests)
  const pendingAttentionCount = countActiveAttentionRequests(pendingServerRequests, persistedServerRequests)
  const state = buildState(
    Boolean(input.inProgress),
    pendingApprovalCount,
    pendingAttentionCount,
    latestErrorMessage,
    readText(input.ownerLeaseExpiresAtIso) || null,
  )
  const activeTurnId = readText(input.activeTurnId) || null

  return {
    sessionId: readText(input.sessionId),
    sourceThreadId: readText(input.sourceThreadId),
    sourceConversationId: readText(input.sourceConversationId) || null,
    title: readText(input.title),
    cwd: readText(input.cwd) || null,
    owner: input.owner,
    ownerInstanceId: readText(input.ownerInstanceId) || null,
    ownerLeaseExpiresAtIso: readText(input.ownerLeaseExpiresAtIso) || null,
    state,
    activeTurnId,
    updatedAtIso,
    timeline: buildTimelineEntries(input.messages ?? [], updatedAtIso),
    latestTurnSummary: buildLatestTurnSummary(activeTurnId, state, {
      ...input,
      updatedAtIso,
      latestErrorMessage,
      activeTurnId,
    }),
    attention: {
      pendingApprovalCount,
      pendingApprovalKinds: readPendingApprovalKinds(pendingServerRequests, persistedServerRequests),
      pendingAttentionCount,
      latestErrorMessage,
      requiresReturnToOwner: state !== 'idle' && state !== 'running',
    },
    capabilities: buildCapabilities(input.owner, state),
  }
}
