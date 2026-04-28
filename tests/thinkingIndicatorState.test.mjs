import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldShowThinkingIndicator } from '../src/utils/thinkingIndicatorState.ts'

test('shouldShowThinkingIndicator hides the thinking state when the current thread is waiting for approval', () => {
  assert.equal(shouldShowThinkingIndicator({
    isHomeRoute: false,
    isSelectedThreadInProgress: true,
    isSendingMessage: false,
    hasLiveOverlay: false,
    hasPendingServerRequests: true,
  }), false)
})

test('shouldShowThinkingIndicator still shows the thinking state when no approval is pending', () => {
  assert.equal(shouldShowThinkingIndicator({
    isHomeRoute: false,
    isSelectedThreadInProgress: true,
    isSendingMessage: false,
    hasLiveOverlay: false,
    hasPendingServerRequests: false,
  }), true)
})
