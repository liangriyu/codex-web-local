import { readFile } from 'node:fs/promises'

import type { UiChangedFile, UiThreadFileChangeTimeline, UiThreadTurnFileChangeRecord, UiTurnFileChanges } from '../types/codex.ts'
// @ts-ignore - tests import this TypeScript module directly via node:test.
import { mergeThreadFileChangeTimelineRecords } from '../utils/threadFileChanges.ts'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTurnId(record: Record<string, unknown>, candidate: Record<string, unknown> | null): string {
  return (
    readText(record.turnId) ||
    readText(record.turn_id) ||
    readText(candidate?.turnId) ||
    readText(candidate?.turn_id)
  )
}

function readRecordTurnId(record: Record<string, unknown>): string {
  return (
    readText(record.turnId) ||
    readText(record.turn_id) ||
    readText(asRecord(record.payload)?.turnId) ||
    readText(asRecord(record.payload)?.turn_id) ||
    readText(asRecord(record.item)?.turnId) ||
    readText(asRecord(record.item)?.turn_id)
  )
}

function readToolCall(record: Record<string, unknown>): { turnId: string; name: string; input: string } | null {
  const nestedCandidates = [
    asRecord(record.item),
    asRecord(record.payload),
    record,
  ]

  for (const candidate of nestedCandidates) {
    if (!candidate) continue
    if (readText(candidate.type) !== 'custom_tool_call') continue

    const name = readText(candidate.name)
    const input = readText(candidate.arguments) || readText(candidate.input)
    if (!name || !input) continue

    return {
      turnId: toTurnId(record, candidate),
      name,
      input,
    }
  }

  return null
}

function ensureFile(
  filesByPath: Map<string, UiChangedFile>,
  order: string[],
  path: string,
): UiChangedFile {
  const normalizedPath = path.trim()
  const existing = filesByPath.get(normalizedPath)
  if (existing) return existing

  const created: UiChangedFile = {
    path: normalizedPath,
    additions: 0,
    deletions: 0,
    diff: '',
  }
  filesByPath.set(normalizedPath, created)
  order.push(normalizedPath)
  return created
}

function moveTrackedFile(
  filesByPath: Map<string, UiChangedFile>,
  order: string[],
  currentPath: string,
  nextPath: string,
): string {
  const normalizedCurrentPath = currentPath.trim()
  const normalizedNextPath = nextPath.trim()
  if (!normalizedCurrentPath || !normalizedNextPath || normalizedCurrentPath === normalizedNextPath) {
    return normalizedCurrentPath
  }

  const existing = filesByPath.get(normalizedCurrentPath)
  if (!existing) {
    ensureFile(filesByPath, order, normalizedNextPath)
    return normalizedNextPath
  }

  const destination = ensureFile(filesByPath, order, normalizedNextPath)
  destination.additions += existing.additions
  destination.deletions += existing.deletions
  filesByPath.delete(normalizedCurrentPath)

  const orderIndex = order.indexOf(normalizedCurrentPath)
  if (orderIndex >= 0) {
    order.splice(orderIndex, 1)
  }

  return normalizedNextPath
}

function parseApplyPatchSummary(input: string): UiChangedFile[] {
  const filesByPath = new Map<string, UiChangedFile>()
  const order: string[] = []
  const diffLinesByPath = new Map<string, string[]>()
  let currentPath = ''

  const lines = input.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.startsWith('*** Add File: ')) {
      currentPath = line.slice('*** Add File: '.length).trim()
      if (currentPath) {
        ensureFile(filesByPath, order, currentPath)
        diffLinesByPath.set(currentPath, [])
      }
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      currentPath = line.slice('*** Update File: '.length).trim()
      if (currentPath) {
        ensureFile(filesByPath, order, currentPath)
        diffLinesByPath.set(currentPath, [])
      }
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      currentPath = line.slice('*** Delete File: '.length).trim()
      if (currentPath) {
        ensureFile(filesByPath, order, currentPath)
        diffLinesByPath.set(currentPath, [])
      }
      continue
    }

    if (line.startsWith('*** Move to: ')) {
      currentPath = moveTrackedFile(filesByPath, order, currentPath, line.slice('*** Move to: '.length))
      continue
    }

    if (!currentPath || line.startsWith('*** ')) continue

    const file = filesByPath.get(currentPath)
    if (!file) continue
    const diffLines = diffLinesByPath.get(currentPath) ?? []

    if (line.startsWith('@@')) {
      diffLines.push(line)
      diffLinesByPath.set(currentPath, diffLines)
      continue
    }

    if (line.startsWith('+')) {
      file.additions += 1
      diffLines.push(line)
      diffLinesByPath.set(currentPath, diffLines)
      continue
    }

    if (line.startsWith('-')) {
      file.deletions += 1
      diffLines.push(line)
      diffLinesByPath.set(currentPath, diffLines)
      continue
    }

    if (rawLine.startsWith(' ')) {
      diffLines.push(rawLine)
      diffLinesByPath.set(currentPath, diffLines)
    }
  }

  return order
    .map((path) => {
      const file = filesByPath.get(path)
      if (!file) return null
      return {
        ...file,
        diff: (diffLinesByPath.get(path) ?? []).join('\n').trim(),
      }
    })
    .filter((value): value is UiChangedFile => Boolean(value))
}

