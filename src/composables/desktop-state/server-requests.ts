import type { UiPersistedServerRequest, UiServerRequest } from '../../types/codex'

export function upsertServerRequestMap(
  map: Record<string, UiServerRequest[]>,
  request: UiServerRequest,
  globalScope: string,
): Record<string, UiServerRequest[]> {
  const threadId = request.threadId || globalScope
  const current = map[threadId] ?? []
  const index = current.findIndex((row) => row.id === request.id)
  const nextRows = [...current]

  if (index >= 0) {
    nextRows.splice(index, 1, request)
  } else {
    nextRows.push(request)
  }

  return {
    ...map,
    [threadId]: nextRows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
  }
}

export function removeServerRequestByIdFromMap(
  map: Record<string, UiServerRequest[]>,
  requestId: number,
): Record<string, UiServerRequest[]> {
  const next: Record<string, UiServerRequest[]> = {}
  for (const [threadId, requests] of Object.entries(map)) {
    const filtered = requests.filter((request) => request.id !== requestId)
    if (filtered.length > 0) {
      next[threadId] = filtered
    }
  }
  return next
}

export function listSelectedServerRequests(
  map: Record<string, UiServerRequest[]>,
  selectedThreadId: string,
  globalScope: string,
): UiServerRequest[] {
  const rows: UiServerRequest[] = []
  if (selectedThreadId && Array.isArray(map[selectedThreadId])) {
    rows.push(...map[selectedThreadId])
  }
  if (Array.isArray(map[globalScope])) {
    rows.push(...map[globalScope])
  }
  return rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
}

export function listPersistedServerRequestsForWorkspace(
  map: Record<string, UiPersistedServerRequest[]>,
  cwd: string,
  getThreadCwdById: (threadId: string) => string,
): UiPersistedServerRequest[] {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) return []

  const matches: UiPersistedServerRequest[] = []
  for (const requests of Object.values(map)) {
    if (requests.length === 0) continue
    for (const request of requests) {
      const requestCwd = request.cwd.trim()
      if (requestCwd) {
        if (requestCwd === normalizedCwd) {
          matches.push(request)
        }
        continue
      }

      const mappedCwd = getThreadCwdById(request.threadId)
      if (mappedCwd === normalizedCwd) {
        matches.push(request)
      }
    }
  }

  return matches.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
}
