import {
  dismissPersistedServerRequests as dismissPersistedServerRequestsRequest,
  fetchPersistedServerRequests,
  fetchRpcMethodCatalog,
  fetchRpcNotificationCatalog,
  fetchPendingServerRequests,
  fetchSharedSessionSnapshot as fetchSharedSessionSnapshotRequest,
  fetchSharedSessionSnapshots as fetchSharedSessionSnapshotsRequest,
  fetchThreadFileChangesFallback as fetchThreadFileChangesFallbackRequest,
  fetchWorkspaceDiffMode as fetchWorkspaceDiffModeRequest,
  rpcCall,
  respondServerRequest,
  subscribeRpcNotifications,
  type RpcNotification,
} from './codexRpcClient'
import type {
  ConfigReadResponse,
  GetAccountRateLimitsResponse,
  Model,
  ModelListResponse,
  ReasoningEffort,
  ReasoningEffortOption,
  ThreadListResponse,
  ThreadReadResponse,
} from './appServerDtos'
import { CodexApiError, extractErrorMessage, normalizeCodexApiError } from './codexErrors'
import {
  normalizeActiveTurnIdV2,
  normalizeLatestTurnFileChangesV2,
  normalizeThreadFileChangeTimelineV2,
  normalizeThreadGroupsV2,
  normalizeThreadInProgressV2,
  normalizeThreadMessagesV2,
} from './normalizers/v2'
import type {
  ChatMode,
  UiAccountProfile,
  UiMessage,
  UiPersistedServerRequest,
  UiProjectGroup,
  UiSharedSessionApprovalKind,
  UiSharedSessionOwner,
  UiSharedSessionSnapshot,
  UiSharedSessionState,
  UiSharedSessionTimelineEntry,
  UiThreadFileChangeTimeline,
  UiWorkspaceDirtyEntry,
  UiWorkspaceDirtyKind,
  UiWorkspaceDirtySummary,
  UiTurnFileChanges,
  UiWorkspaceBranchList,
  UiWorkspaceDiffMode,
  UiWorkspaceDiffSnapshot,
  UiWorkspaceGitStatus,
  UiWorkspacePushResult,
  UiWorkspacePushStatus,
  WorkspacePushBlockReason,
  UserInput,
} from '../types/codex'

type CurrentModelConfig = {
  model: string
  reasoningEffort: ReasoningEffort | ''
}

export type ModelReasoningSupport = {
  supported: ReasoningEffort[]
  defaultEffort: ReasoningEffort | ''
}

const EMPTY_MODEL_REASONING_SUPPORT: ModelReasoningSupport = {
  supported: [],
  defaultEffort: '',
}

const modelReasoningSupportById = new Map<string, ModelReasoningSupport>()
const PRIVATE_ACCOUNT_PROFILES_LIST_METHOD = 'web-local/account/profiles/list'
const PRIVATE_ACCOUNT_PROFILES_SWITCH_METHOD = 'web-local/account/profiles/switch'
const PRIVATE_ACCOUNT_PROFILES_ADD_METHOD = 'web-local/account/profiles/add'
const PRIVATE_ACCOUNT_PROFILES_REMOVE_METHOD = 'web-local/account/profiles/remove'

export type FilePreviewPayload = {
  path: string
  line: number | null
  content: string
}

export type AccountRateLimitSnapshot = {
  usedPercent: number
  remainingPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
  windows: Array<{
    usedPercent: number
    windowDurationMins: number | null
    resetsAt: number | null
  }>
  aiCredits: {
    hasCredits: boolean
    unlimited: boolean
    balance: string | null
  } | null
  planType: string | null
}

export type AddAccountProfileInput = {
  profileId?: string
  accountId?: string
  email?: string | null
  planType?: string | null
  accessToken: string
  chatgptAccountId?: string
  chatgptPlanType?: string | null
  expiresAtIso?: string | null
  status?: 'active' | 'inactive' | 'expired' | 'revoked'
  setActive?: boolean
}

type RpcCallOptions = {
  signal?: AbortSignal
}

type FetchJsonOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
}

const EMPTY_WORKSPACE_DIRTY_SUMMARY: UiWorkspaceDirtySummary = {
  trackedModified: 0,
  staged: 0,
  untracked: 0,
  conflicted: 0,
  renamed: 0,
  deleted: 0,
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function callRpc<T>(method: string, params?: unknown, options: RpcCallOptions = {}): Promise<T> {
  try {
    return await rpcCall<T>(method, params, options)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

async function fetchJson<T>(path: string, fallback: string, method: string, options: FetchJsonOptions = {}): Promise<T> {
  const requestMethod = options.method ?? 'GET'

  let response: Response
  try {
    response = await fetch(path, {
      method: requestMethod,
      headers: requestMethod === 'POST'
        ? { 'Content-Type': 'application/json' }
        : undefined,
      body: requestMethod === 'POST' ? JSON.stringify(options.body ?? null) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw normalizeCodexApiError(error, fallback, method)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(extractErrorMessage(payload, fallback), {
      code: 'http_error',
      method,
      status: response.status,
    })
  }

  return payload as T
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  return typeof value === 'string' && allowed.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : ''
}

function normalizeWorkspaceDirtyKind(value: unknown): UiWorkspaceDirtyKind {
  const allowed: UiWorkspaceDirtyKind[] = [
    'modified',
    'added',
    'deleted',
    'renamed',
    'untracked',
    'conflicted',
    'unknown',
  ]
  return typeof value === 'string' && allowed.includes(value as UiWorkspaceDirtyKind)
    ? (value as UiWorkspaceDirtyKind)
    : 'unknown'
}

function normalizeWorkspaceDirtySummary(value: unknown): UiWorkspaceDirtySummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_WORKSPACE_DIRTY_SUMMARY }
  }
  const row = value as Partial<UiWorkspaceDirtySummary>
  return {
    trackedModified: typeof row.trackedModified === 'number' && Number.isFinite(row.trackedModified)
      ? Math.max(0, Math.trunc(row.trackedModified))
      : 0,
    staged: typeof row.staged === 'number' && Number.isFinite(row.staged)
      ? Math.max(0, Math.trunc(row.staged))
      : 0,
    untracked: typeof row.untracked === 'number' && Number.isFinite(row.untracked)
      ? Math.max(0, Math.trunc(row.untracked))
      : 0,
    conflicted: typeof row.conflicted === 'number' && Number.isFinite(row.conflicted)
      ? Math.max(0, Math.trunc(row.conflicted))
      : 0,
    renamed: typeof row.renamed === 'number' && Number.isFinite(row.renamed)
      ? Math.max(0, Math.trunc(row.renamed))
      : 0,
    deleted: typeof row.deleted === 'number' && Number.isFinite(row.deleted)
      ? Math.max(0, Math.trunc(row.deleted))
      : 0,
  }
}

function normalizeWorkspaceDirtyEntries(value: unknown): UiWorkspaceDirtyEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const row = entry as Partial<UiWorkspaceDirtyEntry>
      const path = typeof row.path === 'string' ? row.path.trim() : ''
      if (!path) return null
      return {
        path,
        x: typeof row.x === 'string' ? row.x.trim().slice(0, 1) : '',
        y: typeof row.y === 'string' ? row.y.trim().slice(0, 1) : '',
        kind: normalizeWorkspaceDirtyKind(row.kind),
        staged: row.staged === true,
        unstaged: row.unstaged === true,
      } satisfies UiWorkspaceDirtyEntry
    })
    .filter((entry): entry is UiWorkspaceDirtyEntry => entry !== null)
}

