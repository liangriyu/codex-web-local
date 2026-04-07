<template>
  <section class="conversation-root">
    <p v-if="isLoading" class="conversation-loading">{{ t('threadConversation.loadingMessages') }}</p>

    <p
      v-else-if="messages.length === 0 && visiblePendingRequests.length === 0 && !hasPrependSlot"
      class="conversation-empty"
    >
      {{ t('threadConversation.noMessages') }}
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li v-if="hasPrependSlot" class="conversation-item conversation-item-prepend">
        <slot name="prepend" />
      </li>
      <li
        v-for="request in visiblePendingRequests"
        :key="`server-request:${request.id}`"
        class="conversation-item conversation-item-request"
      >
        <div class="message-row">
          <div class="message-stack">
            <ApprovalRequestCard
              v-if="shouldRenderApprovalCard(request)"
              :model="readApprovalModel(request)"
              :ui-language="normalizedLanguage"
              @submit="onSubmitApprovalRequest(request, $event)"
              @skip="onCancelApprovalRequest(request)"
              @open-workspace-diff="onOpenWorkspaceDiff"
            />

            <article v-else class="request-card">
              <p class="request-title">{{ readRequestTitle(request) }}</p>
              <p class="request-meta">{{ t('threadConversation.requestMeta', { id: request.id, time: formatIsoTime(request.receivedAtIso) }) }}</p>

              <p v-if="readRequestReason(request)" class="request-reason">{{ readRequestReason(request) }}</p>

              <section v-if="request.method === 'item/tool/requestUserInput'" class="request-user-input">
                <div
                  v-for="question in readToolQuestions(request)"
                  :key="`${request.id}:${question.id}`"
                  class="request-question"
                >
                  <p class="request-question-title">{{ question.header || question.question }}</p>
                  <p v-if="question.header && question.question" class="request-question-text">{{ question.question }}</p>
                  <select
                    class="request-select"
                    :value="readQuestionAnswer(request.id, question.id, question.options[0] || '')"
                    @change="onQuestionAnswerChange(request.id, question.id, $event)"
                  >
                    <option v-for="option in question.options" :key="`${request.id}:${question.id}:${option}`" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <input
                    v-if="question.isOther"
                    class="request-input"
                    type="text"
                    :value="readQuestionOtherAnswer(request.id, question.id)"
                    :placeholder="t('threadConversation.otherAnswer')"
                    @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
                  />
                </div>

                <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(request)">
                  {{ t('threadConversation.submitAnswers') }}
                </button>
              </section>

              <section v-else-if="request.method === 'item/tool/call'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(request.id)">{{ t('threadConversation.failToolCall') }}</button>
                <button type="button" class="request-button" @click="onRespondToolCallSuccess(request.id)">{{ t('threadConversation.successEmpty') }}</button>
              </section>

              <section v-else class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(request.id)">{{ t('threadConversation.returnEmptyResult') }}</button>
                <button type="button" class="request-button" @click="onRejectUnknownRequest(request.id)">{{ t('threadConversation.rejectRequest') }}</button>
              </section>
            </article>
          </div>
        </div>
      </li>

      <li
        v-for="(message, messageIndex) in messages"
        :key="message.id"
        class="conversation-item"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img class="message-image-preview" :src="imageUrl" alt="Message image preview" loading="lazy" />
                  </button>
                </li>
              </ul>

              <div v-if="message.text.length > 0" class="message-card-shell" :data-role="message.role">
                <div
                  v-if="message.role === 'user' && readCopyPayloadAt(messageIndex)"
                  class="message-copy-external"
                >
                  <button
                    type="button"
                    class="message-copy-button"
                    :data-copied="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key"
                    :aria-label="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key ? t('threadConversation.copied') : t('threadConversation.copyMessage')"
                    :title="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key ? t('threadConversation.copied') : t('threadConversation.copy')"
                    @click="onCopyMessage(messageIndex)"
                  >
                    <IconTablerCheck v-if="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key" class="icon-svg" />
                    <IconTablerCopy v-else class="icon-svg" />
                  </button>
                </div>

                <article class="message-card" :data-role="message.role">
                  <div v-if="message.messageType === 'worked'" class="worked-separator" aria-live="polite">
                    <span class="worked-separator-line" aria-hidden="true" />
                    <p class="worked-separator-text">{{ formatWorkedMessage(message.text) }}</p>
                    <span class="worked-separator-line" aria-hidden="true" />
                  </div>
                  <div v-else class="message-content">
                    <template v-for="(block, blockIndex) in parseMessageBlocks(message.text)" :key="`block-${blockIndex}`">
                      <template v-if="block.kind === 'text'">
                        <template v-for="(part, partIndex) in parseTextParts(block.value)" :key="`part-${blockIndex}-${partIndex}`">
                          <p v-if="part.kind === 'paragraph'" class="message-text">
                            <template v-for="(segment, index) in parseInlineSegments(part.value, projectCwd)" :key="`seg-p-${blockIndex}-${partIndex}-${index}`">
                              <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                              <strong v-else-if="segment.kind === 'bold'" class="message-strong-text">{{ segment.value }}</strong>
                              <a
                                v-else-if="segment.kind === 'file'"
                                class="message-file-link"
                                :href="buildFileReferenceHref(segment)"
                                @click.prevent="onFileReferenceClick(segment)"
                              >
                                {{ segment.displayName }}
                              </a>
                              <a
                                v-else-if="segment.kind === 'markdownLink'"
                                class="message-file-link"
                                :href="segment.href"
                                @click.prevent="onMarkdownLinkClick(segment)"
                              >
                                {{ segment.label }}
                              </a>
                              <code v-else class="message-inline-code">{{ segment.value }}</code>
                            </template>
                          </p>
                          <ul v-else class="message-list">
                            <li
                              v-for="(item, itemIndex) in part.items"
                              :key="`seg-l-${blockIndex}-${partIndex}-${itemIndex}`"
                              class="message-list-item"
                            >
                              <template v-for="(segment, index) in parseInlineSegments(item, projectCwd)" :key="`seg-li-${blockIndex}-${partIndex}-${itemIndex}-${index}`">
                                <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                                <strong v-else-if="segment.kind === 'bold'" class="message-strong-text">{{ segment.value }}</strong>
                                <a
                                  v-else-if="segment.kind === 'file'"
                                  class="message-file-link"
                                  :href="buildFileReferenceHref(segment)"
                                  @click.prevent="onFileReferenceClick(segment)"
                                >
                                  {{ segment.displayName }}
                                </a>
                                <a
                                  v-else-if="segment.kind === 'markdownLink'"
                                  class="message-file-link"
                                  :href="segment.href"
                                  @click.prevent="onMarkdownLinkClick(segment)"
                                >
                                  {{ segment.label }}
                                </a>
                                <code v-else class="message-inline-code">{{ segment.value }}</code>
                              </template>
                            </li>
                          </ul>
                        </template>
                      </template>
                      <pre v-else class="message-code-block"><code class="message-code-body">{{ block.value }}</code></pre>
                    </template>
                    <div
                      v-if="message.role !== 'user' && readCopyPayloadAt(messageIndex)"
                      class="message-content-actions"
                    >
                      <button
                        type="button"
                        class="message-copy-button"
                        :data-copied="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key"
                        :aria-label="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key ? t('threadConversation.copied') : t('threadConversation.copyMessage')"
                        :title="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key ? t('threadConversation.copied') : t('threadConversation.copy')"
                        @click="onCopyMessage(messageIndex)"
                      >
                        <IconTablerCheck v-if="copiedMessageKey === readCopyPayloadAt(messageIndex)?.key" class="icon-svg" />
                        <IconTablerCopy v-else class="icon-svg" />
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </article>
            <article
              v-if="readMessageFileChanges(message) && !hasPendingFileChangeApproval"
              class="file-change-card"
            >
              <header class="file-change-card-header">
                <p class="file-change-card-title">
                  {{ readMessageFileChanges(message)?.files.length }} 个文件已更改
                  <span class="file-change-stats-add">+{{ readMessageFileChanges(message)?.totalAdditions ?? 0 }}</span>
                  <span class="file-change-stats-del">-{{ readMessageFileChanges(message)?.totalDeletions ?? 0 }}</span>
                </p>
              </header>
              <ul class="file-change-list">
                <li
                  v-for="change in readMessageFileChanges(message)?.files ?? []"
                  :key="`${message.turnId}:${change.path}`"
                  class="file-change-item"
                >
                  <button
                    type="button"
                    class="file-change-button"
                    :disabled="!change.diff.trim().length"
                    @click="onOpenFileDiff(change.path, change.diff, change.additions, change.deletions)"
                  >
                    <span class="file-change-path">{{ displayFileChangePath(change.path) }}</span>
                    <span class="file-change-stats">
                      <span class="file-change-stats-add">+{{ change.additions }}</span>
                      <span class="file-change-stats-del">-{{ change.deletions }}</span>
                    </span>
                  </button>
                </li>
              </ul>
              <div
                v-if="readMessageFileChanges(message)?.canUndo || readMessageFileChanges(message)?.canReapply"
                class="file-change-actions"
              >
                <button
                  v-if="readMessageFileChanges(message)?.canUndo"
                  type="button"
                  class="file-change-action-button"
                  @click="onUndoThreadFileChange(message.turnId ?? '')"
                >
                  {{ t('threadConversation.undoLatestFileChange') }}
                </button>
                <button
                  v-if="readMessageFileChanges(message)?.canReapply"
                  type="button"
                  class="file-change-action-button"
                  @click="onReapplyThreadFileChange(message.turnId ?? '')"
                >
                  {{ t('threadConversation.reapplyLatestFileChange') }}
                </button>
              </div>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'
