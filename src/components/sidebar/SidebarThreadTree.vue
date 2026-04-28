<template>
  <section class="thread-tree-root">
    <section v-if="pinnedThreads.length > 0" class="pinned-section">
      <ul class="thread-list">
        <li v-for="thread in pinnedThreads" :key="thread.id" class="thread-row-item">
          <SidebarMenuRow
            as="div"
            class="thread-row"
            :data-active="selectedThreadId === thread.id"
            :force-right-hover="isThreadMenuOpen(thread.id) && threadMenuMode === 'rename'"
          >
            <template #left>
              <span class="thread-left-stack">
                <span v-if="thread.inProgress || thread.unread" class="thread-status-indicator" :data-state="getThreadState(thread)" />
                <button class="thread-pin-button" type="button" :title="t('sidebarTree.pin')" @click="togglePin(thread.id)">
                  <IconTablerPin class="thread-icon" />
                </button>
              </span>
            </template>
            <span class="thread-row-main">
                <button class="thread-main-button" type="button" :title="thread.preview || thread.title" @click="onSelect(thread.id)">
                <span class="thread-row-text">
                  <span class="thread-row-title">{{ thread.title }}</span>
                  <span v-if="readThreadStatusSubtitle(thread.id)" class="thread-row-subtitle">{{ readThreadStatusSubtitle(thread.id) }}</span>
                </span>
              </button>
            </span>
            <template #right>
              <span class="thread-row-time-wrap">
                <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
              </span>
            </template>
            <template #right-hover>
              <div class="thread-hover-controls">
                <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                  <button
                    class="thread-menu-trigger"
                    type="button"
                    :title="t('sidebarTree.projectMenu')"
                    @click.stop="toggleThreadMenu(thread.id)"
                  >
                    <IconTablerDots class="thread-icon" />
                  </button>

                  <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                    <template v-if="threadMenuMode === 'actions'">
                      <button class="thread-menu-item" type="button" @click="openRenameThreadMenu(thread.id)">
                        {{ t('sidebarTree.editName') }}
                      </button>
                    </template>
                    <template v-else>
                      <label class="thread-menu-label">{{ t('sidebarTree.threadName') }}</label>
                      <div class="thread-rename-form">
                        <input
                          v-model="threadRenameDraft"
                          v-focus
                          class="thread-menu-input"
                          type="text"
                          @keydown.enter="onThreadRenameSubmit(thread.id)"
                          @keydown.esc="closeThreadMenu"
                        />
                        <div class="thread-rename-actions">
                          <button class="thread-rename-action-btn confirm" type="button" @click="onThreadRenameSubmit(thread.id)">
                            <IconTablerCheck />
                          </button>
                          <button class="thread-rename-action-btn cancel" type="button" @click="closeThreadMenu">
                            <IconTablerX />
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <button
                  class="thread-archive-button"
                  :data-confirm="archiveConfirmThreadId === thread.id"
                  type="button"
                  :title="t('sidebarTree.archiveThread')"
                  @click="onArchiveClick(thread.id)"
                >
                  <span v-if="archiveConfirmThreadId === thread.id">{{ t('sidebarTree.confirm') }}</span>
                  <IconTablerArchive v-else class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>
        </li>
      </ul>
    </section>

    <SidebarMenuRow as="header" class="thread-tree-header-row">
      <span class="thread-tree-header">{{ t('sidebarTree.threads') }}</span>
    </SidebarMenuRow>

    <p v-if="isSearchActive && filteredGroups.length === 0" class="thread-tree-no-results">{{ t('sidebarTree.noMatchingThreads') }}</p>

    <p v-else-if="isLoading && groups.length === 0" class="thread-tree-loading">{{ t('sidebarTree.loadingThreads') }}</p>

    <div v-else ref="groupsContainerRef" class="thread-tree-groups" :style="groupsContainerStyle">
      <article
        v-for="group in filteredGroups"
        :key="group.projectName"
        :ref="(el) => setProjectGroupRef(group.projectName, el)"
        class="project-group"
        :data-project-name="group.projectName"
        :data-expanded="!isCollapsed(group.projectName)"
        :data-dragging="isDraggingProject(group.projectName)"
        :style="projectGroupStyle(group.projectName)"
      >
          <SidebarMenuRow
            as="div"
            class="project-header-row"
            :force-right-hover="isProjectMenuOpen(group.projectName)"
            role="button"
            tabindex="0"
            @click="toggleProjectCollapse(group.projectName)"
            @keydown.enter.prevent="toggleProjectCollapse(group.projectName)"
            @keydown.space.prevent="toggleProjectCollapse(group.projectName)"
          >
            <template #left>
              <span class="project-icon-stack">
                <span class="project-icon-folder">
                  <IconTablerFolder v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerFolderOpen v-else class="thread-icon" />
                </span>
                <span class="project-icon-chevron">
                  <IconTablerChevronRight v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerChevronDown v-else class="thread-icon" />
                </span>
              </span>
            </template>
            <span
              class="project-main-button"
              :data-dragging-handle="isDraggingProject(group.projectName)"
              @mousedown.left="onProjectHandleMouseDown($event, group.projectName)"
            >
              <span class="project-title">{{ getProjectDisplayName(group.projectName) }}</span>
            </span>
            <template #right-hover>
              <div class="project-hover-controls">
                <div :ref="(el) => setProjectMenuWrapRef(group.projectName, el)" class="project-menu-wrap">
                  <button
                    class="project-menu-trigger"
                    type="button"
                    :title="t('sidebarTree.projectMenu')"
                    @click.stop="toggleProjectMenu(group.projectName)"
                  >
                    <IconTablerDots class="thread-icon" />
                  </button>

                  <div v-if="isProjectMenuOpen(group.projectName)" class="project-menu-panel" @click.stop>
                    <template v-if="projectMenuMode === 'actions'">
                      <button class="project-menu-item" type="button" @click="openRenameProjectMenu(group.projectName)">
                        {{ t('sidebarTree.editName') }}
                      </button>
                      <button
                        class="project-menu-item project-menu-item-danger"
                        type="button"
                        @click="onRemoveProject(group.projectName)"
                      >
                        {{ t('sidebarTree.remove') }}
                      </button>
                    </template>
                    <template v-else>
                      <label class="project-menu-label">{{ t('sidebarTree.projectName') }}</label>
                      <input
                        v-model="projectRenameDraft"
                        class="project-menu-input"
                        type="text"
                        @input="onProjectNameInput(group.projectName)"
                      />
                    </template>
                  </div>
                </div>

                <button
                  class="thread-start-button"
                  type="button"
                  :aria-label="getNewThreadButtonAriaLabel(group.projectName)"
                  :title="getNewThreadButtonAriaLabel(group.projectName)"
                  @click.stop="onStartNewThread(group.projectName)"
                >
                  <IconTablerFilePencil class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>

          <ul v-if="hasThreads(group)" class="thread-list">
            <li v-for="thread in visibleThreads(group)" :key="thread.id" class="thread-row-item">
              <SidebarMenuRow
            as="div"
            class="thread-row"
            :data-active="selectedThreadId === thread.id"
            :force-right-hover="isThreadMenuOpen(thread.id) && threadMenuMode === 'rename'"
          >
                <template #left>
                  <span class="thread-left-stack">
                    <span
                      v-if="thread.inProgress || thread.unread"
                      class="thread-status-indicator"
                      :data-state="getThreadState(thread)"
                    />
                    <button class="thread-pin-button" type="button" :title="t('sidebarTree.pin')" @click="togglePin(thread.id)">
                      <IconTablerPin class="thread-icon" />
                    </button>
                  </span>
                </template>
                <span class="thread-row-main">
                  <button class="thread-main-button" type="button" :title="thread.preview || thread.title" @click="onSelect(thread.id)">
                    <span class="thread-row-text">
                      <span class="thread-row-title">{{ thread.title }}</span>
                      <span v-if="readThreadStatusSubtitle(thread.id)" class="thread-row-subtitle">{{ readThreadStatusSubtitle(thread.id) }}</span>
                    </span>
                  </button>
                </span>
                <template #right>
                  <span class="thread-row-time-wrap">
                    <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
                  </span>
                </template>
                <template #right-hover>
                  <div class="thread-hover-controls">
                    <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                      <button
                        class="thread-menu-trigger"
                        type="button"
                        :title="t('sidebarTree.projectMenu')"
                        @click.stop="toggleThreadMenu(thread.id)"
                      >
                        <IconTablerDots class="thread-icon" />
                      </button>

                      <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                        <template v-if="threadMenuMode === 'actions'">
                          <button class="thread-menu-item" type="button" @click="openRenameThreadMenu(thread.id)">
                            {{ t('sidebarTree.editName') }}
                          </button>
                        </template>
                        <template v-else>
                          <label class="thread-menu-label">{{ t('sidebarTree.threadName') }}</label>
                          <div class="thread-rename-form">
                            <input
                              v-model="threadRenameDraft"
                              v-focus
                              class="thread-menu-input"
                              type="text"
                              @keydown.enter="onThreadRenameSubmit(thread.id)"
                              @keydown.esc="closeThreadMenu"
                            />
                            <div class="thread-rename-actions">
                              <button class="thread-rename-action-btn confirm" type="button" @click="onThreadRenameSubmit(thread.id)">
                                <IconTablerCheck />
                              </button>
                              <button class="thread-rename-action-btn cancel" type="button" @click="closeThreadMenu">
                                <IconTablerX />
                              </button>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>

                    <button
                      class="thread-archive-button"
                      :data-confirm="archiveConfirmThreadId === thread.id"
                      type="button"
                      :title="t('sidebarTree.archiveThread')"
                      @click="onArchiveClick(thread.id)"
                    >
                      <span v-if="archiveConfirmThreadId === thread.id">{{ t('sidebarTree.confirm') }}</span>
                      <IconTablerArchive v-else class="thread-icon" />
                    </button>
                  </div>
                </template>
              </SidebarMenuRow>
            </li>
          </ul>

          <SidebarMenuRow v-else as="p" class="project-empty-row">
            <template #left>
              <span class="project-empty-spacer" />
            </template>
            <span class="project-empty">{{ t('sidebarTree.noThreads') }}</span>
          </SidebarMenuRow>

          <SidebarMenuRow v-if="hasHiddenThreads(group)" class="thread-show-more-row">
            <template #left>
              <span class="thread-show-more-spacer" />
            </template>
            <button class="thread-show-more-button" type="button" @click="toggleProjectExpansion(group.projectName)">
              {{ isExpanded(group.projectName) ? t('sidebarTree.showLess') : t('sidebarTree.showMore') }}
            </button>
          </SidebarMenuRow>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { UiProjectGroup, UiSharedSessionSnapshot, UiThread } from '../../types/codex'