function normalizeWorkspacePushStatus(value: unknown, cwd: string): UiWorkspacePushStatus {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<UiWorkspacePushStatus>
    : {}

  const allowedBlockedReasons: WorkspacePushBlockReason[] = [
    'not_repo',
    'workspace_dirty',
    'thread_in_progress',
    'queued_messages',
    'pending_server_requests',
    'persisted_server_requests',
    'unresolved_server_request_scope',
  ]
  const blockedReasons = Array.isArray(row.blockedReasons)
    ? row.blockedReasons
      .filter((reason): reason is WorkspacePushBlockReason =>
        typeof reason === 'string' && allowedBlockedReasons.includes(reason as WorkspacePushBlockReason),
      )
    : []

  return {
    cwd: typeof row.cwd === 'string' && row.cwd.trim().length > 0 ? row.cwd : cwd,
    isRepo: row.isRepo === true,
    currentBranch: typeof row.currentBranch === 'string' ? row.currentBranch.trim() : '',
    hasUpstream: row.hasUpstream === true,
    willSetUpstream: row.willSetUpstream === true,
    upstreamRemote: typeof row.upstreamRemote === 'string' ? row.upstreamRemote.trim() : '',
    upstreamBranch: typeof row.upstreamBranch === 'string' ? row.upstreamBranch.trim() : '',
    aheadCount: typeof row.aheadCount === 'number' && Number.isFinite(row.aheadCount) ? Math.max(0, Math.trunc(row.aheadCount)) : 0,
    behindCount: typeof row.behindCount === 'number' && Number.isFinite(row.behindCount) ? Math.max(0, Math.trunc(row.behindCount)) : 0,
    hasCommitsToPush: row.hasCommitsToPush === true,
    canPush: row.canPush === true,
    blockedReasons,
    suggestedUpstreamCommand: typeof row.suggestedUpstreamCommand === 'string' ? row.suggestedUpstreamCommand.trim() : '',
  }
}

function normalizeWorkspacePushResult(value: unknown): UiWorkspacePushResult {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<UiWorkspacePushResult>
    : {}

  return {
    ok: row.ok === true,
    currentBranch: typeof row.currentBranch === 'string' ? row.currentBranch.trim() : '',
    upstreamRemote: typeof row.upstreamRemote === 'string' ? row.upstreamRemote.trim() : '',
    upstreamBranch: typeof row.upstreamBranch === 'string' ? row.upstreamBranch.trim() : '',
    createdUpstream: row.createdUpstream === true,
    summary: typeof row.summary === 'string' ? row.summary.trim() : '',
  }
}

function normalizePersistedServerRequest(value: unknown): UiPersistedServerRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Partial<UiPersistedServerRequest>
  const id = typeof row.id === 'number' && Number.isInteger(row.id) ? row.id : null
  const method = typeof row.method === 'string' ? row.method.trim() : ''
  const receivedAtIso = typeof row.receivedAtIso === 'string' ? row.receivedAtIso : ''
  if (id === null || !method || !receivedAtIso) return null
  return {
    id,
    method,
    threadId: typeof row.threadId === 'string' ? row.threadId.trim() : '',
    turnId: typeof row.turnId === 'string' ? row.turnId.trim() : '',
    itemId: typeof row.itemId === 'string' ? row.itemId.trim() : '',
    cwd: typeof row.cwd === 'string' ? row.cwd.trim() : '',
    receivedAtIso,
    resolvedAtIso: typeof row.resolvedAtIso === 'string' && row.resolvedAtIso.trim().length > 0 ? row.resolvedAtIso : null,
    resolutionKind: typeof row.resolutionKind === 'string' && row.resolutionKind.trim().length > 0 ? row.resolutionKind : null,
    dismissedAtIso: typeof row.dismissedAtIso === 'string' && row.dismissedAtIso.trim().length > 0 ? row.dismissedAtIso : null,
    dismissedReason: typeof row.dismissedReason === 'string' && row.dismissedReason.trim().length > 0 ? row.dismissedReason : null,
    dismissedBy: row.dismissedBy === 'user' ? 'user' : null,
    params: row.params ?? null,
  }
}

function normalizeWorkspaceDiffMode(value: unknown): UiWorkspaceDiffMode {
  const allowed: UiWorkspaceDiffMode[] = ['unstaged', 'staged', 'branch', 'lastCommit', 'gitStatus']
  return typeof value === 'string' && allowed.includes(value as UiWorkspaceDiffMode)
    ? (value as UiWorkspaceDiffMode)
    : 'unstaged'
}

function normalizeSharedSessionOwner(value: unknown): UiSharedSessionOwner {
  return value === 'terminal' ? 'terminal' : 'web'
}

function normalizeSharedSessionState(value: unknown): UiSharedSessionState {
  const allowed: UiSharedSessionState[] = [
    'idle',
    'running',
    'needs_attention',
    'failed',
    'interrupted',
    'stale_owner',
  ]
  return typeof value === 'string' && allowed.includes(value as UiSharedSessionState)
    ? (value as UiSharedSessionState)
    : 'idle'
}

function normalizeSharedSessionApprovalKind(value: unknown): UiSharedSessionApprovalKind {
  const allowed: UiSharedSessionApprovalKind[] = ['command', 'file_change']
  return typeof value === 'string' && allowed.includes(value as UiSharedSessionApprovalKind)
    ? (value as UiSharedSessionApprovalKind)
    : 'file_change'
}

