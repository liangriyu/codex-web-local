import assert from 'node:assert/strict'
import test from 'node:test'

async function loadFileChangeUtils() {
  return import(`../src/utils/threadFileChanges.ts?test=${Date.now()}-${Math.random()}`)
}

test('mergeTurnFileChangeRecords keeps all files for the same turn and replaces updated paths', async () => {
  const { mergeTurnFileChangeRecords } = await loadFileChangeUtils()

  const merged = mergeTurnFileChangeRecords(
    {
      turnId: 'turn-1',
      files: [
        { path: 'src/a.ts', additions: 2, deletions: 1, diff: '@@\n-old\n+new' },
        { path: 'src/b.ts', additions: 1, deletions: 0, diff: '@@\n-before\n+after' },
      ],
      totalAdditions: 3,
      totalDeletions: 1,
      createdAtIso: '2026-04-07T10:00:00.000Z',
      source: 'turn_diff',
      canUndo: false,
      canReapply: false,
      isLatestChangeTurn: true,
      isReverted: false,
    },
    {
      turnId: 'turn-1',
      files: [
        { path: 'src/b.ts', additions: 4, deletions: 2, diff: '@@\n-older\n+newer' },
        { path: 'src/c.ts', additions: 1, deletions: 0, diff: '@@\n+added' },
      ],
      totalAdditions: 5,
      totalDeletions: 2,
      createdAtIso: '2026-04-07T10:00:02.000Z',
      source: 'turn_diff',
      canUndo: false,
      canReapply: false,
      isLatestChangeTurn: true,
      isReverted: false,
    },
  )

  assert.deepEqual(
    merged.files.map((file) => file.path),
    ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  )
  assert.equal(merged.files[1]?.diff, '@@\n-older\n+newer')
  assert.equal(merged.totalAdditions, 7)
  assert.equal(merged.totalDeletions, 3)
})

test('mergeTurnFileChangeRecords preserves an existing file diff when incoming fallback data has no diff text', async () => {
  const { mergeTurnFileChangeRecords } = await loadFileChangeUtils()

  const merged = mergeTurnFileChangeRecords(
    {
      turnId: 'turn-2',
      files: [
        { path: 'src/a.ts', additions: 2, deletions: 1, diff: '@@\n-old\n+new' },
      ],
      totalAdditions: 2,
      totalDeletions: 1,
      createdAtIso: '2026-04-07T10:00:00.000Z',
      source: 'turn_diff',
      canUndo: false,
      canReapply: false,
      isLatestChangeTurn: true,
      isReverted: false,
    },
    {
      turnId: 'turn-2',
      files: [
        { path: 'src/a.ts', additions: 2, deletions: 1, diff: '' },
      ],
      totalAdditions: 2,
      totalDeletions: 1,
      createdAtIso: '2026-04-07T10:00:02.000Z',
      source: 'session_fallback',
      canUndo: false,
      canReapply: false,
      isLatestChangeTurn: true,
      isReverted: false,
    },
  )

  assert.equal(merged.files[0]?.diff, '@@\n-old\n+new')
})

test('resolveThreadFileChangeTimelineUpdate drops stale cached files when a full authoritative timeline is loaded', async () => {
  const { resolveThreadFileChangeTimelineUpdate } = await loadFileChangeUtils()

  const resolved = resolveThreadFileChangeTimelineUpdate(
    {
      threadId: 'thread-1',
      latestReversibleTurnId: 'turn-2',
      records: [
        {
          turnId: 'turn-1',
          files: [
            { path: 'docs/old-plan.md', additions: 10, deletions: 0, diff: '' },
          ],
          totalAdditions: 10,
          totalDeletions: 0,
          createdAtIso: '2026-04-07T10:00:00.000Z',
          source: 'session_fallback',
          canUndo: false,
          canReapply: false,
          isLatestChangeTurn: false,
          isReverted: false,
        },
        {
          turnId: 'turn-2',
          files: [
            { path: 'src/stale.ts', additions: 1, deletions: 0, diff: '' },
            { path: 'src/real.ts', additions: 2, deletions: 1, diff: '@@\n-old\n+new' },
          ],
          totalAdditions: 3,
          totalDeletions: 1,
          createdAtIso: '2026-04-07T10:01:00.000Z',
          source: 'thread_read',
          canUndo: true,
          canReapply: false,
          isLatestChangeTurn: true,
          isReverted: false,
        },
      ],
    },
    {
      threadId: 'thread-1',
      latestReversibleTurnId: 'turn-2',
      records: [
        {
          turnId: 'turn-2',
          files: [
            { path: 'src/real.ts', additions: 2, deletions: 1, diff: '@@\n-old\n+new' },
          ],
          totalAdditions: 2,
          totalDeletions: 1,
          createdAtIso: '2026-04-07T10:02:00.000Z',
          source: 'session_fallback',
          canUndo: true,
          canReapply: false,
          isLatestChangeTurn: true,
          isReverted: false,
        },
      ],
    },
    { authoritative: true },
  )

  assert.deepEqual(
    resolved.records.map((record) => record.turnId),
    ['turn-2'],
  )
  assert.deepEqual(
    resolved.records[0]?.files.map((file) => file.path),
    ['src/real.ts'],
  )
})
