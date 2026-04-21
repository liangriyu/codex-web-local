<template>
  <DesktopLayout :is-sidebar-collapsed="isSidebarCollapsed">
    <template #sidebar>
      <section class="sidebar-root">
        <SidebarThreadControls
          v-if="!isSidebarCollapsed"
          class="sidebar-thread-controls-host"
          :is-sidebar-collapsed="isSidebarCollapsed"
          :is-auto-refresh-enabled="isAutoRefreshEnabled"
          :auto-refresh-button-label="autoRefreshButtonLabel"
          :ui-language="uiLanguage"
          :show-new-thread-button="true"
          @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
          @toggle-auto-refresh="onToggleAutoRefreshTimer"
          @start-new-thread="onStartNewThreadFromToolbar"
        >
          <button
            class="sidebar-search-toggle"
            type="button"
            :aria-pressed="isSidebarSearchVisible"
            :aria-label="t('app.searchThreads')"
            :title="t('app.searchThreads')"
            @click="toggleSidebarSearch"
          >
            <IconTablerSearch class="sidebar-search-toggle-icon" />
          </button>
        </SidebarThreadControls>

        <div v-if="!isSidebarCollapsed && isSidebarSearchVisible" class="sidebar-search-bar">
          <IconTablerSearch class="sidebar-search-bar-icon" />
          <input
            ref="sidebarSearchInputRef"
            v-model="sidebarSearchQuery"
            class="sidebar-search-input"
            type="text"
            :placeholder="t('app.filterThreads')"
            @keydown="onSidebarSearchKeydown"
          />
          <button
            v-if="sidebarSearchQuery.length > 0"
            class="sidebar-search-clear"
            type="button"
            :aria-label="t('app.clearSearch')"
            @click="clearSidebarSearch"
          >
            <IconTablerX class="sidebar-search-clear-icon" />
          </button>
        </div>

        <SidebarThreadTree :groups="projectGroups" :project-display-name-by-id="projectDisplayNameById"
          v-if="!isSidebarCollapsed"
          :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads"
          :search-query="sidebarSearchQuery"
          :shared-session-snapshot-by-thread-id="sharedSessionSnapshotByThreadId"
          :live-approval-thread-id-set="liveApprovalThreadIdSet"
          :ui-language="uiLanguage"
          @select="onSelectThread"
          @archive="onArchiveThread" @start-new-thread="onStartNewThread" @rename-thread="onRenameThread" @rename-project="onRenameProject"
          @remove-project="onRemoveProject" @reorder-project="onReorderProject" />

        <SidebarAccountSwitcher
          v-if="!isSidebarCollapsed"
          class="sidebar-account-switcher-host"
          :account-profiles="accountProfiles"
          :active-account-profile-id="activeAccountProfileId"
          @switch="onSwitchAccountProfile"
          @align="onAlignAccount"
          @remove="onRemoveAccountProfile"
        />

        <div v-if="!isSidebarCollapsed" class="sidebar-footer-actions">
          <button
            class="sidebar-footer-button"
            type="button"
            :aria-label="themeToggleLabel"
            :title="themeToggleLabel"
            @click="cycleThemeMode"
          >
            <IconThemeMode class="sidebar-footer-button-icon" :mode="uiTheme" />
          </button>
          <button
            class="sidebar-footer-button"
            type="button"
            :aria-label="languageToggleLabel"
            :title="languageToggleLabel"
            @click="toggleUiLanguage"
          >
            <span class="sidebar-footer-language-mark">{{ languageToggleMark }}</span>
          </button>
        </div>
      </section>
    </template>

    <template #content>
      <section class="content-root">
        <ContentHeader :title="contentTitle">
          <template #leading>
            <SidebarThreadControls
              v-if="isSidebarCollapsed"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isSidebarCollapsed"
              :is-auto-refresh-enabled="isAutoRefreshEnabled"
              :auto-refresh-button-label="autoRefreshButtonLabel"
              :ui-language="uiLanguage"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @toggle-auto-refresh="onToggleAutoRefreshTimer"
              @start-new-thread="onStartNewThreadFromToolbar"
            />
          </template>
          <template #actions>
            <button
              v-if="!isHomeRoute"
              class="content-header-diff-chip"
              type="button"
              :disabled="!canOpenWorkspaceDiff"
              @click="onOpenWorkspaceDiff"
            >
              <span class="content-header-diff-icon">+</span>
              <span class="content-header-diff-add">+{{ headerDiffTotals.additions }}</span>
              <span class="content-header-diff-del">-{{ headerDiffTotals.deletions }}</span>
            </button>
          </template>
        </ContentHeader>

        <section class="content-body">
          <p v-if="error" class="content-error">{{ error }}</p>
          <template v-if="isHomeRoute">
            <div class="content-grid">
              <div class="new-thread-empty">
                <p class="new-thread-hero">{{ t('app.letsBuild') }}</p>
                <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd"
                  :options="newThreadFolderOptions" :placeholder="t('app.chooseFolder')"
                  :disabled="newThreadFolderOptions.length === 0" @update:model-value="onSelectNewThreadFolder" />
              </div>

              <ThreadComposer :active-thread-id="composerThreadContextId" :disabled="isSendingMessage"
                :models="availableModelIds" :selected-model="selectedModelId"
                :selected-reasoning-effort="selectedReasoningEffort"
                :selected-chat-mode="selectedChatMode"
                :is-turn-in-progress="false"
                :thread-branch="composerWorkspaceModel?.branch.currentBranch || selectedThread?.branch || ''"
                :workspace-model="composerWorkspaceModel"
                :workspace-branch-state="null"
                :persisted-server-requests="composerPersistedServerRequests"
                :global-live-request-count="globalLiveServerRequests.length"
                :global-persisted-request-count="globalPersistedServerRequests.length"
                :context-usage="selectedThreadContextUsage"
                :rate-limit-usage="selectedThreadRateLimitUsage"
                :is-compacting-context="isCompactingSelectedThreadContext"
                :ui-language="uiLanguage"
                :is-interrupting-turn="false"
                @submit="onSubmitThreadMessage"
                @update:selected-model="onSelectModel"
                @update:selected-reasoning-effort="onSelectReasoningEffort"
                @update:selected-chat-mode="setSelectedChatMode"
                @refresh-branches="onRefreshWorkspaceBranches"
                @switch-branch="onSwitchWorkspaceBranch"
                @create-branch="onCreateWorkspaceBranch"
                @push-branch="onPushWorkspaceBranch"
                @dismiss-persisted-request="onDismissPersistedServerRequest"
                @compact-context="onCompactContext" />
            </div>
          </template>
          <template v-else>
            <div class="content-grid content-grid-thread" :class="{ 'content-grid-thread-has-preview': previewPanel !== null }">
              <div class="content-thread">
                <ThreadConversation :messages="filteredMessages" :is-loading="isLoadingMessages"
                  :active-thread-id="composerThreadContextId" :scroll-state="selectedThreadScrollState"
                  :project-cwd="selectedThread?.cwd ?? ''"
                  :turn-file-changes-timeline="selectedThreadFileChangeTimeline"
                  :file-changes="selectedThreadFileChanges"
                  :floating-request-id="selectedPrimaryApprovalRequestId"
                  :ui-language="uiLanguage"
                  :is-thinking-indicator-visible="isThinkingIndicatorVisible"
                  :pending-requests="selectedThreadServerRequests"
                  @update-scroll-state="onUpdateThreadScrollState"
                  @respond-server-request="onRespondServerRequest"
                  @open-file-reference="onOpenFileReference"
                  @open-file-diff="onOpenFileDiff"
                  @open-workspace-diff="onOpenWorkspaceDiff"
                  @undo-thread-file-change="onUndoThreadFileChange"
                  @reapply-thread-file-change="onReapplyThreadFileChange">
                  <template #prepend>
                    <SharedSessionStatusCard
                      v-if="selectedSharedSessionSnapshot"
                      :snapshot="selectedSharedSessionSnapshot"
                      :live-approval-count="selectedLiveApprovalCount"
                      :persisted-approval-count="selectedPersistedApprovalCount"
                      :ui-language="uiLanguage"
                    />
                  </template>
                </ThreadConversation>
              </div>

              <CodePreviewPanel
                v-if="previewPanel"
                :panel="previewPanel"
                :cwd="selectedThread?.cwd ?? ''"
                :matched-file-diff="previewMatchedDiff"
                :workspace-model="selectedWorkspaceModel"
                :ui-language="uiLanguage"
                :close-label="t('app.closeCodePreview')"
                @change-workspace-mode="onChangeWorkspaceDiffMode"
                @update-workspace-base-branch="onUpdateWorkspaceBaseBranch"
                @close="onCloseFilePreview"
              />
            </div>

            <div class="content-composer-row">
              <div v-if="selectedPrimaryApprovalRequest" class="content-approval-overlay-host">
                <PendingApprovalOverlay
                  :request="selectedPrimaryApprovalRequest"
                  :file-changes="selectedThreadFileChanges"
                  :ui-language="uiLanguage"
                  @submit="onRespondServerRequest"
                  @skip="onRespondServerRequest"
                  @open-workspace-diff="onOpenWorkspaceDiff"
                />
              </div>
              <section v-if="selectedQueuedMessages.length > 0" class="content-queued-messages" aria-live="polite">
                <p class="content-queued-messages-title">{{ t('app.queuedMessagesTitle', { count: selectedQueuedMessages.length }) }}</p>
                <ul class="content-queued-messages-list">
                  <li
                    v-for="queuedMessage in selectedQueuedMessages"
                    :key="queuedMessage.id"
                    class="content-queued-message-item"
                  >
                    <p class="content-queued-message-text">{{ queuedMessage.text }}</p>
                    <p class="content-queued-message-meta">{{ t('app.queuedMessageQueuedAt', { time: formatQueuedAtTime(queuedMessage.queuedAtIso) }) }}</p>
                  </li>
                </ul>
              </section>
              <div
                v-if="isThinkingIndicatorVisible"
                class="content-thinking-indicator"
                aria-live="polite"
              >
                <span class="content-thinking-indicator-main">
                  <span class="content-thinking-indicator-label">{{ thinkingIndicatorLabel }}</span>
                  <span class="content-thinking-indicator-dots" aria-hidden="true">
                    <span class="content-thinking-indicator-dot" />
                    <span class="content-thinking-indicator-dot" />
                    <span class="content-thinking-indicator-dot" />
                  </span>
                </span>
                <span v-if="thinkingIndicatorDetail" class="content-thinking-indicator-detail">{{ thinkingIndicatorDetail }}</span>
              </div>
              <ThreadComposer :active-thread-id="composerThreadContextId"
                :disabled="isSendingMessage || isLoadingMessages" :models="availableModelIds"
                :selected-model="selectedModelId"
                :selected-reasoning-effort="selectedReasoningEffort"
                :selected-chat-mode="selectedChatMode"
                :thread-branch="composerWorkspaceModel?.branch.currentBranch || selectedThread?.branch || ''"
                :workspace-model="composerWorkspaceModel"
                :workspace-branch-state="null"
                :persisted-server-requests="composerPersistedServerRequests"
                :global-live-request-count="globalLiveServerRequests.length"
                :global-persisted-request-count="globalPersistedServerRequests.length"
                :context-usage="selectedThreadContextUsage"
                :rate-limit-usage="selectedThreadRateLimitUsage"
                :is-compacting-context="isCompactingSelectedThreadContext"
                :ui-language="uiLanguage"
                :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn"
                @submit="onSubmitThreadMessage"
                @update:selected-model="onSelectModel"
                @update:selected-reasoning-effort="onSelectReasoningEffort"
                @update:selected-chat-mode="setSelectedChatMode"
                @refresh-branches="onRefreshWorkspaceBranches"
                @switch-branch="onSwitchWorkspaceBranch"
                @create-branch="onCreateWorkspaceBranch"
                @push-branch="onPushWorkspaceBranch"
                @dismiss-persisted-request="onDismissPersistedServerRequest"
                @interrupt="onInterruptTurn"
                @compact-context="onCompactContext" />
              </div>
          </template>
        </section>
      </section>
    </template>
  </DesktopLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import PendingApprovalOverlay from './components/content/PendingApprovalOverlay.vue'