function readSharedSessionApprovalKind(value: unknown): UiSharedSessionApprovalKind | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeSharedSessionApprovalKind(value)
  return normalized === value ? normalized : null
}

function normalizeSharedSessionTimelineEntries(value: unknown): UiSharedSessionTimelineEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry): UiSharedSessionTimelineEntry | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const text = typeof row.text === 'string' ? row.text.trim() : ''
      const createdAtIso = typeof row.createdAtIso === 'string' ? row.createdAtIso.trim() : ''
      const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
      if (!id || !text || !createdAtIso) return null

      if (kind === 'user_message' || kind === 'assistant_message') {
        return {
          id,
          kind,
          text,
          createdAtIso,
        }
      }

      if (kind === 'turn_summary') {
        const turnId = typeof row.turnId === 'string' ? row.turnId.trim() : ''
        const status = row.status
        if (!turnId) return null
        if (status !== 'completed' && status !== 'failed' && status !== 'interrupted') return null
        return {
          id,
          kind,
          text,
          createdAtIso,
          turnId,
          status,
        }
      }

      if (kind === 'attention') {
        const attentionKind = row.attentionKind
        if (attentionKind !== 'approval' && attentionKind !== 'attention' && attentionKind !== 'error') return null
        return {
          id,
          kind,
          text,
          createdAtIso,
          attentionKind,
        }
      }

      return null
    })
    .filter((entry): entry is UiSharedSessionTimelineEntry => entry !== null)
}

function normalizeSharedSessionSnapshot(value: unknown): UiSharedSessionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : ''
  const sourceThreadId = typeof row.sourceThreadId === 'string' ? row.sourceThreadId.trim() : ''
  const updatedAtIso = typeof row.updatedAtIso === 'string' ? row.updatedAtIso.trim() : ''
  if (!sessionId || !sourceThreadId || !updatedAtIso) return null

  const title = typeof row.title === 'string' && row.title.trim().length > 0
    ? row.title.trim()
    : sessionId
  const latestTurnSummaryRow =
    row.latestTurnSummary && typeof row.latestTurnSummary === 'object' && !Array.isArray(row.latestTurnSummary)
      ? (row.latestTurnSummary as Record<string, unknown>)
      : null
  const latestTurnSummary = latestTurnSummaryRow
    ? (() => {
        const turnId = typeof latestTurnSummaryRow.turnId === 'string' ? latestTurnSummaryRow.turnId.trim() : ''
        const status = latestTurnSummaryRow.status
        if (!turnId) return null
        if (status !== 'running' && status !== 'completed' && status !== 'failed' && status !== 'interrupted') {
          return null
        }
        const normalizedStatus: 'running' | 'completed' | 'failed' | 'interrupted' = status
        return {
          turnId,
          status: normalizedStatus,
          summary: typeof latestTurnSummaryRow.summary === 'string' && latestTurnSummaryRow.summary.trim().length > 0
            ? latestTurnSummaryRow.summary.trim()
            : null,
          startedAtIso: typeof latestTurnSummaryRow.startedAtIso === 'string' && latestTurnSummaryRow.startedAtIso.trim().length > 0
            ? latestTurnSummaryRow.startedAtIso.trim()
            : null,
          completedAtIso: typeof latestTurnSummaryRow.completedAtIso === 'string' && latestTurnSummaryRow.completedAtIso.trim().length > 0
            ? latestTurnSummaryRow.completedAtIso.trim()
            : null,
        }
      })()
    : null

  const attentionRow =
    row.attention && typeof row.attention === 'object' && !Array.isArray(row.attention)
      ? (row.attention as Record<string, unknown>)
      : {}
  const capabilitiesRow =
    row.capabilities && typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
      ? (row.capabilities as Record<string, unknown>)
      : {}

  return {
    sessionId,
    sourceThreadId,
    sourceConversationId: typeof row.sourceConversationId === 'string' && row.sourceConversationId.trim().length > 0
      ? row.sourceConversationId.trim()
      : null,
    title,
    cwd: typeof row.cwd === 'string' && row.cwd.trim().length > 0 ? row.cwd.trim() : null,
    owner: normalizeSharedSessionOwner(row.owner),
    ownerInstanceId: typeof row.ownerInstanceId === 'string' && row.ownerInstanceId.trim().length > 0
      ? row.ownerInstanceId.trim()
      : null,
    ownerLeaseExpiresAtIso: typeof row.ownerLeaseExpiresAtIso === 'string' && row.ownerLeaseExpiresAtIso.trim().length > 0
      ? row.ownerLeaseExpiresAtIso.trim()
      : null,
    state: normalizeSharedSessionState(row.state),
    activeTurnId: typeof row.activeTurnId === 'string' && row.activeTurnId.trim().length > 0
      ? row.activeTurnId.trim()
      : null,
    updatedAtIso,
    timeline: normalizeSharedSessionTimelineEntries(row.timeline),
    latestTurnSummary,
    attention: {
      pendingApprovalCount:
        typeof attentionRow.pendingApprovalCount === 'number' && Number.isFinite(attentionRow.pendingApprovalCount)
          ? Math.max(0, Math.trunc(attentionRow.pendingApprovalCount))
          : 0,
      pendingApprovalKinds: Array.isArray(attentionRow.pendingApprovalKinds)
        ? attentionRow.pendingApprovalKinds
          .map((value) => readSharedSessionApprovalKind(value))
          .filter((value): value is UiSharedSessionApprovalKind => value !== null)
        : [],
      pendingAttentionCount:
        typeof attentionRow.pendingAttentionCount === 'number' && Number.isFinite(attentionRow.pendingAttentionCount)
          ? Math.max(0, Math.trunc(attentionRow.pendingAttentionCount))
          : 0,
      latestErrorMessage: typeof attentionRow.latestErrorMessage === 'string' && attentionRow.latestErrorMessage.trim().length > 0
        ? attentionRow.latestErrorMessage.trim()
        : null,
      requiresReturnToOwner: attentionRow.requiresReturnToOwner === true,
    },
    capabilities: {
      canViewHistory: capabilitiesRow.canViewHistory !== false,
      canRequestTakeover: capabilitiesRow.canRequestTakeover === true,
      canApproveInCurrentClient: capabilitiesRow.canApproveInCurrentClient === true,
    },
  }
}