import { tUi, type UiLanguage, type UiTextKey } from '../../i18n/uiText'
import IconTablerArchive from '../icons/IconTablerArchive.vue'
import IconTablerCheck from '../icons/IconTablerCheck.vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFolderOpen from '../icons/IconTablerFolderOpen.vue'
import IconTablerPin from '../icons/IconTablerPin.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'

const vFocus = {
  mounted: (el: HTMLElement) => el.focus(),
}

const props = defineProps<{
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  selectedThreadId: string
  isLoading: boolean
  searchQuery: string
  sharedSessionSnapshotByThreadId: Record<string, UiSharedSessionSnapshot>
  liveApprovalThreadIdSet: Set<string>
  uiLanguage?: UiLanguage
}>()

const emit = defineEmits<{
  select: [threadId: string]
  archive: [threadId: string]
  'start-new-thread': [projectName: string]
  'rename-project': [payload: { projectName: string; displayName: string }]
  'rename-thread': [payload: { threadId: string; title: string }]
  'remove-project': [projectName: string]
  'reorder-project': [payload: { projectName: string; toIndex: number }]
}>()

type PendingProjectDrag = {
  projectName: string
  fromIndex: number
  startClientX: number
  startClientY: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
}

type ActiveProjectDrag = {
  projectName: string
  fromIndex: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
  ghostTop: number
  dropTargetIndexFull: number | null
}

