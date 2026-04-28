import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'

import {
  isSharedSessionOwnerLeaseExpired,
  normalizeSharedSessionId,
  readSharedSessionSnapshot,
  resolveSharedSessionSnapshotPath,
  writeSharedSessionSnapshot,
  listSharedSessionSnapshots,
} from '../src/server/sharedSessionStore.ts'

test('resolveSharedSessionSnapshotPath keeps snapshots inside CODEX_HOME and normalizes session ids', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    const normalized = normalizeSharedSessionId('../alpha/../beta..//gamma')
    const path = resolveSharedSessionSnapshotPath('../alpha/../beta..//gamma')

    assert.equal(normalized.includes('/'), false)
    assert.equal(normalized.includes('\\'), false)
    assert.equal(relative(tempCodexHome, path).startsWith('..'), false)
    assert.equal(path.endsWith(`${normalized}.json`), true)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('resolveSharedSessionSnapshotPath falls back to homedir .codex when CODEX_HOME is unset', () => {
  const previousCodexHome = process.env.CODEX_HOME
  delete process.env.CODEX_HOME

  try {
    const normalized = normalizeSharedSessionId('../fallback/session')
    const path = resolveSharedSessionSnapshotPath('../fallback/session')

    assert.equal(
      path,
      join(homedir(), '.codex', 'shared-sessions', `${normalized}.json`),
    )
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
  }
})

test('writeSharedSessionSnapshot persists and readSharedSessionSnapshot returns the same snapshot', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  const snapshot = {
    sessionId: 'session-123',
    sourceThreadId: 'thread-123',
    sourceConversationId: 'conversation-123',
    title: 'Alpha session',
    cwd: '/repo-alpha',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    ownerLeaseExpiresAtIso: '2026-04-04T10:05:00.000Z',
    state: 'running',
    activeTurnId: 'turn-1',
    updatedAtIso: '2026-04-04T10:00:00.000Z',
    timeline: [
      {
        id: 'msg-1',
        kind: 'user_message',
        text: 'hello',
        createdAtIso: '2026-04-04T10:00:00.000Z',
      },
    ],
    latestTurnSummary: {
      turnId: 'turn-1',
      status: 'running',
      summary: 'Working',
      startedAtIso: '2026-04-04T10:00:00.000Z',
      completedAtIso: null,
    },
    attention: {
      pendingApprovalCount: 1,
      pendingApprovalKinds: ['command'],
      pendingAttentionCount: 0,
      latestErrorMessage: null,
      requiresReturnToOwner: true,
    },
    capabilities: {
      canViewHistory: true,
      canRequestTakeover: false,
      canApproveInCurrentClient: true,
    },
  }

  try {
    await writeSharedSessionSnapshot(snapshot)
    const loaded = await readSharedSessionSnapshot('session-123')

    assert.deepEqual(loaded, snapshot)
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('writeSharedSessionSnapshot leaves only the final snapshot file on disk', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  const snapshot = {
    sessionId: 'session-atomic',
    sourceThreadId: 'thread-atomic',
    sourceConversationId: null,
    title: 'Atomic session',
    cwd: '/repo',
    owner: 'web',
    ownerInstanceId: null,
    ownerLeaseExpiresAtIso: null,
    state: 'idle',
    activeTurnId: null,
    updatedAtIso: '2026-04-04T10:00:00.000Z',
    timeline: [],
    latestTurnSummary: null,
    attention: {
      pendingApprovalCount: 0,
      pendingApprovalKinds: [],
      pendingAttentionCount: 0,
      latestErrorMessage: null,
      requiresReturnToOwner: false,
    },
    capabilities: {
      canViewHistory: true,
      canRequestTakeover: true,
      canApproveInCurrentClient: false,
    },
  }

  try {
    await writeSharedSessionSnapshot(snapshot)
    const writtenDir = dirname(resolveSharedSessionSnapshotPath('session-atomic'))
    const fileNames = (await readdir(writtenDir)).sort()

    assert.deepEqual(fileNames, ['session-atomic.json'])
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('listSharedSessionSnapshots returns snapshots in session id order', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  const baseSnapshot = (sessionId, updatedAtIso) => ({
    sessionId,
    sourceThreadId: `${sessionId}-thread`,
    sourceConversationId: null,
    title: sessionId,
    cwd: '/repo',
    owner: 'terminal',
    ownerInstanceId: null,
    ownerLeaseExpiresAtIso: null,
    state: 'idle',
    activeTurnId: null,
    updatedAtIso,
    timeline: [],
    latestTurnSummary: null,
    attention: {
      pendingApprovalCount: 0,
      pendingApprovalKinds: [],
      pendingAttentionCount: 0,
      latestErrorMessage: null,
      requiresReturnToOwner: false,
    },
    capabilities: {
      canViewHistory: true,
      canRequestTakeover: true,
      canApproveInCurrentClient: false,
    },
  })

  try {
    await writeSharedSessionSnapshot(baseSnapshot('beta', '2026-04-04T10:02:00.000Z'))
    await writeSharedSessionSnapshot(baseSnapshot('alpha', '2026-04-04T10:01:00.000Z'))

    const snapshots = await listSharedSessionSnapshots()

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.sessionId),
      ['alpha', 'beta'],
    )
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('readSharedSessionSnapshot throws when snapshot JSON is corrupt', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  try {
    const path = resolveSharedSessionSnapshotPath('corrupt')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '{not json', 'utf8')

    await assert.rejects(
      readSharedSessionSnapshot('corrupt'),
      SyntaxError,
    )
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('listSharedSessionSnapshots skips corrupt snapshot JSON files', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-shared-session-'))
  process.env.CODEX_HOME = tempCodexHome

  const snapshot = {
    sessionId: 'good',
    sourceThreadId: 'thread-good',
    sourceConversationId: null,
    title: 'Good session',
    cwd: '/repo',
    owner: 'terminal',
    ownerInstanceId: null,
    ownerLeaseExpiresAtIso: null,
    state: 'idle',
    activeTurnId: null,
    updatedAtIso: '2026-04-04T10:00:00.000Z',
    timeline: [],
    latestTurnSummary: null,
    attention: {
      pendingApprovalCount: 0,
      pendingApprovalKinds: [],
      pendingAttentionCount: 0,
      latestErrorMessage: null,
      requiresReturnToOwner: false,
    },
    capabilities: {
      canViewHistory: true,
      canRequestTakeover: false,
      canApproveInCurrentClient: false,
    },
  }

  try {
    await writeSharedSessionSnapshot(snapshot)
    await mkdir(dirname(resolveSharedSessionSnapshotPath('broken')), { recursive: true })
    await writeFile(resolveSharedSessionSnapshotPath('broken'), '{not json', 'utf8')

    const snapshots = await listSharedSessionSnapshots()

    assert.deepEqual(snapshots.map((row) => row.sessionId), ['good'])
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})

test('isSharedSessionOwnerLeaseExpired detects expired and active leases', () => {
  assert.equal(
    isSharedSessionOwnerLeaseExpired({
      ownerLeaseExpiresAtIso: '2026-04-04T10:05:00.000Z',
    }, new Date('2026-04-04T10:04:59.000Z')),
    false,
  )
  assert.equal(
    isSharedSessionOwnerLeaseExpired({
      ownerLeaseExpiresAtIso: '2026-04-04T09:59:59.000Z',
    }, new Date('2026-04-04T10:04:59.000Z')),
    true,
  )
  assert.equal(
    isSharedSessionOwnerLeaseExpired({
      ownerLeaseExpiresAtIso: null,
    }, new Date('2026-04-04T10:04:59.000Z')),
    false,
  )
})