function normalizeChangedFiles(value: unknown): UiWorkspaceDiffSnapshot['files'] {
  if (!Array.isArray(value)) return []
  return value
    .map((file) => {
      if (!file || typeof file !== 'object' || Array.isArray(file)) return null
      const row = file as Partial<UiWorkspaceDiffSnapshot['files'][number]>
      const path = typeof row.path === 'string' ? row.path.trim() : ''
      if (!path) return null
      return {
        path,
        additions: typeof row.additions === 'number' && Number.isFinite(row.additions) ? Math.max(0, Math.trunc(row.additions)) : 0,
        deletions: typeof row.deletions === 'number' && Number.isFinite(row.deletions) ? Math.max(0, Math.trunc(row.deletions)) : 0,
        diff: typeof row.diff === 'string' ? row.diff : '',
      }
    })
    .filter((file): file is UiWorkspaceDiffSnapshot['files'][number] => file !== null)
}

function normalizeTurnFileChangesFallback(value: unknown): UiTurnFileChanges | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Partial<UiTurnFileChanges>
  const turnId = typeof row.turnId === 'string' ? row.turnId.trim() : ''
  const files = normalizeChangedFiles(row.files)
  if (!turnId || files.length === 0) return null

  const totalAdditions = typeof row.totalAdditions === 'number' && Number.isFinite(row.totalAdditions)
    ? Math.max(0, Math.trunc(row.totalAdditions))
    : files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = typeof row.totalDeletions === 'number' && Number.isFinite(row.totalDeletions)
    ? Math.max(0, Math.trunc(row.totalDeletions))
    : files.reduce((sum, file) => sum + file.deletions, 0)

  return {
    turnId,
    files,
    totalAdditions,
    totalDeletions,
  }
}

function normalizeThreadFileChangeTimelineFallback(
  threadId: string,
  value: unknown,
): UiThreadFileChangeTimeline | null {
  const latest = normalizeTurnFileChangesFallback(value)
  if (!latest) return null
  return {
    threadId,
    records: [{
      turnId: latest.turnId,
      files: latest.files,
      totalAdditions: latest.totalAdditions,
      totalDeletions: latest.totalDeletions,
      createdAtIso: null,
      source: 'session_fallback',
      canUndo: false,
      canReapply: false,
      isLatestChangeTurn: true,
      isReverted: false,
    }],
    latestReversibleTurnId: null,
  }
}

function normalizeThreadFileChangeTimelinePayload(
  threadId: string,
  value: unknown,
): UiThreadFileChangeTimeline | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Partial<UiThreadFileChangeTimeline>
  const records = Array.isArray(row.records)
    ? row.records
      .map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return null
        const item = record as Partial<UiThreadFileChangeTimeline['records'][number]>
        const turnId = typeof item.turnId === 'string' ? item.turnId.trim() : ''
        const files = normalizeChangedFiles(item.files)
        if (!turnId || files.length === 0) return null
        const totalAdditions = typeof item.totalAdditions === 'number' && Number.isFinite(item.totalAdditions)
          ? Math.max(0, Math.trunc(item.totalAdditions))
          : files.reduce((sum, file) => sum + file.additions, 0)
        const totalDeletions = typeof item.totalDeletions === 'number' && Number.isFinite(item.totalDeletions)
          ? Math.max(0, Math.trunc(item.totalDeletions))
          : files.reduce((sum, file) => sum + file.deletions, 0)
        return {
          turnId,
          files,
          totalAdditions,
          totalDeletions,
          createdAtIso: typeof item.createdAtIso === 'string' && item.createdAtIso.trim().length > 0 ? item.createdAtIso.trim() : null,
          source: item.source === 'turn_diff' || item.source === 'thread_read' || item.source === 'session_fallback'
            ? item.source
            : 'session_fallback',
          canUndo: item.canUndo === true,
          canReapply: item.canReapply === true,
          isLatestChangeTurn: item.isLatestChangeTurn === true,
          isReverted: item.isReverted === true,
        }
      })
      .filter((record): record is UiThreadFileChangeTimeline['records'][number] => record !== null)
    : []

  if (records.length === 0) return null

  return {
    threadId,
    records,
    latestReversibleTurnId: typeof row.latestReversibleTurnId === 'string' && row.latestReversibleTurnId.trim().length > 0
      ? row.latestReversibleTurnId.trim()
      : null,
  }
}

function normalizeWorkspaceDiffSnapshot(value: unknown, fallbackCwd: string, fallbackMode: UiWorkspaceDiffMode): UiWorkspaceDiffSnapshot {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<UiWorkspaceDiffSnapshot>)
    : {}
  const files = normalizeChangedFiles(row.files)
  const totalAdditions = typeof row.totalAdditions === 'number' && Number.isFinite(row.totalAdditions)
    ? Math.max(0, Math.trunc(row.totalAdditions))
    : files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = typeof row.totalDeletions === 'number' && Number.isFinite(row.totalDeletions)
    ? Math.max(0, Math.trunc(row.totalDeletions))
    : files.reduce((sum, file) => sum + file.deletions, 0)
  return {
    mode: normalizeWorkspaceDiffMode(row.mode ?? fallbackMode),
    cwd: typeof row.cwd === 'string' && row.cwd.trim().length > 0 ? row.cwd.trim() : fallbackCwd,
    label: typeof row.label === 'string' ? row.label : '',
    baseRef: typeof row.baseRef === 'string' && row.baseRef.trim().length > 0 ? row.baseRef.trim() : null,
    targetRef: typeof row.targetRef === 'string' && row.targetRef.trim().length > 0 ? row.targetRef.trim() : null,
    warning: typeof row.warning === 'string' && row.warning.trim().length > 0 ? row.warning : null,
    files,
    totalAdditions,
    totalDeletions,
  }
}

function toModelReasoningSupport(model: Model): ModelReasoningSupport {
  const supported = Array.isArray(model.supportedReasoningEfforts)
    ? model.supportedReasoningEfforts
      .map((option: ReasoningEffortOption) => normalizeReasoningEffort(option.reasoningEffort))
      .filter((effort): effort is ReasoningEffort => effort.length > 0)
    : []

  return {
    supported: Array.from(new Set(supported)),
    defaultEffort: normalizeReasoningEffort(model.defaultReasoningEffort),
  }
}

function cloneModelReasoningSupport(
  support: ModelReasoningSupport,
): ModelReasoningSupport {
  return {
    supported: [...support.supported],
    defaultEffort: support.defaultEffort,
  }
}