type DragPointerSample = {
  clientX: number
  clientY: number
}

const DRAG_START_THRESHOLD_PX = 4
const PROJECT_GROUP_EXPANDED_GAP_PX = 6
const expandedProjects = ref<Record<string, boolean>>({})
const collapsedProjects = ref<Record<string, boolean>>({})
const pinnedThreadIds = ref<string[]>([])
const archiveConfirmThreadId = ref('')
const openProjectMenuId = ref('')
const projectMenuMode = ref<'actions' | 'rename'>('actions')
const projectRenameDraft = ref('')
const groupsContainerRef = ref<HTMLElement | null>(null)
const activeProjectDrag = ref<ActiveProjectDrag | null>(null)
const openThreadMenuId = ref('')
const threadMenuMode = ref<'actions' | 'rename'>('actions')
const threadRenameDraft = ref('')
const threadMenuWrapElementById = new Map<string, HTMLElement>()
const pendingProjectDrag = ref<PendingProjectDrag | null>(null)
let pendingDragPointerSample: DragPointerSample | null = null
let dragPointerRafId: number | null = null
const suppressNextProjectToggleId = ref('')
const measuredHeightByProject = ref<Record<string, number>>({})
const projectGroupElementByName = new Map<string, HTMLElement>()
const projectMenuWrapElementByName = new Map<string, HTMLElement>()
const projectNameByElement = new WeakMap<HTMLElement, string>()
const projectGroupResizeObserver =
  typeof window !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          const projectName = projectNameByElement.get(element)
          if (!projectName) continue
          updateMeasuredProjectHeight(projectName, element)
        }
      })
    : null
const COLLAPSED_STORAGE_KEY = 'codex-web-local.collapsed-projects.v1'
const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')

function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(normalizedLanguage.value, key, params)
}

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

collapsedProjects.value = loadCollapsedState()

