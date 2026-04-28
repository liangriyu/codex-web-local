export type ThinkingIndicatorStateInput = {
  isHomeRoute: boolean
  isSelectedThreadInProgress: boolean
  isSendingMessage: boolean
  hasLiveOverlay: boolean
  hasPendingServerRequests: boolean
}

export function shouldShowThinkingIndicator(input: ThinkingIndicatorStateInput): boolean {
  if (input.isHomeRoute) return false
  if (input.hasPendingServerRequests) return false
  return input.isSelectedThreadInProgress || input.isSendingMessage || input.hasLiveOverlay
}