import SharedSessionStatusCard from './components/content/SharedSessionStatusCard.vue'
import ThreadConversation from './components/content/ThreadConversation.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import CodePreviewPanel from './components/content/CodePreviewPanel.vue'
import type { PreviewPanelState } from './components/content/CodePreviewPanel.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import SidebarAccountSwitcher from './components/sidebar/SidebarAccountSwitcher.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import IconThemeMode from './components/icons/IconThemeMode.vue'
import { useDesktopState } from './composables/useDesktopState'
import { tUi, type UiLanguage, type UiTextKey } from './i18n/uiText'
import type { ComposerSubmitPayload, ReasoningEffort, ThreadScrollState, UiTurnFileChanges, UiWorkspaceDiffMode } from './types/codex'
import { fetchFilePreview } from './api/codexGateway'
import { buildApprovalRequestDisplayModel, isApprovalRequestMethod } from './utils/approvalRequestDisplay'
import { shouldShowThinkingIndicator } from './utils/thinkingIndicatorState'
import {
  normalizePathSeparators,
  getBasename,
  normalizePathForMatch,
} from './utils/pathUtils'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codex-web-local.sidebar-collapsed.v1'
const UI_THEME_STORAGE_KEY = 'codex-web-local.ui-theme.v1'
const UI_LANGUAGE_STORAGE_KEY = 'codex-web-local.ui-language.v1'
const ACCOUNT_ALIGNMENT_REFRESH_INTERVAL_MS = 2000
const ACCOUNT_ALIGNMENT_REFRESH_DURATION_MS = 30000
type ThemeMode = 'light' | 'dark' | 'auto'

