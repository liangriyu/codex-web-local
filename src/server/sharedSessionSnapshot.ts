export type SharedSessionOwner = 'web' | 'terminal'

export type SharedSessionState = 'idle' | 'running' | 'needs_attention' | 'failed' | 'interrupted' | 'stale_owner'

export type SharedTimelineEntry =
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

export type SharedSessionSnapshot = {
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
    status: 'running' | 'completed' | 'failed' | 'interrupted'
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