watch(
  collapsedProjects,
  (value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)

const normalizedSearchQuery = computed(() => props.searchQuery.trim().toLowerCase())

const isSearchActive = computed(() => normalizedSearchQuery.value.length > 0)

function threadMatchesSearch(thread: UiThread): boolean {
  if (!isSearchActive.value) return true
  const q = normalizedSearchQuery.value
  return (
    thread.title.toLowerCase().includes(q) ||
    thread.preview.toLowerCase().includes(q)
  )
}

const filteredGroups = computed<UiProjectGroup[]>(() => {
  if (!isSearchActive.value) return props.groups
  return props.groups
    .map((group) => ({
      ...group,
      threads: group.threads.filter(threadMatchesSearch),
    }))
    .filter((group) => group.threads.length > 0)
})

const threadById = computed(() => {
  const map = new Map<string, UiThread>()

  for (const group of props.groups) {
    for (const thread of group.threads) {
      map.set(thread.id, thread)
    }
  }

  return map
})

const pinnedThreads = computed(() =>
  pinnedThreadIds.value
    .map((threadId) => threadById.value.get(threadId) ?? null)
    .filter((thread): thread is UiThread => thread !== null)
    .filter(threadMatchesSearch),
)

const projectedDropProjectIndex = computed<number | null>(() => {
  const drag = activeProjectDrag.value
  if (!drag || drag.dropTargetIndexFull === null || props.groups.length === 0) return null

  const boundedDropIndex = Math.max(0, Math.min(drag.dropTargetIndexFull, props.groups.length))
  const projectedIndex = boundedDropIndex > drag.fromIndex ? boundedDropIndex - 1 : boundedDropIndex
  const boundedProjectedIndex = Math.max(0, Math.min(projectedIndex, props.groups.length - 1))
  return boundedProjectedIndex === drag.fromIndex ? null : boundedProjectedIndex
})

const layoutProjectOrder = computed<string[]>(() => {
  const sourceGroups = isSearchActive.value ? filteredGroups.value : props.groups
  const names = sourceGroups.map((group) => group.projectName)
  const drag = activeProjectDrag.value
  const projectedIndex = projectedDropProjectIndex.value

  if (!drag || projectedIndex === null) {
    return names
  }

  const next = [...names]
  const [movedProject] = next.splice(drag.fromIndex, 1)
  if (!movedProject) {
    return names
  }
  next.splice(projectedIndex, 0, movedProject)
  return next
})

const layoutTopByProject = computed<Record<string, number>>(() => {
  const topByProject: Record<string, number> = {}
  let currentTop = 0

  for (const projectName of layoutProjectOrder.value) {
    topByProject[projectName] = currentTop
    currentTop += getProjectOuterHeight(projectName)
  }

  return topByProject
})

const groupsContainerStyle = computed<Record<string, string>>(() => {
  let totalHeight = 0
  for (const projectName of layoutProjectOrder.value) {
    totalHeight += getProjectOuterHeight(projectName)
  }

  return {
    height: `${Math.max(0, totalHeight)}px`,
  }
})

function formatRelative(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return t('sidebarTree.na')

  const diffMs = Math.abs(Date.now() - timestamp)
  if (diffMs < 60000) return t('sidebarTree.now')

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return t('sidebarTree.minutesAgo', { minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('sidebarTree.hoursAgo', { hours })

  const days = Math.floor(hours / 24)
  return t('sidebarTree.daysAgo', { days })
}

function isPinned(threadId: string): boolean {
  return pinnedThreadIds.value.includes(threadId)
}

function togglePin(threadId: string): void {
  if (isPinned(threadId)) {
    pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
    return
  }

  pinnedThreadIds.value = [threadId, ...pinnedThreadIds.value]
}

function onSelect(threadId: string): void {
  emit('select', threadId)
}

function onArchiveClick(threadId: string): void {
  if (archiveConfirmThreadId.value !== threadId) {
    archiveConfirmThreadId.value = threadId
    return
  }

  archiveConfirmThreadId.value = ''
  pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
  emit('archive', threadId)
}

function getNewThreadButtonAriaLabel(projectName: string): string {
  return t('sidebarTree.newThreadInProject', {
    projectName: getProjectDisplayName(projectName),
  })
}

function onStartNewThread(projectName: string): void {
  emit('start-new-thread', projectName)
}

function onThreadRowLeave(threadId: string): void {
  if (archiveConfirmThreadId.value === threadId) {
    archiveConfirmThreadId.value = ''
  }
}

function getProjectDisplayName(projectName: string): string {
  return props.projectDisplayNameById[projectName] ?? projectName
}

function isProjectMenuOpen(projectName: string): boolean {
  return openProjectMenuId.value === projectName
}

function closeProjectMenu(): void {
  openProjectMenuId.value = ''
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = ''
}

function toggleProjectMenu(projectName: string): void {
  if (openProjectMenuId.value === projectName) {
    closeProjectMenu()
    return
  }

  openProjectMenuId.value = projectName
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = getProjectDisplayName(projectName)
}

function openRenameProjectMenu(projectName: string): void {
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'rename'
  projectRenameDraft.value = getProjectDisplayName(projectName)
}

function onProjectNameInput(projectName: string): void {
  emit('rename-project', {
    projectName,
    displayName: projectRenameDraft.value,
  })
}

function onRemoveProject(projectName: string): void {
  emit('remove-project', projectName)
  closeProjectMenu()
}

function isThreadMenuOpen(threadId: string): boolean {
  return openThreadMenuId.value === threadId
}

function closeThreadMenu(): void {
  openThreadMenuId.value = ''
  threadMenuMode.value = 'actions'
  threadRenameDraft.value = ''
}

function toggleThreadMenu(threadId: string): void {
  if (openThreadMenuId.value === threadId) {
    closeThreadMenu()
    return
  }

  closeProjectMenu()
  openThreadMenuId.value = threadId
  threadMenuMode.value = 'actions'
  const thread = threadById.value.get(threadId)
  threadRenameDraft.value = thread?.title ?? ''
}

function openRenameThreadMenu(threadId: string): void {
  openThreadMenuId.value = threadId
  threadMenuMode.value = 'rename'
  const thread = threadById.value.get(threadId)
  threadRenameDraft.value = thread?.title ?? ''
}

function onThreadRenameSubmit(threadId: string): void {
  const title = threadRenameDraft.value.trim()
  if (title) {
    emit('rename-thread', {
      threadId,
      title,
    })
  }
  closeThreadMenu()
}

function setThreadMenuWrapRef(threadId: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    threadMenuWrapElementById.set(threadId, htmlElement)
    return
  }

  threadMenuWrapElementById.delete(threadId)
}

function isEventInsideOpenThreadMenu(event: Event): boolean {
  const threadId = openThreadMenuId.value
  if (!threadId) return false

  const openMenuWrapElement = threadMenuWrapElementById.get(threadId)
  if (!openMenuWrapElement) return false

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(openMenuWrapElement)) return true

  const target = event.target
  return target instanceof Node ? openMenuWrapElement.contains(target) : false
}

function isExpanded(projectName: string): boolean {
  return expandedProjects.value[projectName] === true
}

function isCollapsed(projectName: string): boolean {
  return collapsedProjects.value[projectName] === true
}

function toggleProjectExpansion(projectName: string): void {
  expandedProjects.value = {
    ...expandedProjects.value,
    [projectName]: !isExpanded(projectName),
  }
}

function toggleProjectCollapse(projectName: string): void {
  if (suppressNextProjectToggleId.value === projectName) {
    suppressNextProjectToggleId.value = ''
    return
  }

  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectName]: !isCollapsed(projectName),
  }
}