import type {
  ThreadScrollState,
  UiMessage,
  UiServerRequest,
  UiThreadFileChangeTimeline,
  UiTurnFileChanges,
} from '../../types/codex'
import { tUi, type UiLanguage, type UiTextKey } from '../../i18n/uiText'
import IconTablerCheck from '../icons/IconTablerCheck.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import ApprovalRequestCard from './ApprovalRequestCard.vue'
import { formatDisplayPath } from '../../utils/pathUtils'
import { copyTextToClipboard, readMessageCopyPayload } from '../../utils/messageCopy'
import {
  buildApprovalRequestDisplayModel,
  isApprovalRequestMethod,
  type ApprovalDecision,
  type ApprovalRequestDisplayModel,
} from '../../utils/approvalRequestDisplay'
import {
  type InlineSegment,
  buildFileReferenceHrefFromValue,
  parseInlineSegments,
  parseMessageBlocks,
  parseTextParts,
  extractWorkedDuration,
} from '../../utils/markdownParser'

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  isLoading: boolean
  activeThreadId: string
  projectCwd: string
  scrollState: ThreadScrollState | null
  turnFileChangesTimeline: UiThreadFileChangeTimeline | null
  fileChanges: UiTurnFileChanges | null
  uiLanguage?: UiLanguage
  isThinkingIndicatorVisible?: boolean
  floatingRequestId?: number | null
}>()

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
  openFileReference: [payload: { path: string; line: number | null }]
  openFileDiff: [payload: { path: string; diff: string; additions: number; deletions: number }]
  openWorkspaceDiff: []
  'undo-thread-file-change': [turnId: string]
  'reapply-thread-file-change': [turnId: string]
}>()

