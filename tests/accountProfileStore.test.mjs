import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'

import {
  listAccountProfiles,
  readAccountProfileSnapshot,
  resolveAccountProfileStorePath,
  setActiveAccountProfile,
  upsertAccountProfile,
  removeAccountProfile,
} from '../src/server/accountProfileStore.ts'

test('resolveAccountProfileStorePath stays under CODEX_HOME', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-account-profiles-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    const path = resolveAccountProfileStorePath()
    assert.equal(relative(tempCodexHome, path).startsWith('..'), false)
    assert.equal(path.endsWith(join('codex-web-local', 'account-profiles.json')), true)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('account profile store persists profiles and active profile id', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-account-profiles-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    await upsertAccountProfile({
      profileId: 'profile-1',
      accountId: 'account-1',
      provider: 'chatgptAuthTokens',
      email: 'user@example.com',
      planType: 'plus',
      tokenPayload: {
        accessToken: 'token-1',
        chatgptAccountId: 'account-1',
        chatgptPlanType: 'plus',
        expiresAtIso: null,
      },
      managedTokenPayload: {
        idToken: 'id-token-1',
        accessToken: 'token-1',
        refreshToken: 'refresh-token-1',
        accountId: 'account-1',
      },
      status: 'active',
      lastUsedAtIso: '2026-04-21T10:00:00.000Z',
    })
    await setActiveAccountProfile('profile-1')

    const snapshot = await readAccountProfileSnapshot()
    assert.equal(snapshot.activeProfileId, 'profile-1')
    assert.equal(snapshot.profiles.length, 1)
    assert.equal(snapshot.profiles[0].profileId, 'profile-1')
    assert.equal(snapshot.profiles[0].tokenPayload?.accessToken, 'token-1')
    assert.equal(snapshot.profiles[0].managedTokenPayload?.refreshToken, 'refresh-token-1')
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('removing active profile clears activeProfileId', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-account-profiles-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    await upsertAccountProfile({
      profileId: 'profile-2',
      accountId: 'account-2',
      provider: 'chatgptAuthTokens',
      email: null,
      planType: null,
      tokenPayload: null,
      status: 'inactive',
      lastUsedAtIso: null,
    })
    await setActiveAccountProfile('profile-2')
    await removeAccountProfile('profile-2')

    const profiles = await listAccountProfiles()
    const snapshot = await readAccountProfileSnapshot()
    assert.equal(profiles.length, 0)
    assert.equal(snapshot.activeProfileId, null)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('legacy account profile payload migrates from codexHomeDir profiles', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-account-profiles-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    const profileStoreDir = join(tempCodexHome, 'codex-web-local')
    const legacySecondaryProfileHome = join(profileStoreDir, 'profiles', 'legacy-secondary')
    await mkdir(profileStoreDir, { recursive: true })
    await mkdir(legacySecondaryProfileHome, { recursive: true })

    await writeFile(
      join(tempCodexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: 'id-current',
          access_token: 'token-current',
          refresh_token: 'refresh-current',
          account_id: 'account-current',
        },
      }),
      'utf8',
    )

    await writeFile(
      join(legacySecondaryProfileHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: 'id-legacy-secondary',
          access_token: 'token-legacy-secondary',
          refresh_token: 'refresh-legacy-secondary',
          account_id: 'account-legacy-secondary',
        },
      }),
      'utf8',
    )

    await writeFile(
      resolveAccountProfileStorePath(),
      JSON.stringify({
        version: 1,
        activeProfileId: 'default',
        profiles: [
          {
            id: 'default',
            name: '默认账号',
            codexHomeDir: tempCodexHome,
            createdAt: '2026-04-12T12:05:18.322Z',
            updatedAt: '2026-04-14T06:00:08.663Z',
            lastUsedAt: '2026-04-14T06:00:08.663Z',
          },
          {
            id: 'legacy-secondary',
            name: '账号 2',
            codexHomeDir: legacySecondaryProfileHome,
            createdAt: '2026-04-13T00:08:59.605Z',
            updatedAt: '2026-04-20T16:39:31.035Z',
            lastUsedAt: '2026-04-20T16:39:31.035Z',
          },
        ],
      }, null, 2),
      'utf8',
    )

    const snapshot = await readAccountProfileSnapshot()
    assert.equal(snapshot.activeProfileId, 'default')
    assert.equal(snapshot.profiles.length, 2)
    assert.equal(snapshot.profiles[0].profileId, 'default')
    assert.equal(snapshot.profiles[0].tokenPayload?.accessToken, 'token-current')
    assert.equal(snapshot.profiles[0].tokenPayload?.chatgptAccountId, 'account-current')
    assert.equal(snapshot.profiles[0].managedTokenPayload?.idToken, 'id-current')
    assert.equal(snapshot.profiles[0].managedTokenPayload?.refreshToken, 'refresh-current')
    assert.equal(snapshot.profiles[1].profileId, 'legacy-secondary')
    assert.equal(snapshot.profiles[1].tokenPayload?.accessToken, 'token-legacy-secondary')
    assert.equal(snapshot.profiles[1].tokenPayload?.chatgptAccountId, 'account-legacy-secondary')
    assert.equal(snapshot.profiles[1].managedTokenPayload?.idToken, 'id-legacy-secondary')
    assert.equal(snapshot.profiles[1].managedTokenPayload?.refreshToken, 'refresh-legacy-secondary')

    const migratedPayload = await readFile(resolveAccountProfileStorePath(), 'utf8')
    assert.match(migratedPayload, /"profileId": "default"/)
    assert.match(migratedPayload, /"profileId": "legacy-secondary"/)
    assert.doesNotMatch(migratedPayload, /"codexHomeDir"/)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})
