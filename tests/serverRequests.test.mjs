import assert from 'node:assert/strict'
import test from 'node:test'

import { listPersistedServerRequestsForWorkspace } from '../src/composables/desktop-state/server-requests.ts'

test('listPersistedServerRequestsForWorkspace includes global-scope requests when cwd matches directly', () => {
  const requestsByThreadId = {
    __global__: [
      {
        id: 10,
        method: 'workspace/approve',
        threadId: '',
        turnId: '',
        itemId: '',
        cwd: '/repo-a',
        receivedAtIso: '2026-04-03T10:00:00.000Z',
        resolvedAtIso: null,
        resolutionKind: null,
        dismissedAtIso: null,
        dismissedReason: null,
        dismissedBy: null,
        params: null,
      },
    ],
  }

  const matched = listPersistedServerRequestsForWorkspace(
    requestsByThreadId,
    '/repo-a',
    () => '',
  )

  assert.equal(matched.length, 1)
  assert.equal(matched[0]?.id, 10)
})
