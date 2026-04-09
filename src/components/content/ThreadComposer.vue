<template>
  <form class="thread-composer" @submit.prevent="onSubmit">
    <div class="thread-composer-shell">
      <textarea
        ref="textareaRef"
        v-model="draft"
        class="thread-composer-input"
        :placeholder="placeholderText"
        :disabled="disabled || !activeThreadId"
        rows="1"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown.enter.exact.prevent="onEnterKeydown"
        @paste="onPaste"
      />

      <ul v-if="pastedImages.length > 0" class="thread-composer-image-list">
        <li
          v-for="image in pastedImages"
          :key="image.id"
          class="thread-composer-image-item"
        >
          <img
            class="thread-composer-image-preview"
            :src="image.url"
            :alt="image.name"
          />
          <button
            type="button"
            class="thread-composer-image-remove"
            :aria-label="`移除 ${image.name}`"
            @click="removePastedImage(image.id)"
          >
            ×
          </button>
        </li>
      </ul>

      <div class="thread-composer-controls">
        <div class="thread-composer-main-controls">
          <div class="thread-composer-config-group">
            <div ref="actionsMenuRef" class="thread-composer-actions">
          <input
            ref="fileInputRef"
            class="thread-composer-file-input"
            type="file"
            accept="image/*"
            multiple
            @change="onFileInputChange"
          />
          <button
            class="thread-composer-actions-trigger"
            type="button"
            :disabled="disabled || !activeThreadId"
            :aria-expanded="isActionsMenuOpen"
            aria-haspopup="menu"
            title="更多操作"
            @click="toggleActionsMenu"
          >
            <span class="thread-composer-actions-trigger-mark">+</span>
          </button>
          <div
            v-if="isActionsMenuOpen"
            class="thread-composer-actions-menu"
            role="menu"
          >
            <button
              class="thread-composer-actions-menu-item"
              type="button"
              role="menuitem"
              @click="onSelectUploadFiles"
            >
              <IconTablerPaperclip class="thread-composer-actions-menu-item-icon" />
              上传图片
            </button>
            <div class="thread-composer-actions-menu-divider"></div>
            <div class="thread-composer-actions-mode-panel" role="group" aria-label="聊天模式">
              <div class="thread-composer-actions-mode-row">
                <component
                  :is="IconModeToggleMenu"
                  class="thread-composer-actions-mode-leading-icon"
                />
                <div class="thread-composer-mode-toggle">
                  <div
                    class="thread-composer-mode-knob"
                    :class="`is-${selectedChatMode}`"
                  ></div>
                  <button
                    type="button"
                    class="thread-composer-mode-btn"
                    :class="{ 'is-active': selectedChatMode === 'plan' }"
                    @click="onChatModeMenuSelect('plan')"
                  >
                    <IconTablerBulb class="thread-composer-mode-icon" />
                    <span>计划</span>
                  </button>
                  <button
                    type="button"
                    class="thread-composer-mode-btn"
                    :class="{ 'is-active': selectedChatMode === 'act' }"
                    @click="onChatModeMenuSelect('act')"
                  >
                    <IconTablerTerminal2 class="thread-composer-mode-icon" />
                    <span>执行</span>
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>

          <ComposerDropdown
              class="thread-composer-control"
              :model-value="selectedModel"
              :options="modelOptions"
              :placeholder="tUi(normalizedLanguage, 'composer.model')"
              menu-width="model"
              :show-option-icons="false"
              open-direction="up"
              :disabled="disabled || !activeThreadId || modelOptions.length === 0"
              @update:model-value="onModelSelect"
          />

          <ComposerDropdown
            v-if="reasoningOptions.length > 0"
            class="thread-composer-control"
            :model-value="selectedReasoningEffort"
            :options="reasoningOptions"
            :placeholder="tUi(normalizedLanguage, 'composer.thinking')"
            :menu-title="reasoningLabel"
            :trigger-title="reasoningLabel"
            open-direction="up"
            :disabled="disabled || !activeThreadId || isTurnInProgress"
            @update:model-value="onReasoningEffortSelect"
          />
        </div>

          <div class="thread-composer-action-group">
            <button
              v-if="shouldShowVoiceButton"
              class="thread-composer-voice-button"
              type="button"
              :aria-label="voiceButtonLabel"
              :title="voiceButtonLabel"
              :disabled="isVoiceButtonDisabled"
              :data-state="voiceInputState"
              @click="onVoiceInputButtonClick"
            >
              <svg class="thread-composer-voice-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 4a3 3 0 0 0-3 3v4a3 3 0 1 0 6 0V7a3 3 0 0 0-3-3Zm-5 7a1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.07A7 7 0 0 0 19 11a1 1 0 1 0-2 0 5 5 0 1 1-10 0Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button
              v-if="shouldShowStopButton"
              class="thread-composer-stop"
              type="button"
              aria-label="Стоп"
              :disabled="disabled || !activeThreadId || isInterruptingTurn"
              @click="onInterrupt"
            >
              <IconTablerPlayerStopFilled class="thread-composer-stop-icon" />
            </button>
            <button
              v-else
              class="thread-composer-submit"
              type="submit"
              aria-label="Send message"
              :disabled="!canSubmit"
            >
              <IconTablerArrowUp class="thread-composer-submit-icon" />
            </button>
          </div>
        </div>

        <div v-if="activeThreadId" class="thread-composer-status-group">
          <div
            v-if="shouldShowBranchChip"
            ref="branchMenuRef"
            class="thread-composer-branch-wrap"
          >
            <button
              class="thread-composer-status-chip thread-composer-branch-chip thread-composer-branch-button"
              type="button"
              :title="branchLabel || tUi(normalizedLanguage, 'composer.branch')"
              :aria-label="branchLabel || tUi(normalizedLanguage, 'composer.branch')"
              :aria-expanded="isBranchMenuOpen"
              aria-haspopup="menu"
              @click="toggleBranchMenu"
            >
              <IconBranchPretty class="thread-composer-branch-icon" />
              <span class="thread-composer-branch-text">{{ branchName || tUi(normalizedLanguage, 'composer.branch') }}</span>
              <IconTablerChevronDown class="thread-composer-branch-chevron" />
            </button>

            <button
              v-if="isBranchMenuOpen"
              class="thread-composer-branch-sheet-backdrop"
              type="button"
              aria-label="关闭分支面板"
              tabindex="-1"
              @click="closeBranchMenu"
            />

            <div
              v-if="isBranchMenuOpen"
              class="thread-composer-branch-menu thread-composer-branch-sheet"
            >
              <div class="thread-composer-branch-menu-header">
                <div class="thread-composer-branch-sheet-handle" aria-hidden="true" />
                <p class="thread-composer-branch-menu-title">{{ tUi(normalizedLanguage, 'composer.branchMenuTitle') }}</p>
                <button
                  type="button"
                  class="thread-composer-branch-sheet-close"
                  aria-label="关闭分支面板"
                  @click="closeBranchMenu"
                >
                  <IconTablerX class="thread-composer-branch-sheet-close-icon" />
                </button>
              </div>
              <p v-if="branchBlockedSummary" class="thread-composer-branch-menu-hint">
                {{ branchBlockedSummary }}
              </p>
              <p v-else class="thread-composer-branch-menu-hint">
                {{ tUi(normalizedLanguage, 'composer.branchWorkspaceHint') }}
              </p>
              <p
                v-if="branchGlobalApprovalHint"
                class="thread-composer-branch-menu-session-hint"
              >
                {{ branchGlobalApprovalHint }}
              </p>
              <div
                v-if="branchDirtySummaryLabels.length > 0"
                class="thread-composer-branch-dirty-summary"
              >
                <span
                  v-for="label in branchDirtySummaryLabels"
                  :key="label"
                  class="thread-composer-branch-dirty-chip"
                >
                  {{ label }}
                </span>
              </div>
              <div
                v-if="branchDirtyPreviewPaths.length > 0"
                class="thread-composer-branch-dirty-preview"
              >
                <p class="thread-composer-branch-dirty-preview-title">
                  {{ tUi(normalizedLanguage, 'composer.branchDirtyEntriesTitle') }}
                </p>
                <ul class="thread-composer-branch-dirty-preview-list">
                  <li
                    v-for="path in branchDirtyPreviewPaths"
                    :key="path"
                    class="thread-composer-branch-dirty-preview-item"
                  >
                    {{ path }}
                  </li>
                </ul>
                <p
                  v-if="branchDirtyOverflowCount > 0"
                  class="thread-composer-branch-dirty-preview-more"
                >
                  {{ tUi(normalizedLanguage, 'composer.branchDirtyEntriesMore', { count: branchDirtyOverflowCount }) }}
                </p>
              </div>
              <div
                v-if="branchPersistedRecords.length > 0"
                class="thread-composer-branch-persisted"
              >
                <p class="thread-composer-branch-persisted-title">
                  {{ tUi(normalizedLanguage, 'composer.branchPersistedRecordsTitle') }}
                </p>
                <ul class="thread-composer-branch-persisted-list">
                  <li
                    v-for="request in branchPersistedRecords"
                    :key="request.id"
                    class="thread-composer-branch-persisted-item"
                  >
                    <div class="thread-composer-branch-persisted-copy">
                      <p class="thread-composer-branch-persisted-method">{{ request.method }}</p>
                      <p class="thread-composer-branch-persisted-meta">
                        {{ tUi(normalizedLanguage, 'composer.branchPersistedRecordReceivedAt', { time: formatPersistedRequestTime(request.receivedAtIso) }) }}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="thread-composer-branch-persisted-dismiss"
                      :disabled="disabled || isBranchSwitching"
                      @click="onDismissPersistedRequest(request.id)"
                    >
                      {{ tUi(normalizedLanguage, 'composer.branchPersistedRecordDismiss') }}
                    </button>
                  </li>
                </ul>
              </div>

              <div class="thread-composer-branch-push">
                <p class="thread-composer-branch-push-title">
                  {{ tUi(normalizedLanguage, 'composer.branchPushTitle') }}
                </p>
                <p v-if="branchPushSummary" class="thread-composer-branch-push-copy">
                  {{ branchPushSummary }}
                </p>
                <p v-if="branchPushCommand" class="thread-composer-branch-push-command">
                  {{ branchPushCommand }}
                </p>
                <button
                  v-if="shouldShowPushButton"
                  type="button"
                  class="thread-composer-branch-push-button"
                  :disabled="!canTriggerBranchPush"
                  @click="onPushBranch"
                >
                  {{ isBranchPushing ? tUi(normalizedLanguage, 'composer.branchPushing') : branchPushActionLabel }}
                </button>
              </div>

              <p v-if="isBranchLoading" class="thread-composer-branch-menu-empty">
                {{ tUi(normalizedLanguage, 'composer.branchLoading') }}
              </p>
              <div v-else-if="availableBranches.length > 0" class="thread-composer-branch-list">
                <button
                  v-for="branch in availableBranches"
                  :key="branch"
                  class="thread-composer-branch-list-item"
                  type="button"
                  :class="{ 'is-current': branch === currentBranchName }"
                  :disabled="isBranchActionBlocked || isBranchSwitching || branch === currentBranchName"
                  @click="onSelectBranch(branch)"
                >
                  <span class="thread-composer-branch-list-item-name">{{ branch }}</span>
                  <span v-if="branch === currentBranchName" class="thread-composer-branch-list-item-badge">
                    {{ tUi(normalizedLanguage, 'composer.branchCurrent') }}
                  </span>
                </button>
              </div>
              <p v-else class="thread-composer-branch-menu-empty">
                {{ tUi(normalizedLanguage, 'composer.branchEmpty') }}
              </p>

              <div class="thread-composer-branch-menu-divider" />

              <form class="thread-composer-branch-create" @submit.prevent="onCreateBranch">
                <input
                  v-model="newBranchName"
                  class="thread-composer-branch-input"
                  type="text"
                  :disabled="isBranchActionBlocked || isBranchSwitching"
                  :placeholder="tUi(normalizedLanguage, 'composer.branchCreatePlaceholder')"
                />
                <button
                  class="thread-composer-branch-create-button"
                  type="submit"
                  :disabled="isBranchActionBlocked || isBranchSwitching || newBranchName.trim().length === 0"
                >
                  {{ isBranchSwitching ? tUi(normalizedLanguage, 'composer.branchSwitching') : tUi(normalizedLanguage, 'composer.branchCreate') }}
                </button>
              </form>
            </div>
          </div>

          <div class="thread-composer-quota-wrap">
            <div
              v-if="quotaDisplayRows.length > 0"
              class="thread-composer-quota-display"
              tabindex="0"
              :aria-label="rateLimitSummaryLabel"
              :title="rateLimitSummaryLabel"
            >
              <template v-for="row in quotaDisplayRows" :key="row.key">
                <span
                  v-if="row.kind === 'pill'"
                  class="thread-composer-quota-pill"
                  :data-level="row.level"
                >
                  {{ row.displayLabel }}
                </span>
                <button
                  v-else-if="row.kind === 'ring'"
                  class="thread-composer-quota-ring"
                  type="button"
                  :data-level="row.level"
                  :style="row.ringStyle"
                >
                  <span class="thread-composer-quota-ring-inner">{{ row.windowLabel }}</span>
                </button>
              </template>
            </div>
            <span
              v-else-if="rateLimitSummaryLabel"
              class="thread-composer-status-chip thread-composer-status-chip-action"
              :data-quota-level="quotaLevel"
              tabindex="0"
            >
              {{ rateLimitSummaryLabel }}
            </span>
            <div class="thread-composer-status-popover" role="status" aria-live="polite">
              <div class="thread-composer-popover-header">
                <div class="thread-composer-popover-header-left">
                  <span
                    v-if="rateLimitUsage?.planType"
                    class="thread-composer-popover-plan-badge"
                    :data-plan="rateLimitUsage?.planType"
                  >
                    {{ rateLimitUsage?.planType.toUpperCase() }}
                  </span>
                  <span class="thread-composer-popover-gauge-icon" aria-hidden="true" />
                  <span class="thread-composer-popover-title">{{ tUi(normalizedLanguage, 'composer.quotaRemainingTitle') }}</span>
                </div>
              </div>
              <p v-if="quotaWindowRows.length === 0" class="thread-composer-popover-line">{{ tUi(normalizedLanguage, 'composer.quotaDataUnavailable') }}</p>
              <div
                v-for="(row, index) in quotaWindowRows"
                :key="`quota-window-${index}`"
                class="thread-composer-popover-row"
              >
                <span class="thread-composer-popover-row-duration">{{ row.durationText }}</span>
                <span class="thread-composer-popover-row-percent">{{ row.remainingPercentText }}</span>
                <span class="thread-composer-popover-row-reset">{{ row.resetAtText }}</span>
              </div>
              <p v-if="aiCreditsLabel" class="thread-composer-popover-line">{{ aiCreditsLabel }}</p>
            </div>
          </div>

          <div class="thread-composer-context-wrap">
            <button
              class="thread-composer-context-ring"
              type="button"
              :aria-label="contextUsageSummaryLabel"
              :title="contextUsageSummaryLabel"
              :data-level="contextLevel"
              :style="contextRingStyle"
            >
              <span class="thread-composer-context-ring-inner">{{ contextUsedPercentText }}</span>
            </button>
            <div class="thread-composer-status-popover thread-composer-status-popover-context" role="status" aria-live="polite">
              <p class="thread-composer-popover-title">{{ tUi(normalizedLanguage, 'composer.contextUsageTitle') }}</p>
              <p class="thread-composer-popover-line">{{ contextUsageSummaryLabel }}</p>
              <p class="thread-composer-popover-line">{{ contextTokenSummaryLabel }}</p>
              <p class="thread-composer-popover-hint">{{ tUi(normalizedLanguage, 'composer.contextAutoCompressHint') }}</p>
              <button
                class="thread-composer-compact-button"
                type="button"
                :disabled="!canCompactContext || isCompactingContext"
                @click="onCompactContext"
              >
                {{ isCompactingContext ? tUi(normalizedLanguage, 'composer.compacting') : tUi(normalizedLanguage, 'composer.compactNow') }}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import type {
  ChatMode,
  ComposerSubmitPayload,
  ReasoningEffort,
  UiPersistedServerRequest,
  UiRateLimitUsage,
  UiThreadContextUsage,
  UiWorkspaceBranchState,
  WorkspacePushBlockReason,
  WorkspaceModel,
  WorkspaceBranchBlockReason,
} from '../../types/codex'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerBrain from '../icons/IconTablerBrain.vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconBranchPretty from '../icons/IconBranchPretty.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'
import IconTablerSettings from '../icons/IconTablerSettings.vue'
import IconTablerBulb from '../icons/IconTablerBulb.vue'
import IconModeToggleMenu from '../icons/IconModeToggleMenu.vue'
import IconTablerPaperclip from '../icons/IconTablerPaperclip.vue'
import IconTablerTerminal2 from '../icons/IconTablerTerminal2.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import { getModelReasoningSupport } from '../../api/codexGateway'
import { requestLocalTranscription } from '../../api/transcriptionGateway'
import ComposerDropdown from './ComposerDropdown.vue'
import { detectVoiceInputSupport } from '../../utils/voiceInput'