const slots = useSlots()
const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const copiedMessageKey = ref<string | null>(null)
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const BOTTOM_THRESHOLD_PX = 16
const hasPendingFileChangeApproval = computed(() =>
  props.pendingRequests.some((request) => request.method === 'item/fileChange/requestApproval'),
)

let scrollRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let shouldForceBottomOnNextRestore = false
let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')
const hasPrependSlot = computed(() => Boolean(slots.prepend))
const visiblePendingRequests = computed(() =>
  props.pendingRequests.filter((request) => !(isApprovalRequest(request) && request.id === props.floatingRequestId)),
)
const turnFileChangesTimeline = computed(() => props.turnFileChangesTimeline?.records ?? [])

function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(normalizedLanguage.value, key, params)
}

function readMessageFileChanges(message: UiMessage): UiThreadFileChangeTimeline['records'][number] | null {
  const turnId = message.turnId?.trim() ?? ''
  if (!turnId) return null
  return turnFileChangesTimeline.value.find((record) => record.turnId === turnId) ?? null
}

function onUndoThreadFileChange(turnId: string): void {
  const normalizedTurnId = turnId.trim()
  if (!normalizedTurnId) return
  emit('undo-thread-file-change', normalizedTurnId)
}

function onReapplyThreadFileChange(turnId: string): void {
  const normalizedTurnId = turnId.trim()
  if (!normalizedTurnId) return
  emit('reapply-thread-file-change', normalizedTurnId)
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

function formatWorkedMessage(text: string): string {
  const duration = extractWorkedDuration(text)
  return t('threadConversation.workedFor', { duration })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = params?.reason
  return typeof reason === 'string' ? reason.trim() : ''
}

function readRequestTitle(request: UiServerRequest): string {
  switch (request.method) {
    case 'item/commandExecution/requestApproval':
    case 'execCommandApproval':
      return '需要确认命令执行'
    case 'item/fileChange/requestApproval':
    case 'applyPatchApproval':
      return '需要确认文件改动'
    case 'item/tool/requestUserInput':
      return '需要你补充输入'
    case 'item/tool/call':
      return '需要确认工具调用结果'
    default:
      return '需要处理一条请求'
  }
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return isApprovalRequestMethod(request.method)
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => option?.label)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function readApprovalModel(request: UiServerRequest): ApprovalRequestDisplayModel | null {
  return buildApprovalRequestDisplayModel(
    request,
    props.fileChanges && props.fileChanges.turnId === request.turnId ? props.fileChanges : null,
  )
}

function shouldRenderApprovalCard(request: UiServerRequest): boolean {
  return isApprovalRequest(request) && readApprovalModel(request) !== null
}

function onSubmitApprovalRequest(request: UiServerRequest, decision: ApprovalDecision): void {
  emit('respondServerRequest', {
    id: request.id,
    result: { decision },
  })
}

function onCancelApprovalRequest(request: UiServerRequest): void {
  const model = readApprovalModel(request)
  emit('respondServerRequest', {
    id: request.id,
    result: { decision: model?.cancelDecision ?? 'cancel' },
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0] || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function emitScrollState(container: HTMLElement): void {
  if (!props.activeThreadId) return
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0 ? Math.min(Math.max(container.scrollTop / maxScrollTop, 0), 1) : 1
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state: {
      scrollTop: container.scrollTop,
      isAtBottom: isAtBottom(container),
      scrollRatio,
    },
  })
}

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (shouldForceBottomOnNextRestore) {
    shouldForceBottomOnNextRestore = false
    enforceBottomState()
    return
  }

  const savedState = props.scrollState
  if (!savedState || savedState.isAtBottom) {
    enforceBottomState()
    return
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  container.scrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  emitScrollState(container)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
  emitScrollState(container)
}

function shouldLockToBottom(): boolean {
  const savedState = props.scrollState
  return !savedState || savedState.isAtBottom === true
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleScrollRestore(): Promise<void> {
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    applySavedScrollState()
    bindPendingImageHandlers()
    scheduleBottomLock()
  })
}