export function getModelReasoningSupport(modelId: string): ModelReasoningSupport {
  const normalizedModelId = modelId.trim()
  if (!normalizedModelId) {
    return cloneModelReasoningSupport(EMPTY_MODEL_REASONING_SUPPORT)
  }
  const support = modelReasoningSupportById.get(normalizedModelId) ?? EMPTY_MODEL_REASONING_SUPPORT
  return cloneModelReasoningSupport(support)
}

async function getThreadGroupsV2(): Promise<UiProjectGroup[]> {
  const payload = await callRpc<ThreadListResponse>('thread/list', {
    archived: false,
    limit: 100,
    sortKey: 'updated_at',
  })
  return normalizeThreadGroupsV2(payload)
}

async function getThreadMessagesV2(threadId: string): Promise<UiMessage[]> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })
  return normalizeThreadMessagesV2(payload)
}

async function getThreadFileChangesFallbackV2(
  threadId: string,
  options: RpcCallOptions = {},
): Promise<UiTurnFileChanges | null> {
  try {
    const payload = await fetchThreadFileChangesFallbackRequest(threadId, options)
    return normalizeTurnFileChangesFallback(payload)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    return null
  }
}

async function getThreadConversationDataV2(
  threadId: string,
  options: RpcCallOptions = {},
): Promise<{
  messages: UiMessage[]
  fileChanges: UiTurnFileChanges | null
  fileChangeTimeline: UiThreadFileChangeTimeline | null
  inProgress: boolean
  activeTurnId: string
}> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  }, options)
  const threadReadTimeline = normalizeThreadFileChangeTimelineV2(payload)
  const threadReadFileChanges = normalizeLatestTurnFileChangesV2(payload)
  const fallbackTimeline = await fetchThreadFileChangesTimeline(threadId)
  const fileChanges = threadReadFileChanges
    ?? fallbackTimeline?.records.at(-1)
    ?? await getThreadFileChangesFallbackV2(threadId, options)
  return {
    messages: normalizeThreadMessagesV2(payload),
    fileChanges,
    fileChangeTimeline: threadReadTimeline ?? fallbackTimeline ?? normalizeThreadFileChangeTimelineFallback(threadId, fileChanges),
    inProgress: normalizeThreadInProgressV2(payload),
    activeTurnId: normalizeActiveTurnIdV2(payload),
  }
}

export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  try {
    return await getThreadGroupsV2()
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load thread groups', 'thread/list')
  }
}

