import type {
  ThreadScrollState,
  UiChangedFile,
  UiRateLimitUsage,
  UiThreadContextUsage,
  UiThreadFileChangeTimeline,
  UiThreadTurnFileChangeRecord,
  UiTurnFileChanges,
} from '../../types/codex'

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1'
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const AUTO_REFRESH_ENABLED_STORAGE_KEY = 'codex-web-local.auto-refresh-enabled.v1'
const CONTEXT_USAGE_STORAGE_KEY = 'codex-web-local.thread-context-usage.v2'
const FILE_CHANGES_STORAGE_KEY = 'codex-web-local.thread-file-changes.v2'
const FILE_CHANGES_DEBUG_STORAGE_KEY = 'codex-web-local.debug.file-changes.v1'
const RATE_LIMIT_USAGE_STORAGE_KEY = 'codex-web-local.rate-limit-usage.v1'
const WORKSPACE_BASE_BRANCH_STORAGE_KEY = 'codex-web-local.workspace-base-branch.v1'
const MAX_STORED_FILE_CHANGE_THREADS = 20

type StoredChangedFileSummary = Omit<UiChangedFile, 'diff'>

type StoredTurnFileChangesSummary = {
  turnId: string
  files: StoredChangedFileSummary[]
  totalAdditions: number
  totalDeletions: number
  storedAt: number
}

type StoredTurnFileChangeTimeline = {
  records: StoredTurnFileChangesSummary[]
  latestReversibleTurnId: string | null
}

function shortenDebugId(value: string): string {
  const normalized = value.trim()
  if (normalized.length <= 8) return normalized
  return normalized.slice(0, 8)
}

export function isFileChangesDebugEnabled(): boolean {
  if (import.meta?.env?.DEV === true) return true
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(FILE_CHANGES_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function debugFileChangesStorage(action: string, payload: Record<string, unknown>): void {
  if (!isFileChangesDebugEnabled()) return
  if (typeof window === 'undefined') return
  console.debug(`[file-changes-storage] ${action}`, payload)
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

function normalizeThreadScrollState(value: unknown): ThreadScrollState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const rawState = value as Record<string, unknown>
  if (typeof rawState.scrollTop !== 'number' || !Number.isFinite(rawState.scrollTop)) return null
  if (typeof rawState.isAtBottom !== 'boolean') return null

  const normalized: ThreadScrollState = {
    scrollTop: Math.max(0, rawState.scrollTop),
    isAtBottom: rawState.isAtBottom,
  }

  if (typeof rawState.scrollRatio === 'number' && Number.isFinite(rawState.scrollRatio)) {
    normalized.scrollRatio = clamp(rawState.scrollRatio, 0, 1)
  }

  return normalized
}

function normalizeThreadContextUsage(value: unknown): UiThreadContextUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.usedTokens !== 'number' || !Number.isFinite(row.usedTokens) || row.usedTokens < 0) return null
  if (typeof row.totalTokens !== 'number' || !Number.isFinite(row.totalTokens) || row.totalTokens <= 0) return null
  if (typeof row.usedPercent !== 'number' || !Number.isFinite(row.usedPercent)) return null
  if (typeof row.remainingPercent !== 'number' || !Number.isFinite(row.remainingPercent)) return null
  return {
    usedTokens: row.usedTokens,
    totalTokens: row.totalTokens,
    usedPercent: clamp(row.usedPercent, 0, 100),
    remainingPercent: clamp(row.remainingPercent, 0, 100),
  }
}

function normalizeRateLimitUsage(value: unknown): UiRateLimitUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.usedPercent !== 'number' || !Number.isFinite(row.usedPercent)) return null
  if (typeof row.remainingPercent !== 'number' || !Number.isFinite(row.remainingPercent)) return null
  const windowDurationMins = typeof row.windowDurationMins === 'number' && Number.isFinite(row.windowDurationMins)
    ? row.windowDurationMins
    : null
  const resetsAt = typeof row.resetsAt === 'number' && Number.isFinite(row.resetsAt) ? row.resetsAt : null
  const rawWindows = Array.isArray(row.windows) ? row.windows : []
  const windows = rawWindows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const windowRow = item as Record<string, unknown>
      if (typeof windowRow.usedPercent !== 'number' || !Number.isFinite(windowRow.usedPercent)) return null
      return {
        usedPercent: clamp(windowRow.usedPercent, 0, 100),
        windowDurationMins: typeof windowRow.windowDurationMins === 'number' && Number.isFinite(windowRow.windowDurationMins)
          ? windowRow.windowDurationMins
          : null,
        resetsAt: typeof windowRow.resetsAt === 'number' && Number.isFinite(windowRow.resetsAt)
          ? windowRow.resetsAt
          : null,
      }
    })
    .filter((item): item is { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } => item !== null)
  const creditsRaw = row.aiCredits
  const aiCredits = creditsRaw && typeof creditsRaw === 'object' && !Array.isArray(creditsRaw)
    ? {
      hasCredits: Boolean((creditsRaw as Record<string, unknown>).hasCredits),
      unlimited: Boolean((creditsRaw as Record<string, unknown>).unlimited),
      balance: typeof (creditsRaw as Record<string, unknown>).balance === 'string'
        ? ((creditsRaw as Record<string, unknown>).balance as string)
        : null,
    }
    : null
  return {
    usedPercent: clamp(row.usedPercent, 0, 100),
    remainingPercent: clamp(row.remainingPercent, 0, 100),
    windowDurationMins,
    resetsAt,
    windows,
    aiCredits,
    planType: typeof row.planType === 'string' ? row.planType : null,
  }
}

