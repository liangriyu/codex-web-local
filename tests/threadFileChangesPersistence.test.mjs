import assert from 'node:assert/strict'
import test from 'node:test'

const FILE_CHANGES_STORAGE_KEY = 'codex-web-local.thread-file-changes.v2'

function createLocalStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

async function loadStorageModule() {
  return import(`../src/composables/desktop-state/storage.ts?test=${Date.now()}-${Math.random()}`)
}

async function withFakeWindow(run) {
  const previousWindow = globalThis.window
  const localStorage = createLocalStorage()
  globalThis.window = { localStorage }
  try {
    await run(localStorage)
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }
}

test('thread file change timeline round-trips through localStorage as records[]', async () => {
  await withFakeWindow(async (localStorage) => {
    const { saveThreadFileChangeTimelineMap, loadThreadFileChangeTimelineMap } = await loadStorageModule()

    saveThreadFileChangeTimelineMap({
      'thread-1': {
        threadId: 'thread-1',
        latestReversibleTurnId: 'turn-2',
        records: [
          {
            turnId: 'turn-1',
            files: [{ path: 'src/a.ts', additions: 2, deletions: 1, diff: '@@' }],
            totalAdditions: 2,
            totalDeletions: 1,
            createdAtIso: '2026-04-07T10:00:00.000Z',
            source: 'thread_read',
            canUndo: false,
            canReapply: false,
            isLatestChangeTurn: false,
            isReverted: false,
          },
          {
            turnId: 'turn-2',
            files: [{ path: 'src/b.ts', additions: 1, deletions: 0, diff: '@@' }],
            totalAdditions: 1,
            totalDeletions: 0,
            createdAtIso: '2026-04-07T10:01:00.000Z',
            source: 'turn_diff',
            canUndo: true,
            canReapply: false,
            isLatestChangeTurn: true,
            isReverted: false,
          },
        ],
      },
    })

    const persisted = JSON.parse(localStorage.getItem(FILE_CHANGES_STORAGE_KEY))
    assert.equal(Array.isArray(persisted['thread-1']?.records), true)
    assert.equal(persisted['thread-1'].records.length, 2)

    const restored = loadThreadFileChangeTimelineMap()
    assert.equal(restored['thread-1']?.threadId, 'thread-1')
    assert.equal(restored['thread-1']?.latestReversibleTurnId, 'turn-2')
    assert.deepEqual(
      restored['thread-1']?.records.map((record) => record.turnId),
      ['turn-1', 'turn-2'],
    )
    assert.equal(restored['thread-1']?.records[1]?.isLatestChangeTurn, true)
  })
})

test('thread file change timeline loader migrates legacy latest-singleton storage into records[]', async () => {
  await withFakeWindow(async (localStorage) => {
    localStorage.setItem(FILE_CHANGES_STORAGE_KEY, JSON.stringify({
      'thread-legacy': {
        turnId: 'turn-legacy-1',
        files: [
          { path: 'src/legacy.ts', additions: 3, deletions: 1 },
        ],
        totalAdditions: 3,
        totalDeletions: 1,
        storedAt: Date.parse('2026-04-07T09:00:00.000Z'),
      },
    }))

    const { loadThreadFileChangeTimelineMap } = await loadStorageModule()
    const restored = loadThreadFileChangeTimelineMap()

    assert.equal(restored['thread-legacy']?.threadId, 'thread-legacy')
    assert.equal(restored['thread-legacy']?.records.length, 1)
    assert.equal(restored['thread-legacy']?.records[0]?.turnId, 'turn-legacy-1')
    assert.equal(restored['thread-legacy']?.records[0]?.files[0]?.path, 'src/legacy.ts')
  })
})
