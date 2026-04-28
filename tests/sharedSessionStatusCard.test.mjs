import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('SharedSessionStatusCard defines a read-only shared session status shell', async () => {
  const component = await read('../src/components/content/SharedSessionStatusCard.vue')

  assert.match(component, /shared-session-status-card/)
  assert.match(component, /liveApprovalCount\?: number/)
  assert.match(component, /persistedApprovalCount\?: number/)
  assert.match(component, /pendingAttentionCount/)
  assert.match(component, /hasPersistedApprovalRecords/)
  assert.match(component, /sharedSessionPersistedApprovalRecords/)
  assert.match(component, /sharedSessionPersistedApprovalRecordsShort/)
  assert.match(component, /sharedSessionApprovalNeedsReplay/)
  assert.match(component, /sharedSessionPendingAttentionRequests/)
  assert.match(component, /sharedSessionPendingAttentionRequestsShort/)
  assert.match(component, /shared-session-status-chip/)
  assert.match(component, /shared-session-status-timeline/)
  assert.match(component, /shared-session-status-entry/)
  assert.match(component, /visibleTimelineEntries/)
  assert.match(component, /slice\(-3\)/)
  assert.match(component, /shared-session-status-meta/)
  assert.match(component, /shared-session-status-pill/)
  assert.doesNotMatch(component, /shared-session-status-owner/)
  assert.doesNotMatch(component, /sharedSessionControlledBy/)
  assert.doesNotMatch(component, /emit\('/)
})

test('App injects SharedSessionStatusCard into the ThreadConversation scroll flow when snapshot exists', async () => {
  const app = await read('../src/App.vue')
  const conversation = await read('../src/components/content/ThreadConversation.vue')

  assert.match(app, /import SharedSessionStatusCard from '\.\/components\/content\/SharedSessionStatusCard\.vue'/)
  assert.match(app, /selectedSharedSessionSnapshot/)
  assert.match(app, /selectedLiveApprovalCount/)
  assert.match(app, /selectedPersistedApprovalCount/)
  assert.match(app, /<SharedSessionStatusCard/)
  assert.match(app, /v-if="selectedSharedSessionSnapshot"/)
  assert.match(app, /:snapshot="selectedSharedSessionSnapshot"/)
  assert.match(app, /:live-approval-count="selectedLiveApprovalCount"/)
  assert.match(app, /:persisted-approval-count="selectedPersistedApprovalCount"/)
  assert.match(app, /:ui-language="uiLanguage"/)
  assert.match(app, /<ThreadConversation/)
  assert.match(app, /<template #prepend>/)
  assert.match(conversation, /<slot name="prepend" \/>/)
  assert.match(conversation, /conversation-item conversation-item-prepend/)
})

test('uiText defines Chinese product copy for shared session status states and labels', async () => {
  const uiText = await read('../src/i18n/uiText.ts')

  assert.match(uiText, /'app\.sharedSessionStatusRunning'/)
  assert.match(uiText, /'app\.sharedSessionStatusNeedsAttention'/)
  assert.match(uiText, /'app\.sharedSessionStatusFailed'/)
  assert.match(uiText, /'app\.sharedSessionStatusInterrupted'/)
  assert.match(uiText, /'app\.sharedSessionStatusStaleOwner'/)
  assert.match(uiText, /'app\.sharedSessionOwnerWeb'/)
  assert.match(uiText, /'app\.sharedSessionOwnerTerminal'/)
  assert.match(uiText, /'app\.sharedSessionLatestTurn'/)
  assert.match(uiText, /'app\.sharedSessionPendingApprovals'/)
  assert.match(uiText, /'app\.sharedSessionPendingAttentionRequests'/)
  assert.match(uiText, /'app\.sharedSessionPendingAttentionRequestsShort'/)
  assert.match(uiText, /'app\.sharedSessionPersistedApprovalRecords'/)
  assert.match(uiText, /'app\.sharedSessionPersistedApprovalRecordsShort'/)
  assert.match(uiText, /'app\.sharedSessionApprovalNeedsReplay'/)
  assert.match(uiText, /'app\.sharedSessionReturnToOwner'/)
})