const props = defineProps<{
  activeThreadId: string
  models: string[]
  selectedModel: string
  selectedReasoningEffort: ReasoningEffort | ''
  selectedChatMode: ChatMode
  threadBranch?: string
  workspaceModel?: WorkspaceModel | null
  workspaceBranchState?: UiWorkspaceBranchState | null
  persistedServerRequests?: UiPersistedServerRequest[]
  globalLiveRequestCount?: number
  globalPersistedRequestCount?: number
  contextUsage?: UiThreadContextUsage | null
  rateLimitUsage?: UiRateLimitUsage | null
  isCompactingContext?: boolean
  uiLanguage?: UiLanguage
  isTurnInProgress?: boolean
  isInterruptingTurn?: boolean
  disabled?: boolean
}>()

type ComposerImageInput = {
  id: string
  name: string
  url: string
}

type VoiceInputState = 'idle' | 'listening-native' | 'recording-fallback' | 'transcribing-fallback' | 'failed'
type VoiceInputErrorKey =
  | 'composer.voiceUnsupported'
  | 'composer.voicePermissionDenied'
  | 'composer.voiceTranscriptionFailed'

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0?: { transcript?: string }
}

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionInstance = EventTarget & {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

const emit = defineEmits<{
  submit: [payload: ComposerSubmitPayload]
  interrupt: []
  'compact-context': []
  'update:selected-model': [modelId: string]
  'update:selected-reasoning-effort': [effort: ReasoningEffort | '']
  'update:selected-chat-mode': [mode: ChatMode]
  'refresh-branches': []
  'switch-branch': [branch: string]
  'create-branch': [branch: string]
  'push-branch': []
  'dismiss-persisted-request': [requestId: number]
}>()

const draft = ref('')
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const actionsMenuRef = ref<HTMLElement | null>(null)
const branchMenuRef = ref<HTMLElement | null>(null)
const isActionsMenuOpen = ref(false)
const isBranchMenuOpen = ref(false)
const newBranchName = ref('')
const pastedImages = ref<ComposerImageInput[]>([])
const voiceInputSupport = detectVoiceInputSupport()
const voiceInputState = ref<VoiceInputState>('idle')
const voiceInputErrorKey = ref<VoiceInputErrorKey | null>(null)
const activeSpeechRecognition = ref<SpeechRecognitionInstance | null>(null)
const activeMediaRecorder = ref<MediaRecorder | null>(null)
const activeMediaStream = ref<MediaStream | null>(null)
const fallbackAudioChunks = ref<BlobPart[]>([])
const fallbackAutoStopTimer = ref<number | null>(null)
const shouldDiscardFallbackRecording = ref(false)
const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')
const REASONING_EFFORT_ORDER: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const reasoningOptions = computed<Array<{ value: ReasoningEffort; label: string; icon?: Component; iconProps?: Record<string, unknown> }>>(() => {
  const base: Array<{ value: ReasoningEffort; label: string; icon?: Component; iconProps?: Record<string, unknown> }> = [
    { value: 'none', label: tUi(normalizedLanguage.value, 'composer.reasoning.none'), icon: IconTablerBrain, iconProps: { level: 0 } },
    { value: 'minimal', label: tUi(normalizedLanguage.value, 'composer.reasoning.minimal'), icon: IconTablerBrain, iconProps: { level: 1 } },
    { value: 'low', label: tUi(normalizedLanguage.value, 'composer.reasoning.low'), icon: IconTablerBrain, iconProps: { level: 2 } },
    { value: 'medium', label: tUi(normalizedLanguage.value, 'composer.reasoning.medium'), icon: IconTablerBrain, iconProps: { level: 3 } },
    { value: 'high', label: tUi(normalizedLanguage.value, 'composer.reasoning.high'), icon: IconTablerBrain, iconProps: { level: 4 } },
    { value: 'xhigh', label: tUi(normalizedLanguage.value, 'composer.reasoning.xhigh'), icon: IconTablerBrain, iconProps: { level: 5 } },
  ]

  const support = getModelReasoningSupport(props.selectedModel)
  const optionByEffort = new Map(base.map((option) => [option.value, option]))
  if (support.supported.length === 0) {
    const fallbackEffort = props.selectedReasoningEffort
    return fallbackEffort
      ? [optionByEffort.get(fallbackEffort)].filter((option): option is { value: ReasoningEffort; label: string; icon?: Component; iconProps?: Record<string, unknown> } => option !== undefined)
      : []
  }

  return REASONING_EFFORT_ORDER
    .filter((effort) => support.supported.includes(effort))
    .map((effort) => optionByEffort.get(effort))
    .filter((option): option is { value: ReasoningEffort; label: string; icon?: Component; iconProps?: Record<string, unknown> } => option !== undefined)
})

function toDisplayModelName(modelId: string): string {
  const normalized = modelId.trim().toLowerCase()
  if (!normalized) return modelId

  const knownLabels: Record<string, string> = {
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4-Mini',
    'gpt-5.3-codex': 'GPT-5.3-Codex',
    'gpt-5.2-codex': 'GPT-5.2-Codex',
    'gpt-5.2': 'GPT-5.2',
    'gpt-5.1-codex-max': 'GPT-5.1-Codex-Max',
    'gpt-5.1-codex-mini': 'GPT-5.1-Codex-Mini',
  }
  const mapped = knownLabels[normalized]
  if (mapped) return mapped

  return modelId
}

const modelOptions = computed(() =>
  (props.models.length > 0 ? props.models : props.selectedModel.trim() ? [props.selectedModel.trim()] : []).map((modelId) => ({
    value: modelId,
    label: toDisplayModelName(modelId),
    icon: IconTablerSettings,
  })),
)
const reasoningLabel = computed(() =>
  tUi(normalizedLanguage.value, 'composer.reasoningEffort'),
)
const resolvedWorkspaceBranchState = computed<UiWorkspaceBranchState | null>(() => {
  const workspace = props.workspaceModel
  if (workspace) {
    return {
      cwd: workspace.cwd,
      isRepo: workspace.branch.isRepo,
      isDirty: workspace.gitStatus.isDirty,
      currentBranch: workspace.branch.currentBranch,
      branches: workspace.branch.branches,
      dirtySummary: workspace.gitStatus.summary ?? {
        trackedModified: 0,
        staged: 0,
        untracked: 0,
        conflicted: 0,
        renamed: 0,
        deleted: 0,
      },
      dirtyEntries: workspace.gitStatus.entries,
      isLoading: workspace.branch.isLoading,
      isSwitching: workspace.branch.isSwitching,
      blockedReasons: workspace.guard.blockedReasons,
    }
  }
  return props.workspaceBranchState ?? null
})
const resolvedPersistedServerRequests = computed<UiPersistedServerRequest[]>(() => {
  if (props.workspaceModel) {
    return props.workspaceModel.approvals.persisted
  }
  return props.persistedServerRequests ?? []
})
const currentBranchName = computed(() => {
  const workspaceBranch = resolvedWorkspaceBranchState.value?.currentBranch?.trim() ?? ''
  if (workspaceBranch) return workspaceBranch
  return props.threadBranch?.trim() ?? ''
})
const branchLabel = computed(() => {
  const branch = currentBranchName.value
  if (!branch) return ''
  return `${tUi(normalizedLanguage.value, 'composer.branch')} ${branch}`
})
const branchName = computed(() => currentBranchName.value)
const shouldShowBranchChip = computed(() => {
  if (!props.activeThreadId) return false
  return branchName.value.length > 0 || resolvedWorkspaceBranchState.value != null
})
const isBranchLoading = computed(() => resolvedWorkspaceBranchState.value?.isLoading === true)
const isBranchSwitching = computed(() => resolvedWorkspaceBranchState.value?.isSwitching === true)
const branchBlockedReasons = computed<WorkspaceBranchBlockReason[]>(() => resolvedWorkspaceBranchState.value?.blockedReasons ?? [])
const isBranchActionBlocked = computed(() =>
  props.disabled === true || branchBlockedReasons.value.length > 0,
)
const branchDirtySummaryLabels = computed(() => {
  const summary = resolvedWorkspaceBranchState.value?.dirtySummary
  if (!summary) return []
  const labels: string[] = []
  if (summary.trackedModified > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyTrackedModified', { count: summary.trackedModified }))
  }
  if (summary.staged > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyStaged', { count: summary.staged }))
  }
  if (summary.untracked > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyUntracked', { count: summary.untracked }))
  }
  if (summary.conflicted > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyConflicted', { count: summary.conflicted }))
  }
  if (summary.renamed > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyRenamed', { count: summary.renamed }))
  }
  if (summary.deleted > 0) {
    labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyDeleted', { count: summary.deleted }))
  }
  return labels
})
const branchDirtyPreviewPaths = computed(() =>
  (resolvedWorkspaceBranchState.value?.dirtyEntries ?? [])
    .map((entry) => entry.path.trim())
    .filter((path) => path.length > 0)
    .slice(0, 4),
)
const branchDirtyOverflowCount = computed(() => {
  const total = resolvedWorkspaceBranchState.value?.dirtyEntries?.length ?? 0
  return Math.max(0, total - branchDirtyPreviewPaths.value.length)
})
const branchPersistedRecords = computed<UiPersistedServerRequest[]>(() =>
  resolvedPersistedServerRequests.value.slice(0, 3),
)
const resolvedWorkspacePushState = computed(() =>
  props.workspaceModel?.push ?? {
    status: null,
    isLoading: false,
    isPushing: false,
    lastResult: null,
    lastError: null,
  },
)
const branchPushStatus = computed(() => resolvedWorkspacePushState.value.status)
const isBranchPushLoading = computed(() => resolvedWorkspacePushState.value.isLoading === true)
const isBranchPushing = computed(() => resolvedWorkspacePushState.value.isPushing === true)
const availableBranches = computed(() => {
  const branches = resolvedWorkspaceBranchState.value?.branches ?? []
  const current = currentBranchName.value
  const normalized = branches.map((branch) => branch.trim()).filter((branch) => branch.length > 0)
  if (current && !normalized.includes(current)) {
    normalized.unshift(current)
  }
  return Array.from(new Set(normalized))
})
const branchPushTarget = computed(() => {
  const status = branchPushStatus.value
  if (!status?.hasUpstream) return ''
  const remote = status.upstreamRemote.trim()
  const branch = status.upstreamBranch.trim()
  if (!remote || !branch) return ''
  return `${remote}/${branch}`
})
const branchPushSummary = computed(() => {
  const status = branchPushStatus.value
  if (isBranchPushLoading.value) {
    return tUi(normalizedLanguage.value, 'composer.branchPushLoading')
  }
  if (!status) return ''
  if (status.blockedReasons.includes('unresolved_server_request_scope' as WorkspacePushBlockReason)) {
    return tUi(normalizedLanguage.value, 'composer.pushBlockedUnresolvedScope')
  }
  if (!status.isRepo) {
    return tUi(normalizedLanguage.value, 'composer.branchBlockedNotRepo')
  }
  if (!status.currentBranch) {
    return tUi(normalizedLanguage.value, 'composer.branchPushDetachedHead')
  }
  if (status.willSetUpstream === true) {
    return tUi(normalizedLanguage.value, 'composer.branchPushReady', { target: `${status.upstreamRemote || 'origin'}/${status.currentBranch}` })
  }
  if (!status.hasUpstream) {
    return tUi(normalizedLanguage.value, 'composer.branchPushMissingUpstream')
  }
  if (!status.hasCommitsToPush) {
    return tUi(normalizedLanguage.value, 'composer.branchPushUpToDate')
  }
  if (status.behindCount > 0) {
    return tUi(normalizedLanguage.value, 'composer.branchPushBehindWarning', { count: status.behindCount })
  }
  return tUi(normalizedLanguage.value, 'composer.branchPushReady', { target: branchPushTarget.value || status.currentBranch })
})
const branchPushCommand = computed(() => {
  const status = branchPushStatus.value
  if (!status || status.hasUpstream) return ''
  const command = status.suggestedUpstreamCommand.trim()
  if (!command) return ''
  return tUi(normalizedLanguage.value, 'composer.branchPushSuggestedCommand', { command })
})
const branchPushActionLabel = computed(() => {
  const status = branchPushStatus.value
  if (status?.willSetUpstream === true) {
    return tUi(normalizedLanguage.value, 'composer.branchPushSetUpstreamAction', {
      target: `${status.upstreamRemote || 'origin'}/${status.currentBranch || currentBranchName.value || tUi(normalizedLanguage.value, 'composer.branch')}`,
    })
  }
  const target = branchPushTarget.value
  return tUi(normalizedLanguage.value, 'composer.branchPushAction', {
    target: target || currentBranchName.value || tUi(normalizedLanguage.value, 'composer.branch'),
  })
})
const shouldShowPushButton = computed(() => {
  const status = branchPushStatus.value
  if (!status) return false
  if (status.willSetUpstream === true) return true
  return Boolean(status.hasUpstream && status.hasCommitsToPush)
})
const canTriggerBranchPush = computed(() => {
  const status = branchPushStatus.value
  if (!status) return false
  if (status.willSetUpstream !== true && !status.hasUpstream) return false
  if (status.willSetUpstream !== true && !status.hasCommitsToPush) return false
  return props.disabled !== true
    && isBranchSwitching.value === false
    && isBranchPushing.value === false
    && status.canPush === true
})
function getBranchBlockedReasonLabel(reason: WorkspaceBranchBlockReason): string {
  if (reason === 'not_repo') return tUi(normalizedLanguage.value, 'composer.branchBlockedNotRepo')
  if (reason === 'workspace_dirty') return tUi(normalizedLanguage.value, 'composer.branchBlockedDirty')
  if (reason === 'thread_in_progress') return tUi(normalizedLanguage.value, 'composer.branchBlockedInProgress')
  if (reason === 'pending_server_requests') return tUi(normalizedLanguage.value, 'composer.branchBlockedPendingRequests')
  if (reason === 'persisted_server_requests') return tUi(normalizedLanguage.value, 'composer.branchBlockedPersistedRequests')
  return tUi(normalizedLanguage.value, 'composer.branchBlockedQueued')
}
const branchBlockedSummary = computed(() => branchBlockedReasons.value.map(getBranchBlockedReasonLabel).join(' · '))
const branchGlobalApprovalHint = computed(() => {
  const liveCount = Math.max(0, props.globalLiveRequestCount ?? 0)
  const persistedCount = Math.max(0, props.globalPersistedRequestCount ?? 0)
  if (liveCount === 0 && persistedCount === 0) return ''
  return tUi(normalizedLanguage.value, 'composer.branchGlobalRequestsHint')
})
function formatPersistedRequestTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const locale = normalizedLanguage.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
function formatCompactWindowDuration(minutes: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return ''
  }
  const rounded = Math.round(minutes)
  if (rounded % 10080 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowCompactWeeks', { weeks: rounded / 10080 })
  }
  if (rounded % 1440 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowCompactDays', { days: rounded / 1440 })
  }
  if (rounded % 60 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowCompactHours', { hours: rounded / 60 })
  }
  return tUi(normalizedLanguage.value, 'composer.quotaWindowCompactMinutes', { minutes: rounded })
}
function toQuotaLevel(remaining: number): 'normal' | 'warn' | 'danger' {
  const normalizedRemaining = Math.max(0, remaining)
  if (normalizedRemaining < 5) return 'danger'
  if (normalizedRemaining < 20) return 'warn'
  return 'normal'
}
const rateLimitSummaryLabel = computed(() => {
  const usage = props.rateLimitUsage
  if (!usage) return ''

  const windows = usage.windows ?? []
  if (windows.length > 0) {
    const minWindow = windows.reduce((lowest, current) => {
      const currentRemaining = 100 - current.usedPercent
      const lowestRemaining = 100 - lowest.usedPercent
      return currentRemaining < lowestRemaining ? current : lowest
    })
    const remaining = Math.max(0, Math.round(100 - minWindow.usedPercent))
    const window = formatCompactWindowDuration(minWindow.windowDurationMins)
    if (window) {
      return tUi(normalizedLanguage.value, 'composer.quotaRemainingWindow', { percent: remaining, window })
    }
    return tUi(normalizedLanguage.value, 'composer.quotaRemaining', { percent: remaining })
  }

  const remaining = Math.max(0, Math.round(usage.remainingPercent))
  return tUi(normalizedLanguage.value, 'composer.quotaRemaining', { percent: remaining })
})
const quotaDisplayRows = computed<Array<{
  key: string
  kind: 'pill' | 'ring'
  windowLabel: string
  displayLabel: string
  ringStyle?: Record<string, string>
  level: 'normal' | 'warn' | 'danger'
}>>(() => {
  const usage = props.rateLimitUsage
  if (!usage) return []

  const windows = (usage.windows ?? [])
    .filter((row) => typeof row.usedPercent === 'number' && Number.isFinite(row.usedPercent))
    .sort((first, second) => {
      const firstDuration = first.windowDurationMins ?? Number.MAX_SAFE_INTEGER
      const secondDuration = second.windowDurationMins ?? Number.MAX_SAFE_INTEGER
      return secondDuration - firstDuration
    })

  return windows.slice(0, 2).map((row, index) => {
    const remaining = Math.max(0, Math.round(100 - row.usedPercent))
    const windowLabel = formatCompactWindowDuration(row.windowDurationMins) || tUi(normalizedLanguage.value, 'composer.quotaWindowUnknown')
    return {
      key: `${String(row.windowDurationMins ?? 'unknown')}-${String(row.resetsAt ?? 'na')}`,
      kind: index === 0 ? 'pill' : 'ring',
      windowLabel,
      displayLabel: `${windowLabel} ${remaining}%`,
      ringStyle: index === 0
        ? undefined
        : {
            '--quota-ring-fill': `${remaining}%`,
          },
      level: toQuotaLevel(remaining),
    }
  })
})
const quotaLevel = computed<'normal' | 'warn' | 'danger'>(() => {
  const usage = props.rateLimitUsage
  if (!usage) return 'normal'
  
  let minRemaining = usage.remainingPercent
  if (usage.windows && usage.windows.length > 0) {
    const windowMin = Math.min(...usage.windows.map(w => 100 - w.usedPercent))
    minRemaining = Math.min(minRemaining, windowMin)
  }
  
  return toQuotaLevel(minRemaining)
})
function formatWindowDuration(minutes: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowUnknown')
  }
  const rounded = Math.round(minutes)
  if (rounded % 10080 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowWeeks', { weeks: rounded / 10080 })
  }
  if (rounded % 1440 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowDays', { days: rounded / 1440 })
  }
  if (rounded % 60 === 0) {
    return tUi(normalizedLanguage.value, 'composer.quotaWindowHours', { hours: rounded / 60 })
  }
  return tUi(normalizedLanguage.value, 'composer.quotaWindowMinutes', { minutes: rounded })
}
function formatResetAt(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '--'
  const targetDate = new Date(seconds * 1000)
  const now = new Date()
  const locale = normalizedLanguage.value === 'zh' ? 'zh-CN' : 'en-US'
  const isSameDay = targetDate.getFullYear() === now.getFullYear()
    && targetDate.getMonth() === now.getMonth()
    && targetDate.getDate() === now.getDate()
  if (isSameDay) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(targetDate)
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(targetDate)
}
const quotaWindowRows = computed<Array<{ durationText: string; remainingPercentText: string; resetAtText: string }>>(() => {
  const usage = props.rateLimitUsage
  if (!usage) return []
  const windows = usage.windows ?? []
  return windows.slice(0, 2).map((row) => {
    const remainingPercent = Math.max(0, Math.round(100 - row.usedPercent))
    return {
      durationText: formatWindowDuration(row.windowDurationMins),
      remainingPercentText: `${remainingPercent}%`,
      resetAtText: formatResetAt(row.resetsAt),
    }
  })
})
const aiCreditsLabel = computed(() => {
  const usage = props.rateLimitUsage
  const credits = usage?.aiCredits ?? null
  if (!credits) return ''
  if (credits.unlimited) {
    return tUi(normalizedLanguage.value, 'composer.aiCreditsUnlimited')
  }
  const balance = credits.balance?.trim() ?? ''
  if (balance) {
    return tUi(normalizedLanguage.value, 'composer.aiCreditsBalance', { balance })
  }
  return credits.hasCredits
    ? tUi(normalizedLanguage.value, 'composer.aiCreditsAvailable')
    : tUi(normalizedLanguage.value, 'composer.aiCreditsDepleted')
})
const contextUsedPercent = computed(() => {
  const usage = props.contextUsage
  if (!usage) return null
  return Math.min(Math.max(usage.usedPercent, 0), 100)
})
const contextLevel = computed(() => {
  const percent = contextUsedPercent.value
  if (percent === null) return 'idle'
  if (percent >= 90) return 'danger'
  if (percent >= 70) return 'warn'
  return 'ok'
})
const contextUsedPercentText = computed(() => {
  const percent = contextUsedPercent.value
  if (percent === null) return '--'
  return `${Math.round(percent)}%`
})
const contextRingStyle = computed(() => {
  const percent = contextUsedPercent.value
  const fill = percent === null ? 0 : percent
  return {
    '--context-ring-fill': `${fill}%`,
  } as Record<string, string>
})
const contextUsageSummaryLabel = computed(() => {
  const usage = props.contextUsage
  if (!usage) {
    return tUi(normalizedLanguage.value, 'composer.contextDataUnavailable')
  }
  return tUi(normalizedLanguage.value, 'composer.contextUsageSummary', {
    used: Math.round(usage.usedPercent),
    remaining: Math.round(usage.remainingPercent),
  })
})
function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value < 1000) return String(Math.round(value))
  const formatted = value / 1000
  return `${formatted.toFixed(formatted >= 10 ? 0 : 1)}k`
}
const contextTokenSummaryLabel = computed(() => {
  const usage = props.contextUsage
  if (!usage) {
    return tUi(normalizedLanguage.value, 'composer.contextDataUnavailable')
  }
  return tUi(normalizedLanguage.value, 'composer.contextTokensSummary', {
    usedTokens: formatTokenCount(usage.usedTokens),
    totalTokens: formatTokenCount(usage.totalTokens),
  })
})
const canCompactContext = computed(() => {
  if (props.disabled) return false
  if (!props.activeThreadId) return false
  return true
})
const isCompactingContext = computed(() => props.isCompactingContext === true)