function toTimelineRecord(turnId: string, files: UiChangedFile[], createdAtIso: string | null): UiThreadTurnFileChangeRecord {
  return {
    turnId,
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    createdAtIso,
    source: 'session_fallback',
    canUndo: false,
    canReapply: false,
    isLatestChangeTurn: false,
    isReverted: false,
  }
}

function readCreatedAtIso(record: Record<string, unknown>): string | null {
  const createdAt = readText(record.createdAt) || readText(record.timestamp)
  return createdAt || null
}

export async function readThreadFileChangesTimelineFromSessionPath(sessionPath: string): Promise<UiThreadTurnFileChangeRecord[]> {
  const normalizedPath = sessionPath.trim()
  if (!normalizedPath) return []
  const sessionJsonl = await readFile(normalizedPath, 'utf8')
  return readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)
}

export async function readThreadFileChangesTimelineFromSessionJsonl(
  sessionJsonl: string,
): Promise<UiThreadTurnFileChangeRecord[]> {
  const lines = sessionJsonl.split('\n')
  const timeline: Array<{ order: number; record: UiThreadTurnFileChangeRecord }> = []
  let lastSeenTurnId = ''

  for (const line of lines) {
    const raw = line.trim()
    if (!raw) continue

    let record: Record<string, unknown> | null = null
    try {
      record = asRecord(JSON.parse(raw))
    } catch {
      continue
    }
    if (!record) continue

    const recordTurnId = readRecordTurnId(record)
    if (recordTurnId) {
      lastSeenTurnId = recordTurnId
    }

    const toolCall = readToolCall(record)
    if (!toolCall || toolCall.name !== 'apply_patch') continue

    const files = parseApplyPatchSummary(toolCall.input)
    if (files.length === 0) continue

    timeline.push({
      order: timeline.length,
      record: toTimelineRecord(toolCall.turnId || lastSeenTurnId, files, readCreatedAtIso(record)),
    })
  }

  timeline.sort((first, second) => {
    const firstTime = first.record.createdAtIso ? Date.parse(first.record.createdAtIso) : Number.NaN
    const secondTime = second.record.createdAtIso ? Date.parse(second.record.createdAtIso) : Number.NaN
    const firstHasTime = Number.isFinite(firstTime)
    const secondHasTime = Number.isFinite(secondTime)
    if (firstHasTime && secondHasTime && firstTime !== secondTime) {
      return firstTime - secondTime
    }
    if (firstHasTime !== secondHasTime) {
      return firstHasTime ? -1 : 1
    }
    return first.order - second.order
  })

  const mergedTimeline = mergeThreadFileChangeTimelineRecords(timeline.map(({ record }) => record))
  const latestTurnId = mergedTimeline.at(-1)?.turnId ?? ''
  return mergedTimeline.map((record) => ({
    ...record,
    isLatestChangeTurn: record.turnId === latestTurnId,
  }))
}

export async function readThreadFileChangesFallbackFromSessionPath(sessionPath: string): Promise<UiTurnFileChanges | null> {
  const timeline = await readThreadFileChangesTimelineFromSessionPath(sessionPath)
  const latest = timeline.at(-1)
  if (!latest) return null
  return {
    turnId: latest.turnId,
    files: latest.files,
    totalAdditions: latest.totalAdditions,
    totalDeletions: latest.totalDeletions,
  }
}

export async function readThreadFileChangesFallbackFromSessionJsonl(
  sessionJsonl: string,
): Promise<UiTurnFileChanges | null> {
  const timeline = await readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)
  const latest = timeline.at(-1)
  if (!latest) return null
  return {
    turnId: latest.turnId,
    files: latest.files,
    totalAdditions: latest.totalAdditions,
    totalDeletions: latest.totalDeletions,
  }
}