const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadScrollState,
  selectedThreadServerRequests,
  selectedThreadPersistedServerRequests,
  selectedSharedSessionSnapshot,
  globalLiveServerRequests,
  liveApprovalThreadIdSet,
  globalPersistedServerRequests,
  selectedWorkspaceModel,
  selectedWorkspaceDiffTotals,
  selectedThreadFileChangeTimeline,
  selectedThreadFileChanges,
  selectedQueuedMessages,
  selectedThreadContextUsage,
  selectedThreadRateLimitUsage,
  accountProfiles,
  activeAccountProfileId,
  isCompactingSelectedThreadContext,
  selectedLiveOverlay,
  sharedSessionSnapshotByThreadId,
  selectedThreadId,
  availableModelIds,
  selectedModelId,
  selectedReasoningEffort,
  selectedChatMode,
  messages,
  isLoadingThreads,
  isLoadingMessages,
  isSendingMessage,
  isInterruptingTurn,
  isAutoRefreshEnabled,
  autoRefreshSecondsLeft,
  error,
  refreshAll,
  selectThread,
  setThreadScrollState,
  archiveThreadById,
  renameThreadById,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  compactSelectedThreadContext,
  getWorkspaceModelForCwd,
  refreshWorkspaceBranchStateForCwd,
  refreshWorkspacePushStatusForCwd,
  refreshSelectedWorkspaceDiffTotals,
  fetchWorkspaceDiffSnapshotForMode,
  openPreferredWorkspaceDiffSnapshot,
  setWorkspaceDiffMode,
  setWorkspaceBaseBranch,
  switchSelectedWorkspaceBranch,
  createAndSwitchSelectedWorkspaceBranch,
  pushSelectedWorkspaceBranch,
  switchWorkspaceBranchForCwd,
  createAndSwitchWorkspaceBranchForCwd,
  pushWorkspaceBranchForCwd,
  undoLatestThreadFileChange,
  reapplyLatestThreadFileChange,
  setSelectedModelId,
  setSelectedReasoningEffort,
  setSelectedChatMode,
  switchAccountProfile,
  removeAccountProfile,
  startAccountAlignment,
  respondToPendingServerRequest,
  dismissPersistedServerRequests,
  renameProject,
  removeProject,
  reorderProject,
  toggleAutoRefreshTimer,
  startPolling,
  stopPolling,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const isRouteSyncInProgress = ref(false)