const canSubmit = computed(() => {
  if (props.disabled) return false
  if (!props.activeThreadId) return false
  return draft.value.trim().length > 0 || pastedImages.value.length > 0
})
const shouldShowVoiceButton = computed(() =>
  props.activeThreadId
  && voiceInputSupport.preferredMode !== 'unsupported',
)
const isVoiceButtonDisabled = computed(() =>
  props.disabled === true
  || !props.activeThreadId
  || voiceInputState.value === 'transcribing-fallback',
)
const shouldShowStopButton = computed(() =>
  props.isTurnInProgress === true && draft.value.trim().length === 0,
)
const voiceButtonLabel = computed(() => {
  if (voiceInputState.value === 'listening-native') {
    return tUi(normalizedLanguage.value, 'composer.voiceListening')
  }
  if (voiceInputState.value === 'recording-fallback') {
    return tUi(normalizedLanguage.value, 'composer.voiceRecording')
  }
  if (voiceInputState.value === 'transcribing-fallback') {
    return tUi(normalizedLanguage.value, 'composer.voiceTranscribing')
  }
  if (voiceInputState.value === 'failed' && voiceInputErrorKey.value) {
    return tUi(normalizedLanguage.value, voiceInputErrorKey.value)
  }
  return tUi(normalizedLanguage.value, 'composer.voiceInput')
})

