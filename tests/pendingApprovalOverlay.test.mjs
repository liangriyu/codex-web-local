import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('App renders a pending approval overlay above the composer for the selected thread', async () => {
  const app = await read('../src/App.vue')

  assert.match(app, /import PendingApprovalOverlay from '\.\/components\/content\/PendingApprovalOverlay\.vue'/)
  assert.match(app, /selectedPrimaryApprovalRequest/)
  assert.match(app, /selectedPrimaryApprovalRequestId/)
  assert.match(app, /content-approval-overlay-host/)
  assert.match(app, /<PendingApprovalOverlay/)
  assert.match(app, /v-if="selectedPrimaryApprovalRequest"/)
  assert.match(app, /:request="selectedPrimaryApprovalRequest"/)
  assert.match(app, /:file-changes="selectedThreadFileChanges"/)
  assert.match(app, /@submit="onRespondServerRequest"/)
  assert.match(app, /@skip="onRespondServerRequest"/)
})

test('PendingApprovalOverlay reuses ApprovalRequestCard for floating approvals', async () => {
  const overlay = await read('../src/components/content/PendingApprovalOverlay.vue')

  assert.match(overlay, /import ApprovalRequestCard from '\.\/ApprovalRequestCard\.vue'/)
  assert.match(overlay, /buildApprovalRequestDisplayModel/)
  assert.match(overlay, /pending-approval-overlay/)
  assert.match(overlay, /<ApprovalRequestCard/)
  assert.match(overlay, /safe-area-inset-bottom/)
  assert.match(overlay, /max-height:\s*min\(calc\(100vh - 8\.5rem - env\(safe-area-inset-bottom, 0px\)\), 42rem\)/)
  assert.match(overlay, /overflow-y:\s*auto/)
  assert.match(overlay, /role="dialog"/)
  assert.match(overlay, /aria-modal="true"/)
  assert.match(overlay, /aria-labelledby="dialogTitleId"/)
  assert.match(overlay, /aria-describedby="dialogDescriptionId"/)
  assert.match(overlay, /tabindex="-1"/)
  assert.match(overlay, /onMounted\(\(\) => \{/)
  assert.match(overlay, /onBeforeUnmount\(\(\) => \{/)
  assert.match(overlay, /dialogRef\.value\?\.focus\(\)/)
  assert.match(overlay, /pending-approval-overlay-visually-hidden/)
})