const hasInitialized = ref(false)
const newThreadCwd = ref('')
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const uiTheme = ref<ThemeMode>(loadUiTheme())
const uiLanguage = ref<UiLanguage>(loadUiLanguage())
function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(uiLanguage.value, key, params)
}
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const previewPanel = ref<PreviewPanelState | null>(null)
const isCreatingThreadFromHome = ref(false)
let accountAlignmentRefreshTimer: number | null = null
let accountAlignmentRefreshStartedAtMs = 0
const workspaceDiffTotals = computed(() => selectedWorkspaceDiffTotals.value)
const headerDiffTotals = computed(() => {
  if (previewPanel.value?.kind === 'diff') {
    return {
      additions: previewPanel.value.totalAdditions,
      deletions: previewPanel.value.totalDeletions,
    }
  }
  return workspaceDiffTotals.value
})

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const knownThreadIdSet = computed(() => {
  const ids = new Set<string>()
  for (const group of projectGroups.value) {
    for (const thread of group.threads) {
      ids.add(thread.id)
    }
  }
  return ids
})

const isHomeRoute = computed(() => route.name === 'home')
const currentProjectName = computed(() => {
  const activeProjectName = selectedThread.value?.projectName?.trim() ?? ''
  if (activeProjectName.length > 0) return activeProjectName

  const activeCwd = (isHomeRoute.value ? newThreadCwd.value : selectedThread.value?.cwd ?? '').trim()
  if (activeCwd.length > 0) {
    const cwdBasename = getBasename(normalizePathSeparators(activeCwd)).trim()
    if (cwdBasename.length > 0) return cwdBasename
  }

  return projectGroups.value[0]?.projectName?.trim() ?? ''
})
const activeComposerCwd = computed(() => (isHomeRoute.value ? newThreadCwd.value : selectedThread.value?.cwd ?? '').trim())
const composerWorkspaceModel = computed(() => getWorkspaceModelForCwd(activeComposerCwd.value))
const composerPersistedServerRequests = computed(() => composerWorkspaceModel.value?.approvals.persisted ?? [])
const contentTitle = computed(() => {
  if (isHomeRoute.value) return t('app.newThread')
  return selectedThread.value?.title ?? t('app.chooseThread')
})
const autoRefreshButtonLabel = computed(() =>
  isAutoRefreshEnabled.value
    ? t('app.autoRefreshIn', { seconds: autoRefreshSecondsLeft.value })
    : t('app.enableAutoRefresh'),
)
const themeToggleLabel = computed(() => {
  if (uiTheme.value === 'light') return t('app.themeLight')
  if (uiTheme.value === 'dark') return t('app.themeDark')
  return t('app.themeAuto')
})
const languageToggleLabel = computed(() =>
  uiLanguage.value === 'zh' ? t('app.languageChinese') : t('app.languageEnglish'),
)
const languageToggleMark = computed(() =>
  uiLanguage.value === 'zh' ? '中' : 'EN',
)
function normalizeActivityText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ')
}
function isTransientActivityText(value: string): boolean {
  const normalized = normalizeActivityText(value)
  return normalized === 'thinking' || normalized === 'writing response' || normalized === 'waiting response'
}
const liveOverlay = computed(() => selectedLiveOverlay.value)
const thinkingIndicatorLabel = computed(() => {
  const activityLabel = normalizeActivityText(liveOverlay.value?.activityLabel ?? '')
  if (activityLabel === 'writing response') {
    return t('app.aiGenerating')
  }
  return t('app.aiThinking')
})
const thinkingIndicatorDetail = computed(() => {
  const overlay = liveOverlay.value
  if (!overlay) return ''
  if (overlay.reasoningText) return overlay.reasoningText
  const details = overlay.activityDetails.filter((item) =>
    item.trim().length > 0 && !isTransientActivityText(item),
  )
  if (details.length > 0) return details.join(' · ')
  if (overlay.activityLabel && !isTransientActivityText(overlay.activityLabel)) {
    return overlay.activityLabel
  }
  return ''
})
const selectedPrimaryApprovalRequest = computed(() => {
  for (const request of selectedThreadServerRequests.value) {
    if (!isApprovalRequestMethod(request.method)) continue
    const fileChanges = selectedThreadFileChanges.value && selectedThreadFileChanges.value.turnId === request.turnId
      ? selectedThreadFileChanges.value
      : null
    if (buildApprovalRequestDisplayModel(request, fileChanges)) {
      return request
    }
  }
  return null
})
const selectedPrimaryApprovalRequestId = computed(() => selectedPrimaryApprovalRequest.value?.id ?? null)
const selectedLiveApprovalCount = computed(() =>
  selectedThreadServerRequests.value.filter((request) => isApprovalRequestMethod(request.method)).length,
)
const selectedPersistedApprovalCount = computed(() =>
  selectedThreadPersistedServerRequests.value.filter((request) => isApprovalRequestMethod(request.method)).length,
)
const hasSelectedThreadPendingServerRequests = computed(() => selectedThreadServerRequests.value.length > 0)
const isThinkingIndicatorVisible = computed(() =>
  shouldShowThinkingIndicator({
    isHomeRoute: isHomeRoute.value,
    isSelectedThreadInProgress: isSelectedThreadInProgress.value,
    isSendingMessage: isSendingMessage.value,
    hasLiveOverlay: liveOverlay.value !== null,
    hasPendingServerRequests: hasSelectedThreadPendingServerRequests.value,
  }),
)
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const canOpenWorkspaceDiff = computed(() => {
  if (isHomeRoute.value) return false
  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  return cwd.length > 0
})
const previewMatchedDiff = computed(() => {
  const preview = previewPanel.value
  if (!preview || preview.kind !== 'file') return null
  return findTurnFileChangeByPath(preview.payload.path)
})
const newThreadFolderOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seenCwds = new Set<string>()

  for (const group of projectGroups.value) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: projectDisplayNameById.value[group.projectName] ?? group.projectName,
    })
  }

  return options
})

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('focus', onWindowFocus)
  applyThemeMode(uiTheme.value)
  setupSystemThemeSync()
  void initialize()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('focus', onWindowFocus)
  cleanupSystemThemeSync()
  clearAccountAlignmentRefreshTimer()
  stopPolling()
})

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (route.name === 'thread' && routeThreadId.value === threadId) return
  void router.push({ name: 'thread', params: { threadId } })
}

