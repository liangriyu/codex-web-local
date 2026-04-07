import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  UserInput,
} from '../appServerDtos'
import type {
  UiChangedFile,
  UiMessage,
  UiProjectGroup,
  UiThread,
  UiThreadFileChangeTimeline,
  UiThreadTurnFileChangeRecord,
  UiTurnFileChanges,
} from '../../types/codex'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function toProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) || cwd || 'unknown-project'
}

function toRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractCodexUserRequestText(value: string): string {
  const markerRegex = /(?:^|\n)\s{0,3}#{0,6}\s*my request for codex\s*:?\s*/giu
  const matches = Array.from(value.matchAll(markerRegex))
  if (matches.length === 0) {
    return value.trim()
  }

  const lastMatch = matches.at(-1)
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return value.trim()
  }

  const markerOffset = lastMatch.index + lastMatch[0].length
  return value.slice(markerOffset).trim()
}

function parseUserMessageContent(
  itemId: string,
  turnId: string,
  content: UserInput[] | undefined,
): { text: string; images: string[]; rawBlocks: UiMessage[] } {
  if (!Array.isArray(content)) return { text: '', images: [], rawBlocks: [] }

  const textChunks: string[] = []
  const images: string[] = []
  const rawBlocks: UiMessage[] = []

  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      textChunks.push(block.text)
    }
    if (block.type === 'image' && typeof block.url === 'string' && block.url.trim().length > 0) {
      images.push(block.url.trim())
    }

    if (block.type !== 'text' && block.type !== 'image') {
      rawBlocks.push({
        id: `${itemId}:user-content:${index}`,
        role: 'user',
        text: '',
        turnId,
        messageType: `userContent.${block.type}`,
        rawPayload: toRawPayload(block),
        isUnhandled: true,
      })
    }
  }

  return {
    text: extractCodexUserRequestText(textChunks.join('\n')),
    images,
    rawBlocks,
  }
}

function toUiMessages(item: ThreadItem, turnId: string): UiMessage[] {
  if (item.type === 'agentMessage') {
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        turnId,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'userMessage') {
    const parsed = parseUserMessageContent(item.id, turnId, item.content as UserInput[] | undefined)
    const messages: UiMessage[] = []
    const hasRenderableUserContent = parsed.text.length > 0 || parsed.images.length > 0

    if (hasRenderableUserContent) {
      messages.push({
        id: item.id,
        role: 'user',
        text: parsed.text,
        images: parsed.images,
        turnId,
        messageType: item.type,
      })
    }

    messages.push(...parsed.rawBlocks)
    if (messages.length === 0) {
      return []
    }

    return messages
  }

  if (item.type === 'reasoning') {
    return []
  }

  return []
}

function pickThreadName(summary: Thread): string {
  const summaryRecord = summary as unknown as Record<string, unknown>
  const candidates: unknown[] = [
    summaryRecord.name,
    summaryRecord.threadName,
    summaryRecord.thread_name,
    summary.preview,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const normalized = extractCodexUserRequestText(candidate).trim()
    if (normalized.length > 0) {
      return normalized
    }
  }
  return ''
}

function toThreadTitle(summary: Thread): string {
  const named = pickThreadName(summary)
  return named.length > 0 ? named : 'Untitled thread'
}

function toUiThread(summary: Thread): UiThread {
  const branch = typeof summary.gitInfo?.branch === 'string' ? summary.gitInfo.branch.trim() : ''
  return {
    id: summary.id,
    title: toThreadTitle(summary),
    projectName: toProjectName(summary.cwd),
    cwd: summary.cwd,
    branch,
    createdAtIso: toIso(summary.createdAt),
    updatedAtIso: toIso(summary.updatedAt),
    preview: summary.preview,
    unread: false,
    inProgress: false,
  }
}

