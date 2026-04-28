import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSharedSessionSnapshot } from '../src/server/sharedSessionProjector.ts'

test('buildSharedSessionSnapshot projects a running thread into running state', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-1',
    sourceThreadId: 'thread-1',
    sourceConversationId: 'conversation-1',
    title: 'Web session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [
      { id: 'msg-1', role: 'user', text: '请检查这个问题' },
      { id: 'msg-2', role: 'assistant', text: '我在分析中' },
    ],
    inProgress: true,
    activeTurnId: 'turn-1',
    pendingServerRequests: [],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:00:00.000Z',
  })

  assert.equal(snapshot.state, 'running')
  assert.equal(snapshot.activeTurnId, 'turn-1')
  assert.equal(snapshot.latestTurnSummary?.status, 'running')
  assert.equal(snapshot.latestTurnSummary?.turnId, 'turn-1')
  assert.equal(snapshot.attention.pendingApprovalCount, 0)
  assert.equal(snapshot.attention.latestErrorMessage, null)
  assert.deepEqual(snapshot.timeline.map((entry) => entry.kind), [
    'user_message',
    'assistant_message',
  ])
  assert.equal(snapshot.capabilities.canViewHistory, true)
  assert.equal(snapshot.capabilities.canRequestTakeover, false)
  assert.equal(snapshot.capabilities.canApproveInCurrentClient, true)
})

test('buildSharedSessionSnapshot projects pending approvals into needs_attention state', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-2',
    sourceThreadId: 'thread-2',
    sourceConversationId: null,
    title: 'Terminal session',
    cwd: '/workspace',
    owner: 'terminal',
    ownerInstanceId: 'terminal-instance-1',
    messages: [],
    inProgress: false,
    activeTurnId: null,
    pendingServerRequests: [
      {
        id: 1,
        method: 'item/commandExecution/requestApproval',
        threadId: 'thread-2',
        turnId: 'turn-2',
        itemId: 'item-1',
        receivedAtIso: '2026-04-04T10:01:00.000Z',
        params: null,
      },
      {
        id: 2,
        method: 'item/fileChange/requestApproval',
        threadId: 'thread-2',
        turnId: 'turn-2',
        itemId: 'item-2',
        receivedAtIso: '2026-04-04T10:02:00.000Z',
        params: null,
      },
      {
        id: 3,
        method: 'workspace/approve',
        threadId: 'thread-2',
        turnId: 'turn-2',
        itemId: 'item-3',
        receivedAtIso: '2026-04-04T10:03:00.000Z',
        params: null,
      },
    ],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:04:00.000Z',
  })

  assert.equal(snapshot.state, 'needs_attention')
  assert.equal(snapshot.attention.pendingApprovalCount, 2)
  assert.deepEqual(snapshot.attention.pendingApprovalKinds, [
    'command',
    'file_change',
  ])
  assert.equal(snapshot.attention.pendingAttentionCount, 1)
  assert.equal(snapshot.attention.requiresReturnToOwner, true)
  assert.equal(snapshot.latestTurnSummary, null)
})

test('buildSharedSessionSnapshot keeps non-approval requests in attention without inflating approval counts', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-2b',
    sourceThreadId: 'thread-2b',
    sourceConversationId: null,
    title: 'Workspace request session',
    cwd: '/workspace',
    owner: 'terminal',
    ownerInstanceId: 'terminal-instance-2',
    messages: [],
    inProgress: false,
    activeTurnId: null,
    pendingServerRequests: [
      {
        id: 11,
        method: 'workspace/approve',
        threadId: 'thread-2b',
        turnId: 'turn-2b',
        itemId: 'item-11',
        receivedAtIso: '2026-04-04T10:03:00.000Z',
        params: null,
      },
    ],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:04:00.000Z',
  })

  assert.equal(snapshot.state, 'needs_attention')
  assert.equal(snapshot.attention.pendingApprovalCount, 0)
  assert.deepEqual(snapshot.attention.pendingApprovalKinds, [])
  assert.equal(snapshot.attention.pendingAttentionCount, 1)
})

