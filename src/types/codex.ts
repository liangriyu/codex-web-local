export type RpcEnvelope<T> = {
  result: T
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type ChatMode = 'plan' | 'act'

export type RpcMethodCatalog = {
  data: string[]
}

export type ThreadListResult = {
  data: ThreadSummary[]
  nextCursor?: string | null
}

export type ThreadSummary = {
  id: string
  preview: string
  title?: string
  name?: string
  cwd: string
  updatedAt: number
  createdAt: number
  source?: unknown
}

export type ThreadReadResult = {
  thread: ThreadDetail
}

export type ThreadDetail = {
  id: string
  cwd: string
  preview: string
  turns: ThreadTurn[]
  updatedAt: number
  createdAt: number
}

export type ThreadTurn = {
  id: string
  status: string
  items: ThreadItem[]
}

export type ThreadItem = {
  id: string
  type: string
  text?: string
  content?: unknown
  summary?: string[]
}

export type UserInput =
  | { type: 'text'; text: string; text_elements: [] }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }
  | { type: 'skill'; name: string; path: string }
  | { type: 'mention'; name: string; path: string }

export type ComposerSubmitPayload = {
  text: string
  images: Array<{ url: string }>
}

export type UiThread = {
  id: string
  title: string
  projectName: string
  cwd: string
  branch: string
  createdAtIso: string
  updatedAtIso: string
  preview: string
  unread: boolean
  inProgress: boolean
}

export type UiThreadContextUsage = {
  usedTokens: number
  totalTokens: number
  usedPercent: number
  remainingPercent: number
}

export type UiRateLimitUsage = {
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

export type UiAccountAuthMode = 'apiKey' | 'chatgpt' | 'chatgptAuthTokens'
export type UiForcedLoginMethod = 'apiKey' | 'chatgpt'
export type UiAccountStatus = 'loading' | 'logged_out' | 'logged_in' | 'reauth_required' | 'error'
export type UiAccountCenterView = 'overview' | 'login_methods' | 'login_progress'
export type UiAccountLoginFlow =
  | 'idle'
  | 'selecting_method'
  | 'opening_oauth'
  | 'waiting_completion'
  | 'api_key_form'
  | 'success'
  | 'failed'

export type UiAccount = {
  type: 'apiKey' | 'chatgpt'
  email: string | null
  planType: string | null
}

export type UiAccountSnapshot = {
  account: UiAccount | null
  authMode: UiAccountAuthMode | null
  requiresOpenaiAuth: boolean
}

export type UiAccountLoginRequest =
  | {
      type: 'chatgpt'
    }
  | {
      type: 'apiKey'
      apiKey: string
    }

export type UiAccountLoginStartResult = {
  type: UiAccountAuthMode
  loginId: string | null
  authUrl: string | null
}

export type UiAccountProfile = {
  id: string
  name: string
  codexHomeDir: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

export type UiAccountProfilesSnapshot = {
  activeProfileId: string
  profiles: UiAccountProfile[]
}

export type UiServerConnectionMode = 'shared' | 'isolated'
export type UiServerConnectionStatus =
  | 'idle'
  | 'connected'
  | 'unavailable'
  | 'running_without_shared_endpoint'
  | 'attach_failed'

export type UiServerConnectionSnapshot = {
  serverConnectionMode: UiServerConnectionMode
  serverConnectionStatus: UiServerConnectionStatus
  serverConnectionError: string | null
}

export type UiCodexConfigSnapshot = {
  forcedLoginMethod: UiForcedLoginMethod | null
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  turnId?: string
  images?: string[]
  messageType?: string
  rawPayload?: string
  isUnhandled?: boolean
}

export type UiServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  receivedAtIso: string
  params: unknown
}

export type UiPersistedServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  cwd: string
  receivedAtIso: string
  resolvedAtIso: string | null
  resolutionKind: string | null
  dismissedAtIso: string | null
  dismissedReason: string | null
  dismissedBy: 'user' | null
  params: unknown
}

export type UiServerRequestReply = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

export type UiLiveOverlay = {
  activityLabel: string
  activityDetails: string[]
  reasoningText: string
  errorText: string
}

export type UiSharedSessionOwner = 'web' | 'terminal'

export type UiSharedSessionState =
  | 'idle'
  | 'running'
  | 'needs_attention'
  | 'failed'
  | 'interrupted'
  | 'stale_owner'

export type UiSharedSessionApprovalKind = 'command' | 'file_change'

export type UiSharedSessionTimelineEntry =
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
      status: 'completed' | 'failed' | 'interrupted'
    }
  | {
      id: string
      kind: 'attention'
      text: string
      createdAtIso: string
      attentionKind: 'approval' | 'attention' | 'error'
    }