function onArchiveThread(threadId: string): void {
  void archiveThreadById(threadId)
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = projectGroup?.threads[0]?.cwd?.trim() ?? ''
  if (projectCwd) {
    newThreadCwd.value = projectCwd
  }
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onStartNewThreadFromToolbar(): void {
  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  if (cwd) {
    newThreadCwd.value = cwd
  }
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onRemoveProject(projectName: string): void {
  removeProject(projectName)
}

function onReorderProject(payload: { projectName: string; toIndex: number }): void {
  reorderProject(payload.projectName, payload.toIndex)
}

function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void {
  setThreadScrollState(payload.threadId, payload.state)
}

function onRespondServerRequest(payload: { id: number; result?: unknown; error?: { code?: number; message: string } }): void {
  void respondToPendingServerRequest(payload)
}

function onDismissPersistedServerRequest(requestId: number): void {
  void dismissPersistedServerRequests([requestId])
}

function onToggleAutoRefreshTimer(): void {
  toggleAutoRefreshTimer()
}

function cycleThemeMode(): void {
  const order: ThemeMode[] = ['light', 'dark', 'auto']
  const index = order.indexOf(uiTheme.value)
  uiTheme.value = order[(index + 1) % order.length]
}

function toggleUiLanguage(): void {
  uiLanguage.value = uiLanguage.value === 'zh' ? 'en' : 'zh'
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return

  if (event.key.toLowerCase() === 't' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    onToggleAutoRefreshTimer()
    return
  }

  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault()
    const nextMode = selectedChatMode.value === 'plan' ? 'act' : 'plan'
    setSelectedChatMode(nextMode)
    return
  }

  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  if (event.key.toLowerCase() !== 'b') return
  event.preventDefault()
  setSidebarCollapsed(!isSidebarCollapsed.value)
}

function onSubmitThreadMessage(payload: ComposerSubmitPayload): void {
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(payload)
    return
  }
  void sendMessageToSelectedThread(payload)
}

function onSelectNewThreadFolder(cwd: string): void {
  newThreadCwd.value = cwd.trim()
}

