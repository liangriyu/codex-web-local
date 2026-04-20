import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type DesktopAppServerEndpoint = {
  transport: 'websocket'
  url: string
  authToken: string | null
  source: 'env' | 'state_db'
  accountId: string | null
  appServerClientName: string | null
  serverId: string | null
  environmentId: string | null
  serverName: string | null
}

export type DesktopAppServerDiscoveryResult =
  | {
      status: 'available'
      endpoint: DesktopAppServerEndpoint
    }
  | {
      status: 'unavailable'
      reason: 'no_enrollment'
      message: string
    }
  | {
      status: 'malformed'
      reason: 'invalid_websocket_url'
      message: string
    }

type PersistedEnrollmentRow = {
  websocket_url: string
  account_id: string
  app_server_client_name: string
  server_id: string
  environment_id: string
  server_name: string
}

export type DiscoverDesktopAppServerOptions = {
  env?: NodeJS.ProcessEnv
  stateDbPath?: string
}

const NO_ENROLLMENT_RESULT: DesktopAppServerDiscoveryResult = {
  status: 'unavailable',
  reason: 'no_enrollment',
  message: 'No persisted desktop app-server enrollment was found.',
}

function resolveDesktopCodexHomeDir(env: NodeJS.ProcessEnv): string {
  const explicitDesktopHome = env.CODEX_DESKTOP_CODEX_HOME?.trim()
  if (explicitDesktopHome) return explicitDesktopHome

  const configuredCodexHome = env.CODEX_HOME?.trim()
  if (configuredCodexHome) return configuredCodexHome

  return join(homedir(), '.codex')
}

function resolveStateDbPath(env: NodeJS.ProcessEnv): string {
  const explicit = env.CODEX_DESKTOP_STATE_DB_PATH?.trim()
  if (explicit) return explicit
  return join(resolveDesktopCodexHomeDir(env), 'state_5.sqlite')
}

function buildInvalidUrlResult(): DesktopAppServerDiscoveryResult {
  return {
    status: 'malformed',
    reason: 'invalid_websocket_url',
    message: 'Expected a ws:// or wss:// desktop app-server URL.',
  }
}

function normalizeWebSocketUrl(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null
  const value = rawValue.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return null
  }

  const serialized = url.toString()
  if (url.pathname === '/' && !url.search && !url.hash) {
    return serialized.endsWith('/') ? serialized.slice(0, -1) : serialized
  }

  return serialized
}

async function readPersistedEnrollment(stateDbPath: string): Promise<PersistedEnrollmentRow | null> {
  try {
    await access(stateDbPath, fsConstants.R_OK)
  } catch {
    return null
  }

  let sqliteModule: typeof import('node:sqlite') | null = null
  try {
    sqliteModule = await import('node:sqlite')
  } catch {
    return null
  }

  const database = new sqliteModule.DatabaseSync(stateDbPath, { readOnly: true })
  try {
    const row = database.prepare(`
      SELECT
        websocket_url,
        account_id,
        app_server_client_name,
        server_id,
        environment_id,
        server_name
      FROM remote_control_enrollments
      ORDER BY updated_at DESC
      LIMIT 1
    `).get() as PersistedEnrollmentRow | undefined

    return row ?? null
  } catch {
    return null
  } finally {
    database.close()
  }
}

export async function discoverDesktopAppServer(
  options: DiscoverDesktopAppServerOptions = {},
): Promise<DesktopAppServerDiscoveryResult> {
  const env = options.env ?? process.env
  const explicitUrl = env.CODEX_DESKTOP_APP_SERVER_WS_URL?.trim()
  if (explicitUrl) {
    const normalizedUrl = normalizeWebSocketUrl(explicitUrl)
    if (!normalizedUrl) {
      return buildInvalidUrlResult()
    }

    return {
      status: 'available',
      endpoint: {
        transport: 'websocket',
        url: normalizedUrl,
        authToken: env.CODEX_DESKTOP_APP_SERVER_WS_AUTH_TOKEN?.trim() || null,
        source: 'env',
        accountId: null,
        appServerClientName: null,
        serverId: null,
        environmentId: null,
        serverName: null,
      },
    }
  }

  const stateDbPath = options.stateDbPath ?? resolveStateDbPath(env)
  const enrollment = await readPersistedEnrollment(stateDbPath)
  if (!enrollment) {
    return NO_ENROLLMENT_RESULT
  }

  const normalizedUrl = normalizeWebSocketUrl(enrollment.websocket_url)
  if (!normalizedUrl) {
    return buildInvalidUrlResult()
  }

  return {
    status: 'available',
    endpoint: {
      transport: 'websocket',
      url: normalizedUrl,
      authToken: null,
      source: 'state_db',
      accountId: enrollment.account_id,
      appServerClientName: enrollment.app_server_client_name,
      serverId: enrollment.server_id,
      environmentId: enrollment.environment_id,
      serverName: enrollment.server_name,
    },
  }
}