function normalizeStoredChangedFile(value: unknown): StoredChangedFileSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.path !== 'string' || row.path.trim().length === 0) return null
  if (typeof row.additions !== 'number' || !Number.isFinite(row.additions) || row.additions < 0) return null
  if (typeof row.deletions !== 'number' || !Number.isFinite(row.deletions) || row.deletions < 0) return null
  return {
    path: row.path,
    additions: row.additions,
    deletions: row.deletions,
  }
}

function normalizeStoredTurnFileChanges(value: unknown): StoredTurnFileChangesSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.turnId !== 'string' || row.turnId.trim().length === 0) return null
  if (typeof row.totalAdditions !== 'number' || !Number.isFinite(row.totalAdditions) || row.totalAdditions < 0) return null
  if (typeof row.totalDeletions !== 'number' || !Number.isFinite(row.totalDeletions) || row.totalDeletions < 0) return null
  if (typeof row.storedAt !== 'number' || !Number.isFinite(row.storedAt) || row.storedAt <= 0) return null
  if (!Array.isArray(row.files)) return null
  const files = row.files
    .map((file) => normalizeStoredChangedFile(file))
    .filter((file): file is StoredChangedFileSummary => file !== null)
  if (files.length === 0) return null
  return {
    turnId: row.turnId,
    files,
    totalAdditions: row.totalAdditions,
    totalDeletions: row.totalDeletions,
    storedAt: row.storedAt,
  }
}

function toUiTurnFileChanges(summary: StoredTurnFileChangesSummary): UiTurnFileChanges {
  return {
    turnId: summary.turnId,
    files: summary.files.map((file) => ({
      ...file,
      diff: '',
    })),
    totalAdditions: summary.totalAdditions,
    totalDeletions: summary.totalDeletions,
  }
}

function toUiThreadTurnFileChangeRecord(summary: StoredTurnFileChangesSummary): UiThreadTurnFileChangeRecord {
  return {
    turnId: summary.turnId,
    files: summary.files.map((file) => ({
      ...file,
      diff: '',
    })),
    totalAdditions: summary.totalAdditions,
    totalDeletions: summary.totalDeletions,
    createdAtIso: new Date(summary.storedAt).toISOString(),
    source: 'session_fallback',
    canUndo: false,
    canReapply: false,
    isLatestChangeTurn: false,
    isReverted: false,
  }
}

function normalizeStoredThreadFileChangeTimeline(value: unknown): StoredTurnFileChangeTimeline | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (!Array.isArray(row.records)) return null
  const records = row.records
    .map((record) => normalizeStoredTurnFileChanges(record))
    .filter((record): record is StoredTurnFileChangesSummary => record !== null)
  if (records.length === 0) return null
  return {
    records,
    latestReversibleTurnId: typeof row.latestReversibleTurnId === 'string' ? row.latestReversibleTurnId : null,
  }
}

function loadStoredLatestFileChangesMap(): Record<string, StoredTurnFileChangesSummary> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(FILE_CHANGES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const normalizedMap: Record<string, StoredTurnFileChangesSummary> = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalized = normalizeStoredTurnFileChanges(value)
      if (normalized) normalizedMap[threadId] = normalized
    }
    return normalizedMap
  } catch {
    return {}
  }
}