function onSelectModel(modelId: string): void {
  setSelectedModelId(modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSwitchAccountProfile(profileId: string): void {
  void switchAccountProfile(profileId)
}

function onRemoveAccountProfile(profileId: string): void {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) return
  void removeAccountProfile(normalizedProfileId)
}

function clearAccountAlignmentRefreshTimer(): void {
  if (accountAlignmentRefreshTimer !== null) {
    window.clearInterval(accountAlignmentRefreshTimer)
    accountAlignmentRefreshTimer = null
  }
  accountAlignmentRefreshStartedAtMs = 0
}

function scheduleAccountAlignmentRefresh(): void {
  clearAccountAlignmentRefreshTimer()
  accountAlignmentRefreshStartedAtMs = Date.now()
  void refreshAll()
  accountAlignmentRefreshTimer = window.setInterval(() => {
    if (Date.now() - accountAlignmentRefreshStartedAtMs >= ACCOUNT_ALIGNMENT_REFRESH_DURATION_MS) {
      clearAccountAlignmentRefreshTimer()
      return
    }
    void refreshAll()
  }, ACCOUNT_ALIGNMENT_REFRESH_INTERVAL_MS)
}

function onWindowFocus(): void {
  if (accountAlignmentRefreshTimer === null) return
  void refreshAll()
}

function onAlignAccount(): void {
  void (async () => {
    const authUrl = await startAccountAlignment()
    if (!authUrl) return
    scheduleAccountAlignmentRefresh()
    window.open(authUrl, '_blank', 'noopener,noreferrer')
  })()
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function onCompactContext(): void {
  void compactSelectedThreadContext()
}

function onRefreshWorkspaceBranches(): void {
  const cwd = activeComposerCwd.value
  if (!cwd) return
  void refreshWorkspaceBranchStateForCwd(cwd, { includeBranches: true, silent: false })
  void refreshWorkspacePushStatusForCwd(cwd, { silent: false })
}

async function onSwitchWorkspaceBranch(branch: string): Promise<void> {
  const cwd = activeComposerCwd.value
  if (!cwd) return
  const didSwitch = isHomeRoute.value
    ? await switchWorkspaceBranchForCwd(cwd, branch)
    : await switchSelectedWorkspaceBranch(branch)
  if (!didSwitch) return
  previewPanel.value = null
  await refreshWorkspacePushStatusForCwd(cwd, { silent: true })
  await refreshSelectedWorkspaceDiffTotals()
}

async function onCreateWorkspaceBranch(branch: string): Promise<void> {
  const cwd = activeComposerCwd.value
  if (!cwd) return
  const didCreate = isHomeRoute.value
    ? await createAndSwitchWorkspaceBranchForCwd(cwd, branch)
    : await createAndSwitchSelectedWorkspaceBranch(branch)
  if (!didCreate) return
  previewPanel.value = null
  await refreshWorkspacePushStatusForCwd(cwd, { silent: true })
  await refreshSelectedWorkspaceDiffTotals()
}

async function onPushWorkspaceBranch(): Promise<void> {
  const cwd = activeComposerCwd.value
  if (!cwd) return
  if (isHomeRoute.value) {
    await pushWorkspaceBranchForCwd(cwd)
    return
  }
  await pushSelectedWorkspaceBranch()
}

async function onUndoThreadFileChange(turnId: string): Promise<void> {
  await undoLatestThreadFileChange(turnId)
}

async function onReapplyThreadFileChange(turnId: string): Promise<void> {
  await reapplyLatestThreadFileChange(turnId)
}

function formatQueuedAtTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const locale = uiLanguage.value === 'zh' ? 'zh-CN' : 'en-US'
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}


function findTurnFileChangeByPath(pathValue: string): UiTurnFileChanges['files'][number] | null {
  const fileChanges = selectedThreadFileChanges.value
  if (!fileChanges || fileChanges.files.length === 0) return null

  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  const target = normalizePathForMatch(pathValue, cwd)
  if (!target) return null

  for (const change of fileChanges.files) {
    const candidate = normalizePathForMatch(change.path, cwd)
    if (candidate && candidate === target) return change
  }

  const normalizedTargetPath = normalizePathSeparators(pathValue.trim()).toLowerCase()
  const targetBase = getBasename(normalizedTargetPath)
  for (const change of fileChanges.files) {
    const candidateRaw = normalizePathSeparators(change.path.trim()).toLowerCase()
    if (!candidateRaw) continue
    if (candidateRaw.endsWith(`/${normalizedTargetPath}`) || candidateRaw === normalizedTargetPath) {
      return change
    }
    if (getBasename(candidateRaw) === targetBase) {
      return change
    }
  }
  return null
}



async function onOpenFileReference(payload: { path: string; line: number | null }): Promise<void> {
  const matchedDiff = findTurnFileChangeByPath(payload.path)
  if (matchedDiff?.diff.trim()) {
    onOpenFileDiff({
      path: matchedDiff.path,
      diff: matchedDiff.diff,
      additions: matchedDiff.additions,
      deletions: matchedDiff.deletions,
      totalAdditions: matchedDiff.additions,
      totalDeletions: matchedDiff.deletions,
    })
    return
  }

  try {
    const resolved = await fetchFilePreview(payload.path, payload.line)
    previewPanel.value = { kind: 'file', payload: resolved }
  } catch {
    previewPanel.value = null
  }
}

function onCloseFilePreview(): void {
  previewPanel.value = null
}

function onOpenFileDiff(payload: {
  path: string
  diff: string
  additions: number
  deletions: number
  totalAdditions: number
  totalDeletions: number
}): void {
  previewPanel.value = {
    kind: 'diff',
    path: payload.path,
    diff: payload.diff || '',
    additions: payload.additions,
    deletions: payload.deletions,
    totalAdditions: payload.totalAdditions,
    totalDeletions: payload.totalDeletions,
  }
}

async function onOpenWorkspaceDiff(): Promise<void> {
  if (previewPanel.value?.kind === 'workspace') {
    previewPanel.value = null
    return
  }

  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  if (!cwd) return
  const preferredMode = selectedWorkspaceModel.value?.diff.selectedMode ?? ''
  if (preferredMode && preferredMode !== 'unstaged') {
    await openWorkspaceDiffPanel(cwd, preferredMode)
    return
  }

  const snapshot = await openPreferredWorkspaceDiffSnapshot(cwd)
  if (!snapshot) return
  previewPanel.value = {
    kind: 'workspace',
    cwd,
  }
}

async function openWorkspaceDiffPanel(cwd: string, mode: UiWorkspaceDiffMode): Promise<void> {
  const snapshot = await fetchWorkspaceDiffSnapshotForMode(cwd, mode)
  setWorkspaceDiffMode(cwd, snapshot.mode)
  previewPanel.value = {
    kind: 'workspace',
    cwd,
  }
}

async function onChangeWorkspaceDiffMode(mode: UiWorkspaceDiffMode): Promise<void> {
  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  if (!cwd) return
  await openWorkspaceDiffPanel(cwd, mode)
}

async function onUpdateWorkspaceBaseBranch(branch: string): Promise<void> {
  const cwd = selectedThread.value?.cwd?.trim() ?? ''
  if (!cwd) return
  setWorkspaceBaseBranch(cwd, branch.trim() || null)
  if (previewPanel.value?.kind === 'workspace') {
    await openWorkspaceDiffPanel(cwd, 'branch')
  }
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

function loadUiTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto'
}

function loadUiLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'zh'
  const raw = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
  return raw === 'en' ? 'en' : 'zh'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0')
}