const placeholderText = computed(() =>
  props.activeThreadId
    ? tUi(normalizedLanguage.value, 'composer.typeMessage')
    : tUi(normalizedLanguage.value, 'composer.selectThreadFirst'),
)

function onSubmit(): void {
  const text = draft.value.trim()
  if (!canSubmit.value) return
  emit('submit', {
    text,
    images: pastedImages.value.map((image) => ({ url: image.url })),
  })
  draft.value = ''
  pastedImages.value = []
}

function onCompositionStart(): void {
  isComposing.value = true
}

function onCompositionEnd(): void {
  isComposing.value = false
}

function mergeDraftWithTranscript(currentDraft: string, transcript: string): string {
  const normalizedTranscript = transcript.trim()
  if (!normalizedTranscript) return currentDraft
  const base = currentDraft.trimEnd()
  if (!base) return normalizedTranscript
  return `${base} ${normalizedTranscript}`
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window as Window & typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

function applyTranscriptToDraft(transcript: string): void {
  draft.value = mergeDraftWithTranscript(draft.value, transcript)
}

function resetVoiceInputState(): void {
  voiceInputState.value = 'idle'
  voiceInputErrorKey.value = null
}

function clearFallbackRecordingState(): void {
  if (fallbackAutoStopTimer.value !== null) {
    window.clearTimeout(fallbackAutoStopTimer.value)
    fallbackAutoStopTimer.value = null
  }
  activeMediaRecorder.value = null
  if (activeMediaStream.value) {
    activeMediaStream.value.getTracks().forEach((track) => track.stop())
  activeMediaStream.value = null
  }
  fallbackAudioChunks.value = []
  shouldDiscardFallbackRecording.value = false
}

function failVoiceInput(errorKey: VoiceInputErrorKey): void {
  clearFallbackRecordingState()
  voiceInputState.value = 'failed'
  voiceInputErrorKey.value = errorKey
}

function startNativeSpeechRecognition(): void {
  const Recognition = getSpeechRecognitionConstructor()
  if (!Recognition) {
    void startFallbackRecording()
    return
  }

  const recognition = new Recognition()
  activeSpeechRecognition.value = recognition
  voiceInputState.value = 'listening-native'
  voiceInputErrorKey.value = null
  recognition.lang = normalizedLanguage.value === 'zh' ? 'zh-CN' : 'en-US'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .filter((result) => result.isFinal)
      .map((result) => result[0]?.transcript?.trim() ?? '')
      .filter((value) => value.length > 0)
      .join(' ')
    if (transcript) {
      applyTranscriptToDraft(transcript)
    }
  }
  recognition.onerror = () => {
    activeSpeechRecognition.value = null
    failVoiceInput('composer.voiceTranscriptionFailed')
  }
  recognition.onend = () => {
    activeSpeechRecognition.value = null
    if (voiceInputState.value === 'listening-native') {
      resetVoiceInputState()
    }
  }
  recognition.start()
}

