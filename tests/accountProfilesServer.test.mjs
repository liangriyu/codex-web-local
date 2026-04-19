import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { AccountProfileStore } from '../src/server/accountProfileStore.ts'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('account profile store supports list, create, and switch', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const testCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-profiles-'))
  process.env.CODEX_HOME = testCodexHome

  try {
    const store = new AccountProfileStore()

    const initial = await store.list()
    assert.equal(initial.activeProfileId, 'default')
    assert.equal(initial.profiles.length, 1)
    assert.equal(initial.profiles[0].name, '默认账号')
    assert.equal(initial.profiles[0].codexHomeDir, resolve(testCodexHome))

    const created = await store.create('测试账号')
    assert.equal(created.name, '测试账号')
    assert.notEqual(created.id, 'default')
    assert.equal(created.lastUsedAt, null)
    const createdProfileDir = await stat(created.codexHomeDir)
    assert.equal(createdProfileDir.isDirectory(), true)

    const switched = await store.setActive(created.id)
    assert.equal(switched.id, created.id)
    assert.ok(switched.lastUsedAt)
    const switchedProfileDir = await stat(switched.codexHomeDir)
    assert.equal(switchedProfileDir.isDirectory(), true)

    const latest = await store.list()
    assert.equal(latest.activeProfileId, created.id)
    assert.ok(latest.profiles.some((profile) => profile.id === 'default'))
    assert.ok(latest.profiles.some((profile) => profile.id === created.id))
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
  }
})

test('account profile store hides inactive profiles without auth artifact', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const testCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-profiles-visible-'))
  process.env.CODEX_HOME = testCodexHome

  try {
    const store = new AccountProfileStore()
    const initial = await store.list()
    const defaultProfile = initial.profiles.find((profile) => profile.id === initial.activeProfileId)
    assert.ok(defaultProfile)

    const profile2 = await store.create('账号 2')
    const profile3 = await store.create('账号 3')

    const idTokenPayload = Buffer
      .from(JSON.stringify({ email: 'profile2@example.com' }), 'utf8')
      .toString('base64url')
    const authPayload = JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        id_token: `header.${idTokenPayload}.signature`,
      },
    })
    await writeFile(join(profile2.codexHomeDir, 'auth.json'), authPayload, 'utf8')
    await store.setActive(initial.activeProfileId)

    const visible = await store.listVisible()
    const visibleIds = visible.profiles.map((profile) => profile.id)
    const visibleProfile2 = visible.profiles.find((profile) => profile.id === profile2.id)

    assert.ok(visibleIds.includes(initial.activeProfileId))
    assert.ok(visibleIds.includes(profile2.id))
    assert.ok(!visibleIds.includes(profile3.id))
    assert.ok(visibleProfile2)
    assert.match(visibleProfile2.name, /profile2@example\.com/)

    await store.setActive(profile3.id)
    const visibleAfterSwitch = await store.listVisible()
    const visibleAfterSwitchIds = visibleAfterSwitch.profiles.map((profile) => profile.id)
    assert.ok(visibleAfterSwitchIds.includes(profile3.id))
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
  }
})

