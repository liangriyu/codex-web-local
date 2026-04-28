import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('SidebarThreadTree keeps the fixed time-column layout without rendering shared session summary text', async () => {
  const tree = await read('../src/components/sidebar/SidebarThreadTree.vue')

  assert.match(tree, /sharedSessionSnapshotByThreadId: Record<string, UiSharedSessionSnapshot>/)
  assert.match(tree, /liveApprovalThreadIdSet: Set<string>/)
  assert.match(tree, /thread-row-main/)
  assert.match(tree, /thread-row-time-wrap/)
  assert.match(tree, /thread-row-text/)
  assert.match(tree, /thread-row-time-wrap[\s\S]*w-14/)
  assert.match(tree, /\.thread-row-main \{\n  @apply min-w-0 flex-1 overflow-hidden;/)
  assert.match(tree, /\.thread-main-button \{\n  @apply min-w-0 flex-1 w-full overflow-hidden text-left rounded px-0 py-0 flex items-center;/)
  assert.match(tree, /\.thread-row-text \{\n  @apply min-w-0 w-full flex flex-col items-start justify-center;/)
  assert.match(tree, /\.thread-row-title \{\n  @apply block w-full text-sm leading-5 font-normal truncate whitespace-nowrap;/)
  assert.match(tree, /thread-row-subtitle/)
  assert.match(tree, /readThreadStatusSubtitle/)
  assert.match(tree, /待审批/)
  assert.doesNotMatch(tree, /readSharedSessionThreadSummary/)
  assert.doesNotMatch(tree, /readSharedSessionThreadSummaryState/)
  assert.doesNotMatch(tree, /readSharedSessionPendingApprovalsLabel/)
})

test('App passes shared snapshot mapping into SidebarThreadTree', async () => {
  const app = await read('../src/App.vue')

  assert.match(app, /sharedSessionSnapshotByThreadId/)
  assert.match(app, /selectedThreadPersistedServerRequests/)
  assert.match(app, /liveApprovalThreadIdSet/)
  assert.match(app, /:shared-session-snapshot-by-thread-id="sharedSessionSnapshotByThreadId"/)
  assert.match(app, /:live-approval-thread-id-set="liveApprovalThreadIdSet"/)
})