export async function getThreadMessages(threadId: string): Promise<UiMessage[]> {
  try {
    return await getThreadMessagesV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getThreadConversationData(
  threadId: string,
  options: RpcCallOptions = {},
): Promise<{
  messages: UiMessage[]
  fileChanges: UiTurnFileChanges | null
  fileChangeTimeline: UiThreadFileChangeTimeline | null
  inProgress: boolean
  activeTurnId: string
}> {
  try {
    return await getThreadConversationDataV2(threadId, options)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function fetchLatestReversibleThreadFileChange(threadId: string): Promise<unknown | null> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return null
  try {
    const query = new URLSearchParams({ threadId: normalizedThreadId })
    const payload = await fetchJson<{ data?: unknown }>(
      `/codex-api/thread-file-changes/latest-reversible?${query.toString()}`,
      `Failed to read latest reversible file change for ${normalizedThreadId}`,
      'thread-file-changes/latest-reversible',
    )
    return payload?.data ?? null
  } catch (error) {
    if (error instanceof CodexApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function fetchThreadFileChangesTimeline(threadId: string): Promise<UiThreadFileChangeTimeline | null> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return null
  try {
    const query = new URLSearchParams({ threadId: normalizedThreadId })
    const payload = await fetchJson<{ data?: unknown }>(
      `/codex-api/thread-file-changes/timeline?${query.toString()}`,
      `Failed to read file change timeline for ${normalizedThreadId}`,
      'thread-file-changes/timeline',
    )
    return normalizeThreadFileChangeTimelinePayload(normalizedThreadId, payload?.data ?? null)
  } catch (error) {
    if (error instanceof CodexApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function undoLatestThreadFileChange(threadId: string): Promise<unknown> {
  const normalizedThreadId = threadId.trim()
  return fetchJson(
    '/codex-api/thread-file-changes/undo-latest',
    `Failed to undo latest file change for ${normalizedThreadId}`,
    'thread-file-changes/undo-latest',
    {
      method: 'POST',
      body: { threadId: normalizedThreadId },
    },
  )
}

export async function reapplyLatestThreadFileChange(threadId: string): Promise<unknown> {
  const normalizedThreadId = threadId.trim()
  return fetchJson(
    '/codex-api/thread-file-changes/reapply-latest',
    `Failed to reapply latest file change for ${normalizedThreadId}`,
    'thread-file-changes/reapply-latest',
    {
      method: 'POST',
      body: { threadId: normalizedThreadId },
    },
  )
}

export async function getMethodCatalog(): Promise<string[]> {
  return fetchRpcMethodCatalog()
}

export async function getNotificationCatalog(): Promise<string[]> {
  return fetchRpcNotificationCatalog()
}

export function subscribeCodexNotifications(onNotification: (value: RpcNotification) => void): () => void {
  return subscribeRpcNotifications(onNotification)
}

export type { RpcNotification }

export async function replyToServerRequest(
  id: number,
  payload: { result?: unknown; error?: { code?: number; message: string } },
): Promise<void> {
  await respondServerRequest({
    id,
    ...payload,
  })
}

export async function getPendingServerRequests(): Promise<unknown[]> {
  return fetchPendingServerRequests()
}

export async function getPersistedServerRequests(): Promise<UiPersistedServerRequest[]> {
  const rows = await fetchPersistedServerRequests()
  return rows
    .map((row) => normalizePersistedServerRequest(row))
    .filter((row): row is UiPersistedServerRequest => row !== null)
}

export async function getSharedSessionSnapshots(): Promise<UiSharedSessionSnapshot[]> {
  const rows = await fetchSharedSessionSnapshotsRequest()
  return rows
    .map((row) => normalizeSharedSessionSnapshot(row))
    .filter((row): row is UiSharedSessionSnapshot => row !== null)
}

export async function getSharedSessionSnapshot(sessionId: string): Promise<UiSharedSessionSnapshot | null> {
  const row = await fetchSharedSessionSnapshotRequest(sessionId)
  return normalizeSharedSessionSnapshot(row)
}

export async function dismissPersistedServerRequests(requestIds: number[]): Promise<number[]> {
  const normalizedRequestIds = requestIds
    .filter((value) => Number.isInteger(value))
    .map((value) => Math.trunc(value))
  if (normalizedRequestIds.length === 0) return []
  return dismissPersistedServerRequestsRequest(Array.from(new Set(normalizedRequestIds)))
}

export async function resumeThread(threadId: string): Promise<void> {
  await callRpc('thread/resume', { threadId })
}

export async function archiveThread(threadId: string): Promise<void> {
  await callRpc('thread/archive', { threadId })
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTitle = title.trim()
  if (!normalizedThreadId || !normalizedTitle) return

  await callRpc('thread/name/set', {
    threadId: normalizedThreadId,
    name: normalizedTitle,
  })
}

function normalizeThreadIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>

  const thread = record.thread
  if (thread && typeof thread === 'object') {
    const threadId = (thread as Record<string, unknown>).id
    if (typeof threadId === 'string' && threadId.length > 0) {
      return threadId
    }
  }
  return ''
}

export async function startThread(cwd?: string, model?: string): Promise<string> {
  try {
    const params: Record<string, unknown> = {}
    if (typeof cwd === 'string' && cwd.trim().length > 0) {
      params.cwd = cwd.trim()
    }
    if (typeof model === 'string' && model.trim().length > 0) {
      params.model = model.trim()
    }
    const payload = await callRpc<{ thread?: { id?: string } }>('thread/start', params)
    const threadId = normalizeThreadIdFromPayload(payload)
    if (!threadId) {
      throw new Error('thread/start did not return a thread id')
    }
    return threadId
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to start a new thread', 'thread/start')
  }
}

export async function startThreadTurn(
  threadId: string,
  input: UserInput[],
  model?: string,
  effort?: ReasoningEffort,
  mode?: ChatMode,
): Promise<void> {
  try {
    const params: Record<string, unknown> = {
      threadId,
      input,
    }
    if (typeof model === 'string' && model.length > 0) {
      params.model = model
    }
    if (typeof effort === 'string' && effort.length > 0) {
      const support = typeof model === 'string' && model.length > 0
        ? getModelReasoningSupport(model)
        : EMPTY_MODEL_REASONING_SUPPORT
      if (support.supported.includes(effort)) {
        params.effort = effort
      }
    }
    if (mode === 'plan') {
      params.sandboxPolicy = {
        type: 'readOnly',
        access: { type: 'fullAccess' },
      }
    } else {
      params.sandboxPolicy = {
        type: 'workspaceWrite',
      }
    }
    await callRpc('turn/start', params)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to start turn for thread ${threadId}`, 'turn/start')
  }
}

export async function interruptThreadTurn(threadId: string, turnId?: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTurnId = turnId?.trim() || ''
  if (!normalizedThreadId) return

  try {
    if (!normalizedTurnId) {
      throw new Error('turn/interrupt requires turnId')
    }
    await callRpc('turn/interrupt', { threadId: normalizedThreadId, turnId: normalizedTurnId })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to interrupt turn for thread ${normalizedThreadId}`, 'turn/interrupt')
  }
}

export async function setDefaultModel(model: string): Promise<void> {
  await callRpc('setDefaultModel', { model })
}

export async function getAvailableModelIds(): Promise<string[]> {
  const payload = await callRpc<ModelListResponse>('model/list', {})
  const ids: string[] = []
  modelReasoningSupportById.clear()
  for (const row of payload.data) {
    const candidate = row.id || row.model
    if (!candidate) continue
    const normalizedCandidate = candidate.trim()
    if (!normalizedCandidate || ids.includes(normalizedCandidate)) continue
    ids.push(normalizedCandidate)
    modelReasoningSupportById.set(normalizedCandidate, toModelReasoningSupport(row))
  }
  return ids
}

export async function getCurrentModelConfig(): Promise<CurrentModelConfig> {
  const payload = await callRpc<ConfigReadResponse>('config/read', {})
  const model = payload.config.model ?? ''
  const reasoningEffort = normalizeReasoningEffort(payload.config.model_reasoning_effort)
  return { model, reasoningEffort }
}

function normalizeUsedPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(Math.max(value, 0), 100)
}

type RateLimitWindowInfo = {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

function normalizeWindowDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

function normalizeResetAt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

function readWindowInfo(window: unknown): RateLimitWindowInfo | null {
  if (!window || typeof window !== 'object') return null
  const row = window as Record<string, unknown>
  const usedPercent = normalizeUsedPercent(row.usedPercent)
  if (usedPercent === null) return null
  return {
    usedPercent,
    windowDurationMins: normalizeWindowDuration(row.windowDurationMins),
    resetsAt: normalizeResetAt(row.resetsAt),
  }
}

function compareWindowDuration(first: RateLimitWindowInfo, second: RateLimitWindowInfo): number {
  const left = first.windowDurationMins ?? -1
  const right = second.windowDurationMins ?? -1
  if (left !== right) return left - right
  return first.usedPercent - second.usedPercent
}

function pickLongerWindow(snapshot: unknown): RateLimitWindowInfo | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const row = snapshot as Record<string, unknown>
  const primary = readWindowInfo(row.primary)
  const secondary = readWindowInfo(row.secondary)
  if (!primary && !secondary) return null
  if (!primary) return secondary
  if (!secondary) return primary
  return compareWindowDuration(primary, secondary) >= 0 ? primary : secondary
}

function extractAllWindows(snapshot: unknown): RateLimitWindowInfo[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const row = snapshot as Record<string, unknown>
  const windows: RateLimitWindowInfo[] = []
  const primary = readWindowInfo(row.primary)
  const secondary = readWindowInfo(row.secondary)
  if (primary) windows.push(primary)
  if (secondary) windows.push(secondary)
  windows.sort((first, second) => second.usedPercent - first.usedPercent)
  return windows
}

function readCredits(snapshot: unknown): AccountRateLimitSnapshot['aiCredits'] {
  if (!snapshot || typeof snapshot !== 'object') return null
  const credits = (snapshot as Record<string, unknown>).credits
  if (!credits || typeof credits !== 'object') return null
  const row = credits as Record<string, unknown>
  const hasCredits = typeof row.hasCredits === 'boolean' ? row.hasCredits : false
  const unlimited = typeof row.unlimited === 'boolean' ? row.unlimited : false
  const balance = typeof row.balance === 'string' ? row.balance : null
  return { hasCredits, unlimited, balance }
}

function toRateLimitSnapshot(payload: GetAccountRateLimitsResponse): AccountRateLimitSnapshot | null {
  const candidates: unknown[] = [payload.rateLimits]
  if (payload.rateLimitsByLimitId && typeof payload.rateLimitsByLimitId === 'object') {
    candidates.push(...Object.values(payload.rateLimitsByLimitId))
  }

  let bestWindow: RateLimitWindowInfo | null = null
  let bestSnapshot: unknown = null
  for (const candidate of candidates) {
    const window = pickLongerWindow(candidate)
    if (!window) continue
    if (!bestWindow || compareWindowDuration(window, bestWindow) > 0) {
      bestWindow = window
      bestSnapshot = candidate
    }
  }

  if (!bestWindow) return null
  return {
    usedPercent: bestWindow.usedPercent,
    remainingPercent: Math.max(0, 100 - bestWindow.usedPercent),
    windowDurationMins: bestWindow.windowDurationMins,
    resetsAt: bestWindow.resetsAt,
    windows: extractAllWindows(bestSnapshot),
    aiCredits: readCredits(bestSnapshot),
    planType: (bestSnapshot as Record<string, any>)?.planType || null,
  }
}

export async function getAccountRateLimitSnapshot(): Promise<AccountRateLimitSnapshot | null> {
  const payload = await callRpc<GetAccountRateLimitsResponse>('account/rateLimits/read')
  return toRateLimitSnapshot(payload)
}

function normalizeAccountProfile(value: unknown): UiAccountProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : ''
  const accountId = typeof row.accountId === 'string' ? row.accountId.trim() : ''
  if (!profileId || !accountId) return null

  return {
    profileId,
    accountId,
    provider: typeof row.provider === 'string' ? row.provider : 'chatgptAuthTokens',
    email: typeof row.email === 'string' ? row.email : null,
    planType: typeof row.planType === 'string' ? row.planType : null,
    status: typeof row.status === 'string' ? row.status : 'inactive',
    lastUsedAtIso: typeof row.lastUsedAtIso === 'string' ? row.lastUsedAtIso : null,
    tokenState: row.tokenState === 'available' ? 'available' : 'missing',
    chatgptAccountId: typeof row.chatgptAccountId === 'string' ? row.chatgptAccountId : null,
    chatgptPlanType: typeof row.chatgptPlanType === 'string' ? row.chatgptPlanType : null,
    tokenExpiresAtIso: typeof row.tokenExpiresAtIso === 'string' ? row.tokenExpiresAtIso : null,
  }
}

function normalizeAccountProfilesPayload(payload: unknown): { activeProfileId: string | null; profiles: UiAccountProfile[] } {
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
  const activeProfileId = typeof row.activeProfileId === 'string' && row.activeProfileId.trim().length > 0
    ? row.activeProfileId.trim()
    : null
  const profiles = Array.isArray(row.profiles)
    ? row.profiles
      .map((entry) => normalizeAccountProfile(entry))
      .filter((entry): entry is UiAccountProfile => entry !== null)
    : []
  return {
    activeProfileId,
    profiles,
  }
}

export async function listAccountProfiles(): Promise<{ activeProfileId: string | null; profiles: UiAccountProfile[] }> {
  const payload = await callRpc<unknown>(PRIVATE_ACCOUNT_PROFILES_LIST_METHOD, {})
  return normalizeAccountProfilesPayload(payload)
}

export async function switchAccountProfile(profileId: string): Promise<{ activeProfileId: string | null; profiles: UiAccountProfile[] }> {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) {
    throw new Error('Account profile id is required')
  }
  const payload = await callRpc<unknown>(PRIVATE_ACCOUNT_PROFILES_SWITCH_METHOD, { profileId: normalizedProfileId })
  return normalizeAccountProfilesPayload(payload)
}

export async function addAccountProfile(profile: AddAccountProfileInput): Promise<{ activeProfileId: string | null; profiles: UiAccountProfile[] }> {
  const payload = await callRpc<unknown>(PRIVATE_ACCOUNT_PROFILES_ADD_METHOD, profile)
  return normalizeAccountProfilesPayload(payload)
}

export async function removeAccountProfile(profileId: string): Promise<{ activeProfileId: string | null; profiles: UiAccountProfile[] }> {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) {
    throw new Error('Account profile id is required')
  }
  const payload = await callRpc<unknown>(PRIVATE_ACCOUNT_PROFILES_REMOVE_METHOD, { profileId: normalizedProfileId })
  return normalizeAccountProfilesPayload(payload)
}

export async function startChatgptAccountLogin(): Promise<string> {
  const payload = await callRpc<unknown>('account/login/start', {
    type: 'chatgpt',
  })
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
  const authUrl = row && typeof row.authUrl === 'string' ? row.authUrl.trim() : ''
  if (!authUrl) {
    throw new Error('account/login/start did not return authUrl')
  }
  return authUrl
}

export async function compactThreadContext(threadId: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return
  await callRpc('thread/compact/start', { threadId: normalizedThreadId })
}

export async function fetchFilePreview(path: string, line?: number | null): Promise<FilePreviewPayload> {
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    throw new Error('File path is required')
  }

  const query = new URLSearchParams({ path: normalizedPath })
  if (typeof line === 'number' && Number.isFinite(line) && line > 0) {
    query.set('line', String(Math.trunc(line)))
  }

  const response = await fetch(`/codex-api/file-preview?${query.toString()}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw normalizeCodexApiError(payload, `Failed to preview file: ${normalizedPath}`, 'file-preview')
  }

  const row = payload as Partial<FilePreviewPayload> | null
  const content = typeof row?.content === 'string' ? row.content : ''
  const resolvedPath = typeof row?.path === 'string' ? row.path : normalizedPath
  const resolvedLine = typeof row?.line === 'number' && Number.isFinite(row.line) ? Math.trunc(row.line) : null
  return {
    path: resolvedPath,
    line: resolvedLine,
    content,
  }
}

export async function fetchWorkspaceChanges(cwd: string): Promise<UiTurnFileChanges | null> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return null

  const query = new URLSearchParams({ cwd: normalizedCwd })
  const response = await fetch(`/codex-api/workspace-changes?${query.toString()}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw normalizeCodexApiError(payload, `Failed to read workspace changes for ${normalizedCwd}`, 'workspace-changes')
  }

  const row = payload as {
    files?: Array<{ path?: string; additions?: number; deletions?: number; diff?: string }>
    totalAdditions?: number
    totalDeletions?: number
  } | null

  const files = Array.isArray(row?.files)
    ? row.files
      .map((file) => ({
        path: typeof file.path === 'string' ? file.path : '',
        additions: typeof file.additions === 'number' && Number.isFinite(file.additions) ? Math.max(0, Math.trunc(file.additions)) : 0,
        deletions: typeof file.deletions === 'number' && Number.isFinite(file.deletions) ? Math.max(0, Math.trunc(file.deletions)) : 0,
        diff: typeof file.diff === 'string' ? file.diff : '',
      }))
      .filter((file) => file.path.length > 0)
    : []

  if (files.length === 0) {
    return null
  }

  const totalAdditions = typeof row?.totalAdditions === 'number' && Number.isFinite(row.totalAdditions)
    ? Math.max(0, Math.trunc(row.totalAdditions))
    : files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = typeof row?.totalDeletions === 'number' && Number.isFinite(row.totalDeletions)
    ? Math.max(0, Math.trunc(row.totalDeletions))
    : files.reduce((sum, file) => sum + file.deletions, 0)

  return {
    turnId: '__workspace__',
    files,
    totalAdditions,
    totalDeletions,
  }
}

export async function fetchWorkspaceGitStatus(cwd: string): Promise<UiWorkspaceGitStatus | null> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return null

  const query = new URLSearchParams({ cwd: normalizedCwd })
  const payload = await fetchJson<Partial<UiWorkspaceGitStatus>>(
    `/codex-api/git/status?${query.toString()}`,
    `Failed to read workspace git status for ${normalizedCwd}`,
    'git/status',
  )

  return {
    cwd: typeof payload.cwd === 'string' && payload.cwd.trim().length > 0 ? payload.cwd : normalizedCwd,
    isRepo: payload.isRepo === true,
    isDirty: payload.isDirty === true,
    currentBranch: typeof payload.currentBranch === 'string' ? payload.currentBranch.trim() : '',
    dirtySummary: normalizeWorkspaceDirtySummary(payload.dirtySummary),
    dirtyEntries: normalizeWorkspaceDirtyEntries(payload.dirtyEntries),
  }
}

