import { computed, ref } from 'vue'
import {
  archiveThread,
  compactThreadContext,
  createAndSwitchWorkspaceBranch,
  dismissPersistedServerRequests as dismissPersistedServerRequestsRequest,
  fetchWorkspaceChanges,
  fetchWorkspaceBranches,
  fetchWorkspaceDiffSnapshot,
  fetchWorkspaceGitStatus,
  fetchWorkspacePushStatus,
  getAvailableModelIds,
  getAccountRateLimitSnapshot,
  getCurrentModelConfig,
  getModelReasoningSupport,
  getPersistedServerRequests,
  getSharedSessionSnapshots,
  getThreadConversationData,
  getPendingServerRequests,
  interruptThreadTurn,
  pushWorkspaceBranch as pushWorkspaceBranchRequest,
  replyToServerRequest,
  getThreadGroups,
  renameThread,
  resumeThread,
  switchWorkspaceBranch,
  startThread,
  subscribeCodexNotifications,
  startThreadTurn,
  type RpcNotification,
} from '../api/codexGateway'
import { CodexApiError } from '../api/codexErrors'
import type {
  ComposerSubmitPayload,
  UiRateLimitUsage,
  UiThreadContextUsage,
  ReasoningEffort,
  ChatMode,
  ThreadScrollState,
    UiLiveOverlay,
    UiMessage,
    UiPersistedServerRequest,
    UiProjectGroup,
    UiSharedSessionSnapshot,
  UiServerRequest,
  UiServerRequestReply,
  UiThread,
  UiTurnFileChanges,
  UiWorkspaceBranchState,
  UiWorkspaceDiffMode,
  UiWorkspaceDiffSnapshot,
  UiWorkspacePushStatus,
  WorkspaceBranchBlockReason,
  WorkspaceModel,
} from '../types/codex'
import { normalizeTurnDiffToFileChanges } from '../api/normalizers/v2'
import {
  loadAutoRefreshEnabled,
  isFileChangesDebugEnabled,
  loadLatestFileChangesMap,
  loadWorkspaceBaseBranchMap,
  loadProjectDisplayNames,
  loadProjectOrder,
  loadRateLimitUsage,
  loadReadStateMap,
  loadSelectedThreadId,
  loadThreadContextUsageMap,
  loadThreadScrollStateMap,
  saveAutoRefreshEnabled,
  saveLatestFileChangesMap,
  saveWorkspaceBaseBranchMap,
  saveProjectDisplayNames,
  saveProjectOrder,
  saveRateLimitUsage,
  saveReadStateMap,
  saveSelectedThreadId,
  saveThreadContextUsageMap,
  saveThreadScrollStateMap,
} from './desktop-state/storage'
import {
  areStringArraysEqual,
  flattenThreads,
  mergeProjectOrder,
  mergeThreadGroups,
  omitKey,
  orderGroupsByProjectOrder,
  pruneThreadStateMap,
  reorderStringArray,
} from './desktop-state/core-utils'
import {
  areMessageArraysEqual,
  buildQueuedMessagePreviewText,
  buildUserInputs,
  mergeMessages,
  normalizeComposerSubmitPayload,
  normalizeMessageText,
  removeRedundantLiveAgentMessages,
  upsertMessage,
} from './desktop-state/message-utils'
import {
  dequeueQueuedMessage,
  enqueueQueuedMessage,
  type QueuedMessageState,
} from './desktop-state/queue-utils'
import { isApprovalRequestMethod } from '../utils/approvalRequestDisplay'
import {
  listPersistedServerRequestsForWorkspace as listPersistedServerRequestsForWorkspaceFromMap,
  listSelectedServerRequests,
  removeServerRequestByIdFromMap,
  upsertServerRequestMap,
} from './desktop-state/server-requests'
import {
  buildFlaggedThreadGroups,
  filterPendingServerRequestsByThreadIds,
} from './desktop-state/thread-flags'
import {
  asRecord,
  extractThreadIdFromNotification,
  isAgentContentEvent,
  liveReasoningMessageId,
  normalizeServerRequest,
  readAgentMessageCompleted,
  readAgentMessageDelta,
  readAgentMessageStartedId,
  readReasoningCompletedId,
  readReasoningDelta,
  readReasoningSectionBreakMessageId,
  readReasoningStartedItemId,
  readThreadContextUsage,
  readTurnActivity,
  readTurnCompletedInfo,
  readTurnDiffUpdate,
  readTurnErrorMessage,
  readTurnStartedInfo,
  type TurnActivityState,
  type TurnCompletedInfo,
  type TurnStartedInfo,
} from './desktop-state/notification-parsers'
import {
  areTurnActivitiesEqual,
  areTurnSummariesEqual,
  clamp,
  insertTurnSummaryMessage,
  readNumber,
  sanitizeDisplayText,
  type TurnSummaryState,
} from './desktop-state/turn-display-utils'
import {
  createOptimisticThread,
  mergeOptimisticThreads as mergeOptimisticThreadGroups,
  removeMaterializedOptimisticThreads,
} from './desktop-state/optimistic-threads'
import {
  clearExpiredThreadSelectionHolds,
  consumeObservedThreadSelection,
  holdThreadSelection,
  shouldKeepMissingSelectedThread,
} from './desktop-state/selection-hold'
import { retryOrThrow, retryWithResult } from './desktop-state/retry-utils'
const EVENT_SYNC_DEBOUNCE_MS = 220
const AUTO_REFRESH_INTERVAL_MS = 4000
const THREAD_LIST_AUTO_REFRESH_INTERVAL_MS = 30000
const RATE_LIMIT_REFRESH_MIN_INTERVAL_MS = 30000
const NEW_THREAD_SELECTION_HOLD_MS = 20000
const RESUME_RETRY_ATTEMPTS = 3
const RESUME_RETRY_BASE_DELAY_MS = 900
const ARCHIVE_RETRY_ATTEMPTS = 3
const ARCHIVE_RETRY_BASE_DELAY_MS = 1200
const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const GLOBAL_SERVER_REQUEST_SCOPE = '__global__'
const TOKEN_USAGE_DEBUG_ENABLED = true
const EMPTY_WORKSPACE_DIRTY_SUMMARY = {
  trackedModified: 0,
  staged: 0,
  untracked: 0,
  conflicted: 0,
  renamed: 0,
  deleted: 0,
}
const EMPTY_WORKSPACE_DIFF_TOTALS = {
  additions: 0,
  deletions: 0,
}
const THREAD_LIST_REFRESH_METHODS = new Set([
  'thread/started',
  'thread/name/updated',
  'thread/compacted',
  'thread/archived',
  'thread/unarchived',
])

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

type TurnErrorState = {
  message: string
}

function debugTokenUsageNotification(notification: RpcNotification): void {
  if (!TOKEN_USAGE_DEBUG_ENABLED) return
  if (typeof window === 'undefined') return
  const params = notification.params
  if (!params || typeof params !== 'object' || Array.isArray(params)) return
  const row = params as Record<string, unknown>
  const hasTokenPayload =
    row.tokenUsage !== undefined ||
    row.token_usage !== undefined ||
    row.info !== undefined
  const tokenMethods = new Set(['thread/tokenUsage/updated', 'token_count', 'tokenCount'])
  if (!hasTokenPayload && !tokenMethods.has(notification.method)) return
  const threadId =
    (typeof row.threadId === 'string' ? row.threadId : '') ||
    (typeof row.thread_id === 'string' ? row.thread_id : '')
  console.debug('[token-usage]', {
    method: notification.method,
    threadId,
    params: row,
  })
}

function debugFileChangesState(action: string, payload: Record<string, unknown>): void {
  if (!isFileChangesDebugEnabled()) return
  if (typeof window === 'undefined') return
  console.debug(`[file-changes-state] ${action}`, payload)
}

function isNoRolloutError(error: unknown): error is CodexApiError {
  if (!(error instanceof CodexApiError)) return false
  if (error.status !== 502) return false
  return error.message.toLowerCase().includes('no rollout found for thread id')
}

function isResumeNoRolloutError(error: unknown): error is CodexApiError {
  if (!(error instanceof CodexApiError)) return false
  if (error.method !== 'thread/resume') return false
  return isNoRolloutError(error)
}

