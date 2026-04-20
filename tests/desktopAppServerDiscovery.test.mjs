import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const discoveryModulePromise = import('../src/server/desktopAppServerDiscovery.ts')

async function createStateDbWithEnrollment() {
  const { DatabaseSync } = await import('node:sqlite')
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-desktop-discovery-'))
  const stateDbPath = join(rootDir, 'state.sqlite')
  const database = new DatabaseSync(stateDbPath)

  database.exec(`
    CREATE TABLE remote_control_enrollments (
      websocket_url TEXT NOT NULL,
      account_id TEXT NOT NULL,
      app_server_client_name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      server_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (websocket_url, account_id, app_server_client_name)
    );
  `)

  database.prepare(`
    INSERT INTO remote_control_enrollments (
      websocket_url,
      account_id,
      app_server_client_name,
      server_id,
      environment_id,
      server_name,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ws://127.0.0.1:4217',
    'account-test',
    'desktop-codex',
    'server-test',
    'env-test',
    'Codex Desktop',
    1713542400000,
  )

  database.close()
  return stateDbPath
}

test('discoverDesktopAppServer returns available when an explicit websocket endpoint is configured', async () => {
  const { discoverDesktopAppServer } = await discoveryModulePromise

  const result = await discoverDesktopAppServer({
    env: {
      CODEX_DESKTOP_APP_SERVER_WS_URL: 'ws://127.0.0.1:4317',
    },
    stateDbPath: join(homedir(), '.codex', 'missing-for-test.sqlite'),
  })

  assert.deepEqual(result, {
    status: 'available',
    endpoint: {
      transport: 'websocket',
      url: 'ws://127.0.0.1:4317',
      authToken: null,
      source: 'env',
      accountId: null,
      appServerClientName: null,
      serverId: null,
      environmentId: null,
      serverName: null,
    },
  })
})

test('discoverDesktopAppServer returns unavailable when no explicit endpoint or persisted enrollment exists', async () => {
  const { discoverDesktopAppServer } = await discoveryModulePromise
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-desktop-discovery-empty-'))
  const stateDbPath = join(rootDir, 'state.sqlite')
  await writeFile(stateDbPath, '', 'utf8')

  const result = await discoverDesktopAppServer({
    env: {},
    stateDbPath,
  })

  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'no_enrollment',
    message: 'No persisted desktop app-server enrollment was found.',
  })
})

test('discoverDesktopAppServer returns malformed when the websocket endpoint is invalid', async () => {
  const { discoverDesktopAppServer } = await discoveryModulePromise

  const result = await discoverDesktopAppServer({
    env: {
      CODEX_DESKTOP_APP_SERVER_WS_URL: 'http://127.0.0.1:4317',
    },
    stateDbPath: join(homedir(), '.codex', 'missing-for-test.sqlite'),
  })

  assert.deepEqual(result, {
    status: 'malformed',
    reason: 'invalid_websocket_url',
    message: 'Expected a ws:// or wss:// desktop app-server URL.',
  })
})

test('discoverDesktopAppServer reuses the latest persisted desktop enrollment from sqlite state', async () => {
  const { discoverDesktopAppServer } = await discoveryModulePromise
  const stateDbPath = await createStateDbWithEnrollment()

  const result = await discoverDesktopAppServer({
    env: {},
    stateDbPath,
  })

  assert.deepEqual(result, {
    status: 'available',
    endpoint: {
      transport: 'websocket',
      url: 'ws://127.0.0.1:4217',
      authToken: null,
      source: 'state_db',
      accountId: 'account-test',
      appServerClientName: 'desktop-codex',
      serverId: 'server-test',
      environmentId: 'env-test',
      serverName: 'Codex Desktop',
    },
  })
})

test('discoverDesktopAppServer prefers desktop-specific home over CODEX_HOME when resolving the state db path', async () => {
  const { discoverDesktopAppServer } = await discoveryModulePromise
  const desktopHomeDir = await mkdtemp(join(tmpdir(), 'codex-web-local-desktop-home-'))
  const otherHomeDir = await mkdtemp(join(tmpdir(), 'codex-web-local-other-home-'))
  const stateDbPath = join(desktopHomeDir, 'state_5.sqlite')
  await writeFile(join(otherHomeDir, 'state_5.sqlite'), '', 'utf8')

  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(stateDbPath)
  database.exec(`
    CREATE TABLE remote_control_enrollments (
      websocket_url TEXT NOT NULL,
      account_id TEXT NOT NULL,
      app_server_client_name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      server_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (websocket_url, account_id, app_server_client_name)
    );
  `)
  database.prepare(`
    INSERT INTO remote_control_enrollments (
      websocket_url,
      account_id,
      app_server_client_name,
      server_id,
      environment_id,
      server_name,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ws://127.0.0.1:4318',
    'account-desktop',
    'desktop-codex',
    'server-desktop',
    'env-desktop',
    'Codex Desktop',
    1713542400001,
  )
  database.close()

  const result = await discoverDesktopAppServer({
    env: {
      CODEX_HOME: otherHomeDir,
      CODEX_DESKTOP_CODEX_HOME: desktopHomeDir,
    },
  })

  assert.deepEqual(result, {
    status: 'available',
    endpoint: {
      transport: 'websocket',
      url: 'ws://127.0.0.1:4318',
      authToken: null,
      source: 'state_db',
      accountId: 'account-desktop',
      appServerClientName: 'desktop-codex',
      serverId: 'server-desktop',
      environmentId: 'env-desktop',
      serverName: 'Codex Desktop',
    },
  })
})