export async function fetchWorkspaceBranches(cwd: string): Promise<UiWorkspaceBranchList | null> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return null

  const query = new URLSearchParams({ cwd: normalizedCwd })
  const payload = await fetchJson<Partial<UiWorkspaceBranchList>>(
    `/codex-api/git/branches?${query.toString()}`,
    `Failed to read workspace branches for ${normalizedCwd}`,
    'git/branches',
  )

  const branches = Array.isArray(payload.branches)
    ? payload.branches
      .filter((branch): branch is string => typeof branch === 'string')
      .map((branch) => branch.trim())
      .filter((branch) => branch.length > 0)
    : []

  return {
    cwd: typeof payload.cwd === 'string' && payload.cwd.trim().length > 0 ? payload.cwd : normalizedCwd,
    isRepo: payload.isRepo === true,
    currentBranch: typeof payload.currentBranch === 'string' ? payload.currentBranch.trim() : '',
    branches: Array.from(new Set(branches)),
  }
}

export async function fetchWorkspacePushStatus(cwd: string): Promise<UiWorkspacePushStatus | null> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return null

  const query = new URLSearchParams({ cwd: normalizedCwd })
  const payload = await fetchJson<unknown>(
    `/codex-api/git/push/status?${query.toString()}`,
    `Failed to read workspace push status for ${normalizedCwd}`,
    'git/push/status',
  )

  return normalizeWorkspacePushStatus(payload, normalizedCwd)
}

