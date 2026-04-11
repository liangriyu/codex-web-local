import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveThreadExecutionInProgress } from '../src/utils/threadExecutionState.ts'

test('home 路由下始终不是执行中', () => {
  assert.equal(resolveThreadExecutionInProgress({
    isHomeRoute: true,
    threadInProgress: true,
    sharedSessionState: 'running',
    sharedSessionTurnStatus: 'running',
  }), false)
})

test('thread 本身 inProgress 时应视为执行中', () => {
  assert.equal(resolveThreadExecutionInProgress({
    isHomeRoute: false,
    threadInProgress: true,
    sharedSessionState: null,
    sharedSessionTurnStatus: null,
  }), true)
})

test('shared session 为 running 时应视为执行中', () => {
  assert.equal(resolveThreadExecutionInProgress({
    isHomeRoute: false,
    threadInProgress: false,
    sharedSessionState: 'running',
    sharedSessionTurnStatus: null,
  }), true)
})

test('shared session 为 needs_attention 且 turn status=running 时应视为执行中', () => {
  assert.equal(resolveThreadExecutionInProgress({
    isHomeRoute: false,
    threadInProgress: false,
    sharedSessionState: 'needs_attention',
    sharedSessionTurnStatus: 'running',
  }), true)
})

test('无执行信号时应返回非执行中', () => {
  assert.equal(resolveThreadExecutionInProgress({
    isHomeRoute: false,
    threadInProgress: false,
    sharedSessionState: 'idle',
    sharedSessionTurnStatus: 'completed',
  }), false)
})