function saveUiTheme(value: ThemeMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UI_THEME_STORAGE_KEY, value)
}

function saveUiLanguage(value: UiLanguage): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, value)
}

function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const resolvedMode = resolveThemeMode(mode)
  document.documentElement.setAttribute('data-theme', resolvedMode)
  document.documentElement.style.colorScheme = resolvedMode
}

let cleanupSystemThemeSync = () => {}
function setupSystemThemeSync(): void {
  if (typeof window === 'undefined') return
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (uiTheme.value !== 'auto') return
    applyThemeMode('auto')
  }
  media.addEventListener('change', onChange)
  cleanupSystemThemeSync = () => {
    media.removeEventListener('change', onChange)
    cleanupSystemThemeSync = () => {}
  }
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

async function initialize(): Promise<void> {
  await refreshAll()
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
  await refreshSelectedWorkspaceDiffTotals()
  startPolling()
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) return
  isRouteSyncInProgress.value = true

  try {
    if (route.name === 'home') {
      if (selectedThreadId.value !== '' && !isSendingMessage.value && !isCreatingThreadFromHome.value) {
        await selectThread('')
      }
      return
    }

    if (route.name === 'thread') {
      const threadId = routeThreadId.value
      if (!threadId) return

      if (!knownThreadIdSet.value.has(threadId) && selectedThreadId.value !== threadId) {
        return
      }

      if (selectedThreadId.value !== threadId) {
        await selectThread(threadId)
      }
      return
    }

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      knownThreadIdSet.value.has(routeThreadId.value),
      selectedThreadId.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => selectedThreadId.value,
  () => {
    previewPanel.value = null
    void refreshSelectedWorkspaceDiffTotals()
  },
)

watch(
  () => uiTheme.value,
  (mode) => {
    saveUiTheme(mode)
    applyThemeMode(mode)
  },
)

watch(
  () => uiLanguage.value,
  (language) => {
    saveUiLanguage(language)
  },
)

watch(
  () => currentProjectName.value,
  (projectName) => {
    if (typeof document === 'undefined') return
    const normalizedProjectName = projectName.trim()
    document.title = normalizedProjectName.length > 0 ? `Codex: ${normalizedProjectName}` : 'Codex'
  },
  { immediate: true },
)

watch(
  () => selectedThreadFileChanges.value?.turnId ?? '',
  () => {
    void refreshSelectedWorkspaceDiffTotals()
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      newThreadCwd.value = ''
      return
    }
    const hasSelected = options.some((option) => option.value === newThreadCwd.value)
    if (!hasSelected) {
      newThreadCwd.value = options[0].value
    }
  },
  { immediate: true },
)

watch(
  () => [isHomeRoute.value, newThreadCwd.value] as const,
  ([homeRoute, cwd]) => {
    if (!homeRoute) return
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return
    void refreshWorkspaceBranchStateForCwd(normalizedCwd, { includeBranches: false, silent: true })
  },
  { immediate: true },
)