export type UiSharedSessionSnapshot = {
  sessionId: string
  sourceThreadId: string
  sourceConversationId: string | null
  title: string
  cwd: string | null
  owner: UiSharedSessionOwner
  ownerInstanceId: string | null
  ownerLeaseExpiresAtIso: string | null
  state: UiSharedSessionState
  activeTurnId: string | null
  updatedAtIso: string
  timeline: UiSharedSessionTimelineEntry[]
  latestTurnSummary: {
    turnId: string
    status: 'running' | 'completed' | 'failed' | 'interrupted'
    summary: string | null
    startedAtIso: string | null
    completedAtIso: string | null
  } | null
  attention: {
    pendingApprovalCount: number
    pendingApprovalKinds: UiSharedSessionApprovalKind[]
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

export type UiProjectGroup = {
  projectName: string
  threads: UiThread[]
}

export type UiChangedFile = {
  path: string
  additions: number
  deletions: number
  diff: string
}

export type UiTurnFileChanges = {
  turnId: string
  files: UiChangedFile[]
  totalAdditions: number
  totalDeletions: number
}

export type UiThreadTurnFileChangeRecord = {
  turnId: string
  files: UiChangedFile[]
  totalAdditions: number
  totalDeletions: number
  createdAtIso: string | null
  source: 'turn_diff' | 'thread_read' | 'session_fallback'
  canUndo: boolean
  canReapply: boolean
  isLatestChangeTurn: boolean
  isReverted: boolean
}

export type UiThreadFileChangeTimeline = {
  threadId: string
  records: UiThreadTurnFileChangeRecord[]
  latestReversibleTurnId: string | null
}

export type UiWorkspaceDiffMode =
  | 'unstaged'
  | 'staged'
  | 'branch'
  | 'lastCommit'
  | 'gitStatus'

export type UiWorkspaceDiffSnapshot = {
  mode: UiWorkspaceDiffMode
  cwd: string
  label: string
  baseRef: string | null
  targetRef: string | null
  warning: string | null
  files: UiChangedFile[]
  totalAdditions: number
  totalDeletions: number
}

export type WorkspaceBranchState = {
  isRepo: boolean
  currentBranch: string
  branches: string[]
  baseBranch: string | null
  isDetachedHead: boolean
  isLoading: boolean
  isSwitching: boolean
}

export type WorkspaceBranchBlockReason =
  | 'not_repo'
  | 'workspace_dirty'
  | 'thread_in_progress'
  | 'queued_messages'
  | 'pending_server_requests'
  | 'persisted_server_requests'

export type WorkspacePushBlockReason =
  | WorkspaceBranchBlockReason
  | 'unresolved_server_request_scope'

export type UiWorkspaceDirtyKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'
  | 'unknown'

export type UiWorkspaceDirtyEntry = {
  path: string
  x: string
  y: string
  kind: UiWorkspaceDirtyKind
  staged: boolean
  unstaged: boolean
}

export type UiWorkspaceDirtySummary = {
  trackedModified: number
  staged: number
  untracked: number
  conflicted: number
  renamed: number
  deleted: number
}

export type UiWorkspaceGitStatus = {
  cwd: string
  isRepo: boolean
  isDirty: boolean
  currentBranch: string
  dirtySummary: UiWorkspaceDirtySummary
  dirtyEntries: UiWorkspaceDirtyEntry[]
}

export type UiWorkspaceBranchList = {
  cwd: string
  isRepo: boolean
  currentBranch: string
  branches: string[]
}

export type UiWorkspaceBranchState = {
  cwd: string
  isRepo: boolean
  isDirty: boolean
  currentBranch: string
  branches: string[]
  dirtySummary: UiWorkspaceDirtySummary
  dirtyEntries: UiWorkspaceDirtyEntry[]
  isLoading: boolean
  isSwitching: boolean
  blockedReasons: WorkspaceBranchBlockReason[]
}

export type UiWorkspacePushStatus = {
  cwd: string
  isRepo: boolean
  currentBranch: string
  hasUpstream: boolean
  willSetUpstream: boolean
  upstreamRemote: string
  upstreamBranch: string
  aheadCount: number
  behindCount: number
  hasCommitsToPush: boolean
  canPush: boolean
  blockedReasons: WorkspacePushBlockReason[]
  suggestedUpstreamCommand: string
}

export type UiWorkspacePushResult = {
  ok: boolean
  currentBranch: string
  upstreamRemote: string
  upstreamBranch: string
  createdUpstream: boolean
  summary: string
}

export type WorkspaceGuardState = {
  blockedReasons: WorkspaceBranchBlockReason[]
  livePendingRequestCount: number
  persistedPendingRequestCount: number
  queuedMessageCount: number
  inProgressThreadCount: number
}

export type WorkspaceDiffState = {
  selectedMode: UiWorkspaceDiffMode
  snapshots: Partial<Record<UiWorkspaceDiffMode, UiWorkspaceDiffSnapshot>>
  isLoadingByMode: Partial<Record<UiWorkspaceDiffMode, boolean>>
  totalAdditions: number
  totalDeletions: number
}

export type WorkspaceApprovalState = {
  live: UiServerRequest[]
  persisted: UiPersistedServerRequest[]
}

export type WorkspacePushState = {
  status: UiWorkspacePushStatus | null
  isLoading: boolean
  isPushing: boolean
  lastResult: UiWorkspacePushResult | null
  lastError: string | null
}

export type SessionApprovalState = {
  globalLive: UiServerRequest[]
  globalPersisted: UiPersistedServerRequest[]
}

export type WorkspaceModel = {
  cwd: string
  branch: WorkspaceBranchState
  guard: WorkspaceGuardState
  push: WorkspacePushState
  gitStatus: {
    isDirty: boolean
    summary: UiWorkspaceDirtySummary | null
    entries: UiWorkspaceDirtyEntry[]
    fetchedAt: string | null
  }
  diff: WorkspaceDiffState
  approvals: WorkspaceApprovalState
  ui: {
    selectedPath: string | null
    expandedPaths: string[]
    lastOpenedAt: string | null
  }
}

export type ThreadScrollState = {
  scrollTop: number
  isAtBottom: boolean
  scrollRatio?: number
}

export type ChatMessage = {
  id: string
  role: string
  text: string
  createdAt: string | null
}

export type ChatThread = {
  id: string
  title: string
  projectName: string
  updatedAt: string | null
  messages: ChatMessage[]
}