function loadStoredThreadFileChangeTimelineMap(): Record<string, StoredTurnFileChangeTimeline> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(FILE_CHANGES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const normalizedMap: Record<string, StoredTurnFileChangeTimeline> = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalizedTimeline = normalizeStoredThreadFileChangeTimeline(value)
      if (normalizedTimeline) {
        normalizedMap[threadId] = normalizedTimeline
        continue
      }
      const normalizedLatest = normalizeStoredTurnFileChanges(value)
      if (normalizedLatest) {
        normalizedMap[threadId] = { records: [normalizedLatest], latestReversibleTurnId: null }
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

function buildStoredTurnFileChangesSummary(
  value: UiTurnFileChanges,
  storedAt: number,
): StoredTurnFileChangesSummary {
  return {
    turnId: value.turnId,
    files: value.files.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
    })),
    totalAdditions: value.totalAdditions,
    totalDeletions: value.totalDeletions,
    storedAt,
  }
}

function buildStoredThreadFileChangeTimelineSummary(
  value: UiThreadFileChangeTimeline,
  previous: StoredTurnFileChangeTimeline | null,
  now: number,
): StoredTurnFileChangeTimeline {
  const previousByTurnId = new Map((previous?.records ?? []).map((record) => [record.turnId, record]))
  return {
    records: value.records.map((record, index) => {
      const existing = previousByTurnId.get(record.turnId)
      const storedAt = existing?.storedAt ?? (now + index)
      return buildStoredTurnFileChangesSummary(record, storedAt)
    }),
    latestReversibleTurnId: value.latestReversibleTurnId,
  }
}

function buildStoredFileChangeSummaryMap(state: Record<string, UiTurnFileChanges>): Record<string, StoredTurnFileChangesSummary> {
  const previousState = loadStoredLatestFileChangesMap()
  const now = Date.now()
  const entries = Object.entries(state)
    .map(([threadId, value], index) => {
      const previous = previousState[threadId]
      const isSameTurn = previous?.turnId === value.turnId
      const storedAt = isSameTurn ? previous.storedAt : now + index
      return [threadId, buildStoredTurnFileChangesSummary(value, storedAt)] as const
    })
    .sort((first, second) => second[1].storedAt - first[1].storedAt)
    .slice(0, MAX_STORED_FILE_CHANGE_THREADS)

  return Object.fromEntries(entries)
}

function buildStoredThreadFileChangeTimelineMap(
  state: Record<string, UiThreadFileChangeTimeline>,
): Record<string, StoredTurnFileChangeTimeline> {
  const previousState = loadStoredThreadFileChangeTimelineMap()
  const now = Date.now()
  const entries = Object.entries(state)
    .map(([threadId, value], index) => {
      const previous = previousState[threadId] ?? null
      const summary = buildStoredThreadFileChangeTimelineSummary(value, previous, now + (index * 1000))
      const storedAt = summary.records.at(-1)?.storedAt ?? 0
      return [threadId, summary, storedAt] as const
    })
    .sort((first, second) => second[2] - first[2])
    .slice(0, MAX_STORED_FILE_CHANGE_THREADS)

  return Object.fromEntries(entries.map(([threadId, summary]) => [threadId, summary]))
}

export function loadReadStateMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(READ_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function saveReadStateMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function loadAutoRefreshEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AUTO_REFRESH_ENABLED_STORAGE_KEY) === '1'
}

export function saveAutoRefreshEnabled(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTO_REFRESH_ENABLED_STORAGE_KEY, value ? '1' : '0')
}

export function loadThreadScrollStateMap(): Record<string, ThreadScrollState> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(SCROLL_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, ThreadScrollState> = {}
    for (const [threadId, state] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalizedState = normalizeThreadScrollState(state)
      if (normalizedState) {
        normalizedMap[threadId] = normalizedState
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadScrollStateMap(state: Record<string, ThreadScrollState>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SCROLL_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function loadSelectedThreadId(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(SELECTED_THREAD_STORAGE_KEY)
  return raw ?? ''
}

export function saveSelectedThreadId(threadId: string): void {
  if (typeof window === 'undefined') return
  if (!threadId) {
    window.localStorage.removeItem(SELECTED_THREAD_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_THREAD_STORAGE_KEY, threadId)
}

export function loadProjectOrder(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const order: string[] = []
    for (const item of parsed) {
      if (typeof item === 'string' && item.length > 0 && !order.includes(item)) {
        order.push(item)
      }
    }
    return order
  } catch {
    return []
  }
}

export function saveProjectOrder(order: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(order))
}

export function loadProjectDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROJECT_DISPLAY_NAME_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const displayNames: Record<string, string> = {}
    for (const [projectName, displayName] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof projectName === 'string' && projectName.length > 0 && typeof displayName === 'string') {
        displayNames[projectName] = displayName
      }
    }
    return displayNames
  } catch {
    return {}
  }
}

export function saveProjectDisplayNames(displayNames: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, JSON.stringify(displayNames))
}