function getProjectOuterHeight(projectName: string): number {
  const measuredHeight = measuredHeightByProject.value[projectName] ?? 0
  const drag = activeProjectDrag.value
  const dragHeight = drag?.projectName === projectName ? drag.groupHeight : null
  const baseHeight = dragHeight ?? measuredHeight
  const gap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
  return Math.max(0, baseHeight + gap)
}

function setProjectMenuWrapRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    projectMenuWrapElementByName.set(projectName, htmlElement)
    return
  }

  projectMenuWrapElementByName.delete(projectName)
}

function isEventInsideOpenProjectMenu(event: Event): boolean {
  const projectName = openProjectMenuId.value
  if (!projectName) return false

  const openMenuWrapElement = projectMenuWrapElementByName.get(projectName)
  if (!openMenuWrapElement) return false

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(openMenuWrapElement)) return true

  const target = event.target
  return target instanceof Node ? openMenuWrapElement.contains(target) : false
}

function onProjectMenuPointerDown(event: PointerEvent): void {
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onProjectMenuFocusIn(event: FocusEvent): void {
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onWindowBlurForProjectMenu(): void {
  if (!openProjectMenuId.value && !openThreadMenuId.value) return
  closeProjectMenu()
  closeThreadMenu()
}

function bindProjectMenuDismissListeners(): void {
  window.addEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.addEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.addEventListener('blur', onWindowBlurForProjectMenu)
}

function unbindProjectMenuDismissListeners(): void {
  window.removeEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.removeEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.removeEventListener('blur', onWindowBlurForProjectMenu)
}

function updateMeasuredProjectHeight(projectName: string, element: HTMLElement): void {
  const nextHeight = element.getBoundingClientRect().height
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

  const previousHeight = measuredHeightByProject.value[projectName]
  if (previousHeight !== undefined && Math.abs(previousHeight - nextHeight) < 0.5) {
    return
  }

  measuredHeightByProject.value = {
    ...measuredHeightByProject.value,
    [projectName]: nextHeight,
  }
}

function setProjectGroupRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const previousElement = projectGroupElementByName.get(projectName)
  if (previousElement && previousElement !== element && projectGroupResizeObserver) {
    projectGroupResizeObserver.unobserve(previousElement)
  }

  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    projectGroupElementByName.set(projectName, htmlElement)
    projectNameByElement.set(htmlElement, projectName)
    updateMeasuredProjectHeight(projectName, htmlElement)
    projectGroupResizeObserver?.observe(htmlElement)
    return
  }

  if (previousElement) {
    projectGroupResizeObserver?.unobserve(previousElement)
  }

  projectGroupElementByName.delete(projectName)
}

function onProjectHandleMouseDown(event: MouseEvent, projectName: string): void {
  if (event.button !== 0) return
  if (pendingProjectDrag.value || activeProjectDrag.value) return

  const fromIndex = props.groups.findIndex((group) => group.projectName === projectName)
  const projectGroupElement = projectGroupElementByName.get(projectName)
  if (fromIndex < 0 || !projectGroupElement) return

  const groupRect = projectGroupElement.getBoundingClientRect()
  const groupGap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
  pendingProjectDrag.value = {
    projectName,
    fromIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerOffsetY: event.clientY - groupRect.top,
    groupLeft: groupRect.left,
    groupWidth: groupRect.width,
    groupHeight: groupRect.height,
    groupOuterHeight: groupRect.height + groupGap,
  }

  event.preventDefault()
  bindProjectDragListeners()
}

function bindProjectDragListeners(): void {
  window.addEventListener('mousemove', onProjectDragMouseMove)
  window.addEventListener('mouseup', onProjectDragMouseUp)
  window.addEventListener('keydown', onProjectDragKeyDown)
}

function unbindProjectDragListeners(): void {
  window.removeEventListener('mousemove', onProjectDragMouseMove)
  window.removeEventListener('mouseup', onProjectDragMouseUp)
  window.removeEventListener('keydown', onProjectDragKeyDown)
}

