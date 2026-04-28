import type { UiChangedFile, UiThreadFileChangeTimeline, UiThreadTurnFileChangeRecord } from '../types/codex'

function isNonEmptyDiff(value: string): boolean {
  return value.trim().length > 0
}

export function mergeChangedFiles(current: UiChangedFile[], incoming: UiChangedFile[]): UiChangedFile[] {
  const order: string[] = []
  const filesByPath = new Map<string, UiChangedFile>()

  for (const file of current) {
    filesByPath.set(file.path, { ...file })
    order.push(file.path)
  }

  for (const file of incoming) {
    const existing = filesByPath.get(file.path)
    const nextFile: UiChangedFile = existing && !isNonEmptyDiff(file.diff) && isNonEmptyDiff(existing.diff)
      ? { ...file, diff: existing.diff }
      : { ...file }

    if (!existing) {
      order.push(file.path)
    }
    filesByPath.set(file.path, nextFile)
  }

  return order
    .map((path) => filesByPath.get(path))
    .filter((file): file is UiChangedFile => file !== undefined)
}

export function mergeTurnFileChangeRecords(
  current: UiThreadTurnFileChangeRecord,
  incoming: UiThreadTurnFileChangeRecord,
): UiThreadTurnFileChangeRecord {
  if (current.turnId !== incoming.turnId) {
    return incoming
  }

  const files = mergeChangedFiles(current.files, incoming.files)
  return {
    ...incoming,
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    createdAtIso: incoming.createdAtIso ?? current.createdAtIso,
  }
}

export function mergeThreadFileChangeTimelineRecords(
  records: UiThreadTurnFileChangeRecord[],
): UiThreadTurnFileChangeRecord[] {
  const recordsByTurnId = new Map<string, UiThreadTurnFileChangeRecord>()
  const order: string[] = []

  for (const record of records) {
    const existing = recordsByTurnId.get(record.turnId)
    if (!existing) {
      recordsByTurnId.set(record.turnId, { ...record, files: record.files.map((file) => ({ ...file })) })
      order.push(record.turnId)
      continue
    }
    recordsByTurnId.set(record.turnId, mergeTurnFileChangeRecords(existing, record))
  }

  const merged = order
    .map((turnId) => recordsByTurnId.get(turnId))
    .filter((record): record is UiThreadTurnFileChangeRecord => record !== undefined)

  const stableOrder = new Map(merged.map((record, index) => [record.turnId, index]))
  merged.sort((first, second) => {
    const firstTime = first.createdAtIso ? Date.parse(first.createdAtIso) : Number.NaN
    const secondTime = second.createdAtIso ? Date.parse(second.createdAtIso) : Number.NaN
    const firstHasTime = Number.isFinite(firstTime)
    const secondHasTime = Number.isFinite(secondTime)
    if (firstHasTime && secondHasTime && firstTime !== secondTime) {
      return firstTime - secondTime
    }
    if (firstHasTime !== secondHasTime) {
      return firstHasTime ? -1 : 1
    }
    return (stableOrder.get(first.turnId) ?? 0) - (stableOrder.get(second.turnId) ?? 0)
  })

  return merged
}

export function mergeThreadFileChangeTimelines(
  current: UiThreadFileChangeTimeline | null,
  incoming: UiThreadFileChangeTimeline,
): UiThreadFileChangeTimeline {
  if (!current) {
    return {
      ...incoming,
      records: mergeThreadFileChangeTimelineRecords(incoming.records),
    }
  }

  const mergedRecords = mergeThreadFileChangeTimelineRecords([
    ...current.records,
    ...incoming.records,
  ])

  return {
    threadId: incoming.threadId,
    latestReversibleTurnId: incoming.latestReversibleTurnId ?? current.latestReversibleTurnId,
    records: mergedRecords.map((record) => ({
      ...record,
      isLatestChangeTurn: record.turnId === (incoming.latestReversibleTurnId ?? current.latestReversibleTurnId ?? mergedRecords.at(-1)?.turnId ?? ''),
    })),
  }
}

export function resolveThreadFileChangeTimelineUpdate(
  current: UiThreadFileChangeTimeline | null,
  incoming: UiThreadFileChangeTimeline,
  options: { authoritative?: boolean } = {},
): UiThreadFileChangeTimeline {
  if (options.authoritative === true) {
    const normalizedRecords = mergeThreadFileChangeTimelineRecords(incoming.records)
    const latestTurnId = incoming.latestReversibleTurnId ?? normalizedRecords.at(-1)?.turnId ?? null
    return {
      threadId: incoming.threadId,
      latestReversibleTurnId: latestTurnId,
      records: normalizedRecords.map((record) => ({
        ...record,
        isLatestChangeTurn: record.turnId === latestTurnId,
      })),
    }
  }

  return mergeThreadFileChangeTimelines(current, incoming)
}