async function transcribeFallbackAudio(audio: Blob): Promise<void> {
  voiceInputState.value = 'transcribing-fallback'
  try {
    const response = await requestLocalTranscription(audio)
    applyTranscriptToDraft(response.text ?? '')
    resetVoiceInputState()
  } catch {
    failVoiceInput('composer.voiceTranscriptionFailed')
  }
}

async function startFallbackRecording(): Promise<void> {
  if (!voiceInputSupport.hasFallbackRecording || voiceInputSupport.requiresSecureContext) {
    failVoiceInput('composer.voiceUnsupported')
    return
  }

  voiceInputState.value = 'recording-fallback'
  voiceInputErrorKey.value = null
  shouldDiscardFallbackRecording.value = false

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    activeMediaStream.value = stream
    const mimeType = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : ''
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    activeMediaRecorder.value = recorder
    fallbackAudioChunks.value = []

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        fallbackAudioChunks.value = [...fallbackAudioChunks.value, event.data]
      }
    })

    recorder.addEventListener('stop', () => {
      const chunks = [...fallbackAudioChunks.value]
      const shouldDiscard = shouldDiscardFallbackRecording.value
      clearFallbackRecordingState()
      if (shouldDiscard) {
        resetVoiceInputState()
        return
      }
      if (chunks.length === 0) {
        failVoiceInput('composer.voiceTranscriptionFailed')
        return
      }
      void transcribeFallbackAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
    }, { once: true })

    recorder.start()
    fallbackAutoStopTimer.value = window.setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
    }, 30000)
  } catch (error) {
    const isPermissionError = error instanceof DOMException
      && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    failVoiceInput(isPermissionError ? 'composer.voicePermissionDenied' : 'composer.voiceTranscriptionFailed')
  }
}