async function submitFirstMessageForNewThread(payload: ComposerSubmitPayload): Promise<void> {
  isCreatingThreadFromHome.value = true
  try {
    const threadId = await sendMessageToNewThread(payload, newThreadCwd.value)
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  } catch {
    // Error is already reflected in state.
  } finally {
    isCreatingThreadFromHome.value = false
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-root {
  @apply min-h-full py-4 px-2 flex flex-col gap-2 select-none;
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.content-root {
  @apply h-full min-h-0 w-full flex flex-col overflow-y-hidden overflow-x-visible;
  background: var(--color-bg-surface);
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-toggle {
  @apply h-6.75 w-6.75 rounded-md border border-transparent bg-transparent flex items-center justify-center transition;
  color: var(--color-text-secondary);
}

.sidebar-search-toggle[aria-pressed='true'] {
  border-color: var(--color-border-default);
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.sidebar-search-toggle:hover {
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

.sidebar-search-toggle-icon {
  @apply w-4 h-4;
}

.sidebar-search-bar {
  @apply flex items-center gap-1.5 mx-2 px-2 py-1 rounded-md border transition-colors;
  border-color: var(--color-border-default);
  background: var(--color-bg-surface);
}

.sidebar-search-bar:focus-within {
  border-color: var(--color-border-strong);
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 shrink-0;
  color: var(--color-text-muted);
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm outline-none border-none p-0;
  color: var(--color-text-primary);
}

.sidebar-search-input::placeholder {
  color: var(--color-text-muted);
}

.sidebar-search-clear {
  @apply w-4 h-4 rounded flex items-center justify-center transition;
  color: var(--color-text-muted);
}

.sidebar-search-clear:hover {
  color: var(--color-text-secondary);
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-footer-actions {
  @apply mt-auto px-2 pb-1 pt-2 flex items-center justify-start gap-1;
}

.sidebar-footer-button {
  @apply h-7 w-7 rounded-md border border-transparent bg-transparent flex items-center justify-center transition;
  color: var(--color-text-secondary);
}

.sidebar-footer-button:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

.sidebar-footer-button-icon {
  @apply w-4 h-4;
}

.sidebar-footer-language-mark {
  @apply text-[10px] leading-none font-medium tracking-tight;
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.content-header-diff-chip {
  @apply h-8 rounded-full border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 inline-flex items-center gap-1.5 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.content-header-diff-icon {
  @apply inline-flex h-5 w-5 items-center justify-center rounded-md border border-zinc-400 text-sm leading-none text-zinc-600;
}

.content-header-diff-add {
  @apply text-[#16a34a] font-semibold;
}

.content-header-diff-del {
  @apply text-[#ef4444] font-semibold;
}

.content-body {
  @apply flex-1 min-h-0 w-full flex flex-col gap-3 pt-1 pb-4 overflow-y-hidden overflow-x-visible;
}

.content-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-3;
}

.content-thread {
  @apply flex-1 min-h-0;
}

.content-composer-row {
  @apply min-h-0 flex flex-col gap-2;
}

.content-approval-overlay-host {
  @apply w-full;
}

.content-queued-messages {
  @apply w-full max-w-175 mx-auto px-6;
}

.content-queued-messages-title {
  @apply m-0 text-[11px] leading-4 text-zinc-500;
}

.content-queued-messages-list {
  @apply list-none m-0 mt-1.5 p-0 flex flex-col gap-1.5;
}

.content-queued-message-item {
  @apply rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5;
}

.content-queued-message-text {
  @apply m-0 text-xs leading-4 text-zinc-700 whitespace-pre-wrap break-words;
}

.content-queued-message-meta {
  @apply m-0 mt-0.5 text-[10px] leading-3 text-zinc-500;
}

.content-thinking-indicator {
  @apply w-full max-w-175 mx-auto px-6 text-sm text-zinc-500 inline-flex flex-col items-start gap-0.5;
}

.content-thinking-indicator-main {
  @apply inline-flex items-center gap-1.5;
}

.content-thinking-indicator-label {
  @apply leading-5;
}

.content-thinking-indicator-dots {
  @apply inline-flex items-center gap-1;
}

.content-thinking-indicator-dot {
  @apply h-1.5 w-1.5 rounded-full bg-zinc-400;
  animation: thinking-dot-pulse 1.2s ease-in-out infinite;
}

.content-thinking-indicator-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.content-thinking-indicator-dot:nth-child(3) {
  animation-delay: 0.3s;
}

.content-thinking-indicator-detail {
  @apply text-xs leading-4 text-zinc-400 whitespace-pre-wrap;
}

@keyframes thinking-dot-pulse {
  0%, 70%, 100% {
    opacity: 0.2;
    transform: translateY(0);
  }

  35% {
    opacity: 1;
    transform: translateY(-1px);
  }
}

.content-grid-thread {
  @apply flex-row items-stretch;
}

.content-grid-thread .content-thread {
  @apply min-w-0;
}

.content-grid-thread-has-preview .content-thread {
  @apply basis-[58%];
}


@media (max-width: 1100px) {
  .content-grid-thread {
    @apply flex-col;
  }

  .content-grid-thread-has-preview .content-thread {
    @apply basis-auto;
  }
}

.new-thread-empty {
  @apply flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 px-6;
}

.new-thread-hero {
  @apply m-0 text-[2.5rem] font-normal leading-[1.05] text-zinc-900;
}

.new-thread-folder-dropdown {
  @apply text-[2.5rem] text-zinc-500;
}

.new-thread-folder-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto text-[2.5rem] leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-value) {
  @apply leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-chevron) {
  @apply h-5 w-5 mt-0;
}

@media (max-width: 720px) {
  .new-thread-empty {
    @apply px-4;
  }

  .new-thread-folder-dropdown {
    @apply max-w-full;
  }

  .new-thread-folder-dropdown :deep(.composer-dropdown) {
    @apply max-w-full justify-center;
  }

  .new-thread-folder-dropdown :deep(.composer-dropdown-menu-wrap) {
    left: 50%;
    transform: translateX(-50%);
    width: min(20rem, calc(100vw - 1.5rem));
  }

  .new-thread-folder-dropdown :deep(.composer-dropdown-menu) {
    width: 100%;
  }
}

</style>