test('buildSharedSessionSnapshot prefers failed state when latest error exists', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-3',
    sourceThreadId: 'thread-3',
    sourceConversationId: null,
    title: 'Failed session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [],
    inProgress: true,
    activeTurnId: 'turn-3',
    pendingServerRequests: [
      {
        id: 4,
        method: 'item/commandExecution/requestApproval',
        threadId: 'thread-3',
        turnId: 'turn-3',
        itemId: 'item-4',
        receivedAtIso: '2026-04-04T10:05:00.000Z',
        params: null,
      },
    ],
    persistedServerRequests: [],
    latestErrorMessage: '命令执行失败',
    updatedAtIso: '2026-04-04T10:06:00.000Z',
  })

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.attention.latestErrorMessage, '命令执行失败')
  assert.equal(snapshot.latestTurnSummary?.status, 'failed')
})

test('buildSharedSessionSnapshot does not synthesize a running summary for idle turns', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-3b',
    sourceThreadId: 'thread-3b',
    sourceConversationId: null,
    title: 'Idle session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [],
    inProgress: false,
    activeTurnId: 'turn-3b',
    pendingServerRequests: [],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:06:30.000Z',
  })

  assert.equal(snapshot.state, 'idle')
  assert.equal(snapshot.latestTurnSummary, null)
})

test('buildSharedSessionSnapshot returns null latestTurnSummary without an active turn', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-3c',
    sourceThreadId: 'thread-3c',
    sourceConversationId: null,
    title: 'No active turn session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [],
    inProgress: false,
    activeTurnId: null,
    pendingServerRequests: [],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:06:45.000Z',
  })

  assert.equal(snapshot.state, 'idle')
  assert.equal(snapshot.latestTurnSummary, null)
})

test('buildSharedSessionSnapshot maps user and assistant messages into timeline entries', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-4',
    sourceThreadId: 'thread-4',
    sourceConversationId: null,
    title: 'Timeline session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [
      { id: 'user-1', role: 'user', text: '你好' },
      { id: 'system-1', role: 'system', text: '系统提示' },
      { id: 'assistant-1', role: 'assistant', text: '你好，我在这里' },
    ],
    inProgress: false,
    activeTurnId: null,
    pendingServerRequests: [],
    persistedServerRequests: [],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:07:00.000Z',
  })

  assert.deepEqual(snapshot.timeline.map((entry) => ({
    kind: entry.kind,
    text: entry.text,
  })), [
    { kind: 'user_message', text: '你好' },
    { kind: 'assistant_message', text: '你好，我在这里' },
  ])
})

test('buildSharedSessionSnapshot normalizes pending approval kinds from live and persisted requests', () => {
  const snapshot = buildSharedSessionSnapshot({
    sessionId: 'session-5',
    sourceThreadId: 'thread-5',
    sourceConversationId: null,
    title: 'Kinds session',
    cwd: '/workspace',
    owner: 'web',
    ownerInstanceId: 'web-instance-1',
    messages: [],
    inProgress: false,
    activeTurnId: null,
    pendingServerRequests: [
      {
        id: 5,
        method: 'item/commandExecution/requestApproval',
        threadId: 'thread-5',
        turnId: 'turn-5',
        itemId: 'item-5',
        receivedAtIso: '2026-04-04T10:08:00.000Z',
        params: null,
      },
    ],
    persistedServerRequests: [
      {
        id: 6,
        method: 'item/fileChange/requestApproval',
        threadId: 'thread-5',
        turnId: 'turn-5',
        itemId: 'item-6',
        cwd: '/workspace',
        receivedAtIso: '2026-04-04T10:09:00.000Z',
        resolvedAtIso: null,
        resolutionKind: null,
        dismissedAtIso: null,
        dismissedReason: null,
        dismissedBy: null,
        params: null,
      },
      {
        id: 7,
        method: 'workspace/approve',
        threadId: 'thread-5',
        turnId: 'turn-5',
        itemId: 'item-7',
        cwd: '/workspace',
        receivedAtIso: '2026-04-04T10:10:00.000Z',
        resolvedAtIso: null,
        resolutionKind: null,
        dismissedAtIso: null,
        dismissedReason: null,
        dismissedBy: null,
        params: null,
      },
    ],
    latestErrorMessage: null,
    updatedAtIso: '2026-04-04T10:11:00.000Z',
  })

  assert.equal(snapshot.attention.pendingApprovalCount, 2)
  assert.deepEqual(snapshot.attention.pendingApprovalKinds, [
    'command',
    'file_change',
  ])
  assert.equal(snapshot.attention.pendingAttentionCount, 1)
})