function onProjectDragMouseMove(event: MouseEvent): void {
  pendingDragPointerSample = {
    clientX: event.clientX,
    clientY: event.clientY,
  }
  scheduleProjectDragPointerFrame()
}

function onProjectDragMouseUp(event: MouseEvent): void {
  processProjectDragPointerSample({
    clientX: event.clientX,
    clientY: event.clientY,
  })

  const drag = activeProjectDrag.value
  if (drag && projectedDropProjectIndex.value !== null) {
    const currentProjectIndex = props.groups.findIndex((group) => group.projectName === drag.projectName)
    if (currentProjectIndex >= 0) {
      const toIndex = projectedDropProjectIndex.value
      if (toIndex !== currentProjectIndex) {
        emit('reorder-project', {
          projectName: drag.projectName,
          toIndex,
        })
      }
    }
  }

  resetProjectDragState()
}

function onProjectDragKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!pendingProjectDrag.value && !activeProjectDrag.value) return

  event.preventDefault()
  resetProjectDragState()
}

function resetProjectDragState(): void {
  if (dragPointerRafId !== null) {
    window.cancelAnimationFrame(dragPointerRafId)
    dragPointerRafId = null
  }
  pendingDragPointerSample = null
  pendingProjectDrag.value = null
  activeProjectDrag.value = null
  suppressNextProjectToggleId.value = ''
  unbindProjectDragListeners()
}

function scheduleProjectDragPointerFrame(): void {
  if (dragPointerRafId !== null) return

  dragPointerRafId = window.requestAnimationFrame(() => {
    dragPointerRafId = null
    if (!pendingDragPointerSample) return

    const sample = pendingDragPointerSample
    pendingDragPointerSample = null
    processProjectDragPointerSample(sample)
  })
}

function processProjectDragPointerSample(sample: DragPointerSample): void {
  const pending = pendingProjectDrag.value
  if (!activeProjectDrag.value && pending) {
    const deltaX = sample.clientX - pending.startClientX
    const deltaY = sample.clientY - pending.startClientY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance < DRAG_START_THRESHOLD_PX) {
      return
    }

    closeProjectMenu()
    suppressNextProjectToggleId.value = pending.projectName
    activeProjectDrag.value = {
      projectName: pending.projectName,
      fromIndex: pending.fromIndex,
      pointerOffsetY: pending.pointerOffsetY,
      groupLeft: pending.groupLeft,
      groupWidth: pending.groupWidth,
      groupHeight: pending.groupHeight,
      groupOuterHeight: pending.groupOuterHeight,
      ghostTop: sample.clientY - pending.pointerOffsetY,
      dropTargetIndexFull: null,
    }
  }

  if (!activeProjectDrag.value) return
  updateProjectDropTarget(sample)
}

function updateProjectDropTarget(sample: DragPointerSample): void {
  const drag = activeProjectDrag.value
  if (!drag) return

  drag.ghostTop = sample.clientY - drag.pointerOffsetY
  if (!isPointerInProjectDropZone(sample)) {
    drag.dropTargetIndexFull = null
    return
  }

  const cursorY = sample.clientY
  const groupsContainer = groupsContainerRef.value
  if (!groupsContainer) {
    drag.dropTargetIndexFull = null
    return
  }

  const containerRect = groupsContainer.getBoundingClientRect()
  const projectIndexByName = new Map(props.groups.map((group, index) => [group.projectName, index]))
  const nonDraggedProjectNames = props.groups
    .map((group) => group.projectName)
    .filter((projectName) => projectName !== drag.projectName)

  let accumulatedTop = 0
  let nextDropTarget = props.groups.length

  for (const projectName of nonDraggedProjectNames) {
    const originalIndex = projectIndexByName.get(projectName)
    if (originalIndex === undefined) continue

    const groupOuterHeight = getProjectOuterHeight(projectName)
    const groupMiddleY = containerRect.top + accumulatedTop + groupOuterHeight / 2
    if (cursorY < groupMiddleY) {
      nextDropTarget = originalIndex
      break
    }

    accumulatedTop += groupOuterHeight
  }

  drag.dropTargetIndexFull = nextDropTarget
}

function isPointerInProjectDropZone(sample: DragPointerSample): boolean {
  const groupsContainer = groupsContainerRef.value
  if (!groupsContainer) return false

  const bounds = groupsContainer.getBoundingClientRect()
  const xInBounds = sample.clientX >= bounds.left && sample.clientX <= bounds.right
  const yInBounds = sample.clientY >= bounds.top - 32 && sample.clientY <= bounds.bottom + 32
  return xInBounds && yInBounds
}

function isDraggingProject(projectName: string): boolean {
  return activeProjectDrag.value?.projectName === projectName
}