watch(
  () => props.messages,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.isThinkingIndicatorVisible,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.activeThreadId,
  () => {
    modalImageUrl.value = ''
    shouldForceBottomOnNextRestore = true
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  emitScrollState(container)
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

function buildFileReferenceHref(segment: Extract<InlineSegment, { kind: 'file' }>): string {
  const basePath = segment.path.trim()
  if (!basePath) return '#'
  return buildFileReferenceHrefFromValue(basePath, segment.line)
}



function onFileReferenceClick(segment: Extract<InlineSegment, { kind: 'file' }>): void {
  emit('openFileReference', {
    path: segment.path,
    line: segment.line,
  })
}

function onMarkdownLinkClick(segment: Extract<InlineSegment, { kind: 'markdownLink' }>): void {
  if (segment.path) {
    emit('openFileReference', {
      path: segment.path,
      line: segment.line,
    })
    return
  }

  if (typeof window !== 'undefined' && segment.href) {
    window.open(segment.href, '_blank', 'noopener,noreferrer')
  }
}

function onOpenFileDiff(path: string, diff: string, additions: number, deletions: number): void {
  emit('openFileDiff', {
    path,
    diff,
    additions,
    deletions,
  })
}

function onOpenWorkspaceDiff(): void {
  emit('openWorkspaceDiff')
}

function displayFileChangePath(path: string): string {
  return formatDisplayPath(path, props.projectCwd)
}

function readCopyPayloadAt(messageIndex: number) {
  const copyPayload = readMessageCopyPayload(props.messages, messageIndex)
  return copyPayload
}

function clearCopiedMessageFeedback(): void {
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
    copiedMessageResetTimer = null
  }
}

async function onCopyMessage(messageIndex: number): Promise<void> {
  const copyPayload = readCopyPayloadAt(messageIndex)
  if (!copyPayload) return
  const copied = await copyTextToClipboard(copyPayload.text)
  if (!copied) return

  copiedMessageKey.value = copyPayload.key
  clearCopiedMessageFeedback()
  copiedMessageResetTimer = setTimeout(() => {
    copiedMessageKey.value = null
    copiedMessageResetTimer = null
  }, 1400)
}

onBeforeUnmount(() => {
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
  clearCopiedMessageFeedback()
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-6 text-sm;
  color: var(--color-text-muted);
}

.conversation-empty {
  @apply m-0 px-6 text-sm;
  color: var(--color-text-muted);
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-3;
}

.conversation-item {
  @apply m-0 w-full flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-prepend {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full max-w-180 mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.message-stack {
  @apply flex flex-col w-full;
}

.request-card {
  @apply w-full max-w-180 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.file-change-card {
  @apply w-full max-w-180 rounded-lg border px-0 py-0 overflow-hidden;
  border-color: var(--color-border-default);
  background: var(--color-bg-elevated);
}

.file-change-card-header {
  @apply px-2.5 py-1.5 border-b flex items-center justify-between gap-2;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
}

.file-change-card-title {
  @apply m-0 text-xs leading-4;
  color: var(--color-text-primary);
}

.file-change-header-action {
  @apply shrink-0 text-[11px] leading-4 underline underline-offset-2;
  color: var(--color-link);
}

.file-change-header-action:hover {
  color: var(--color-link-hover);
}

.file-change-list {
  @apply list-none m-0 p-0;
}

.file-change-item {
  @apply m-0 border-b last:border-b-0;
  border-color: var(--color-border-default);
}

.file-change-button {
  @apply w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition;
  background: var(--color-bg-muted);
}

.file-change-button:hover {
  background: var(--color-bg-muted-hover);
}

.file-change-path {
  @apply text-xs leading-4 truncate;
  color: var(--color-text-primary);
}

.file-change-stats {
  @apply inline-flex items-center gap-1.5 shrink-0 text-[11px] leading-4;
}

.file-change-stats-add {
  @apply text-[#16a34a] font-medium;
}

.file-change-stats-del {
  @apply text-[#ef4444] font-medium;
}

.file-change-actions {
  @apply flex items-center gap-2 px-2.5 py-2 border-t;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
}

.file-change-action-button {
  @apply rounded-md px-2.5 py-1.5 text-xs leading-4 transition;
  color: var(--color-text-primary);
  background: var(--color-bg-muted);
}

.file-change-action-button:hover {
  background: var(--color-bg-muted-hover);
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.live-overlay-inline {
  @apply w-full max-w-180 px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium;
  color: var(--color-text-secondary);
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 whitespace-pre-wrap;
  color: var(--color-text-muted);
}

.live-overlay-error {
  @apply m-0 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.message-body {
  @apply flex flex-col max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-card {
  @apply max-w-[min(76ch,100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap;
  color: var(--color-text-primary);
}

.message-content {
  @apply flex flex-col gap-2;
}

.message-list {
  @apply m-0 pl-5 list-disc text-sm leading-relaxed;
  color: var(--color-text-primary);
}

.message-list-item {
  @apply m-0;
}

.message-inline-code {
  @apply rounded-md border px-1.5 py-0.5 text-[0.875em] leading-[1.4] font-mono;
  border-color: var(--color-border-default);
  background: var(--color-code-bg);
  color: var(--color-code-text);
}

.message-code-block {
  @apply m-0 rounded-lg border px-3 py-2 overflow-x-auto;
  border-color: var(--color-border-default);
  background: var(--color-code-block-bg);
}

.message-code-body {
  @apply block whitespace-pre text-xs leading-5;
  color: var(--color-code-block-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.message-strong-text {
  @apply font-semibold;
  color: var(--color-text-primary);
}

.message-file-link {
  @apply text-sm leading-relaxed no-underline hover:underline underline-offset-2;
  color: var(--color-link);
}

.message-file-link:hover {
  color: var(--color-link-hover);
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl px-4 py-3 max-w-[min(560px,100%)];
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

.message-card-shell {
  @apply flex flex-col max-w-full;
}

.message-card-shell[data-role='user'] {
  @apply flex-row items-end gap-2;
}

.message-content-actions {
  @apply flex items-center justify-start pt-1;
}

.message-copy-external {
  @apply shrink-0 self-end pb-1;
}

.message-copy-button {
  @apply inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 transition;
  border-color: var(--color-border-default);
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  opacity: 0.78;
}

.message-copy-button:hover,
.message-copy-button:focus-visible,
.message-copy-button[data-copied='true'] {
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
  opacity: 1;
}

.message-copy-button:focus-visible {
  outline: 2px solid var(--color-border-strong);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .message-copy-button {
    opacity: 0;
    pointer-events: none;
  }

  .message-card-shell[data-role='user']:hover .message-copy-button,
  .message-card-shell[data-role='user']:focus-within .message-copy-button,
  .message-content:hover .message-copy-button,
  .message-content:focus-within .message-copy-button,
  .message-copy-button[data-copied='true'] {
    opacity: 1;
    pointer-events: auto;
  }
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator {
  @apply w-full flex items-center gap-4;
}

.worked-separator-line {
  @apply h-px flex-1;
  background: var(--color-border-default);
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal;
  color: var(--color-text-secondary);
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full border flex items-center justify-center;
  background: var(--color-bg-overlay);
  color: var(--color-text-primary);
  border-color: var(--color-border-default);
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl;
  background: var(--color-bg-surface);
}

.icon-svg {
  @apply w-5 h-5;
}
</style>
