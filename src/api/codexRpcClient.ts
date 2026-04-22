import type { RpcEnvelope, RpcMethodCatalog } from '../types/codex'
import { CodexApiError, extractErrorMessage } from './codexErrors'

type RpcRequestBody = {
  method: string
  params?: unknown
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
}

type ServerRequestReplyBody = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

type RpcCallOptions = {
  signal?: AbortSignal
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function parseJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function assertHttpOk(
  response: Response,
  payload: unknown,
  context: { method: string; fallbackMessage: string },
): void {
  if (response.ok) {
    return
  }

  throw new CodexApiError(
    extractErrorMessage(payload, context.fallbackMessage),
    {
      code: 'http_error',
      method: context.method,
      status: response.status,
    },
  )
}

async function fetchJsonPayload(
  input: RequestInfo | URL,
  context: { method: string; fallbackMessage: (status: number) => string },
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await parseJsonPayload(response)
  assertHttpOk(response, payload, {
    method: context.method,
    fallbackMessage: context.fallbackMessage(response.status),
  })
  return payload
}

export async function rpcCall<T>(method: string, params?: unknown, options: RpcCallOptions = {}): Promise<T> {
  const body: RpcRequestBody = { method }
  if (params !== undefined) {
    body.params = params
  }

  let response: Response
  try {
    response = await fetch('/codex-api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new CodexApiError(
      error instanceof Error ? error.message : `RPC ${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `RPC ${method} failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const envelope = payload as RpcEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || !('result' in envelope)) {
    throw new CodexApiError(`RPC ${method} returned malformed envelope`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return envelope.result
}

export async function fetchRpcMethodCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/methods')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Method catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/methods',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/notifications')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/notifications',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

function toNotification(value: unknown): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : new Date().toISOString()

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
  }
}

export function subscribeRpcNotifications(onNotification: (value: RpcNotification) => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {}
  }

  const source = new EventSource('/codex-api/events')

  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as unknown
      const notification = toNotification(parsed)
      if (notification) {
        onNotification(notification)
      }
    } catch {
      // Ignore malformed event payloads and keep stream alive.
    }
  }

  return () => {
    source.close()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody): Promise<void> {
  let response: Response
  try {
    response = await fetch('/codex-api/server-requests/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Failed to reply to server request',
      { code: 'network_error', method: 'server-requests/respond' },
    )
  }

  const payload = await parseJsonPayload(response)
  assertHttpOk(response, payload, {
    method: 'server-requests/respond',
    fallbackMessage: `Server request reply failed with HTTP ${response.status}`,
  })
}

export async function fetchPendingServerRequests(): Promise<unknown[]> {
  const payload = await fetchJsonPayload(
    '/codex-api/server-requests/pending',
    {
      method: 'server-requests/pending',
      fallbackMessage: (status) => `Pending server requests failed with HTTP ${status}`,
    },
  )

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}

export async function fetchPersistedServerRequests(): Promise<unknown[]> {
  const payload = await fetchJsonPayload(
    '/codex-api/server-requests/persisted',
    {
      method: 'server-requests/persisted',
      fallbackMessage: (status) => `Persisted server requests failed with HTTP ${status}`,
    },
  )

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}

export async function fetchSharedSessionSnapshots(): Promise<unknown[]> {
  const payload = await fetchJsonPayload(
    '/codex-api/shared-sessions',
    {
      method: 'shared-sessions/list',
      fallbackMessage: (status) => `Shared session snapshots failed with HTTP ${status}`,
    },
  )

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}

export async function fetchSharedSessionSnapshot(sessionId: string): Promise<unknown | null> {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    return null
  }

  const payload = await fetchJsonPayload(
    `/codex-api/shared-sessions/${encodeURIComponent(normalizedSessionId)}`,
    {
      method: 'shared-sessions/read',
      fallbackMessage: (status) => `Shared session ${normalizedSessionId} failed with HTTP ${status}`,
    },
  )

  const record = asRecord(payload)
  return record?.data ?? null
}

export async function fetchThreadFileChangesFallback(
  threadId: string,
  options: RpcCallOptions = {},
): Promise<unknown | null> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) {
    return null
  }

  const query = new URLSearchParams({
    threadId: normalizedThreadId,
  })

  let response: Response
  try {
    response = await fetch(`/codex-api/thread-file-changes/fallback?${query.toString()}`, {
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new CodexApiError(
      error instanceof Error ? error.message : `Thread file changes fallback ${normalizedThreadId} failed before request was sent`,
      {
        code: 'network_error',
        method: 'thread-file-changes/fallback',
      },
    )
  }

  const payload = await parseJsonPayload(response)
  assertHttpOk(response, payload, {
    method: 'thread-file-changes/fallback',
    fallbackMessage: `Thread file changes fallback ${normalizedThreadId} failed with HTTP ${response.status}`,
  })

  const record = asRecord(payload)
  return record?.data ?? null
}

export async function fetchWorkspaceDiffMode(
  cwd: string,
  mode: string,
  options: { baseBranch?: string | null } = {},
): Promise<unknown> {
  const query = new URLSearchParams({
    cwd,
    mode,
  })
  const baseBranch = options.baseBranch?.trim() ?? ''
  if (baseBranch) {
    query.set('baseBranch', baseBranch)
  }
  return await fetchJsonPayload(
    `/codex-api/workspace-diff-mode?${query.toString()}`,
    {
      method: 'workspace-diff-mode',
      fallbackMessage: (status) => `Workspace diff mode failed with HTTP ${status}`,
    },
  )
}

export async function dismissPersistedServerRequests(requestIds: number[]): Promise<number[]> {
  const response = await fetch('/codex-api/server-requests/persisted/dismiss', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestIds }),
  })

  const payload = await parseJsonPayload(response)
  assertHttpOk(response, payload, {
    method: 'server-requests/persisted/dismiss',
    fallbackMessage: `Dismiss persisted server requests failed with HTTP ${response.status}`,
  })

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data)
    ? data.filter((value): value is number => typeof value === 'number' && Number.isInteger(value))
    : []
}