export function loadThreadContextUsageMap(): Record<string, UiThreadContextUsage> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const normalizedMap: Record<string, UiThreadContextUsage> = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalized = normalizeThreadContextUsage(value)
      if (normalized) normalizedMap[threadId] = normalized
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadContextUsageMap(state: Record<string, UiThreadContextUsage>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONTEXT_USAGE_STORAGE_KEY, JSON.stringify(state))
}

export function loadLatestFileChangesMap(): Record<string, UiTurnFileChanges> {
  if (typeof window === 'undefined') return {}
  const storedState = loadStoredLatestFileChangesMap()
  if (Object.keys(storedState).length === 0) {
    debugFileChangesStorage('load:miss', { storageKey: FILE_CHANGES_STORAGE_KEY })
    return {}
  }
  const normalizedMap = Object.fromEntries(
    Object.entries(storedState).map(([threadId, value]) => [threadId, toUiTurnFileChanges(value)]),
  ) as Record<string, UiTurnFileChanges>
  debugFileChangesStorage('load:hit', {
    storageKey: FILE_CHANGES_STORAGE_KEY,
    threadIds: Object.keys(normalizedMap).map((value) => shortenDebugId(value)),
  })
  return normalizedMap
}

export function loadThreadFileChangeTimelineMap(): Record<string, UiThreadFileChangeTimeline> {
  if (typeof window === 'undefined') return {}
  const storedState = loadStoredThreadFileChangeTimelineMap()
  if (Object.keys(storedState).length === 0) {
    debugFileChangesStorage('load-timeline:miss', { storageKey: FILE_CHANGES_STORAGE_KEY })
    return {}
  }
  const normalizedMap = Object.fromEntries(
    Object.entries(storedState).map(([threadId, value]) => [threadId, {
      threadId,
      records: value.records.map((record, index, records) => ({
        ...toUiThreadTurnFileChangeRecord(record),
        isLatestChangeTurn: index === records.length - 1,
      })),
      latestReversibleTurnId: value.latestReversibleTurnId,
    }]),
  ) as Record<string, UiThreadFileChangeTimeline>
  debugFileChangesStorage('load-timeline:hit', {
    storageKey: FILE_CHANGES_STORAGE_KEY,
    threadIds: Object.keys(normalizedMap).map((value) => shortenDebugId(value)),
  })
  return normalizedMap
}

export function saveLatestFileChangesMap(state: Record<string, UiTurnFileChanges>): void {
  if (typeof window === 'undefined') return
  try {
    const storedState = buildStoredFileChangeSummaryMap(state)
    window.localStorage.setItem(FILE_CHANGES_STORAGE_KEY, JSON.stringify(storedState))
    debugFileChangesStorage('save', {
      storageKey: FILE_CHANGES_STORAGE_KEY,
      threadIds: Object.keys(storedState).map((value) => shortenDebugId(value)),
      turnIds: Object.values(storedState).map((value) => shortenDebugId(value.turnId)),
    })
  } catch {
    debugFileChangesStorage('save:error', { storageKey: FILE_CHANGES_STORAGE_KEY })
  }
}

export function saveThreadFileChangeTimelineMap(state: Record<string, UiThreadFileChangeTimeline>): void {
  if (typeof window === 'undefined') return
  try {
    const storedState = buildStoredThreadFileChangeTimelineMap(state)
    window.localStorage.setItem(FILE_CHANGES_STORAGE_KEY, JSON.stringify(storedState))
    debugFileChangesStorage('save-timeline', {
      storageKey: FILE_CHANGES_STORAGE_KEY,
      threadIds: Object.keys(storedState).map((value) => shortenDebugId(value)),
    })
  } catch {
    debugFileChangesStorage('save-timeline:error', { storageKey: FILE_CHANGES_STORAGE_KEY })
  }
}

export function loadRateLimitUsage(): UiRateLimitUsage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(RATE_LIMIT_USAGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return normalizeRateLimitUsage(parsed)
  } catch {
    return null
  }
}

export function saveRateLimitUsage(value: UiRateLimitUsage | null): void {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(RATE_LIMIT_USAGE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(RATE_LIMIT_USAGE_STORAGE_KEY, JSON.stringify(value))
}

export function loadWorkspaceBaseBranchMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(WORKSPACE_BASE_BRANCH_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalized: Record<string, string> = {}
    for (const [cwd, branch] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof cwd !== 'string' || cwd.trim().length === 0) continue
      if (typeof branch !== 'string' || branch.trim().length === 0) continue
      normalized[cwd.trim()] = branch.trim()
    }
    return normalized
  } catch {
    return {}
  }
}

export function saveWorkspaceBaseBranchMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORKSPACE_BASE_BRANCH_STORAGE_KEY, JSON.stringify(state))
}