function projectGroupStyle(projectName: string): Record<string, string> | undefined {
  const drag = activeProjectDrag.value
  const targetTop = layoutTopByProject.value[projectName] ?? 0

  if (!drag || drag.projectName !== projectName) {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      transform: `translate3d(0, ${targetTop}px, 0)`,
      willChange: 'transform',
      transition: 'transform 180ms ease',
    }
  }

  return {
    position: 'fixed',
    top: '0',
    left: `${drag.groupLeft}px`,
    width: `${drag.groupWidth}px`,
    height: `${drag.groupHeight}px`,
    zIndex: '50',
    pointerEvents: 'none',
    transform: `translate3d(0, ${drag.ghostTop}px, 0)`,
    willChange: 'transform',
    transition: 'transform 0ms linear',
  }
}

function projectThreads(group: UiProjectGroup): UiThread[] {
  return group.threads.filter((thread) => !isPinned(thread.id))
}

function visibleThreads(group: UiProjectGroup): UiThread[] {
  if (isSearchActive.value) return projectThreads(group)
  if (isCollapsed(group.projectName)) return []

  const rows = projectThreads(group)
  return isExpanded(group.projectName) ? rows : rows.slice(0, 10)
}

function hasHiddenThreads(group: UiProjectGroup): boolean {
  if (isSearchActive.value) return false
  return !isCollapsed(group.projectName) && projectThreads(group).length > 10
}

function hasThreads(group: UiProjectGroup): boolean {
  return projectThreads(group).length > 0
}

function getThreadState(thread: UiThread): 'working' | 'unread' | 'idle' {
  if (thread.inProgress) return 'working'
  if (thread.unread) return 'unread'
  return 'idle'
}

function readThreadStatusSubtitle(threadId: string): string {
  if (!props.liveApprovalThreadIdSet.has(threadId)) return ''
  return normalizedLanguage.value === 'zh' ? '待审批' : 'Pending approval'
}

watch(
  () => props.groups.map((group) => group.projectName),
  (projectNames) => {
    const dragProjectName = activeProjectDrag.value?.projectName ?? pendingProjectDrag.value?.projectName ?? ''
    if (dragProjectName && !props.groups.some((group) => group.projectName === dragProjectName)) {
      resetProjectDragState()
    }

    const projectNameSet = new Set(projectNames)
    const nextMeasuredHeights = Object.fromEntries(
      Object.entries(measuredHeightByProject.value).filter(([projectName]) => projectNameSet.has(projectName)),
    ) as Record<string, number>

    if (Object.keys(nextMeasuredHeights).length !== Object.keys(measuredHeightByProject.value).length) {
      measuredHeightByProject.value = nextMeasuredHeights
    }
  },
)

watch([openProjectMenuId, openThreadMenuId], ([pId, tId]) => {
  if (pId || tId) {
    bindProjectMenuDismissListeners()
    return
  }

  unbindProjectMenuDismissListeners()
})

onBeforeUnmount(() => {
  for (const element of projectGroupElementByName.values()) {
    projectGroupResizeObserver?.unobserve(element)
  }
  projectGroupElementByName.clear()
  projectMenuWrapElementByName.clear()
  unbindProjectMenuDismissListeners()
  resetProjectDragState()
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-tree-root {
  @apply flex flex-col;
}

.pinned-section {
  @apply mb-1;
}

.thread-tree-header-row {
  @apply cursor-default;
}

.thread-tree-header {
  @apply text-sm font-normal select-none;
  color: var(--color-text-secondary);
}

.thread-start-button {
  @apply h-5 w-5 rounded flex items-center justify-center transition;
  color: var(--color-text-muted);
}

.thread-start-button:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

.thread-tree-loading {
  @apply px-3 py-2 text-sm;
  color: var(--color-text-secondary);
}

.thread-tree-no-results {
  @apply px-3 py-2 text-sm;
  color: var(--color-text-muted);
}

.thread-tree-groups {
  @apply pr-0.5 relative;
}

.project-group {
  @apply m-0 transition-shadow;
}

.project-group[data-dragging='true'] {
  @apply shadow-lg;
}

.project-header-row {
  @apply cursor-pointer focus-visible:outline-none focus-visible:ring-1;
}

.project-header-row:hover {
  background: var(--color-bg-subtle);
}

.project-header-row:focus-visible {
  --tw-ring-color: var(--color-border-strong);
}

.project-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5 cursor-grab;
}

.project-main-button[data-dragging-handle='true'] {
  @apply cursor-grabbing;
}

.project-icon-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
  color: var(--color-text-muted);
}

.project-icon-folder {
  @apply absolute inset-0 flex items-center justify-center opacity-100;
}

.project-icon-chevron {
  @apply absolute inset-0 items-center justify-center opacity-0 hidden;
}

.project-title {
  @apply text-sm font-normal truncate select-none;
  color: var(--color-text-secondary);
}

.project-menu-wrap {
  @apply relative;
}

.project-hover-controls {
  @apply flex items-center gap-1;
}

.project-menu-trigger {
  @apply h-4 w-4 rounded p-0 flex items-center justify-center;
  color: var(--color-text-secondary);
}

.project-menu-panel {
  @apply absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md border p-1 shadow-md flex flex-col gap-0.5;
  border-color: var(--color-border-default);
  background: var(--color-bg-elevated);
}

.project-menu-item {
  @apply rounded px-2 py-1 text-left text-sm;
  color: var(--color-text-secondary);
}

