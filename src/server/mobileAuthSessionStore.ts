import { randomUUID } from 'node:crypto'

export type MobileAuthSessionStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'expired'
  | 'public_url_changed'
  | 'server_restarted'

export type MobileAuthSessionRecord = {
  loginSessionId: string
  appServerLoginId: string
  state: string
  status: Exclude<MobileAuthSessionStatus, 'server_restarted'>
  createdAt: string
  expiresAt: string
  publicBaseUrlSnapshot: string
  originalCallbackUrl: string
  error: string | null
}

export type MobileAuthSessionStatusResult = {
  loginSessionId: string
  status: Exclude<MobileAuthSessionStatus, 'server_restarted'>
  expiresAt: string
  error: string | null
}

type CreateMobileAuthSessionInput = {
  appServerLoginId: string
  state: string
  originalCallbackUrl: string
  publicBaseUrlSnapshot: string
  nowMs?: number
}

type MobileAuthSessionStoreOptions = {
  ttlMs?: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000
const CALLBACK_PATH = '/auth/chatgpt/callback'

function parseAbsoluteUrl(value: string): URL | null {
  const normalized = value.trim()
  if (!normalized) return null
  try {
    return new URL(normalized)
  } catch {
    return null
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]'
}

export function normalizePublicBaseUrl(value: string | null | undefined): string | null {
  const parsed = parseAbsoluteUrl(value ?? '')
  if (!parsed || parsed.protocol !== 'https:') {
    return null
  }

  parsed.hash = ''

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/u, '')
  } else {
    parsed.pathname = ''
  }

  return parsed.toString().replace(/\/$/u, '')
}

export function rewriteAuthUrlForMobileCallback(
  authUrl: string,
  publicBaseUrl: string,
): {
  authUrl: string
  state: string
  originalCallbackUrl: string
} {
  const parsedAuthUrl = parseAbsoluteUrl(authUrl)
  if (!parsedAuthUrl) {
    throw new Error('Invalid auth URL returned by app-server')
  }

  const state = parsedAuthUrl.searchParams.get('state')?.trim() ?? ''
  if (!state) {
    throw new Error('ChatGPT auth URL is missing state')
  }

  let callbackParamName = ''
  let originalCallbackUrl = ''
  for (const [name, value] of parsedAuthUrl.searchParams.entries()) {
    const parsedValue = parseAbsoluteUrl(value)
    if (!parsedValue || !isLoopbackHost(parsedValue.hostname)) continue
    callbackParamName = name
    originalCallbackUrl = parsedValue.toString()
    break
  }

  if (!callbackParamName || !originalCallbackUrl) {
    throw new Error('ChatGPT auth URL does not expose a loopback callback URL')
  }

  const publicCallbackUrl = new URL(CALLBACK_PATH, `${normalizePublicBaseUrl(publicBaseUrl) ?? publicBaseUrl}/`)
  parsedAuthUrl.searchParams.set(callbackParamName, publicCallbackUrl.toString())

  return {
    authUrl: parsedAuthUrl.toString(),
    state,
    originalCallbackUrl,
  }
}

export function buildMobileAuthRelayUrl(originalCallbackUrl: string, callbackUrl: URL): string {
  const relayUrl = parseAbsoluteUrl(originalCallbackUrl)
  if (!relayUrl) {
    throw new Error('Invalid original callback URL')
  }

  for (const [name, value] of callbackUrl.searchParams.entries()) {
    relayUrl.searchParams.set(name, value)
  }

  return relayUrl.toString()
}

export class MobileAuthSessionStore {
  private readonly ttlMs: number
  private readonly sessionsById = new Map<string, MobileAuthSessionRecord>()
  private readonly sessionIdByState = new Map<string, string>()

  constructor(options: MobileAuthSessionStoreOptions = {}) {
    this.ttlMs = typeof options.ttlMs === 'number' && options.ttlMs > 0
      ? options.ttlMs
      : DEFAULT_TTL_MS
  }

  create(input: CreateMobileAuthSessionInput): MobileAuthSessionRecord {
    const nowMs = input.nowMs ?? Date.now()
    this.pruneExpired(nowMs)

    const session: MobileAuthSessionRecord = {
      loginSessionId: randomUUID(),
      appServerLoginId: input.appServerLoginId,
      state: input.state,
      status: 'pending',
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.ttlMs).toISOString(),
      publicBaseUrlSnapshot: input.publicBaseUrlSnapshot,
      originalCallbackUrl: input.originalCallbackUrl,
      error: null,
    }

    this.sessionsById.set(session.loginSessionId, session)
    this.sessionIdByState.set(session.state, session.loginSessionId)
    return session
  }

  readByState(state: string): MobileAuthSessionRecord | null {
    const loginSessionId = this.sessionIdByState.get(state.trim())
    if (!loginSessionId) return null
    return this.sessionsById.get(loginSessionId) ?? null
  }

  markSuccessByState(state: string): MobileAuthSessionRecord | null {
    return this.updateByState(state, {
      status: 'success',
      error: null,
    })
  }

  markFailedByState(state: string, error: string): MobileAuthSessionRecord | null {
    return this.updateByState(state, {
      status: 'failed',
      error: error.trim() || 'Login failed',
    })
  }

  readStatus(
    loginSessionId: string,
    currentPublicBaseUrl: string | null,
    nowMs = Date.now(),
  ): MobileAuthSessionStatusResult | null {
    this.pruneExpired(nowMs)
    const session = this.sessionsById.get(loginSessionId.trim())
    if (!session) return null

    const expiresAtMs = Date.parse(session.expiresAt)
    if (Number.isFinite(expiresAtMs) && nowMs >= expiresAtMs && session.status === 'pending') {
      session.status = 'expired'
    }

    if (
      session.status === 'pending'
      && currentPublicBaseUrl
      && currentPublicBaseUrl !== session.publicBaseUrlSnapshot
    ) {
      return {
        loginSessionId: session.loginSessionId,
        status: 'public_url_changed',
        expiresAt: session.expiresAt,
        error: session.error,
      }
    }

    return {
      loginSessionId: session.loginSessionId,
      status: session.status,
      expiresAt: session.expiresAt,
      error: session.error,
    }
  }

  private updateByState(
    state: string,
    next: Pick<MobileAuthSessionRecord, 'status' | 'error'>,
  ): MobileAuthSessionRecord | null {
    const session = this.readByState(state)
    if (!session) return null
    session.status = next.status
    session.error = next.error
    return session
  }

  private pruneExpired(nowMs: number): void {
    for (const [loginSessionId, session] of this.sessionsById.entries()) {
      const expiresAtMs = Date.parse(session.expiresAt)
      if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) continue
      if (session.status === 'pending') {
        session.status = 'expired'
      }
      if (nowMs - expiresAtMs > this.ttlMs) {
        this.sessionsById.delete(loginSessionId)
        this.sessionIdByState.delete(session.state)
      }
    }
  }
}