test('account profile store keeps conversation artifacts when switching profiles', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const testCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-profiles-sync-'))
  process.env.CODEX_HOME = testCodexHome

  try {
    const store = new AccountProfileStore()
    await store.list()

    await mkdir(join(testCodexHome, 'sessions', '2026', '04'), { recursive: true })
    await mkdir(join(testCodexHome, 'archived_sessions'), { recursive: true })
    await mkdir(join(testCodexHome, 'shared-sessions'), { recursive: true })
    await writeFile(join(testCodexHome, 'state_5.sqlite'), 'state-a', 'utf8')
    await writeFile(join(testCodexHome, 'state_5.sqlite-wal'), 'state-a-wal-content', 'utf8')
    await writeFile(join(testCodexHome, 'logs_1.sqlite'), 'logs-a', 'utf8')
    await writeFile(join(testCodexHome, 'logs_2.sqlite'), 'logs-2-a', 'utf8')
    await writeFile(join(testCodexHome, 'logs_2.sqlite-wal'), 'logs-2-a-wal', 'utf8')
    await writeFile(join(testCodexHome, 'session_index.jsonl'), '{"id":"thread-1"}\n', 'utf8')
    await writeFile(join(testCodexHome, 'sessions', '2026', '04', 'rollout-a.jsonl'), '{"turn":1}\n', 'utf8')
    await writeFile(join(testCodexHome, 'archived_sessions', 'rollout-a.jsonl'), '{"turn":1}\n', 'utf8')
    await writeFile(join(testCodexHome, 'shared-sessions', 'session-a.json'), '{"session":"a"}\n', 'utf8')

    const profile2 = await store.create('账号 2')
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'state_5.sqlite'), 'utf8'),
      'state-a',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'logs_1.sqlite'), 'utf8'),
      'logs-a',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'logs_2.sqlite'), 'utf8'),
      'logs-2-a',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'logs_2.sqlite-wal'), 'utf8'),
      'logs-2-a-wal',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'session_index.jsonl'), 'utf8'),
      '{"id":"thread-1"}\n',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'sessions', '2026', '04', 'rollout-a.jsonl'), 'utf8'),
      '{"turn":1}\n',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'archived_sessions', 'rollout-a.jsonl'), 'utf8'),
      '{"turn":1}\n',
    )
    await assert.rejects(
      readFile(join(profile2.codexHomeDir, 'shared-sessions', 'session-a.json'), 'utf8'),
      { code: 'ENOENT' },
    )

    const sessionIndexRich = '{"id":"thread-2"}\n{"id":"thread-3"}\n'
    await writeFile(join(testCodexHome, 'session_index.jsonl'), sessionIndexRich, 'utf8')
    const stateRich = 'b'
    const stateRichWal = 'state-b-with-more-content-in-wal'
    await writeFile(join(testCodexHome, 'state_5.sqlite'), stateRich, 'utf8')
    await writeFile(join(testCodexHome, 'state_5.sqlite-wal'), stateRichWal, 'utf8')
    await writeFile(join(testCodexHome, 'sessions', '2026', '04', 'rollout-a.jsonl'), '{"turn":1}\n{"turn":2}\n', 'utf8')
    await store.setActive(profile2.id)
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'session_index.jsonl'), 'utf8'),
      sessionIndexRich,
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'state_5.sqlite'), 'utf8'),
      stateRich,
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'state_5.sqlite-wal'), 'utf8'),
      stateRichWal,
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'sessions', '2026', '04', 'rollout-a.jsonl'), 'utf8'),
      '{"turn":1}\n{"turn":2}\n',
    )

    await store.setActive('default')
    await writeFile(join(testCodexHome, 'state_5.sqlite'), 's', 'utf8')
    await rm(join(testCodexHome, 'state_5.sqlite-wal'), { force: true })
    await writeFile(join(profile2.codexHomeDir, 'state_5.sqlite'), 'state-profile-rich', 'utf8')
    await writeFile(join(profile2.codexHomeDir, 'state_5.sqlite-wal'), 'state-profile-rich-wal', 'utf8')
    await store.setActive(profile2.id)
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'state_5.sqlite'), 'utf8'),
      'state-profile-rich',
    )
    assert.equal(
      await readFile(join(profile2.codexHomeDir, 'state_5.sqlite-wal'), 'utf8'),
      'state-profile-rich-wal',
    )
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
  }
})

test('account profile store skips conversation artifact sync in shared mode', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const testCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-profiles-shared-'))
  process.env.CODEX_HOME = testCodexHome

  try {
    const store = new AccountProfileStore({ serverMode: 'shared' })
    await store.list()

    await mkdir(join(testCodexHome, 'sessions', '2026', '04'), { recursive: true })
    await mkdir(join(testCodexHome, 'archived_sessions'), { recursive: true })
    await writeFile(join(testCodexHome, 'state_5.sqlite'), 'state-a', 'utf8')
    await writeFile(join(testCodexHome, 'session_index.jsonl'), '{"id":"thread-1"}\n', 'utf8')
    await writeFile(join(testCodexHome, 'sessions', '2026', '04', 'rollout-a.jsonl'), '{"turn":1}\n', 'utf8')
    await writeFile(join(testCodexHome, 'archived_sessions', 'rollout-a.jsonl'), '{"turn":1}\n', 'utf8')

    const profile2 = await store.create('账号 2')

    await assert.rejects(
      readFile(join(profile2.codexHomeDir, 'state_5.sqlite'), 'utf8'),
      { code: 'ENOENT' },
    )
    await assert.rejects(
      readFile(join(profile2.codexHomeDir, 'session_index.jsonl'), 'utf8'),
      { code: 'ENOENT' },
    )
    await assert.rejects(
      readFile(join(profile2.codexHomeDir, 'sessions', '2026', '04', 'rollout-a.jsonl'), 'utf8'),
      { code: 'ENOENT' },
    )

    await store.setActive(profile2.id)
    await assert.rejects(
      readFile(join(profile2.codexHomeDir, 'archived_sessions', 'rollout-a.jsonl'), 'utf8'),
      { code: 'ENOENT' },
    )
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
  }
})

test('bridge exposes account profile management endpoints', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(bridge, /\/codex-api\/account-profiles/)
  assert.match(bridge, /\/codex-api\/account-profiles\/switch/)
})