.project-menu-item:hover {
  background: var(--color-bg-subtle);
}

.project-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.project-menu-label {
  @apply px-2 pt-1 text-xs;
  color: var(--color-text-muted);
}

.project-menu-input {
  @apply px-2 py-1 text-sm rounded outline-none w-full border;
  color: var(--color-text-primary);
  background: var(--color-bg-surface);
  border-color: var(--color-border-default);
}

.thread-hover-controls {
  @apply flex items-center gap-1;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 flex items-center justify-center;
  color: var(--color-text-secondary);
}

.thread-menu-trigger:hover {
  background: var(--color-bg-subtle);
}

.thread-menu-panel {
  @apply absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md border p-1 shadow-md flex flex-col gap-0.5;
  border-color: var(--color-border-default);
  background: var(--color-bg-elevated);
}

.thread-menu-item {
  @apply rounded px-2 py-1 text-left text-sm;
  color: var(--color-text-secondary);
}

.thread-menu-item:hover {
  background: var(--color-bg-subtle);
}

.thread-menu-label {
  @apply px-2 pt-1 text-xs;
  color: var(--color-text-muted);
}

.thread-menu-input {
  @apply px-2 py-1 text-sm rounded outline-none flex-1 border;
  color: var(--color-text-primary);
  background: var(--color-bg-surface);
  border-color: var(--color-border-default);
}

.thread-rename-form {
  @apply px-1 py-1 flex flex-col gap-2;
}

.thread-rename-actions {
  @apply flex items-center justify-end gap-1;
}

.thread-rename-action-btn {
  @apply w-6 h-6 rounded flex items-center justify-center transition;
}

.thread-rename-action-btn.confirm {
  @apply bg-blue-600 text-white hover:bg-blue-700;
}

.thread-rename-action-btn.cancel {
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
}

.thread-rename-action-btn.cancel:hover {
  background: var(--color-bg-muted);
}

.project-empty-row {
  @apply cursor-default;
}

.project-empty-spacer {
  @apply block w-4 h-4;
}

.project-empty {
  @apply text-sm;
  color: var(--color-text-muted);
}

.thread-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.project-group > .thread-list {
  @apply mt-0.5;
}

.thread-row-item {
  @apply m-0;
}

.thread-row {
  @apply min-h-8 py-1;
}

.thread-row:hover {
  background: var(--color-bg-subtle);
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-pin-button {
  @apply absolute inset-0 w-4 h-4 rounded opacity-0 pointer-events-none transition flex items-center justify-center;
  color: var(--color-text-muted);
}

.thread-main-button {
  @apply min-w-0 flex-1 w-full overflow-hidden text-left rounded px-0 py-0 flex items-center;
}

.thread-row-main {
  @apply min-w-0 flex-1 overflow-hidden;
}

.thread-row-text {
  @apply min-w-0 w-full flex flex-col items-start justify-center;
}

.thread-row-title {
  @apply block w-full text-sm leading-5 font-normal truncate whitespace-nowrap;
  color: var(--color-text-primary);
}

.thread-row-subtitle {
  @apply block w-full text-[11px] leading-4 truncate whitespace-nowrap;
  color: var(--color-text-muted);
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time-wrap {
  @apply inline-flex w-14 shrink-0 justify-end;
}

.thread-row-time {
  @apply block max-w-full text-xs font-normal truncate whitespace-nowrap;
  color: var(--color-text-secondary);
}

.thread-hover-right-wrap {
  @apply inline-flex items-center justify-end gap-1.5 w-34;
}

.thread-row-preview {
  @apply min-w-0 flex-1 block text-xs leading-4 truncate whitespace-nowrap;
  color: var(--color-text-muted);
}

.thread-archive-button {
  @apply h-4 w-4 rounded p-0 text-xs flex items-center justify-center;
  color: var(--color-text-secondary);
}

.thread-archive-button[data-confirm='true'] {
  @apply h-5 w-auto px-1.5;
}

.thread-icon {
  @apply w-4 h-4;
}

.thread-show-more-row {
  @apply mt-1;
}

.thread-show-more-spacer {
  @apply block w-4 h-4;
}

.thread-show-more-button {
  @apply block mx-auto rounded-lg px-2 py-0.5 text-sm font-normal transition;
  color: var(--color-text-secondary);
}

.thread-show-more-button:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-subtle);
}

.project-header-row:hover .project-icon-folder {
  @apply opacity-0;
}

.project-header-row:hover .project-icon-chevron {
  @apply flex opacity-100;
}

.thread-row[data-active='true'] {
  background: var(--color-bg-muted);
}

.thread-row:hover .thread-pin-button,
.thread-row:focus-within .thread-pin-button {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-blue-600;
}

.thread-status-indicator[data-state='working'] {
  @apply border-2 border-zinc-500 border-t-transparent bg-transparent animate-spin;
}

.thread-row:hover .thread-status-indicator[data-state='unread'],
.thread-row:hover .thread-status-indicator[data-state='working'],
.thread-row:focus-within .thread-status-indicator[data-state='unread'],
.thread-row:focus-within .thread-status-indicator[data-state='working'] {
  @apply opacity-0;
}
</style>
