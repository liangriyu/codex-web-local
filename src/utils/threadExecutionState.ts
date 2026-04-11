export type SharedSessionState =
  | 'idle'
  | 'running'
  | 'needs_attention'
  | 'failed'
  | 'interrupted'
  | 'stale_owner'

export type SharedSessionTurnStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export type ThreadExecutionStateInput = {
  isHomeRoute: boolean
  threadInProgress: boolean
  sharedSessionState: SharedSessionState | null
  sharedSessionTurnStatus: SharedSessionTurnStatus | null
}

export function resolveThreadExecutionInProgress(input: ThreadExecutionStateInput): boolean {
  if (input.isHomeRoute) return false
  if (input.threadInProgress) return true
  if (input.sharedSessionState === 'running' || input.sharedSessionState === 'needs_attention') {
    return true
  }
  return input.sharedSessionTurnStatus === 'running'
}
