import assert from 'node:assert/strict'
import test from 'node:test'
import { useDesktopState } from '../src/composables/useDesktopState.ts'

test('can load workspace branch state for an explicit cwd without selecting a thread', async () => {
  const originalFetch = globalThis.fetch
  const cwd = '/tmp/example-repo'

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

    if (url.startsWith('/codex-api/git/status?')) {
      return Response.json({
        cwd,
        isRepo: true,
        isDirty: false,
        currentBranch: 'feature/mobile-home',
        dirtySummary: {
          trackedModified: 0,
          staged: 0,
          untracked: 0,
          conflicted: 0,
          renamed: 0,
          deleted: 0,
        },
        dirtyEntries: [],
      })
    }

    if (url.startsWith('/codex-api/git/branches?')) {
      return Response.json({
        cwd,
        isRepo: true,
        currentBranch: 'feature/mobile-home',
        branches: ['main', 'feature/mobile-home'],
      })
    }

    throw new Error(`Unexpected fetch request: ${url}`)
  }) as typeof fetch

  try {
    const state = useDesktopState()

    assert.equal(state.selectedThread.value, null)
    assert.equal(state.selectedWorkspaceModel.value, null)

    const branchState = await state.refreshWorkspaceBranchStateForCwd(cwd, {
      includeBranches: true,
      silent: true,
    })

    assert.ok(branchState)
    assert.equal(branchState.currentBranch, 'feature/mobile-home')
    assert.deepEqual(branchState.branches, ['main', 'feature/mobile-home'])

    const workspaceModel = state.getWorkspaceModelForCwd(cwd)
    assert.ok(workspaceModel)
    assert.equal(workspaceModel?.branch.currentBranch, 'feature/mobile-home')
    assert.deepEqual(workspaceModel?.branch.branches, ['main', 'feature/mobile-home'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