export function useDesktopState() {
  const projectGroups = ref<UiProjectGroup[]>([])
  const sourceGroups = ref<UiProjectGroup[]>([])
  const selectedThreadId = ref(loadSelectedThreadId())
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveAgentMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveReasoningTextByThreadId = ref<Record<string, string>>({})
  const inProgressById = ref<Record<string, boolean>>({})
  const eventUnreadByThreadId = ref<Record<string, boolean>>({})
  const availableModelIds = ref<string[]>([])
  const selectedModelId = ref('')
  const selectedReasoningEffort = ref<ReasoningEffort | ''>('medium')
  const selectedChatMode = ref<ChatMode>('act')
  const readStateByThreadId = ref<Record<string, string>>(loadReadStateMap())
  const scrollStateByThreadId = ref<Record<string, ThreadScrollState>>(loadThreadScrollStateMap())
  const projectOrder = ref<string[]>(loadProjectOrder())
  const projectDisplayNameById = ref<Record<string, string>>(loadProjectDisplayNames())
  const loadedVersionByThreadId = ref<Record<string, string>>({})
  const loadedMessagesByThreadId = ref<Record<string, boolean>>({})
  const resumedThreadById = ref<Record<string, boolean>>({})
  const turnSummaryByThreadId = ref<Record<string, TurnSummaryState>>({})
  const turnActivityByThreadId = ref<Record<string, TurnActivityState>>({})
  const turnErrorByThreadId = ref<Record<string, TurnErrorState>>({})
  const activeTurnIdByThreadId = ref<Record<string, string>>({})
  const pendingServerRequestsByThreadId = ref<Record<string, UiServerRequest[]>>({})
  const persistedServerRequestsByThreadId = ref<Record<string, UiPersistedServerRequest[]>>({})
  const sharedSessionSnapshots = ref<UiSharedSessionSnapshot[]>([])
  const latestFileChangesByThreadId = ref<Record<string, UiTurnFileChanges>>(loadLatestFileChangesMap())
  const queuedMessagesByThreadId = ref<Record<string, QueuedMessageState[]>>({})
  const contextUsageByThreadId = ref<Record<string, UiThreadContextUsage>>(loadThreadContextUsageMap())
  const rateLimitUsage = ref<UiRateLimitUsage | null>(loadRateLimitUsage())
  const compactingContextByThreadId = ref<Record<string, boolean>>({})
  const workspaceBranchStateByCwd = ref<Record<string, UiWorkspaceBranchState>>({})
  const workspaceByCwd = ref<Record<string, WorkspaceModel>>({})
  const workspaceBaseBranchByCwd = ref<Record<string, string>>(loadWorkspaceBaseBranchMap())

  const isLoadingThreads = ref(false)
  const isLoadingMessages = ref(false)
  const isSendingMessage = ref(false)
  const isInterruptingTurn = ref(false)
  const error = ref('')
  const isPolling = ref(false)
  const hasLoadedThreads = ref(false)
  const isAutoRefreshEnabled = ref(loadAutoRefreshEnabled())
  const autoRefreshSecondsLeft = ref(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000))
  let stopNotificationStream: (() => void) | null = null
  let eventSyncTimer: number | null = null
  let autoRefreshIntervalTimer: number | null = null
  let autoRefreshCountdownTimer: number | null = null
  let pendingThreadsRefresh = false
  const pendingThreadMessageRefresh = new Set<string>()
  let activeReasoningItemId = ''
  let shouldAutoScrollOnNextAgentEvent = false
  const pendingTurnStartsById = new Map<string, TurnStartedInfo>()
  let latestSelectRequestToken = 0
  let selectThreadLoadAbortController: AbortController | null = null
  let lastThreadListRefreshAtMs = 0
  let lastRateLimitRefreshAtMs = 0
  const pendingNewThreadSelectionUntilById = new Map<string, number>()
  const optimisticThreadById = new Map<string, UiThread>()

  const allThreads = computed(() => flattenThreads(projectGroups.value))
  const selectedThread = computed(() =>
    allThreads.value.find((thread) => thread.id === selectedThreadId.value) ?? null,
  )
  const selectedThreadScrollState = computed<ThreadScrollState | null>(
    () => scrollStateByThreadId.value[selectedThreadId.value] ?? null,
  )
  const selectedThreadServerRequests = computed<UiServerRequest[]>(() => {
    return listSelectedServerRequests(
      pendingServerRequestsByThreadId.value,
      selectedThreadId.value,
      GLOBAL_SERVER_REQUEST_SCOPE,
    )
  })
  const selectedThreadPersistedServerRequests = computed<UiPersistedServerRequest[]>(() => {
    const rows: UiPersistedServerRequest[] = []
    if (selectedThreadId.value && Array.isArray(persistedServerRequestsByThreadId.value[selectedThreadId.value])) {
      rows.push(...persistedServerRequestsByThreadId.value[selectedThreadId.value])
    }
    if (Array.isArray(persistedServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])) {
      rows.push(...persistedServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])
    }
    return rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
  })
  const selectedWorkspacePersistedServerRequests = computed<UiPersistedServerRequest[]>(() => {
    return selectedWorkspaceModel.value?.approvals.persisted ?? []
  })
  const globalLiveServerRequests = computed<UiServerRequest[]>(() => {
    return pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE] ?? []
  })
  const liveApprovalThreadIdSet = computed<Set<string>>(() => {
    const threadIds = new Set<string>()
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      if (threadId === GLOBAL_SERVER_REQUEST_SCOPE) continue
      if (!Array.isArray(requests) || requests.length === 0) continue
      if (requests.some((request) => isApprovalRequestMethod(request.method))) {
        threadIds.add(threadId)
      }
    }
    return threadIds
  })
  const globalPersistedServerRequests = computed<UiPersistedServerRequest[]>(() => {
    return persistedServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE] ?? []
  })
  const sharedSessionSnapshotBySessionId = computed<Record<string, UiSharedSessionSnapshot>>(() => {
    const next: Record<string, UiSharedSessionSnapshot> = {}
    for (const snapshot of sharedSessionSnapshots.value) {
      if (!snapshot.sessionId) continue
      next[snapshot.sessionId] = snapshot
    }
    return next
  })
  const sharedSessionSnapshotByThreadId = computed<Record<string, UiSharedSessionSnapshot>>(() => {
    const next: Record<string, UiSharedSessionSnapshot> = {}
    for (const snapshot of sharedSessionSnapshots.value) {
      const threadId = snapshot.sourceThreadId.trim()
      if (!threadId || next[threadId]) continue
      next[threadId] = snapshot
    }
    return next
  })
  const selectedSharedSessionSnapshot = computed<UiSharedSessionSnapshot | null>(() => {
    const threadId = selectedThreadId.value.trim()
    if (!threadId) return null
    return sharedSessionSnapshotByThreadId.value[threadId]
      ?? sharedSessionSnapshotBySessionId.value[threadId]
      ?? null
  })
  const selectedThreadFileChanges = computed<UiTurnFileChanges | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null
    return latestFileChangesByThreadId.value[threadId] ?? null
  })
  const selectedThreadContextUsage = computed<UiThreadContextUsage | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null
    return contextUsageByThreadId.value[threadId] ?? null
  })
  const selectedThreadRateLimitUsage = computed<UiRateLimitUsage | null>(() => rateLimitUsage.value)
  const selectedQueuedMessages = computed<QueuedMessageState[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []
    return queuedMessagesByThreadId.value[threadId] ?? []
  })
  function getWorkspaceModelForCwd(cwd: string): WorkspaceModel | null {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return null
    const current = workspaceByCwd.value[normalizedCwd]
    if (current) return current
    const loadingModel = createWorkspaceModel(normalizedCwd)
    return {
      ...loadingModel,
      branch: {
        ...loadingModel.branch,
        isLoading: true,
      },
    }
  }

  function getWorkspaceBranchStateForCwd(cwd: string): UiWorkspaceBranchState | null {
    const workspace = getWorkspaceModelForCwd(cwd)
    if (!workspace) return null
    return workspaceBranchStateFromModel(workspace)
  }

  const selectedWorkspaceModel = computed<WorkspaceModel | null>(() => {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    return getWorkspaceModelForCwd(cwd)
  })
  const selectedWorkspaceBranchState = computed<UiWorkspaceBranchState | null>(() => {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    return getWorkspaceBranchStateForCwd(cwd)
  })
  const selectedWorkspaceDiffTotals = computed(() => ({
    additions: selectedWorkspaceModel.value?.diff.totalAdditions ?? 0,
    deletions: selectedWorkspaceModel.value?.diff.totalDeletions ?? 0,
  }))
  const isCompactingSelectedThreadContext = computed<boolean>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return false
    return compactingContextByThreadId.value[threadId] === true
  })
  const selectedLiveOverlay = computed<UiLiveOverlay | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null

    const activity = turnActivityByThreadId.value[threadId]
    const reasoningText = (liveReasoningTextByThreadId.value[threadId] ?? '').trim()
    const errorText = (turnErrorByThreadId.value[threadId]?.message ?? '').trim()

    if (!activity && !reasoningText && !errorText) return null
    return {
      activityLabel: activity?.label || 'Thinking',
      activityDetails: activity?.details ?? [],
      reasoningText,
      errorText,
    }
  })
  const messages = computed<UiMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const liveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
    const combined = persisted === liveAgent ? persisted : [...persisted, ...liveAgent]

    const summary = turnSummaryByThreadId.value[threadId]
    if (!summary) return combined
    return insertTurnSummaryMessage(combined, summary)
  })

  function setSelectedThreadId(nextThreadId: string): void {
    if (selectedThreadId.value === nextThreadId) return
    selectedThreadId.value = nextThreadId
    saveSelectedThreadId(nextThreadId)
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
  }

  function holdNewThreadSelection(threadId: string): void {
    holdThreadSelection(
      pendingNewThreadSelectionUntilById,
      threadId,
      NEW_THREAD_SELECTION_HOLD_MS,
    )
  }

  function addOptimisticThread(threadId: string, cwd: string, text: string): void {
    if (!threadId) return
    const optimisticThread = createOptimisticThread(threadId, cwd, text)
    optimisticThreadById.set(threadId, optimisticThread)

    if (optimisticThread.projectName && !projectOrder.value.includes(optimisticThread.projectName)) {
      projectOrder.value = [...projectOrder.value, optimisticThread.projectName]
      saveProjectOrder(projectOrder.value)
    }

    sourceGroups.value = mergeThreadGroups(
      sourceGroups.value,
      mergeOptimisticThreadGroups(sourceGroups.value, optimisticThreadById.values()),
    )
    applyThreadFlags()
  }

  async function resumeThreadWithRetry(threadId: string): Promise<boolean> {
    return retryWithResult(
      () => resumeThread(threadId),
      {
        attempts: RESUME_RETRY_ATTEMPTS,
        baseDelayMs: RESUME_RETRY_BASE_DELAY_MS,
        shouldRetry: isResumeNoRolloutError,
      },
    )
  }

  async function archiveThreadWithRetry(threadId: string): Promise<void> {
    await retryOrThrow(
      () => archiveThread(threadId),
      {
        attempts: ARCHIVE_RETRY_ATTEMPTS,
        baseDelayMs: ARCHIVE_RETRY_BASE_DELAY_MS,
        shouldRetry: isNoRolloutError,
      },
    )
    optimisticThreadById.delete(threadId)
  }

  function setSelectedModelId(modelId: string): void {
    selectedModelId.value = modelId.trim()
    normalizeReasoningEffortForModel(selectedModelId.value)
  }

  function setSelectedReasoningEffort(effort: ReasoningEffort | ''): void {
    if (effort && !REASONING_EFFORT_OPTIONS.includes(effort)) {
      return
    }
    selectedReasoningEffort.value = effort
  }

  function normalizeReasoningEffortForModel(modelId: string): void {
    const support = getModelReasoningSupport(modelId)
    if (support.supported.length === 0) {
      return
    }

    const current = selectedReasoningEffort.value
    if (current && support.supported.includes(current)) {
      return
    }

    if (support.defaultEffort && support.supported.includes(support.defaultEffort)) {
      selectedReasoningEffort.value = support.defaultEffort
      return
    }

    selectedReasoningEffort.value = support.supported[0] ?? ''
  }
  
  function setSelectedChatMode(mode: ChatMode): void {
    selectedChatMode.value = mode
  }

  function createWorkspaceBranchState(cwd: string): UiWorkspaceBranchState {
    return {
      cwd,
      isRepo: false,
      isDirty: false,
      currentBranch: '',
      branches: [],
      dirtySummary: { ...EMPTY_WORKSPACE_DIRTY_SUMMARY },
      dirtyEntries: [],
      isLoading: false,
      isSwitching: false,
      blockedReasons: [],
    }
  }

  function createWorkspacePushState(): WorkspaceModel['push'] {
    return {
      status: null,
      isLoading: false,
      isPushing: false,
      lastResult: null,
      lastError: null,
    }
  }

  function createWorkspaceModel(cwd: string): WorkspaceModel {
    return {
      cwd,
      branch: {
        isRepo: false,
        currentBranch: '',
        branches: [],
        baseBranch: workspaceBaseBranchByCwd.value[cwd] ?? null,
        isDetachedHead: false,
        isLoading: false,
        isSwitching: false,
      },
      guard: {
        blockedReasons: [],
        livePendingRequestCount: 0,
        persistedPendingRequestCount: 0,
        queuedMessageCount: 0,
        inProgressThreadCount: 0,
      },
      gitStatus: {
        isDirty: false,
        summary: { ...EMPTY_WORKSPACE_DIRTY_SUMMARY },
        entries: [],
        fetchedAt: null,
      },
      push: createWorkspacePushState(),
      diff: {
        selectedMode: 'unstaged',
        snapshots: {},
        isLoadingByMode: {},
        totalAdditions: EMPTY_WORKSPACE_DIFF_TOTALS.additions,
        totalDeletions: EMPTY_WORKSPACE_DIFF_TOTALS.deletions,
      },
      approvals: {
        live: [],
        persisted: [],
      },
      ui: {
        selectedPath: null,
        expandedPaths: [],
        lastOpenedAt: null,
      },
    }
  }

  function upsertWorkspaceModel(cwd: string, updater: (current: WorkspaceModel) => WorkspaceModel): void {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    const current = workspaceByCwd.value[normalizedCwd] ?? createWorkspaceModel(normalizedCwd)
    workspaceByCwd.value = {
      ...workspaceByCwd.value,
      [normalizedCwd]: updater(current),
    }
  }

  function workspaceBranchStateFromModel(workspace: WorkspaceModel): UiWorkspaceBranchState {
    return {
      cwd: workspace.cwd,
      isRepo: workspace.branch.isRepo,
      isDirty: workspace.gitStatus.isDirty,
      currentBranch: workspace.branch.currentBranch,
      branches: workspace.branch.branches,
      dirtySummary: workspace.gitStatus.summary ?? { ...EMPTY_WORKSPACE_DIRTY_SUMMARY },
      dirtyEntries: workspace.gitStatus.entries,
      isLoading: workspace.branch.isLoading,
      isSwitching: workspace.branch.isSwitching,
      blockedReasons: workspace.guard.blockedReasons,
    }
  }

  function upsertWorkspaceBranchState(cwd: string, updater: (current: UiWorkspaceBranchState) => UiWorkspaceBranchState): void {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    const current = workspaceBranchStateByCwd.value[normalizedCwd] ?? createWorkspaceBranchState(normalizedCwd)
    workspaceBranchStateByCwd.value = {
      ...workspaceBranchStateByCwd.value,
      [normalizedCwd]: updater(current),
    }
  }

  function hasInProgressThreadsInWorkspace(cwd: string): boolean {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return false
    return allThreads.value.some((thread) =>
      thread.cwd.trim() === normalizedCwd && inProgressById.value[thread.id] === true,
    )
  }

  function hasQueuedMessagesInWorkspace(cwd: string): boolean {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return false
    return allThreads.value.some((thread) => {
      if (thread.cwd.trim() !== normalizedCwd) return false
      const queued = queuedMessagesByThreadId.value[thread.id] ?? []
      return queued.length > 0
    })
  }

  function hasPendingServerRequestsInWorkspace(cwd: string): boolean {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return false
    return allThreads.value.some((thread) => {
      if (thread.cwd.trim() !== normalizedCwd) return false
      const requests = pendingServerRequestsByThreadId.value[thread.id] ?? []
      return requests.length > 0
    })
  }

  function countLiveServerRequestsInWorkspace(cwd: string): number {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return 0
    let count = 0
    for (const thread of allThreads.value) {
      if (thread.cwd.trim() !== normalizedCwd) continue
      count += pendingServerRequestsByThreadId.value[thread.id]?.length ?? 0
    }
    return count
  }

  function getThreadCwdById(threadId: string): string {
    if (!threadId) return ''
    const thread = allThreads.value.find((row) => row.id === threadId)
    return thread?.cwd?.trim() ?? ''
  }

  function hasPersistedServerRequestsInWorkspace(cwd: string): boolean {
    return listPersistedServerRequestsForWorkspace(cwd).length > 0
  }

  function listPersistedServerRequestsForWorkspace(cwd: string): UiPersistedServerRequest[] {
    return listPersistedServerRequestsForWorkspaceFromMap(
      persistedServerRequestsByThreadId.value,
      cwd,
      getThreadCwdById,
    )
  }

  function listLiveServerRequestsForWorkspace(cwd: string): UiServerRequest[] {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return []
    const matches: UiServerRequest[] = []
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      if (threadId === GLOBAL_SERVER_REQUEST_SCOPE || requests.length === 0) continue
      const mappedCwd = getThreadCwdById(threadId)
      if (mappedCwd === normalizedCwd) {
        matches.push(...requests)
      }
    }
    return matches.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
  }

  function computeWorkspaceBranchBlockedReasons(
    cwd: string,
    state: Pick<UiWorkspaceBranchState, 'isRepo' | 'isDirty'>,
  ): WorkspaceBranchBlockReason[] {
    const reasons: WorkspaceBranchBlockReason[] = []
    if (!state.isRepo) reasons.push('not_repo')
    if (state.isDirty) reasons.push('workspace_dirty')
    if (hasInProgressThreadsInWorkspace(cwd)) reasons.push('thread_in_progress')
    if (hasQueuedMessagesInWorkspace(cwd)) reasons.push('queued_messages')
    if (hasPendingServerRequestsInWorkspace(cwd)) reasons.push('pending_server_requests')
    if (hasPersistedServerRequestsInWorkspace(cwd)) reasons.push('persisted_server_requests')
    return reasons
  }

  function computeWorkspaceGuardState(cwd: string, state: Pick<UiWorkspaceBranchState, 'isRepo' | 'isDirty'>) {
    const livePendingRequestCount = countLiveServerRequestsInWorkspace(cwd)
    const persistedPendingRequestCount = listPersistedServerRequestsForWorkspace(cwd).length
    const queuedMessageCount = allThreads.value.reduce((total, thread) => {
      if (thread.cwd.trim() !== cwd.trim()) return total
      return total + (queuedMessagesByThreadId.value[thread.id]?.length ?? 0)
    }, 0)
    const inProgressThreadCount = allThreads.value.reduce((total, thread) => {
      if (thread.cwd.trim() !== cwd.trim()) return total
      return total + (inProgressById.value[thread.id] === true ? 1 : 0)
    }, 0)
    return {
      blockedReasons: computeWorkspaceBranchBlockedReasons(cwd, state),
      livePendingRequestCount,
      persistedPendingRequestCount,
      queuedMessageCount,
      inProgressThreadCount,
    }
  }

  function syncWorkspaceModelForCwd(cwd: string): void {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    const branchState = workspaceBranchStateByCwd.value[normalizedCwd] ?? createWorkspaceBranchState(normalizedCwd)
    const guard = computeWorkspaceGuardState(normalizedCwd, branchState)
    const liveRequests = listLiveServerRequestsForWorkspace(normalizedCwd)
    const persistedRequests = listPersistedServerRequestsForWorkspace(normalizedCwd)

    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      branch: {
        ...current.branch,
        isRepo: branchState.isRepo,
        currentBranch: branchState.currentBranch,
        branches: branchState.branches,
        baseBranch: workspaceBaseBranchByCwd.value[normalizedCwd] ?? current.branch.baseBranch,
        isLoading: branchState.isLoading,
        isSwitching: branchState.isSwitching,
      },
      guard,
      gitStatus: {
        isDirty: branchState.isDirty,
        summary: branchState.dirtySummary,
        entries: branchState.dirtyEntries,
        fetchedAt: new Date().toISOString(),
      },
      approvals: {
        live: liveRequests,
        persisted: persistedRequests,
      },
    }))
  }

  function syncWorkspaceModelsForKnownCwds(): void {
    const cwdSet = new Set<string>(Object.keys(workspaceByCwd.value))
    for (const cwd of Object.keys(workspaceBranchStateByCwd.value)) {
      if (cwd.trim()) cwdSet.add(cwd.trim())
    }
    for (const thread of allThreads.value) {
      const cwd = thread.cwd.trim()
      if (cwd) cwdSet.add(cwd)
    }
    for (const cwd of cwdSet) {
      syncWorkspaceModelForCwd(cwd)
    }
  }

  function syncWorkspaceBranchBlockedReasons(): void {
    const cwdSet = new Set<string>(Object.keys(workspaceBranchStateByCwd.value))
    for (const thread of allThreads.value) {
      const cwd = thread.cwd.trim()
      if (cwd) cwdSet.add(cwd)
    }

    if (cwdSet.size === 0) return

    const nextStateByCwd: Record<string, UiWorkspaceBranchState> = {
      ...workspaceBranchStateByCwd.value,
    }
    for (const cwd of cwdSet) {
      const current = nextStateByCwd[cwd] ?? createWorkspaceBranchState(cwd)
      nextStateByCwd[cwd] = {
        ...current,
        blockedReasons: computeWorkspaceBranchBlockedReasons(cwd, current),
      }
    }
    workspaceBranchStateByCwd.value = nextStateByCwd
    syncWorkspaceModelsForKnownCwds()
  }

  async function refreshWorkspaceBranchState(
    cwd: string,
    options: { includeBranches?: boolean; silent?: boolean } = {},
  ): Promise<UiWorkspaceBranchState | null> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return null

    const includeBranches = options.includeBranches ?? true
    const silent = options.silent ?? false
    upsertWorkspaceBranchState(normalizedCwd, (current) => ({
      ...current,
      isLoading: true,
    }))

    try {
      const [status, branchList] = await Promise.all([
        fetchWorkspaceGitStatus(normalizedCwd),
        includeBranches ? fetchWorkspaceBranches(normalizedCwd) : Promise.resolve(null),
      ])

      const nextState: UiWorkspaceBranchState = {
        cwd: normalizedCwd,
        isRepo: status?.isRepo === true,
        isDirty: status?.isDirty === true,
        currentBranch: status?.currentBranch ?? branchList?.currentBranch ?? '',
        branches: branchList?.branches ?? (workspaceBranchStateByCwd.value[normalizedCwd]?.branches ?? []),
        dirtySummary: status?.dirtySummary ?? { ...EMPTY_WORKSPACE_DIRTY_SUMMARY },
        dirtyEntries: status?.dirtyEntries ?? [],
        isLoading: false,
        isSwitching: workspaceBranchStateByCwd.value[normalizedCwd]?.isSwitching === true,
        blockedReasons: [],
      }
      nextState.blockedReasons = computeWorkspaceBranchBlockedReasons(normalizedCwd, nextState)
      upsertWorkspaceBranchState(normalizedCwd, () => nextState)
      syncWorkspaceModelForCwd(normalizedCwd)
      return nextState
    } catch (unknownError) {
      upsertWorkspaceBranchState(normalizedCwd, (current) => ({
        ...current,
        isLoading: false,
      }))
      if (!silent) {
        error.value = unknownError instanceof Error ? unknownError.message : 'Failed to load workspace branches'
      }
      return null
    }
  }

  async function refreshSelectedWorkspaceBranchState(
    options: { includeBranches?: boolean; silent?: boolean } = {},
  ): Promise<UiWorkspaceBranchState | null> {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    if (!cwd) return null
    return refreshWorkspaceBranchState(cwd, options)
  }

  async function refreshWorkspaceBranchStateForCwd(
    cwd: string,
    options: { includeBranches?: boolean; silent?: boolean } = {},
  ): Promise<UiWorkspaceBranchState | null> {
    return refreshWorkspaceBranchState(cwd, options)
  }

  async function refreshWorkspacePushStatus(
    cwd: string,
    options: { silent?: boolean } = {},
  ): Promise<UiWorkspacePushStatus | null> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return null

    const silent = options.silent ?? false
    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      push: {
        ...current.push,
        isLoading: true,
      },
    }))

    try {
      const status = await fetchWorkspacePushStatus(normalizedCwd)
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        push: {
          ...current.push,
          status,
          isLoading: false,
          lastError: null,
        },
      }))
      return status
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Failed to load workspace push status'
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        push: {
          ...current.push,
          isLoading: false,
          lastError: message,
        },
      }))
      if (!silent) {
        error.value = message
      }
      return null
    }
  }

  async function refreshSelectedWorkspacePushStatus(
    options: { silent?: boolean } = {},
  ): Promise<UiWorkspacePushStatus | null> {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    if (!cwd) return null
    return refreshWorkspacePushStatus(cwd, options)
  }

  async function refreshWorkspacePushStatusForCwd(
    cwd: string,
    options: { silent?: boolean } = {},
  ): Promise<UiWorkspacePushStatus | null> {
    return refreshWorkspacePushStatus(cwd, options)
  }

  async function runWorkspacePushActionForCwd(cwd: string, fallbackMessage: string): Promise<boolean> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return false

    await refreshWorkspacePushStatus(normalizedCwd, { silent: true })
    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      push: {
        ...current.push,
        isPushing: true,
        lastError: null,
      },
    }))

    try {
      const result = await pushWorkspaceBranchRequest(normalizedCwd)
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        push: {
          ...current.push,
          lastResult: result,
          lastError: null,
        },
      }))
      await refreshWorkspacePushStatus(normalizedCwd, { silent: true })
      return true
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : fallbackMessage
      error.value = message
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        push: {
          ...current.push,
          lastError: message,
        },
      }))
      await refreshWorkspacePushStatus(normalizedCwd, { silent: true })
      return false
    } finally {
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        push: {
          ...current.push,
          isPushing: false,
        },
      }))
    }
  }

  async function pushSelectedWorkspaceBranch(): Promise<boolean> {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    if (!cwd) return false
    return runWorkspacePushActionForCwd(cwd, '当前工作区暂时不能推送到远端')
  }

  async function pushWorkspaceBranchForCwd(cwd: string): Promise<boolean> {
    return runWorkspacePushActionForCwd(cwd, '当前工作区暂时不能推送到远端')
  }

  async function refreshWorkspaceDiffTotals(cwd: string): Promise<{ additions: number; deletions: number }> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return { ...EMPTY_WORKSPACE_DIFF_TOTALS }
    try {
      const changes = await fetchWorkspaceChanges(normalizedCwd)
      const nextTotals = changes
        ? {
            additions: changes.totalAdditions,
            deletions: changes.totalDeletions,
          }
        : { ...EMPTY_WORKSPACE_DIFF_TOTALS }
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        diff: {
          ...current.diff,
          totalAdditions: nextTotals.additions,
          totalDeletions: nextTotals.deletions,
        },
      }))
      return nextTotals
    } catch {
      const emptyTotals = { ...EMPTY_WORKSPACE_DIFF_TOTALS }
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        diff: {
          ...current.diff,
          totalAdditions: emptyTotals.additions,
          totalDeletions: emptyTotals.deletions,
        },
      }))
      return emptyTotals
    }
  }

  async function refreshSelectedWorkspaceDiffTotals(): Promise<{ additions: number; deletions: number }> {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    if (!cwd) return { ...EMPTY_WORKSPACE_DIFF_TOTALS }
    return refreshWorkspaceDiffTotals(cwd)
  }

  function setWorkspaceDiffMode(cwd: string, mode: UiWorkspaceDiffMode): void {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      diff: {
        ...current.diff,
        selectedMode: mode,
      },
      ui: {
        ...current.ui,
        lastOpenedAt: new Date().toISOString(),
      },
    }))
  }

  function setWorkspaceBaseBranch(cwd: string, branch: string | null): void {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    const normalizedBranch = branch?.trim() ?? ''

    if (normalizedBranch) {
      workspaceBaseBranchByCwd.value = {
        ...workspaceBaseBranchByCwd.value,
        [normalizedCwd]: normalizedBranch,
      }
    } else if (workspaceBaseBranchByCwd.value[normalizedCwd]) {
      workspaceBaseBranchByCwd.value = omitKey(workspaceBaseBranchByCwd.value, normalizedCwd)
    }
    saveWorkspaceBaseBranchMap(workspaceBaseBranchByCwd.value)

    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      branch: {
        ...current.branch,
        baseBranch: normalizedBranch || null,
      },
    }))
  }

  async function fetchWorkspaceDiffSnapshotForMode(
    cwd: string,
    mode: UiWorkspaceDiffMode,
  ): Promise<UiWorkspaceDiffSnapshot> {
    const normalizedCwd = cwd.trim()
    const fallbackSnapshot: UiWorkspaceDiffSnapshot = {
      mode,
      cwd: normalizedCwd,
      label: '',
      baseRef: null,
      targetRef: null,
      warning: null,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    }
    if (!normalizedCwd) return fallbackSnapshot

    upsertWorkspaceModel(normalizedCwd, (current) => ({
      ...current,
      diff: {
        ...current.diff,
        isLoadingByMode: {
          ...current.diff.isLoadingByMode,
          [mode]: true,
        },
      },
    }))

    try {
      const baseBranch =
        mode === 'branch'
          ? (workspaceBaseBranchByCwd.value[normalizedCwd] ?? workspaceByCwd.value[normalizedCwd]?.branch.baseBranch ?? null)
          : null
      const snapshot = await fetchWorkspaceDiffSnapshot(normalizedCwd, mode, { baseBranch })
      const normalizedSnapshot = snapshot ?? fallbackSnapshot
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        diff: {
          ...current.diff,
          selectedMode: normalizedSnapshot.mode,
          snapshots: {
            ...current.diff.snapshots,
            [normalizedSnapshot.mode]: normalizedSnapshot,
          },
          isLoadingByMode: {
            ...current.diff.isLoadingByMode,
            [mode]: false,
          },
        },
        ui: {
          ...current.ui,
          lastOpenedAt: new Date().toISOString(),
        },
      }))
      return normalizedSnapshot
    } catch {
      upsertWorkspaceModel(normalizedCwd, (current) => ({
        ...current,
        diff: {
          ...current.diff,
          isLoadingByMode: {
            ...current.diff.isLoadingByMode,
            [mode]: false,
          },
        },
      }))
      return fallbackSnapshot
    }
  }

  async function openPreferredWorkspaceDiffSnapshot(cwd: string): Promise<UiWorkspaceDiffSnapshot | null> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return null
    const preferredMode = workspaceByCwd.value[normalizedCwd]?.diff.selectedMode ?? 'unstaged'
    if (preferredMode !== 'unstaged') {
      return fetchWorkspaceDiffSnapshotForMode(normalizedCwd, preferredMode)
    }

    const unstagedSnapshot = await fetchWorkspaceDiffSnapshotForMode(normalizedCwd, 'unstaged')
    if (unstagedSnapshot.files.length > 0 || unstagedSnapshot.warning) {
      return unstagedSnapshot
    }

    const stagedSnapshot = await fetchWorkspaceDiffSnapshotForMode(normalizedCwd, 'staged')
    if (stagedSnapshot.files.length > 0) {
      return stagedSnapshot
    }

    return unstagedSnapshot
  }

  async function runWorkspaceBranchActionForCwd(
    cwd: string,
    action: (cwd: string) => Promise<void>,
    fallbackMessage: string,
  ): Promise<boolean> {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return false

    const currentState = await refreshWorkspaceBranchState(normalizedCwd, { includeBranches: true, silent: true })
    if (!currentState) return false
    if (currentState.blockedReasons.length > 0) {
      error.value = fallbackMessage
      return false
    }

    upsertWorkspaceBranchState(normalizedCwd, (current) => ({
      ...current,
      isSwitching: true,
    }))

    try {
      await action(normalizedCwd)
      await loadThreads()
      if (selectedThreadId.value) {
        await loadMessages(selectedThreadId.value, { silent: true })
      }
      await refreshWorkspaceBranchState(normalizedCwd, { includeBranches: true, silent: true })
      await refreshWorkspacePushStatus(normalizedCwd, { silent: true })
      return true
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : fallbackMessage
      return false
    } finally {
      upsertWorkspaceBranchState(normalizedCwd, (current) => ({
        ...current,
        isSwitching: false,
        blockedReasons: computeWorkspaceBranchBlockedReasons(normalizedCwd, current),
      }))
    }
  }

  async function runSelectedWorkspaceBranchAction(
    action: (cwd: string) => Promise<void>,
    fallbackMessage: string,
  ): Promise<boolean> {
    const cwd = selectedThread.value?.cwd?.trim() ?? ''
    if (!cwd) return false
    return runWorkspaceBranchActionForCwd(cwd, action, fallbackMessage)
  }

  async function switchSelectedWorkspaceBranch(targetBranch: string): Promise<boolean> {
    const normalizedBranch = targetBranch.trim()
    if (!normalizedBranch) return false
    return runSelectedWorkspaceBranchAction(
      (cwd) => switchWorkspaceBranch(cwd, normalizedBranch),
      '当前工作区暂时不能切换分支',
    )
  }

  async function createAndSwitchSelectedWorkspaceBranch(targetBranch: string): Promise<boolean> {
    const normalizedBranch = targetBranch.trim()
    if (!normalizedBranch) return false
    return runSelectedWorkspaceBranchAction(
      (cwd) => createAndSwitchWorkspaceBranch(cwd, normalizedBranch),
      '当前工作区暂时不能创建分支',
    )
  }

  async function switchWorkspaceBranchForCwd(cwd: string, targetBranch: string): Promise<boolean> {
    const normalizedBranch = targetBranch.trim()
    if (!normalizedBranch) return false
    return runWorkspaceBranchActionForCwd(
      cwd,
      (targetCwd) => switchWorkspaceBranch(targetCwd, normalizedBranch),
      '当前工作区暂时不能切换分支',
    )
  }

  async function createAndSwitchWorkspaceBranchForCwd(cwd: string, targetBranch: string): Promise<boolean> {
    const normalizedBranch = targetBranch.trim()
    if (!normalizedBranch) return false
    return runWorkspaceBranchActionForCwd(
      cwd,
      (targetCwd) => createAndSwitchWorkspaceBranch(targetCwd, normalizedBranch),
      '当前工作区暂时不能创建分支',
    )
  }
  
  function buildPendingTurnDetails(): string[] {
    return []
  }

  async function dispatchNextQueuedMessage(threadId: string): Promise<void> {
    if (!threadId) return
    if (isSendingMessage.value) return
    if (inProgressById.value[threadId] === true) return
    const dequeueResult = dequeueQueuedMessage(queuedMessagesByThreadId.value, threadId)
    queuedMessagesByThreadId.value = dequeueResult.nextStateByThreadId
    const nextMessage = dequeueResult.message
    if (!nextMessage) return

    isSendingMessage.value = true
    error.value = ''
    shouldAutoScrollOnNextAgentEvent = selectedThreadId.value === threadId
    setTurnSummaryForThread(threadId, null)
    setTurnActivityForThread(
      threadId,
      { label: 'Thinking', details: buildPendingTurnDetails() },
    )
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)

    try {
      await startTurnForThread(threadId, nextMessage.payload)
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    } finally {
      isSendingMessage.value = false
    }
  }

  async function refreshModelPreferences(): Promise<void> {
    try {
      const [modelIds, currentConfig] = await Promise.all([
        getAvailableModelIds(),
        getCurrentModelConfig(),
      ])

      availableModelIds.value = modelIds

      const hasSelectedModel = selectedModelId.value.length > 0 && modelIds.includes(selectedModelId.value)
      if (!hasSelectedModel) {
        if (currentConfig.model && modelIds.includes(currentConfig.model)) {
          selectedModelId.value = currentConfig.model
        } else if (modelIds.length > 0) {
          selectedModelId.value = modelIds[0]
        } else {
          selectedModelId.value = ''
        }
      }

      if (
        currentConfig.reasoningEffort &&
        REASONING_EFFORT_OPTIONS.includes(currentConfig.reasoningEffort)
      ) {
        selectedReasoningEffort.value = currentConfig.reasoningEffort
      }

      normalizeReasoningEffortForModel(selectedModelId.value)
    } catch {
      // Keep chat UI usable even if model metadata is temporarily unavailable.
    }
  }

  async function refreshRateLimitUsage(options: { force?: boolean } = {}): Promise<void> {
    const force = options.force === true
    const now = Date.now()
    if (!force && now - lastRateLimitRefreshAtMs < RATE_LIMIT_REFRESH_MIN_INTERVAL_MS) {
      return
    }
    try {
      rateLimitUsage.value = await getAccountRateLimitSnapshot()
      saveRateLimitUsage(rateLimitUsage.value)
      lastRateLimitRefreshAtMs = now
    } catch {
      // Keep existing rate-limit snapshot on transient failures.
    }
  }

  function applyThreadFlags(): void {
    const flaggedGroups = buildFlaggedThreadGroups(
      sourceGroups.value,
      selectedThreadId.value,
      inProgressById.value,
      readStateByThreadId.value,
      eventUnreadByThreadId.value,
    )
    projectGroups.value = mergeThreadGroups(projectGroups.value, flaggedGroups)
  }

  function pruneThreadScopedState(flatThreads: UiThread[]): void {
    const activeThreadIds = new Set(flatThreads.map((thread) => thread.id))
    const nextReadState = pruneThreadStateMap(readStateByThreadId.value, activeThreadIds)
    if (nextReadState !== readStateByThreadId.value) {
      readStateByThreadId.value = nextReadState
      saveReadStateMap(nextReadState)
    }
    const nextScrollState = pruneThreadStateMap(scrollStateByThreadId.value, activeThreadIds)
    if (nextScrollState !== scrollStateByThreadId.value) {
      scrollStateByThreadId.value = nextScrollState
      saveThreadScrollStateMap(nextScrollState)
    }
    loadedMessagesByThreadId.value = pruneThreadStateMap(loadedMessagesByThreadId.value, activeThreadIds)
    loadedVersionByThreadId.value = pruneThreadStateMap(loadedVersionByThreadId.value, activeThreadIds)
    resumedThreadById.value = pruneThreadStateMap(resumedThreadById.value, activeThreadIds)
    persistedMessagesByThreadId.value = pruneThreadStateMap(persistedMessagesByThreadId.value, activeThreadIds)
    liveAgentMessagesByThreadId.value = pruneThreadStateMap(liveAgentMessagesByThreadId.value, activeThreadIds)
    liveReasoningTextByThreadId.value = pruneThreadStateMap(liveReasoningTextByThreadId.value, activeThreadIds)
    turnSummaryByThreadId.value = pruneThreadStateMap(turnSummaryByThreadId.value, activeThreadIds)
    turnActivityByThreadId.value = pruneThreadStateMap(turnActivityByThreadId.value, activeThreadIds)
    turnErrorByThreadId.value = pruneThreadStateMap(turnErrorByThreadId.value, activeThreadIds)
    activeTurnIdByThreadId.value = pruneThreadStateMap(activeTurnIdByThreadId.value, activeThreadIds)
    latestFileChangesByThreadId.value = pruneThreadStateMap(latestFileChangesByThreadId.value, activeThreadIds)
    saveLatestFileChangesMap(latestFileChangesByThreadId.value)
    queuedMessagesByThreadId.value = pruneThreadStateMap(queuedMessagesByThreadId.value, activeThreadIds)
    contextUsageByThreadId.value = pruneThreadStateMap(contextUsageByThreadId.value, activeThreadIds)
    saveThreadContextUsageMap(contextUsageByThreadId.value)
    compactingContextByThreadId.value = pruneThreadStateMap(compactingContextByThreadId.value, activeThreadIds)
    eventUnreadByThreadId.value = pruneThreadStateMap(eventUnreadByThreadId.value, activeThreadIds)
    inProgressById.value = pruneThreadStateMap(inProgressById.value, activeThreadIds)
    pendingServerRequestsByThreadId.value = filterPendingServerRequestsByThreadIds(
      pendingServerRequestsByThreadId.value,
      activeThreadIds,
      GLOBAL_SERVER_REQUEST_SCOPE,
    )
    syncWorkspaceBranchBlockedReasons()
  }

  function markThreadAsRead(threadId: string): void {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    if (!thread) return

    readStateByThreadId.value = {
      ...readStateByThreadId.value,
      [threadId]: thread.updatedAtIso,
    }
    saveReadStateMap(readStateByThreadId.value)
    if (eventUnreadByThreadId.value[threadId]) {
      eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, threadId)
    }
    applyThreadFlags()
  }

  function setTurnSummaryForThread(threadId: string, summary: TurnSummaryState | null): void {
    if (!threadId) return

    const previous = turnSummaryByThreadId.value[threadId]
    if (summary) {
      if (areTurnSummariesEqual(previous, summary)) return
      turnSummaryByThreadId.value = {
        ...turnSummaryByThreadId.value,
        [threadId]: summary,
      }
    } else {
      if (previous) {
        turnSummaryByThreadId.value = omitKey(turnSummaryByThreadId.value, threadId)
      }
    }
  }

  function setThreadInProgress(threadId: string, nextInProgress: boolean): void {
    if (!threadId) return
    const currentValue = inProgressById.value[threadId] === true
    if (currentValue === nextInProgress) return
    if (nextInProgress) {
      inProgressById.value = {
        ...inProgressById.value,
        [threadId]: true,
      }
    } else {
      inProgressById.value = omitKey(inProgressById.value, threadId)
    }
    applyThreadFlags()
  }

  function markThreadUnreadByEvent(threadId: string): void {
    if (!threadId) return
    if (threadId === selectedThreadId.value) return
    if (eventUnreadByThreadId.value[threadId] === true) return
    eventUnreadByThreadId.value = {
      ...eventUnreadByThreadId.value,
      [threadId]: true,
    }
    applyThreadFlags()
  }

  function setTurnActivityForThread(threadId: string, activity: TurnActivityState | null): void {
    if (!threadId) return

    const previous = turnActivityByThreadId.value[threadId]
    if (!activity) {
      if (previous) {
        turnActivityByThreadId.value = omitKey(turnActivityByThreadId.value, threadId)
      }
      return
    }

    const normalizedLabel = sanitizeDisplayText(activity.label) || 'Thinking'
    const incomingDetails = activity.details
      .map((line) => sanitizeDisplayText(line))
      .filter((line) => line.length > 0 && line !== normalizedLabel)
    const mergedDetails = Array.from(new Set([...(previous?.details ?? []), ...incomingDetails])).slice(-3)
    const nextActivity: TurnActivityState = {
      label: normalizedLabel,
      details: mergedDetails,
    }

    if (areTurnActivitiesEqual(previous, nextActivity)) return
    turnActivityByThreadId.value = {
      ...turnActivityByThreadId.value,
      [threadId]: nextActivity,
    }
  }

  function setTurnErrorForThread(threadId: string, message: string | null): void {
    if (!threadId) return

    const previous = turnErrorByThreadId.value[threadId]
    const normalizedMessage = message ? normalizeMessageText(message) : ''
    if (!normalizedMessage) {
      if (previous) {
        turnErrorByThreadId.value = omitKey(turnErrorByThreadId.value, threadId)
      }
      return
    }

    if (previous?.message === normalizedMessage) return

    turnErrorByThreadId.value = {
      ...turnErrorByThreadId.value,
      [threadId]: { message: normalizedMessage },
    }
  }

  function currentThreadVersion(threadId: string): string {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    return thread?.updatedAtIso ?? ''
  }

  function setThreadScrollState(threadId: string, nextState: ThreadScrollState): void {
    if (!threadId) return

    const normalizedState: ThreadScrollState = {
      scrollTop: Math.max(0, nextState.scrollTop),
      isAtBottom: nextState.isAtBottom === true,
    }
    if (typeof nextState.scrollRatio === 'number' && Number.isFinite(nextState.scrollRatio)) {
      normalizedState.scrollRatio = clamp(nextState.scrollRatio, 0, 1)
    }

    const previousState = scrollStateByThreadId.value[threadId]
    if (
      previousState &&
      previousState.scrollTop === normalizedState.scrollTop &&
      previousState.isAtBottom === normalizedState.isAtBottom &&
      previousState.scrollRatio === normalizedState.scrollRatio
    ) {
      return
    }

    scrollStateByThreadId.value = {
      ...scrollStateByThreadId.value,
      [threadId]: normalizedState,
    }
    saveThreadScrollStateMap(scrollStateByThreadId.value)
  }

  function setPersistedMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    persistedMessagesByThreadId.value = {
      ...persistedMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function setLiveAgentMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    liveAgentMessagesByThreadId.value = {
      ...liveAgentMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function upsertLiveAgentMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, nextMessage)
    setLiveAgentMessagesForThread(threadId, next)
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    if (!threadId) return
    const normalized = text.trim()
    const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
    if (normalized.length === 0) {
      if (!previous) return
      liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
      return
    }
    if (previous === normalized) return
    liveReasoningTextByThreadId.value = {
      ...liveReasoningTextByThreadId.value,
      [threadId]: normalized,
    }
  }

  function appendLiveReasoningText(threadId: string, delta: string): void {
    if (!threadId) return
    const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
    setLiveReasoningText(threadId, `${previous}${delta}`)
  }

  function clearLiveReasoningForThread(threadId: string): void {
    if (!threadId) return
    if (!(threadId in liveReasoningTextByThreadId.value)) return
    liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
  }

  function clearLiveOverlayStateForThread(threadId: string): void {
    if (!threadId) return
    setTurnActivityForThread(threadId, null)
    clearLiveReasoningForThread(threadId)
    setTurnErrorForThread(threadId, null)
    setLiveAgentMessagesForThread(threadId, [])
  }


  function upsertPendingServerRequest(request: UiServerRequest): void {
    pendingServerRequestsByThreadId.value = upsertServerRequestMap(
      pendingServerRequestsByThreadId.value,
      request,
      GLOBAL_SERVER_REQUEST_SCOPE,
    )
    syncWorkspaceBranchBlockedReasons()
  }

  function removePendingServerRequestById(requestId: number): void {
    pendingServerRequestsByThreadId.value = removeServerRequestByIdFromMap(
      pendingServerRequestsByThreadId.value,
      requestId,
    )
    syncWorkspaceBranchBlockedReasons()
  }

  function mapPersistedRequestsByThreadId(requests: UiPersistedServerRequest[]): Record<string, UiPersistedServerRequest[]> {
    const next: Record<string, UiPersistedServerRequest[]> = {}
    for (const request of requests) {
      const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
      const current = next[threadId] ?? []
      current.push(request)
      next[threadId] = current
    }
    for (const [threadId, rows] of Object.entries(next)) {
      next[threadId] = rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
    }
    return next
  }

  function replacePersistedServerRequests(requests: UiPersistedServerRequest[]): void {
    persistedServerRequestsByThreadId.value = mapPersistedRequestsByThreadId(requests)
    syncWorkspaceBranchBlockedReasons()
  }

  function replaceSharedSessionSnapshots(rows: UiSharedSessionSnapshot[]): void {
    const bySessionId = new Map<string, UiSharedSessionSnapshot>()
    for (const row of rows) {
      const sessionId = row.sessionId.trim()
      if (!sessionId) continue
      bySessionId.set(sessionId, row)
    }
    sharedSessionSnapshots.value = Array.from(bySessionId.values()).sort((first, second) =>
      second.updatedAtIso.localeCompare(first.updatedAtIso),
    )
  }

  function removePersistedServerRequestById(requestId: number): void {
    const next: Record<string, UiPersistedServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(persistedServerRequestsByThreadId.value)) {
      const filtered = requests.filter((request) => request.id !== requestId)
      if (filtered.length > 0) {
        next[threadId] = filtered
      }
    }
    persistedServerRequestsByThreadId.value = next
    syncWorkspaceBranchBlockedReasons()
  }

  function handleServerRequestNotification(notification: RpcNotification): boolean {
    if (notification.method === 'server/request') {
      const request = normalizeServerRequest(notification.params, GLOBAL_SERVER_REQUEST_SCOPE)
      if (!request) return true
      upsertPendingServerRequest(request)
      void refreshSharedSessionSnapshots({ silent: true })
      return true
    }

    if (notification.method === 'server/request/resolved') {
      const row = asRecord(notification.params)
      const id = row?.id
      if (typeof id === 'number' && Number.isInteger(id)) {
        removePendingServerRequestById(id)
        removePersistedServerRequestById(id)
      }
      void refreshSharedSessionSnapshots({ silent: true })
      return true
    }

    return false
  }

  function applyRealtimeUpdates(notification: RpcNotification): void {
    debugTokenUsageNotification(notification)

    if (handleServerRequestNotification(notification)) {
      return
    }

    const threadContextUsage = readThreadContextUsage(notification, selectedThreadId.value)
    if (threadContextUsage) {
      contextUsageByThreadId.value = {
        ...contextUsageByThreadId.value,
        [threadContextUsage.threadId]: threadContextUsage.usage,
      }
      saveThreadContextUsageMap(contextUsageByThreadId.value)
    }

    if (notification.method === 'account/rateLimits/updated') {
      void refreshRateLimitUsage()
    }

    if (notification.method === 'thread/compacted') {
      const compactedThreadId = extractThreadIdFromNotification(notification)
      if (compactedThreadId && compactingContextByThreadId.value[compactedThreadId]) {
        compactingContextByThreadId.value = omitKey(compactingContextByThreadId.value, compactedThreadId)
      }
    }

    const turnActivity = readTurnActivity(notification)
    if (turnActivity) {
      setTurnActivityForThread(turnActivity.threadId, turnActivity.activity)
    }

    const startedTurn = readTurnStartedInfo(notification)
    if (startedTurn) {
      pendingTurnStartsById.set(startedTurn.turnId, startedTurn)
      activeTurnIdByThreadId.value = {
        ...activeTurnIdByThreadId.value,
        [startedTurn.threadId]: startedTurn.turnId,
      }
      setTurnSummaryForThread(startedTurn.threadId, null)
      setTurnErrorForThread(startedTurn.threadId, null)
      setThreadInProgress(startedTurn.threadId, true)
      if (latestFileChangesByThreadId.value[startedTurn.threadId]) {
        latestFileChangesByThreadId.value = omitKey(latestFileChangesByThreadId.value, startedTurn.threadId)
        saveLatestFileChangesMap(latestFileChangesByThreadId.value)
      }
      if (eventUnreadByThreadId.value[startedTurn.threadId]) {
        eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, startedTurn.threadId)
      }
    }

    const turnDiffUpdate = readTurnDiffUpdate(notification)
    if (turnDiffUpdate) {
      const normalized = normalizeTurnDiffToFileChanges(turnDiffUpdate.diff, turnDiffUpdate.turnId)
      if (normalized) {
        latestFileChangesByThreadId.value = {
          ...latestFileChangesByThreadId.value,
          [turnDiffUpdate.threadId]: normalized,
        }
        saveLatestFileChangesMap(latestFileChangesByThreadId.value)
        debugFileChangesState('turn-diff-update', {
          threadId: turnDiffUpdate.threadId,
          turnId: normalized.turnId,
          fileCount: normalized.files.length,
        })
      } else if (latestFileChangesByThreadId.value[turnDiffUpdate.threadId]) {
        latestFileChangesByThreadId.value = omitKey(latestFileChangesByThreadId.value, turnDiffUpdate.threadId)
        saveLatestFileChangesMap(latestFileChangesByThreadId.value)
        debugFileChangesState('turn-diff-clear', {
          threadId: turnDiffUpdate.threadId,
        })
      }
    }

    const completedTurn = readTurnCompletedInfo(notification)
    if (completedTurn) {
      const startedTurnState = pendingTurnStartsById.get(completedTurn.turnId)
      if (startedTurnState) {
        pendingTurnStartsById.delete(completedTurn.turnId)
      }

      const rawDurationMs =
        readNumber(asRecord(notification.params)?.durationMs) ??
        readNumber(asRecord(asRecord(notification.params)?.turn)?.durationMs) ??
        (typeof completedTurn.startedAtMs === 'number'
          ? completedTurn.completedAtMs - completedTurn.startedAtMs
          : null) ??
        (startedTurnState ? completedTurn.completedAtMs - startedTurnState.startedAtMs : null)

      const durationMs = typeof rawDurationMs === 'number' ? Math.max(0, rawDurationMs) : 0
      setTurnSummaryForThread(completedTurn.threadId, {
        turnId: completedTurn.turnId,
        durationMs,
      })
      if (activeTurnIdByThreadId.value[completedTurn.threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, completedTurn.threadId)
      }
      setThreadInProgress(completedTurn.threadId, false)
      setTurnActivityForThread(completedTurn.threadId, null)
      markThreadUnreadByEvent(completedTurn.threadId)
    }

    const turnErrorMessage = readTurnErrorMessage(notification)
    if (turnErrorMessage) {
      const failedThreadId = completedTurn?.threadId || extractThreadIdFromNotification(notification)
      if (failedThreadId) {
        setTurnErrorForThread(failedThreadId, turnErrorMessage)
      }
      error.value = turnErrorMessage
    } else if (completedTurn) {
      setTurnErrorForThread(completedTurn.threadId, null)
      void dispatchNextQueuedMessage(completedTurn.threadId)
    }

    const notificationThreadId = extractThreadIdFromNotification(notification)
    if (!notificationThreadId || notificationThreadId !== selectedThreadId.value) return

    const startedAgentMessageId = readAgentMessageStartedId(notification)
    if (startedAgentMessageId) {
      activeReasoningItemId = ''
    }

    const liveAgentMessageDelta = readAgentMessageDelta(notification)
    if (liveAgentMessageDelta) {
      const existing = (liveAgentMessagesByThreadId.value[notificationThreadId] ?? [])
        .find((message) => message.id === liveAgentMessageDelta.messageId)
      const nextText = `${existing?.text ?? ''}${liveAgentMessageDelta.delta}`
      upsertLiveAgentMessage(notificationThreadId, {
        id: liveAgentMessageDelta.messageId,
        role: 'assistant',
        text: nextText,
        messageType: 'agentMessage.live',
      })
    }

    const completedAgentMessage = readAgentMessageCompleted(notification)
    if (completedAgentMessage) {
      upsertLiveAgentMessage(notificationThreadId, completedAgentMessage)
    }

    const startedReasoningItemId = readReasoningStartedItemId(notification)
    if (startedReasoningItemId) {
      activeReasoningItemId = startedReasoningItemId
    }

    const liveReasoningDelta = readReasoningDelta(notification)
    if (liveReasoningDelta) {
      appendLiveReasoningText(notificationThreadId, liveReasoningDelta.delta)
    }

    const sectionBreakMessageId = readReasoningSectionBreakMessageId(notification)
    if (sectionBreakMessageId) {
      const current = liveReasoningTextByThreadId.value[notificationThreadId] ?? ''
      if (current.trim().length > 0 && !current.endsWith('\n\n')) {
        setLiveReasoningText(notificationThreadId, `${current}\n\n`)
      }
    }

    const completedReasoningMessageId = readReasoningCompletedId(notification)
    if (completedReasoningMessageId) {
      if (completedReasoningMessageId === liveReasoningMessageId(activeReasoningItemId)) {
        activeReasoningItemId = ''
      }
    }

    if (isAgentContentEvent(notification)) {
      if (shouldAutoScrollOnNextAgentEvent && selectedThreadId.value) {
        setThreadScrollState(selectedThreadId.value, {
          scrollTop: 0,
          isAtBottom: true,
          scrollRatio: 1,
        })
      }
      activeReasoningItemId = ''
      clearLiveReasoningForThread(notificationThreadId)
    }

    if (notification.method === 'turn/completed') {
      activeReasoningItemId = ''
      shouldAutoScrollOnNextAgentEvent = false
      clearLiveReasoningForThread(notificationThreadId)
      const completedThreadId = extractThreadIdFromNotification(notification)
      if (completedThreadId) {
        setThreadInProgress(completedThreadId, false)
        setTurnActivityForThread(completedThreadId, null)
        markThreadUnreadByEvent(completedThreadId)
      }
    }

  }

  function shouldQueueMessageRefresh(notification: RpcNotification): boolean {
    const method = notification.method
    return method === 'turn/completed' || method === 'thread/compacted'
  }

  function shouldQueueThreadListRefresh(method: string): boolean {
    return THREAD_LIST_REFRESH_METHODS.has(method)
  }

  function queueEventDrivenSync(notification: RpcNotification): void {
    const threadId = extractThreadIdFromNotification(notification)
    if (threadId && shouldQueueMessageRefresh(notification)) {
      pendingThreadMessageRefresh.add(threadId)
    }

    const method = notification.method
    if (shouldQueueThreadListRefresh(method)) {
      pendingThreadsRefresh = true
    }

    if (!pendingThreadsRefresh && pendingThreadMessageRefresh.size === 0) {
      return
    }

    if (eventSyncTimer !== null || typeof window === 'undefined') return
    eventSyncTimer = window.setTimeout(() => {
      eventSyncTimer = null
      void syncFromNotifications()
    }, EVENT_SYNC_DEBOUNCE_MS)
  }

  async function loadThreads() {
    if (!hasLoadedThreads.value) {
      isLoadingThreads.value = true
    }

    try {
      const groups = await getThreadGroups()

      const nextProjectOrder = mergeProjectOrder(projectOrder.value, groups)
      if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
        projectOrder.value = nextProjectOrder
        saveProjectOrder(projectOrder.value)
      }

      const orderedGroups = orderGroupsByProjectOrder(groups, projectOrder.value)
      removeMaterializedOptimisticThreads(optimisticThreadById, orderedGroups)
      const groupsWithOptimistic = mergeOptimisticThreadGroups(orderedGroups, optimisticThreadById.values())
      sourceGroups.value = mergeThreadGroups(sourceGroups.value, groupsWithOptimistic)
      inProgressById.value = pruneThreadStateMap(
        inProgressById.value,
        new Set(flattenThreads(sourceGroups.value).map((thread) => thread.id)),
      )
      applyThreadFlags()
      hasLoadedThreads.value = true
      lastThreadListRefreshAtMs = Date.now()

      const flatThreads = flattenThreads(projectGroups.value)
      pruneThreadScopedState(flatThreads)
      const nowMs = Date.now()
      clearExpiredThreadSelectionHolds(pendingNewThreadSelectionUntilById, nowMs)

      const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)
      if (currentExists) {
        consumeObservedThreadSelection(pendingNewThreadSelectionUntilById, selectedThreadId.value)
      }

      if (!currentExists) {
        if (shouldKeepMissingSelectedThread(pendingNewThreadSelectionUntilById, selectedThreadId.value, nowMs)) {
          return
        }
        setSelectedThreadId(flatThreads[0]?.id ?? '')
      }
    } finally {
      isLoadingThreads.value = false
    }
  }

  async function loadMessages(threadId: string, options: { silent?: boolean; signal?: AbortSignal } = {}) {
    if (!threadId) {
      return
    }

    const alreadyLoaded = loadedMessagesByThreadId.value[threadId] === true
    const shouldShowLoading = options.silent !== true && !alreadyLoaded
    if (shouldShowLoading) {
      isLoadingMessages.value = true
    }

    try {
      const requiresInitialResume = resumedThreadById.value[threadId] !== true
      if (requiresInitialResume) {
        const resumed = await resumeThreadWithRetry(threadId)
        if (resumed) {
          resumedThreadById.value = {
            ...resumedThreadById.value,
            [threadId]: true,
          }
        }
      }

      const { messages: nextMessages, fileChanges, inProgress, activeTurnId } = await getThreadConversationData(threadId, {
        signal: options.signal,
      })
      const previousPersisted = persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
        preserveMissing: options.silent === true,
      })
      setPersistedMessagesForThread(threadId, mergedMessages)
      if (fileChanges) {
        latestFileChangesByThreadId.value = {
          ...latestFileChangesByThreadId.value,
          [threadId]: fileChanges,
        }
        saveLatestFileChangesMap(latestFileChangesByThreadId.value)
        debugFileChangesState('load-messages:file-changes', {
          threadId,
          turnId: fileChanges.turnId,
          fileCount: fileChanges.files.length,
        })
      } else {
        debugFileChangesState('load-messages:no-file-changes', {
          threadId,
          cachedTurnId: latestFileChangesByThreadId.value[threadId]?.turnId ?? null,
          cachedFileCount: latestFileChangesByThreadId.value[threadId]?.files.length ?? 0,
        })
      }

      const previousLiveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
      const nextLiveAgent = removeRedundantLiveAgentMessages(previousLiveAgent, nextMessages)
      setLiveAgentMessagesForThread(threadId, nextLiveAgent)
      setThreadInProgress(threadId, inProgress)
      if (inProgress && activeTurnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: activeTurnId,
        }
      } else {
        if (activeTurnIdByThreadId.value[threadId]) {
          activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
        }
        clearLiveOverlayStateForThread(threadId)
      }

      loadedMessagesByThreadId.value = {
        ...loadedMessagesByThreadId.value,
        [threadId]: true,
      }

      const version = currentThreadVersion(threadId)
      if (version) {
        loadedVersionByThreadId.value = {
          ...loadedVersionByThreadId.value,
          [threadId]: version,
        }
      }
      markThreadAsRead(threadId)

      if (requiresInitialResume && !allThreads.value.some((thread) => thread.id === threadId)) {
        await loadThreads()
      }
    } finally {
      if (shouldShowLoading) {
        isLoadingMessages.value = false
      }
    }
  }

  async function refreshAll() {
    error.value = ''

    try {
      await Promise.all([
        loadThreads(),
        refreshModelPreferences(),
        refreshRateLimitUsage({ force: true }),
        refreshSharedSessionSnapshots({ silent: true }),
      ])
      await loadMessages(selectedThreadId.value)
      await refreshSelectedWorkspaceBranchState({ includeBranches: false, silent: true })
      await refreshSelectedWorkspacePushStatus({ silent: true })
      await refreshSelectedWorkspaceDiffTotals()
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function selectThread(threadId: string) {
    const requestToken = ++latestSelectRequestToken
    selectThreadLoadAbortController?.abort()
    selectThreadLoadAbortController = threadId ? new AbortController() : null
    setSelectedThreadId(threadId)
    debugFileChangesState('select-thread', {
      threadId,
      hasPersistedFileChanges: Boolean(latestFileChangesByThreadId.value[threadId]),
      persistedTurnId: latestFileChangesByThreadId.value[threadId]?.turnId ?? null,
      persistedFileCount: latestFileChangesByThreadId.value[threadId]?.files.length ?? 0,
    })
    if (!threadId) return

    void refreshSelectedWorkspaceBranchState({ includeBranches: false, silent: true })
    void refreshSelectedWorkspacePushStatus({ silent: true })
    void refreshSelectedWorkspaceDiffTotals()

    void loadMessages(threadId, {
      signal: selectThreadLoadAbortController?.signal,
    }).catch((unknownError) => {
      if (requestToken !== latestSelectRequestToken) return
      if (isAbortError(unknownError)) return
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    })
  }

  async function archiveThreadById(threadId: string) {
    try {
      await archiveThreadWithRetry(threadId)
      await loadThreads()

      if (selectedThreadId.value === threadId) {
        await loadMessages(selectedThreadId.value)
      }
    } catch (unknownError) {
      if (isNoRolloutError(unknownError)) {
        error.value = '线程刚创建完成，归档尚未就绪，请稍后再试'
        return
      }
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function sendMessageToSelectedThread(payload: ComposerSubmitPayload): Promise<void> {
    const threadId = selectedThreadId.value
    const normalizedPayload = normalizeComposerSubmitPayload(payload)
    if (!threadId || !normalizedPayload) return
    if (inProgressById.value[threadId] === true) {
      queuedMessagesByThreadId.value = enqueueQueuedMessage(
        queuedMessagesByThreadId.value,
        threadId,
        normalizedPayload,
      )
      return
    }

    isSendingMessage.value = true
    error.value = ''
    shouldAutoScrollOnNextAgentEvent = true
    setTurnSummaryForThread(threadId, null)
    setTurnActivityForThread(
      threadId,
      { label: 'Thinking', details: buildPendingTurnDetails() },
    )
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)
    setThreadScrollState(threadId, {
      scrollTop: 0,
      isAtBottom: true,
      scrollRatio: 1,
    })

    try {
      await startTurnForThread(threadId, normalizedPayload)
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      throw unknownError
    } finally {
      isSendingMessage.value = false
    }
  }

  async function sendMessageToNewThread(payload: ComposerSubmitPayload, cwd: string): Promise<string> {
    const normalizedPayload = normalizeComposerSubmitPayload(payload)
    const targetCwd = cwd.trim()
    const selectedModel = selectedModelId.value.trim()
    if (!normalizedPayload) return ''

    isSendingMessage.value = true
    error.value = ''
    let threadId = ''

    try {
      threadId = await startThread(targetCwd || undefined, selectedModel || undefined)
      if (!threadId) return ''

      addOptimisticThread(threadId, targetCwd, buildQueuedMessagePreviewText(normalizedPayload))
      setSelectedThreadId(threadId)
      holdNewThreadSelection(threadId)
      shouldAutoScrollOnNextAgentEvent = true
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(
        threadId,
        { label: 'Thinking', details: buildPendingTurnDetails() },
      )
      setTurnErrorForThread(threadId, null)
      setThreadInProgress(threadId, true)
      setThreadScrollState(threadId, {
        scrollTop: 0,
        isAtBottom: true,
        scrollRatio: 1,
      })

      await startTurnForThread(threadId, normalizedPayload)
      pendingThreadMessageRefresh.add(threadId)
      pendingThreadsRefresh = true
      await syncFromNotifications()
      return threadId
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      if (threadId) {
        setThreadInProgress(threadId, false)
        setTurnActivityForThread(threadId, null)
      }
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      if (threadId) {
        setTurnErrorForThread(threadId, errorMessage)
      }
      error.value = errorMessage
      throw unknownError
    } finally {
      isSendingMessage.value = false
    }
  }

  async function startTurnForThread(threadId: string, payload: ComposerSubmitPayload): Promise<void> {
    const modelId = selectedModelId.value.trim()
    const reasoningEffort = selectedReasoningEffort.value

    try {
      const requiresInitialResume = resumedThreadById.value[threadId] !== true
      if (requiresInitialResume) {
        await resumeThreadWithRetry(threadId)
      }

      await startThreadTurn(
        threadId,
        buildUserInputs(payload),
        modelId || undefined,
        reasoningEffort || undefined,
        selectedChatMode.value,
      )

      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }

      pendingThreadMessageRefresh.add(threadId)
      if (requiresInitialResume) {
        pendingThreadsRefresh = true
      }
      await syncFromNotifications()
      void dispatchNextQueuedMessage(threadId)
    } catch (unknownError) {
      throw unknownError
    }
  }

  async function interruptSelectedThreadTurn(): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (inProgressById.value[threadId] !== true) return
    const turnId = activeTurnIdByThreadId.value[threadId]

    isInterruptingTurn.value = true
    error.value = ''
    try {
      await interruptThreadTurn(threadId, turnId)
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      if (activeTurnIdByThreadId.value[threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
      }
      pendingThreadMessageRefresh.add(threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to interrupt active turn'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    } finally {
      isInterruptingTurn.value = false
    }
  }

  async function compactSelectedThreadContext(): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (compactingContextByThreadId.value[threadId] === true) return

    compactingContextByThreadId.value = {
      ...compactingContextByThreadId.value,
      [threadId]: true,
    }

    error.value = ''
    try {
      await compactThreadContext(threadId)
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to compact thread context'
      error.value = errorMessage
    } finally {
      if (compactingContextByThreadId.value[threadId]) {
        compactingContextByThreadId.value = omitKey(compactingContextByThreadId.value, threadId)
      }
    }
  }

  async function renameThreadById(threadId: string, title: string): Promise<void> {
    const normalizedThreadId = threadId.trim()
    const normalizedTitle = title.trim()
    if (!normalizedThreadId || !normalizedTitle) return

    try {
      await renameThread(normalizedThreadId, normalizedTitle)
      
      // Optimistic update
      sourceGroups.value = sourceGroups.value.map(group => ({
        ...group,
        threads: group.threads.map(thread => 
          thread.id === normalizedThreadId ? { ...thread, title: normalizedTitle } : thread
        )
      }))
      applyThreadFlags()
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to rename thread'
    }
  }

  function renameProject(projectName: string, displayName: string): void {
    if (projectName.length === 0) return

    const currentValue = projectDisplayNameById.value[projectName] ?? ''
    if (currentValue === displayName) return

    projectDisplayNameById.value = {
      ...projectDisplayNameById.value,
      [projectName]: displayName,
    }
    saveProjectDisplayNames(projectDisplayNameById.value)
  }

  function removeProject(projectName: string): void {
    if (projectName.length === 0) return

    const nextProjectOrder = projectOrder.value.filter((name) => name !== projectName)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }

    sourceGroups.value = sourceGroups.value.filter((group) => group.projectName !== projectName)

    if (projectDisplayNameById.value[projectName] !== undefined) {
      const nextDisplayNames = { ...projectDisplayNameById.value }
      delete nextDisplayNames[projectName]
      projectDisplayNameById.value = nextDisplayNames
      saveProjectDisplayNames(nextDisplayNames)
    }

    applyThreadFlags()

    const flatThreads = flattenThreads(projectGroups.value)
    pruneThreadScopedState(flatThreads)

    const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)
    if (!currentExists) {
      setSelectedThreadId(flatThreads[0]?.id ?? '')
    }
  }

  function reorderProject(projectName: string, toIndex: number): void {
    if (projectName.length === 0) return
    if (projectOrder.value.length === 0) return

    const fromIndex = projectOrder.value.indexOf(projectName)
    if (fromIndex === -1) return

    const clampedToIndex = Math.max(0, Math.min(toIndex, projectOrder.value.length - 1))
    const nextProjectOrder = reorderStringArray(projectOrder.value, fromIndex, clampedToIndex)
    if (nextProjectOrder === projectOrder.value) return

    projectOrder.value = nextProjectOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
  }

  async function syncThreadStatus(): Promise<void> {
    if (isPolling.value) return
    isPolling.value = true

    try {
      await refreshSharedSessionSnapshots({ silent: true })
      const now = Date.now()
      const shouldRefreshThreadList = now - lastThreadListRefreshAtMs >= THREAD_LIST_AUTO_REFRESH_INTERVAL_MS
      if (shouldRefreshThreadList) {
        await loadThreads()
      }

      if (!selectedThreadId.value) return

      const threadId = selectedThreadId.value
      const currentVersion = currentThreadVersion(threadId)
      const loadedVersion = loadedVersionByThreadId.value[threadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion

      if (hasVersionChange) {
        await loadMessages(threadId, { silent: true })
      }
    } catch {
      // ignore poll failures and keep last known state
    } finally {
      isPolling.value = false
    }
  }

  async function syncFromNotifications(): Promise<void> {
    if (isPolling.value) {
      if (typeof window !== 'undefined' && eventSyncTimer === null) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
      return
    }

    isPolling.value = true

    const shouldRefreshThreads = pendingThreadsRefresh
    const threadIdsToRefresh = new Set(pendingThreadMessageRefresh)
    pendingThreadsRefresh = false
    pendingThreadMessageRefresh.clear()

    try {
      if (shouldRefreshThreads) {
        await loadThreads()
      }

      const activeThreadId = selectedThreadId.value
      if (!activeThreadId) return

      const isActiveDirty = threadIdsToRefresh.has(activeThreadId)

      if (isActiveDirty) {
        await loadMessages(activeThreadId, { silent: true })
      }
    } catch {
      // Keep UI stable on transient event sync failures.
    } finally {
      isPolling.value = false

      if (
        (pendingThreadsRefresh || pendingThreadMessageRefresh.size > 0) &&
        typeof window !== 'undefined' &&
        eventSyncTimer === null
      ) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
    }
  }

  function startPolling(): void {
    if (typeof window === 'undefined') return

    if (stopNotificationStream) return
    if (isAutoRefreshEnabled.value) {
      startAutoRefreshTimer()
    }
    void refreshSharedSessionSnapshots({ silent: true })
    void loadPendingServerRequestsFromBridge()
    void loadPersistedServerRequestsFromBridge()
    stopNotificationStream = subscribeCodexNotifications((notification) => {
      applyRealtimeUpdates(notification)
      queueEventDrivenSync(notification)
    })
  }

  async function loadPendingServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await getPendingServerRequests()
      for (const row of rows) {
        const request = normalizeServerRequest(row, GLOBAL_SERVER_REQUEST_SCOPE)
        if (request) {
          upsertPendingServerRequest(request)
        }
      }
      syncWorkspaceBranchBlockedReasons()
    } catch {
      // Keep UI usable when pending request endpoint is temporarily unavailable.
    }
  }

  async function loadPersistedServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await getPersistedServerRequests()
      replacePersistedServerRequests(rows)
    } catch {
      // Keep UI usable when persisted request endpoint is temporarily unavailable.
    }
  }

  async function refreshSharedSessionSnapshots(options: { silent?: boolean } = {}): Promise<void> {
    try {
      const rows = await getSharedSessionSnapshots()
      replaceSharedSessionSnapshots(rows)
    } catch (unknownError) {
      if (options.silent === true) return
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to load shared session snapshots'
    }
  }

  async function respondToPendingServerRequest(reply: UiServerRequestReply): Promise<void> {
    try {
      await replyToServerRequest(reply.id, {
        result: reply.result,
        error: reply.error,
      })
      removePendingServerRequestById(reply.id)
      removePersistedServerRequestById(reply.id)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to reply to server request'
    }
  }

  async function dismissPersistedServerRequests(requestIds: number[]): Promise<boolean> {
    const normalizedRequestIds = requestIds
      .filter((value) => Number.isInteger(value))
      .map((value) => Math.trunc(value))
    if (normalizedRequestIds.length === 0) return false

    try {
      const dismissedIds = await dismissPersistedServerRequestsRequest(normalizedRequestIds)
      for (const requestId of dismissedIds) {
        removePersistedServerRequestById(requestId)
      }
      if (dismissedIds.length > 0) {
        void refreshSharedSessionSnapshots({ silent: true })
      }
      return dismissedIds.length > 0
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to dismiss persisted server requests'
      return false
    }
  }

  function stopAutoRefreshTimer(options: { updatePreference?: boolean } = {}): void {
    const updatePreference = options.updatePreference ?? true

    if (autoRefreshIntervalTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(autoRefreshIntervalTimer)
      autoRefreshIntervalTimer = null
    }
    if (autoRefreshCountdownTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(autoRefreshCountdownTimer)
      autoRefreshCountdownTimer = null
    }
    if (updatePreference) {
      isAutoRefreshEnabled.value = false
      saveAutoRefreshEnabled(false)
    }
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
  }

  function startAutoRefreshTimer(): void {
    if (typeof window === 'undefined') return
    if (autoRefreshIntervalTimer !== null || autoRefreshCountdownTimer !== null) return

    isAutoRefreshEnabled.value = true
    saveAutoRefreshEnabled(true)
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)

    autoRefreshIntervalTimer = window.setInterval(() => {
      autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
      void syncThreadStatus()
    }, AUTO_REFRESH_INTERVAL_MS)

    autoRefreshCountdownTimer = window.setInterval(() => {
      autoRefreshSecondsLeft.value = Math.max(0, autoRefreshSecondsLeft.value - 1)
    }, 1000)
  }

  function toggleAutoRefreshTimer(): void {
    if (isAutoRefreshEnabled.value) {
      stopAutoRefreshTimer()
      return
    }
    startAutoRefreshTimer()
  }

  function stopPolling(): void {
    stopAutoRefreshTimer({ updatePreference: false })

    if (stopNotificationStream) {
      stopNotificationStream()
      stopNotificationStream = null
    }

    pendingThreadsRefresh = false
    pendingThreadMessageRefresh.clear()
    pendingTurnStartsById.clear()
    if (eventSyncTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(eventSyncTimer)
      eventSyncTimer = null
    }
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
    persistedMessagesByThreadId.value = {}
    liveAgentMessagesByThreadId.value = {}
    liveReasoningTextByThreadId.value = {}
    turnActivityByThreadId.value = {}
    turnSummaryByThreadId.value = {}
    turnErrorByThreadId.value = {}
    activeTurnIdByThreadId.value = {}
    compactingContextByThreadId.value = {}
  }

  return {
    projectGroups,
    projectDisplayNameById,
    selectedThread,
    selectedThreadScrollState,
    selectedThreadServerRequests,
    selectedThreadPersistedServerRequests,
    selectedWorkspacePersistedServerRequests,
    globalLiveServerRequests,
    liveApprovalThreadIdSet,
    globalPersistedServerRequests,
    sharedSessionSnapshots,
    sharedSessionSnapshotByThreadId,
    selectedSharedSessionSnapshot,
    selectedWorkspaceModel,
    selectedWorkspaceDiffTotals,
    selectedThreadFileChanges,
    selectedQueuedMessages,
    selectedWorkspaceBranchState,
    selectedThreadContextUsage,
    selectedThreadRateLimitUsage,
    isCompactingSelectedThreadContext,
    selectedLiveOverlay,
    selectedThreadId,
    availableModelIds,
    selectedModelId,
    selectedReasoningEffort,
    selectedChatMode,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    isSendingMessage,
    isInterruptingTurn,
    isAutoRefreshEnabled,
    autoRefreshSecondsLeft,
    error,
    refreshAll,
    selectThread,
    setThreadScrollState,
    archiveThreadById,
    renameThreadById,
    sendMessageToSelectedThread,
    sendMessageToNewThread,
    interruptSelectedThreadTurn,
    compactSelectedThreadContext,
    getWorkspaceModelForCwd,
    getWorkspaceBranchStateForCwd,
    refreshSelectedWorkspaceBranchState,
    refreshWorkspaceBranchStateForCwd,
    refreshSelectedWorkspacePushStatus,
    refreshWorkspacePushStatusForCwd,
    refreshSelectedWorkspaceDiffTotals,
    fetchWorkspaceDiffSnapshotForMode,
    openPreferredWorkspaceDiffSnapshot,
    setWorkspaceDiffMode,
    setWorkspaceBaseBranch,
    switchSelectedWorkspaceBranch,
    createAndSwitchSelectedWorkspaceBranch,
    pushSelectedWorkspaceBranch,
    switchWorkspaceBranchForCwd,
    createAndSwitchWorkspaceBranchForCwd,
    pushWorkspaceBranchForCwd,
    setSelectedModelId,
    setSelectedReasoningEffort,
    setSelectedChatMode,
    respondToPendingServerRequest,
    dismissPersistedServerRequests,
    refreshSharedSessionSnapshots,
    renameProject,
    removeProject,
    reorderProject,
    toggleAutoRefreshTimer,
    startPolling,
    stopPolling,
  }
}