function stopFallbackRecording(): void {
  const recorder = activeMediaRecorder.value
  if (!recorder || recorder.state === 'inactive') return
  recorder.stop()
}

function discardFallbackRecording(): void {
  const recorder = activeMediaRecorder.value
  if (!recorder || recorder.state === 'inactive') {
    clearFallbackRecordingState()
    return
  }
  shouldDiscardFallbackRecording.value = true
  recorder.stop()
}

function onVoiceInputButtonClick(): void {
  if (isVoiceButtonDisabled.value) return

  if (voiceInputState.value === 'listening-native') {
    activeSpeechRecognition.value?.stop()
    return
  }

  if (voiceInputState.value === 'recording-fallback') {
    stopFallbackRecording()
    return
  }

  if (voiceInputSupport.preferredMode === 'native') {
    startNativeSpeechRecognition()
    return
  }

  void startFallbackRecording()
}

function onEnterKeydown(event: KeyboardEvent): void {
  if (event.shiftKey) return
  if (isComposing.value || event.isComposing) return
  onSubmit()
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const imageItems = Array.from(event.clipboardData?.items ?? []).filter((item) => item.type.startsWith('image/'))
  if (imageItems.length === 0) return

  event.preventDefault()
  const files = imageItems
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  await appendSelectedFiles(files)
}

function removePastedImage(imageId: string): void {
  pastedImages.value = pastedImages.value.filter((image) => image.id !== imageId)
  textareaRef.value?.focus()
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read pasted image'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read pasted image'))
    }
    reader.readAsDataURL(file)
  })
}

function toggleActionsMenu(): void {
  if (props.disabled || !props.activeThreadId) return
  isActionsMenuOpen.value = !isActionsMenuOpen.value
}

function closeActionsMenu(): void {
  isActionsMenuOpen.value = false
}

function toggleBranchMenu(): void {
  if (!props.activeThreadId) return
  const nextOpen = !isBranchMenuOpen.value
  isBranchMenuOpen.value = nextOpen
  if (nextOpen) {
    emit('refresh-branches')
  }
}

function closeBranchMenu(): void {
  isBranchMenuOpen.value = false
}

function onSelectUploadFiles(): void {
  closeActionsMenu()
  fileInputRef.value?.click()
}

function onChatModeMenuSelect(mode: ChatMode): void {
  onChatModeSelect(mode)
}

async function onFileInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const files = Array.from(input?.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (files.length === 0) return
  await appendSelectedFiles(files)
  if (input) {
    input.value = ''
  }
}

async function appendSelectedFiles(files: File[]): Promise<void> {
  const nextImages = await Promise.all(
    files.map(async (file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || `selected-image-${index + 1}.png`,
      url: await readFileAsDataUrl(file),
    })),
  )
  pastedImages.value = [...pastedImages.value, ...nextImages]
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  const actionsRoot = actionsMenuRef.value
  if (isActionsMenuOpen.value && actionsRoot && !actionsRoot.contains(target)) {
    closeActionsMenu()
  }
  const branchRoot = branchMenuRef.value
  if (isBranchMenuOpen.value && branchRoot && !branchRoot.contains(target)) {
    closeBranchMenu()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  activeSpeechRecognition.value?.stop()
  discardFallbackRecording()
})

function onInterrupt(): void {
  emit('interrupt')
}

function onCompactContext(): void {
  emit('compact-context')
}

function onModelSelect(value: string): void {
  emit('update:selected-model', value)
}

function onReasoningEffortSelect(value: string): void {
  const effort = reasoningOptions.value.find((option) => option.value === value)?.value ?? ''
  emit('update:selected-reasoning-effort', effort)
}

function onChatModeSelect(mode: ChatMode): void {
  if (props.disabled || !props.activeThreadId) return
  emit('update:selected-chat-mode', mode)
}

function onSelectBranch(branch: string): void {
  if (isBranchActionBlocked.value || isBranchSwitching.value) return
  emit('switch-branch', branch)
  closeBranchMenu()
}

function onCreateBranch(): void {
  const branch = newBranchName.value.trim()
  if (!branch || isBranchActionBlocked.value || isBranchSwitching.value) return
  emit('create-branch', branch)
  newBranchName.value = ''
  closeBranchMenu()
}

function onPushBranch(): void {
  if (!canTriggerBranchPush.value) return
  emit('push-branch')
}

function onDismissPersistedRequest(requestId: number): void {
  if (!Number.isInteger(requestId)) return
  const confirmed = window.confirm(
    tUi(normalizedLanguage.value, 'composer.branchPersistedRecordDismissConfirm'),
  )
  if (!confirmed) return
  emit('dismiss-persisted-request', requestId)
}

watch(
  () => props.activeThreadId,
  () => {
    draft.value = ''
    pastedImages.value = []
    activeSpeechRecognition.value?.stop()
    discardFallbackRecording()
    resetVoiceInputState()
    closeActionsMenu()
    closeBranchMenu()
    newBranchName.value = ''
  },
)
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer {
  @apply w-full max-w-175 mx-auto px-6;
}

.thread-composer-shell {
  @apply rounded-2xl border border-zinc-300 bg-white p-3 shadow-sm;
}

.thread-composer-input {
  @apply w-full min-w-0 min-h-11 max-h-40 rounded-xl border-0 bg-transparent px-1 py-2 text-sm leading-6 text-zinc-900 outline-none transition resize-y;
}

.thread-composer-input:focus {
  @apply ring-0;
}

.thread-composer-input:disabled {
  @apply bg-zinc-100 text-zinc-500 cursor-not-allowed;
}

.thread-composer-image-list {
  @apply mt-2 flex flex-wrap gap-2 list-none p-0;
}

.thread-composer-image-item {
  @apply relative h-20 w-20 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50;
}

.thread-composer-image-preview {
  @apply h-full w-full object-cover;
}

.thread-composer-image-remove {
  @apply absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-xs leading-none text-zinc-700 transition hover:bg-white;
}

.thread-composer-controls {
  @apply mt-3 flex items-center gap-4;
}

.thread-composer-main-controls {
  @apply flex min-w-0 flex-1 items-center gap-4;
}

.thread-composer-config-group {
  @apply flex min-w-0 items-center gap-4;
}

.thread-composer-action-group {
  @apply ml-auto flex items-center gap-2;
}

.thread-composer-control {
  @apply shrink-0;
}

.thread-composer-actions {
  @apply relative shrink-0;
}

.thread-composer-file-input {
  @apply hidden;
}

.thread-composer-actions-trigger {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400;
}

.thread-composer-voice-button {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 transition disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400;
}

.thread-composer-voice-button:hover {
  @apply bg-zinc-100;
}