export async function switchWorkspaceBranch(cwd: string, branch: string): Promise<void> {
  const normalizedCwd = cwd.trim()
  const normalizedBranch = branch.trim()
  if (!normalizedCwd || !normalizedBranch) {
    throw new Error('Workspace path and branch name are required')
  }

  await fetchJson<{ ok?: boolean }>(
    '/codex-api/git/branch/switch',
    `Failed to switch workspace branch to ${normalizedBranch}`,
    'git/branch/switch',
    {
      method: 'POST',
      body: {
        cwd: normalizedCwd,
        branch: normalizedBranch,
      },
    },
  )
}

export async function createAndSwitchWorkspaceBranch(cwd: string, branch: string): Promise<void> {
  const normalizedCwd = cwd.trim()
  const normalizedBranch = branch.trim()
  if (!normalizedCwd || !normalizedBranch) {
    throw new Error('Workspace path and branch name are required')
  }

  await fetchJson<{ ok?: boolean }>(
    '/codex-api/git/branch/create-and-switch',
    `Failed to create workspace branch ${normalizedBranch}`,
    'git/branch/create-and-switch',
    {
      method: 'POST',
      body: {
        cwd: normalizedCwd,
        branch: normalizedBranch,
      },
    },
  )
}

export async function pushWorkspaceBranch(cwd: string): Promise<UiWorkspacePushResult> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) {
    throw new Error('Workspace path is required')
  }

  const payload = await fetchJson<unknown>(
    '/codex-api/git/push',
    `Failed to push workspace branch for ${normalizedCwd}`,
    'git/push',
    {
      method: 'POST',
      body: {
        cwd: normalizedCwd,
      },
    },
  )

  return normalizeWorkspacePushResult(payload)
}

export async function fetchWorkspaceFullDiff(cwd: string): Promise<string> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return ''

  const query = new URLSearchParams({ cwd: normalizedCwd })
  const response = await fetch(`/codex-api/workspace-diff?${query.toString()}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw normalizeCodexApiError(payload, `Failed to read workspace diff for ${normalizedCwd}`, 'workspace-diff')
  }

  const record = payload as Record<string, unknown> | null
  return typeof record?.diff === 'string' ? record.diff : ''
}

export async function fetchWorkspaceDiffSnapshot(
  cwd: string,
  mode: UiWorkspaceDiffMode,
  options: { baseBranch?: string | null } = {},
): Promise<UiWorkspaceDiffSnapshot | null> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return null
  const normalizedMode = normalizeWorkspaceDiffMode(mode)
  const payload = await fetchWorkspaceDiffModeRequest(normalizedCwd, normalizedMode, {
    baseBranch: options.baseBranch ?? null,
  })
  return normalizeWorkspaceDiffSnapshot(payload, normalizedCwd, normalizedMode)
}

// `thread/loaded/list` returns sessions loaded in memory, not currently running turns.