function groupThreadsByProject(threads: UiThread[]): UiProjectGroup[] {
  const grouped = new Map<string, UiThread[]>()
  for (const thread of threads) {
    const rows = grouped.get(thread.projectName)
    if (rows) rows.push(thread)
    else grouped.set(thread.projectName, [thread])
  }

  return Array.from(grouped.entries())
    .map(([projectName, projectThreads]) => ({
      projectName,
      threads: projectThreads.sort(
        (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.threads[0]?.updatedAtIso ?? 0).getTime()
      const bLast = new Date(b.threads[0]?.updatedAtIso ?? 0).getTime()
      return bLast - aLast
    })
}

export function normalizeThreadGroupsV2(payload: ThreadListResponse): UiProjectGroup[] {
  const uiThreads = payload.data.map(toUiThread)
  return groupThreadsByProject(uiThreads)
}

export function normalizeThreadMessagesV2(payload: ThreadReadResponse): UiMessage[] {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const messages: UiMessage[] = []
  for (const turn of turns) {
    const items = Array.isArray(turn.items) ? turn.items : []
    for (const item of items) {
      messages.push(...toUiMessages(item, turn.id))
    }
  }
  return messages
}

export function normalizeThreadInProgressV2(payload: ThreadReadResponse): boolean {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const latestTurn = turns.at(-1)
  if (!latestTurn || typeof latestTurn.status !== 'string') return false
  return latestTurn.status === 'inProgress'
}

export function normalizeActiveTurnIdV2(payload: ThreadReadResponse): string {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (!turn || typeof turn.id !== 'string' || typeof turn.status !== 'string') continue
    if (turn.status === 'inProgress') return turn.id
  }
  return ''
}

function countDiffLineStats(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  const lines = diff.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function extractChangedFilesFromTurn(turn: { id: string; items?: ThreadItem[] }): UiTurnFileChanges | null {
  const items = Array.isArray(turn.items) ? turn.items : []
  const filesByPath = new Map<string, UiChangedFile>()

  for (const item of items) {
    if (item.type !== 'fileChange') continue
    if (item.status !== 'completed') continue

    for (const change of item.changes) {
      const path = change.path
      if (!path) continue
      const diff = typeof change.diff === 'string' ? change.diff : ''
      const stats = countDiffLineStats(diff)
      const existing = filesByPath.get(path)
      if (existing) {
        existing.additions += stats.additions
        existing.deletions += stats.deletions
        existing.diff = [existing.diff, diff].filter((value) => value.length > 0).join('\n')
      } else {
        filesByPath.set(path, {
          path,
          additions: stats.additions,
          deletions: stats.deletions,
          diff,
        })
      }
    }
  }

  const files = Array.from(filesByPath.values())
  if (files.length === 0) return null

  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)
  return {
    turnId: turn.id,
    files,
    totalAdditions,
    totalDeletions,
  }
}

function toTimelineRecord(changeSet: UiTurnFileChanges, createdAtIso: string | null = null): UiThreadTurnFileChangeRecord {
  return {
    turnId: changeSet.turnId,
    files: changeSet.files,
    totalAdditions: changeSet.totalAdditions,
    totalDeletions: changeSet.totalDeletions,
    createdAtIso,
    source: 'thread_read',
    canUndo: false,
    canReapply: false,
    isLatestChangeTurn: false,
    isReverted: false,
  }
}

export function normalizeThreadFileChangeTimelineV2(payload: ThreadReadResponse): UiThreadFileChangeTimeline | null {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const records = turns
    .map((turn) => extractChangedFilesFromTurn(turn))
    .filter((record): record is UiTurnFileChanges => record !== null)
    .map((record) => toTimelineRecord(record))
  if (records.length === 0) return null
  const latestRecord = records.at(-1) ?? null
  return {
    threadId: payload.thread.id,
    records: records.map((record) => ({
      ...record,
      isLatestChangeTurn: latestRecord?.turnId === record.turnId,
    })),
    latestReversibleTurnId: null,
  }
}

export function normalizeLatestTurnFileChangesV2(payload: ThreadReadResponse): UiTurnFileChanges | null {
  const timeline = normalizeThreadFileChangeTimelineV2(payload)
  const latestRecord = timeline?.records.at(-1)
  if (!latestRecord) return null
  return {
    turnId: latestRecord.turnId,
    files: latestRecord.files,
    totalAdditions: latestRecord.totalAdditions,
    totalDeletions: latestRecord.totalDeletions,
  }
}

export function normalizeTurnDiffToFileChanges(diff: string, turnId: string): UiTurnFileChanges | null {
  const raw = diff.trim()
  if (!raw) return null

  const lines = raw.split('\n')
  const files: UiChangedFile[] = []

  let currentPath = ''
  let currentDiffLines: string[] = []

  const flushCurrent = () => {
    if (!currentPath) {
      currentDiffLines = []
      return
    }
    const fileDiff = currentDiffLines.join('\n').trim()
    const stats = countDiffLineStats(fileDiff)
    files.push({
      path: currentPath,
      additions: stats.additions,
      deletions: stats.deletions,
      diff: fileDiff,
    })
    currentPath = ''
    currentDiffLines = []
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushCurrent()
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)
      currentPath = (match?.[2] ?? match?.[1] ?? '').trim()
      currentDiffLines = [line]
      continue
    }

    if (!currentPath) {
      continue
    }
    currentDiffLines.push(line)
  }
  flushCurrent()

  if (files.length === 0) return null
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)
  return {
    turnId,
    files,
    totalAdditions,
    totalDeletions,
  }
}