.thread-composer-voice-button[data-state='listening-native'],
.thread-composer-voice-button[data-state='recording-fallback'],
.thread-composer-voice-button[data-state='transcribing-fallback'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.thread-composer-voice-icon {
  @apply h-3 w-3;
}

.thread-composer-actions-trigger-mark {
  @apply text-xs leading-none;
}

.thread-composer-actions-menu {
  @apply absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-40 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.thread-composer-actions-menu-item {
  @apply flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[11px] text-zinc-700 transition hover:bg-zinc-100;
}

.thread-composer-actions-menu-item-icon {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.thread-composer-actions-menu-divider {
  @apply my-1 h-px bg-zinc-200;
}

.thread-composer-actions-mode-panel {
  @apply px-1 pb-1;
}

.thread-composer-actions-mode-row {
  @apply flex items-center gap-2;
}

.thread-composer-actions-mode-leading-icon {
  @apply h-4 w-4 shrink-0 text-zinc-500;
}

.thread-composer-actions-mode-panel .thread-composer-mode-toggle {
  min-width: 118px;
}

.thread-composer-mode-toggle {
  @apply relative flex items-center p-0.5 bg-zinc-100 rounded-md shrink-0 border border-zinc-200/50;
  height: 28px;
  min-width: 100px;
}

.thread-composer-mode-knob {
  @apply absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-white rounded shadow-sm border border-zinc-200/30 transition-all duration-300 ease-out z-0;
}

.thread-composer-mode-knob.is-plan {
  left: 2px;
}

.thread-composer-mode-knob.is-act {
  left: calc(50% + 0px);
  @apply bg-blue-50/80 border-blue-200/50 shadow-blue-900/5;
}

.thread-composer-mode-btn {
  @apply relative z-10 flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-zinc-500 transition-all duration-200;
}

.thread-composer-mode-btn.is-active {
  @apply text-zinc-800;
}

.thread-composer-mode-knob.is-act ~ .thread-composer-mode-btn.is-active {
  @apply text-blue-700;
}

.thread-composer-mode-icon {
  @apply w-3.5 h-3.5;
}

.thread-composer-mode-text {
  @apply whitespace-nowrap;
}

.thread-composer-control :deep(.composer-dropdown-trigger) {
  @apply text-[11px] text-zinc-600;
}

.thread-composer-control :deep(.composer-dropdown-trigger-icon) {
  @apply h-3.5 w-3.5;
}

.thread-composer-control :deep(.composer-dropdown-chevron) {
  @apply h-3 w-3;
}

.thread-composer-status-group {
  @apply ml-auto flex items-center gap-1.5;
}

.thread-composer-status-chip {
  @apply inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600 whitespace-nowrap;
}

.thread-composer-status-chip-action {
  @apply cursor-default select-none;
}

.thread-composer-status-chip-action[data-quota-level='warn'] {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.thread-composer-status-chip-action[data-quota-level='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.thread-composer-branch-chip {
  @apply gap-1.5 rounded-full border-zinc-200 bg-zinc-100 px-2.5 text-zinc-600;
}

.thread-composer-branch-wrap {
  @apply relative;
}

.thread-composer-branch-button {
  @apply transition hover:bg-zinc-200;
}

.thread-composer-branch-menu {
  @apply absolute bottom-[calc(100%+8px)] right-0 z-30 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg;
}

.thread-composer-branch-sheet-backdrop {
  @apply hidden;
}

.thread-composer-branch-menu-header {
  @apply flex items-center gap-2;
}

.thread-composer-branch-sheet-handle {
  @apply hidden;
}

.thread-composer-branch-menu-title {
  @apply m-0 min-w-0 flex-1 text-[11px] font-semibold text-zinc-800;
}

.thread-composer-branch-sheet-close {
  @apply hidden;
}

.thread-composer-branch-sheet-close-icon {
  @apply h-3.5 w-3.5;
}

.thread-composer-branch-menu-hint {
  @apply mt-1 mb-0 text-[10px] leading-4 text-zinc-500;
}

.thread-composer-branch-menu-session-hint {
  @apply mt-1 mb-0 text-[10px] leading-4 text-zinc-400;
}

.thread-composer-branch-dirty-summary {
  @apply mt-2 flex flex-wrap gap-1;
}

.thread-composer-branch-dirty-chip {
  @apply rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] leading-4 text-amber-800;
}

.thread-composer-branch-dirty-preview {
  @apply mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2;
}

.thread-composer-branch-dirty-preview-title {
  @apply m-0 text-[10px] font-medium text-zinc-700;
}

.thread-composer-branch-dirty-preview-list {
  @apply mt-1 list-none p-0 m-0 flex flex-col gap-1;
}

.thread-composer-branch-dirty-preview-item {
  @apply text-[10px] leading-4 text-zinc-600 break-all;
}

.thread-composer-branch-dirty-preview-more {
  @apply mt-1 mb-0 text-[10px] leading-4 text-zinc-500;
}

.thread-composer-branch-persisted {
  @apply mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-2;
}

.thread-composer-branch-persisted-title {
  @apply m-0 text-[10px] font-medium text-sky-900;
}

.thread-composer-branch-persisted-list {
  @apply mt-1 list-none p-0 m-0 flex flex-col gap-1.5;
}

.thread-composer-branch-persisted-item {
  @apply flex items-start justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5;
}

.thread-composer-branch-persisted-copy {
  @apply min-w-0 flex-1;
}

.thread-composer-branch-persisted-method {
  @apply m-0 text-[10px] font-medium leading-4 text-sky-950 break-all;
}

.thread-composer-branch-persisted-meta {
  @apply mt-0.5 mb-0 text-[10px] leading-4 text-sky-700;
}

.thread-composer-branch-persisted-dismiss {
  @apply shrink-0 rounded-md border border-sky-200 bg-white px-2 py-1 text-[10px] font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50;
}

.thread-composer-branch-push {
  @apply mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2;
}

.thread-composer-branch-push-title {
  @apply m-0 text-[10px] font-medium text-emerald-950;
}

.thread-composer-branch-push-copy {
  @apply mt-1 mb-0 text-[10px] leading-4 text-emerald-900;
}

.thread-composer-branch-push-command {
  @apply mt-1 mb-0 break-all rounded-md bg-white/80 px-2 py-1 font-mono text-[10px] leading-4 text-emerald-950;
}

.thread-composer-branch-push-hint {
  @apply mt-1 mb-0 text-[10px] leading-4 text-emerald-800;
}

.thread-composer-branch-push-button {
  @apply mt-2 inline-flex w-full items-center justify-center rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-[11px] font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50;
}

.thread-composer-branch-menu-empty {
  @apply mt-2 mb-0 text-[11px] text-zinc-500;
}

.thread-composer-branch-list {
  @apply mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto;
}

.thread-composer-branch-list-item {
  @apply flex w-full items-center justify-between gap-2 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[11px] text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-branch-list-item.is-current {
  @apply bg-zinc-100 text-zinc-800;
}

.thread-composer-branch-list-item-name {
  @apply truncate;
}

.thread-composer-branch-list-item-badge {
  @apply shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-700;
}

.thread-composer-branch-menu-divider {
  @apply my-2 h-px bg-zinc-200;
}

.thread-composer-branch-create {
  @apply flex items-center gap-2;
}

.thread-composer-branch-input {
  @apply min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[11px] outline-none transition;
  border-color: var(--color-border-default);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.thread-composer-branch-input::placeholder {
  color: var(--color-text-muted);
}

.thread-composer-branch-input:focus {
  border-color: var(--color-border-strong);
}

.thread-composer-branch-create-button {
  @apply shrink-0 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50;
  border-color: var(--color-border-default);
  background: var(--color-bg-muted);
  color: var(--color-text-secondary);
}

.thread-composer-branch-create-button:hover {
  background: var(--color-bg-muted-hover);
  color: var(--color-text-primary);
}

.thread-composer-branch-icon {
  @apply h-3 w-3 shrink-0;
}

.thread-composer-branch-text {
  @apply min-w-0 truncate text-[11px];
  color: var(--color-text-secondary);
}

.thread-composer-branch-chevron {
  @apply h-3.5 w-3.5 shrink-0;
  color: var(--color-text-muted);
}

.thread-composer-quota-wrap,
.thread-composer-context-wrap {
  @apply relative flex items-center;
}

.thread-composer-quota-display {
  @apply inline-flex items-center gap-1.5;
}

.thread-composer-quota-pill {
  @apply inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap;
}

.thread-composer-quota-pill[data-level='normal'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.thread-composer-quota-pill[data-level='warn'] {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.thread-composer-quota-pill[data-level='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.thread-composer-quota-ring {
  background: conic-gradient(var(--quota-ring-color, #a1a1aa) var(--quota-ring-fill), var(--color-border-default) 0%);
  @apply relative inline-flex h-6 w-6 items-center justify-center rounded-full border-0 p-0 text-[8px] font-semibold shadow-sm;
  color: var(--quota-ring-text, var(--color-text-secondary));
}

.thread-composer-quota-ring-inner {
  @apply inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold;
  background: var(--color-bg-surface);
  color: currentColor;
}

.thread-composer-quota-ring[data-level='normal'] {
  --quota-ring-color: #16a34a;
  --quota-ring-text: #166534;
}

.thread-composer-quota-ring[data-level='warn'] {
  --quota-ring-color: #ca8a04;
  --quota-ring-text: #854d0e;
}

.thread-composer-quota-ring[data-level='danger'] {
  --quota-ring-color: #dc2626;
  --quota-ring-text: #991b1b;
}

.thread-composer-context-ring {
  background: conic-gradient(var(--ring-color, #a1a1aa) var(--context-ring-fill), var(--color-border-default) 0%);
  @apply relative inline-flex h-6 w-6 items-center justify-center rounded-full border-0 p-0 text-[9px];
  color: var(--color-text-secondary);
}

.thread-composer-context-ring[data-level='ok'] {
  --ring-color: #16a34a;
}

.thread-composer-context-ring[data-level='warn'] {
  --ring-color: #ca8a04;
}

.thread-composer-context-ring[data-level='danger'] {
  --ring-color: #dc2626;
}

.thread-composer-context-ring[data-level='idle'] {
  --ring-color: #a1a1aa;
}

.thread-composer-context-ring-inner {
  @apply inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-medium;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.thread-composer-status-popover {
  @apply pointer-events-none invisible absolute bottom-full right-0 z-20 w-54 rounded-xl border p-2 text-[11px] opacity-0 shadow-md transition;
  border-color: var(--color-border-default);
  background: var(--color-bg-overlay);
  color: var(--color-text-secondary);
}

.thread-composer-status-popover-context {
  @apply w-56;
}

.thread-composer-quota-wrap:hover .thread-composer-status-popover,
.thread-composer-quota-wrap:focus-within .thread-composer-status-popover,
.thread-composer-context-wrap:hover .thread-composer-status-popover,
.thread-composer-context-wrap:focus-within .thread-composer-status-popover {
  @apply pointer-events-auto visible opacity-100;
}

.thread-composer-popover-title {
  @apply m-0 text-xs font-semibold;
  color: var(--color-text-primary);
}

.thread-composer-popover-header {
  @apply flex items-center;
}

.thread-composer-popover-header-left {
  @apply flex items-center flex-wrap gap-2;
}

.thread-composer-popover-plan-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider text-white shadow-sm transition-all;
  background: linear-gradient(135deg, #18181b 0%, #3f3f46 100%);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  text-shadow: 0 1px 1px rgba(0,0,0,0.2);
}

.thread-composer-popover-plan-badge[data-plan='plus'],
.thread-composer-popover-plan-badge[data-plan='pro'] {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.thread-composer-popover-plan-badge[data-plan='team'],
.thread-composer-popover-plan-badge[data-plan='business'],
.thread-composer-popover-plan-badge[data-plan='enterprise'] {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
}

.thread-composer-popover-plan-badge[data-plan='go'] {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.thread-composer-popover-plan-badge[data-plan='free'] {
  background: linear-gradient(135deg, #71717a 0%, #52525b 100%);
}

.thread-composer-popover-gauge-icon {
  @apply inline-block h-3 w-3 rounded-full border;
  border-color: var(--color-border-strong);
  clip-path: inset(25% 0 0 0);
}

.thread-composer-popover-line {
  @apply m-0 mt-1 text-[11px] leading-4;
  color: var(--color-text-secondary);
}

.thread-composer-popover-row {
  @apply mt-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[11px];
}

.thread-composer-popover-row-duration {
  @apply font-semibold;
  color: var(--color-text-secondary);
}

.thread-composer-popover-row-percent {
  color: var(--color-text-muted);
}

.thread-composer-popover-row-reset {
  color: var(--color-text-muted);
}

.thread-composer-popover-hint {
  @apply m-0 mt-1.5 text-[11px] leading-4 font-medium;
  color: var(--color-text-primary);
}

.thread-composer-compact-button {
  @apply mt-2 inline-flex w-full items-center justify-center rounded-lg border px-2 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed;
  border-color: var(--color-interactive-strong);
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.thread-composer-compact-button:hover {
  border-color: var(--color-interactive-strong-hover);
  background: var(--color-interactive-strong-hover);
}

.thread-composer-compact-button:disabled {
  border-color: var(--color-border-default);
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}

.thread-composer-submit {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 transition disabled:cursor-not-allowed;
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.thread-composer-submit:hover {
  background: var(--color-interactive-strong-hover);
}

.thread-composer-submit:disabled {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}

.thread-composer-submit-icon {
  @apply h-5 w-5;
}

.thread-composer-stop {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 transition disabled:cursor-not-allowed;
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.thread-composer-stop:hover {
  background: var(--color-interactive-strong-hover);
}

.thread-composer-stop:disabled {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}

.thread-composer-stop-icon {
  @apply h-5 w-5;
}

@media (max-width: 720px) {
  .thread-composer {
    @apply px-3;
  }

  .thread-composer-input {
    font-size: 16px;
    line-height: 1.5rem;
  }

  .thread-composer-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .thread-composer-main-controls {
    width: 100%;
    gap: 0.5rem;
  }

  .thread-composer-config-group {
    @apply min-w-0 flex-1 gap-2;
  }

  .thread-composer-action-group {
    @apply ml-auto gap-2;
    flex: 0 0 auto;
  }

  .thread-composer-actions-trigger,
  .thread-composer-voice-button,
  .thread-composer-submit,
  .thread-composer-stop {
    width: 2.5rem;
    height: 2.5rem;
    min-width: 2.5rem;
    max-width: 2.5rem;
    padding: 0;
    flex: 0 0 2.5rem;
    justify-content: center;
  }

  .thread-composer-control {
    min-width: 0;
    flex: 0 1 auto;
  }

  .thread-composer-control :deep(.composer-dropdown-trigger) {
    min-width: 0;
  }

  .thread-composer-status-group {
    @apply min-w-0 gap-1;
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .thread-composer-branch-wrap {
    min-width: 0;
    flex: 0 1 auto;
    max-width: min(12rem, 55vw);
  }

  .thread-composer-branch-button {
    width: auto;
    min-width: 0;
    min-height: 2.5rem;
    max-width: 100%;
    padding: 0 0.625rem;
    gap: 0.375rem;
    flex: 0 1 auto;
    justify-content: flex-start;
  }

  .thread-composer-branch-text {
    display: inline;
  }

  .thread-composer-quota-wrap,
  .thread-composer-context-wrap {
    flex: 0 0 auto;
  }

  .thread-composer-branch-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
    display: block;
    background: color-mix(in srgb, var(--color-bg-overlay) 54%, transparent);
    backdrop-filter: blur(6px);
  }

  .thread-composer-branch-menu.thread-composer-branch-sheet {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
    z-index: 30;
    width: auto;
    max-width: 32.5rem;
    max-height: min(70vh, 32rem);
    margin: 0 auto;
    padding: 0.75rem;
    border-radius: 1.25rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    box-shadow: 0 24px 80px color-mix(in srgb, black 20%, transparent);
  }

  .thread-composer-branch-menu-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    margin: -0.75rem -0.75rem 0;
    padding: 0.5rem 0.75rem 0.25rem;
    background: color-mix(in srgb, var(--color-bg-surface) 96%, transparent);
  }

  .thread-composer-branch-sheet-handle {
    display: block;
    grid-column: 1 / -1;
    justify-self: center;
    width: 2.25rem;
    height: 0.25rem;
    margin: 0 auto;
    border-radius: 999px;
    background: var(--color-border-default);
  }

  .thread-composer-branch-menu-title {
    @apply text-sm;
    grid-column: 1;
    grid-row: 2;
  }

  .thread-composer-branch-sheet-close {
    @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 transition hover:bg-zinc-100;
    grid-column: 2;
    grid-row: 2;
  }

  .thread-composer-branch-menu-hint,
  .thread-composer-branch-menu-session-hint,
  .thread-composer-branch-menu-empty,
  .thread-composer-branch-dirty-preview-title,
  .thread-composer-branch-dirty-preview-item,
  .thread-composer-branch-dirty-preview-more,
  .thread-composer-branch-persisted-method,
  .thread-composer-branch-persisted-meta {
    @apply text-[11px];
  }

  .thread-composer-branch-list {
    max-height: min(32vh, 14rem);
  }

  .thread-composer-branch-persisted-list {
    max-height: 7.5rem;
    overflow-y: auto;
  }

  .thread-composer-branch-create {
    @apply sticky bottom-0 mt-3 flex-col items-stretch gap-2 rounded-xl border border-zinc-200 bg-white/95 p-2;
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    backdrop-filter: blur(10px);
  }

  .thread-composer-branch-create-button {
    @apply w-full justify-center;
  }

  .thread-composer-submit,
  .thread-composer-stop {
    width: 2.5rem;
    height: 2.5rem;
    min-width: 2.5rem;
    flex: 0 0 2.5rem;
  }
}
</style>
