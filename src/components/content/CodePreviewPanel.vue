<template>
  <aside class="content-code-preview">
    <header class="content-code-preview-header">
      <div class="content-code-preview-title-wrap">
        <p class="content-code-preview-title">{{ panelTitle }}</p>
        <p v-if="panelSubtitle" class="content-code-preview-subtitle">{{ panelSubtitle }}</p>
      </div>
      <button
        class="content-code-preview-close"
        type="button"
        :aria-label="closeLabel"
        @click="emit('close')"
      >
        <IconTablerX class="content-code-preview-close-icon" />
      </button>
    </header>
    <section v-if="panel.kind === 'workspace'" class="workspace-diff-panel">
      <div class="workspace-diff-mode-tabs" role="tablist" aria-label="Workspace diff modes">
        <button
          v-for="mode in workspaceDiffModes"
          :key="mode"
          type="button"
          class="workspace-diff-mode-tab"
          :class="{ 'is-active': workspaceSnapshot.mode === mode }"
          @click="emit('change-workspace-mode', mode)"
        >
          {{ getWorkspaceModeLabel(mode) }}
        </button>
      </div>
      <div class="workspace-diff-mode-meta">
        <p class="workspace-diff-mode-description">{{ workspaceModeDescription }}</p>
        <p v-if="workspaceModeRefs" class="workspace-diff-mode-refs">{{ workspaceModeRefs }}</p>
        <div v-if="showBaseBranchSelector" class="workspace-diff-base-branch-row">
          <label class="workspace-diff-base-branch-label" for="workspace-base-branch-select">
            {{ tUi(normalizedLanguage, 'diffPanel.baseBranchLabel') }}
          </label>
          <select
            id="workspace-base-branch-select"
            class="workspace-diff-base-branch-select"
            :value="selectedBaseBranchValue"
            @change="onBaseBranchChange"
          >
            <option value="">{{ tUi(normalizedLanguage, 'diffPanel.baseBranchAuto') }}</option>
            <option
              v-for="branch in baseBranchOptions"
              :key="branch"
              :value="branch"
            >
              {{ branch }}
            </option>
          </select>
        </div>
        <p v-if="baseBranchResolutionText" class="workspace-diff-base-branch-resolution">
          {{ baseBranchResolutionText }}
        </p>
      </div>
      <p v-if="workspaceSnapshot.warning" class="workspace-diff-warning">{{ workspaceSnapshot.warning }}</p>
      <section v-if="isGitStatusMode" class="workspace-status-panel">
        <div class="workspace-status-summary">
          <p class="workspace-status-branch">
            {{ tUi(normalizedLanguage, 'diffPanel.gitStatusCurrentBranch', { branch: workspaceCurrentBranch }) }}
          </p>
          <div v-if="workspaceStatusSummaryLabels.length > 0" class="workspace-status-summary-chips">
            <span
              v-for="label in workspaceStatusSummaryLabels"
              :key="label"
              class="workspace-status-summary-chip"
            >
              {{ label }}
            </span>
          </div>
          <div v-if="workspaceBlockedReasonLabels.length > 0" class="workspace-status-blockers">
            <p class="workspace-status-blockers-title">{{ tUi(normalizedLanguage, 'diffPanel.gitStatusBlockersTitle') }}</p>
            <div class="workspace-status-summary-chips">
              <span
                v-for="label in workspaceBlockedReasonLabels"
                :key="label"
                class="workspace-status-blocker-chip"
              >
                {{ label }}
              </span>
            </div>
          </div>
        </div>
        <p v-if="workspaceStatusEntries.length === 0" class="workspace-diff-empty">
          {{ tUi(normalizedLanguage, 'diffPanel.gitStatusEmpty') }}
        </p>
        <ul v-else class="workspace-status-list">
          <li
            v-for="entry in workspaceStatusEntries"
            :key="`wstatus:${entry.path}:${entry.x}${entry.y}`"
            class="workspace-status-item"
          >
            <div class="workspace-status-item-main">
              <span class="workspace-status-item-path">{{ formatDisplayPath(entry.path, panel.cwd) }}</span>
              <div class="workspace-status-item-tags">
                <span class="workspace-status-item-tag">{{ getWorkspaceStatusKindLabel(entry.kind) }}</span>
                <span v-if="entry.staged" class="workspace-status-item-tag">
                  {{ tUi(normalizedLanguage, 'diffPanel.gitStatusTagStaged') }}
                </span>
                <span v-if="entry.unstaged" class="workspace-status-item-tag">
                  {{ tUi(normalizedLanguage, 'diffPanel.gitStatusTagUnstaged') }}
                </span>
              </div>
            </div>
            <span class="workspace-status-item-xy">{{ entry.x }}{{ entry.y }}</span>
          </li>
        </ul>
      </section>
      <p v-else-if="workspaceSnapshot.files.length === 0" class="workspace-diff-empty">
        {{ workspaceEmptyMessage }}
      </p>
      <ul v-else class="workspace-diff-list">
        <li v-for="change in workspaceSnapshot.files" :key="`workspace:${workspaceSnapshot.mode}:${change.path}`" class="workspace-diff-item">
          <button
            type="button"
            class="workspace-diff-item-button"
            @click="toggleWorkspaceDiffFile(change.path)"
          >
            <span class="workspace-diff-item-path">{{ formatDisplayPath(change.path, panel.cwd) }}</span>
            <span class="workspace-diff-item-stats">
              <span class="file-change-stats-add">+{{ change.additions }}</span>
              <span class="file-change-stats-del">-{{ change.deletions }}</span>
            </span>
          </button>
          <pre
            v-if="isWorkspaceDiffFileExpanded(change.path)"
            class="workspace-diff-item-body"
          >
            <div class="diff-lines">
              <div
                v-for="(line, index) in buildRenderableDiffLines(change.diff)"
                :key="`wdiff:${change.path}:${index}`"
                class="diff-line"
                :class="`diff-line-${line.kind}`"
              >
                <span class="diff-ln-old">{{ line.oldLine ?? '' }}</span>
                <span class="diff-ln-new">{{ line.newLine ?? '' }}</span>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
            </div>
          </pre>
        </li>
      </ul>
    </section>
    <pre v-else-if="panel.kind === 'diff'" class="content-code-preview-body">
      <div class="diff-lines">
        <div
          v-for="(line, index) in buildRenderableDiffLines(panel.diff)"
          :key="`pdiff:${panel.path}:${index}`"
          class="diff-line"
          :class="`diff-line-${line.kind}`"
        >
          <span class="diff-ln-old">{{ line.oldLine ?? '' }}</span>
          <span class="diff-ln-new">{{ line.newLine ?? '' }}</span>
          <span class="diff-line-text">{{ line.text }}</span>
        </div>
      </div>
    </pre>
    <pre v-else-if="panel.kind === 'file'" class="content-code-preview-body">
      <div class="code-lines">
        <div
          v-for="(line, index) in renderableFilePreviewLines"
          :key="`fline:${panel.payload.path}:${index}:${line.oldLine ?? 'n'}:${line.newLine ?? 'n'}`"
          class="diff-line"
          :class="[ `diff-line-${line.kind}`, hasDiff ? '' : 'code-line-single' ]"
        >
          <span class="diff-ln-old">{{ line.oldLine ?? '' }}</span>
          <span v-if="hasDiff" class="diff-ln-new">{{ line.newLine ?? '' }}</span>
          <span class="hljs code-line-text" v-html="line.html || '&nbsp;'"></span>
        </div>
      </div>
    </pre>
    <pre v-else class="content-code-preview-body"><code class="hljs content-code-preview-code" v-html="highlightedPreviewHtml"></code></pre>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type {
  UiChangedFile,
  UiWorkspaceDiffMode,
  UiWorkspaceDiffSnapshot,
  UiWorkspaceDirtyKind,
  WorkspaceBranchBlockReason,
  WorkspaceModel,
} from '../../types/codex'
import type { FilePreviewPayload } from '../../api/codexGateway'
import { formatDisplayPath } from '../../utils/pathUtils'
import IconTablerX from '../icons/IconTablerX.vue'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import hljs from 'highlight.js/lib/common'

// ─── 类型 ────────────────────────────────────────────────────
export type PreviewPanelState =
  | { kind: 'file'; payload: FilePreviewPayload }
  | { kind: 'diff'; path: string; diff: string; additions: number; deletions: number; totalAdditions: number; totalDeletions: number }
  | { kind: 'workspace'; cwd: string }

type RenderableDiffLine = {
  kind: 'add' | 'del' | 'ctx'
  oldLine: number | null
  newLine: number | null
  text: string
}

type RenderableCodeLine = {
  kind: 'add' | 'del' | 'ctx'
  oldLine: number | null
  newLine: number | null
  html: string
}

// ─── Props / Emits ───────────────────────────────────────────
const props = defineProps<{
  panel: PreviewPanelState
  cwd: string
  matchedFileDiff: UiChangedFile | null
  workspaceModel?: WorkspaceModel | null
  uiLanguage?: UiLanguage
  closeLabel: string
}>()

const emit = defineEmits<{
  close: []
  'change-workspace-mode': [mode: UiWorkspaceDiffMode]
  'update-workspace-base-branch': [branch: string]
}>()

const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')
const workspaceDiffModes: UiWorkspaceDiffMode[] = ['unstaged', 'staged', 'branch', 'lastCommit', 'gitStatus']
const EMPTY_WORKSPACE_SNAPSHOT: UiWorkspaceDiffSnapshot = {
  mode: 'unstaged',
  cwd: '',
  label: '',
  baseRef: null,
  targetRef: null,
  warning: null,
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
}

// ─── Workspace diff 展开状态 ─────────────────────────────────
const localExpandedPaths = reactive<Record<string, boolean>>({})

function isWorkspaceDiffFileExpanded(path: string): boolean {
  return localExpandedPaths[path] === true
}

function toggleWorkspaceDiffFile(path: string): void {
  localExpandedPaths[path] = localExpandedPaths[path] !== true
}

function resetExpandedWorkspacePaths(nextPaths: string[]): void {
  for (const key of Object.keys(localExpandedPaths)) {
    delete localExpandedPaths[key]
  }
  if (nextPaths.length > 0) {
    localExpandedPaths[nextPaths[0]] = true
  }
}

// ─── HTML 转义 ───────────────────────────────────────────────
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

// ─── 代码高亮 ────────────────────────────────────────────────
function detectHighlightLanguage(path: string): string | null {
  const lowerPath = path.trim().toLowerCase()
  if (!lowerPath) return null

  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) return 'typescript'
  if (lowerPath.endsWith('.js') || lowerPath.endsWith('.jsx') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) return 'javascript'
  if (lowerPath.endsWith('.vue')) return 'xml'
  if (lowerPath.endsWith('.py')) return 'python'
  if (lowerPath.endsWith('.java')) return 'java'
  if (lowerPath.endsWith('.scala')) return 'scala'
  if (lowerPath.endsWith('.go')) return 'go'
  if (lowerPath.endsWith('.rs')) return 'rust'
  if (lowerPath.endsWith('.rb')) return 'ruby'
  if (lowerPath.endsWith('.php')) return 'php'
  if (lowerPath.endsWith('.json')) return 'json'
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml')) return 'yaml'
  if (lowerPath.endsWith('.toml')) return 'ini'
  if (lowerPath.endsWith('.md')) return 'markdown'
  if (lowerPath.endsWith('.sql')) return 'sql'
  if (lowerPath.endsWith('.sh') || lowerPath.endsWith('.bash') || lowerPath.endsWith('.zsh')) return 'bash'
  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.xml')) return 'xml'
  if (lowerPath.endsWith('.css') || lowerPath.endsWith('.scss')) return 'css'
  return null
}

function highlightCodeByLines(content: string, language: string | null): string[] {
  let highlighted = ''
  if (language) {
    try {
      highlighted = hljs.highlight(content, {
        language,
        ignoreIllegals: true,
      }).value
    } catch {
      highlighted = hljs.highlightAuto(content).value
    }
  } else {
    highlighted = hljs.highlightAuto(content).value
  }
  return highlighted.split('\n')
}

function highlightSingleLine(text: string, language: string | null): string {
  if (!text) return ''
  if (language) {
    try {
      return hljs.highlight(text, {
        language,
        ignoreIllegals: true,
      }).value
    } catch {
      return escapeHtml(text)
    }
  }
  return escapeHtml(text)
}

// ─── Diff 解析 ───────────────────────────────────────────────
function parseDiffHunkHeader(rawLine: string): { oldLine: number | null; newLine: number | null } | null {
  const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u)
  if (match) {
    return {
      oldLine: Number.parseInt(match[1], 10),
      newLine: Number.parseInt(match[2], 10),
    }
  }
  if (rawLine.trim() === '@@') {
    return {
      oldLine: null,
      newLine: null,
    }
  }
  return null
}

function buildFileDiffAnnotations(diff: string): {
  addedNewLines: Set<number>
  deletionsByNewPos: Map<number, Array<{ oldLine: number; text: string }>>
} {
  const addedNewLines = new Set<number>()
  const deletionsByNewPos = new Map<number, Array<{ oldLine: number; text: string }>>()
  const lines = diff.split('\n')

  let oldLine: number | null = null
  let newLine: number | null = null
  let inHunk = false

  for (const rawLine of lines) {
    if (
      rawLine.startsWith('diff --git ') ||
      rawLine.startsWith('index ') ||
      rawLine.startsWith('--- ') ||
      rawLine.startsWith('+++ ')
    ) {
      continue
    }

    if (rawLine.startsWith('@@')) {
      const header = parseDiffHunkHeader(rawLine)
      if (header) {
        oldLine = header.oldLine
        newLine = header.newLine
        inHunk = true
      }
      continue
    }

    if (!inHunk) continue
    if (rawLine.startsWith('\\ No newline at end of file')) continue

    const marker = rawLine[0] ?? ' '
    const content = rawLine.length > 0 ? rawLine.slice(1) : ''

    if (marker === '+') {
      if (newLine !== null) {
        addedNewLines.add(newLine)
        newLine += 1
      }
      continue
    }

    if (marker === '-') {
      if (newLine !== null && oldLine !== null) {
        const existing = deletionsByNewPos.get(newLine) ?? []
        existing.push({ oldLine, text: content })
        deletionsByNewPos.set(newLine, existing)
      }
      if (oldLine !== null) {
        oldLine += 1
      }
      continue
    }

    if (oldLine !== null) {
      oldLine += 1
    }
    if (newLine !== null) {
      newLine += 1
    }
  }

  return { addedNewLines, deletionsByNewPos }
}

function buildRenderableDiffLines(diff: string): RenderableDiffLine[] {
  const lines = diff.split('\n')
  const rendered: RenderableDiffLine[] = []

  let oldLine: number | null = null
  let newLine: number | null = null
  let inHunk = false

  for (const rawLine of lines) {
    if (
      rawLine.startsWith('diff --git ') ||
      rawLine.startsWith('index ') ||
      rawLine.startsWith('--- ') ||
      rawLine.startsWith('+++ ')
    ) {
      continue
    }

    if (rawLine.startsWith('@@')) {
      const header = parseDiffHunkHeader(rawLine)
      if (header) {
        oldLine = header.oldLine
        newLine = header.newLine
        inHunk = true
      }
      continue
    }

    if (!inHunk) continue
    if (rawLine.startsWith('\\ No newline at end of file')) continue

    const marker = rawLine[0] ?? ' '
    const content = rawLine.length > 0 ? rawLine.slice(1) : ''

    if (marker === '+') {
      rendered.push({
        kind: 'add',
        oldLine: null,
        newLine,
        text: content,
      })
      if (newLine !== null) {
        newLine += 1
      }
      continue
    }

    if (marker === '-') {
      rendered.push({
        kind: 'del',
        oldLine,
        newLine: null,
        text: content,
      })
      if (oldLine !== null) {
        oldLine += 1
      }
      continue
    }

    rendered.push({
      kind: 'ctx',
      oldLine,
      newLine,
      text: marker === ' ' ? content : rawLine,
    })
    if (oldLine !== null) {
      oldLine += 1
    }
    if (newLine !== null) {
      newLine += 1
    }
  }

  return rendered
}

// ─── Computed ────────────────────────────────────────────────
const panelTitle = computed(() => {
  if (props.panel.kind === 'workspace') return tUi(normalizedLanguage.value, 'diffPanel.title')
  if (props.panel.kind === 'diff') return `${formatDisplayPath(props.panel.path, props.cwd)} (diff)`
  return formatDisplayPath(props.panel.payload.path, props.cwd)
})

const panelSubtitle = computed(() => {
  if (props.panel.kind === 'workspace') {
    return `${workspaceSnapshot.value.files.length} ${tUi(normalizedLanguage.value, 'diffPanel.filesUnit')} +${workspaceSnapshot.value.totalAdditions} -${workspaceSnapshot.value.totalDeletions}`
  }
  if (props.panel.kind === 'diff') {
    if (props.panel.additions === 0 && props.panel.deletions === 0) return ''
    return `+${props.panel.additions} -${props.panel.deletions}`
  }
  return props.panel.payload.line ? `Line ${props.panel.payload.line}` : ''
})

const workspaceSnapshot = computed<UiWorkspaceDiffSnapshot>(() => {
  if (props.panel.kind !== 'workspace') return EMPTY_WORKSPACE_SNAPSHOT
  const model = props.workspaceModel
  if (!model || model.cwd !== props.panel.cwd) {
    return {
      ...EMPTY_WORKSPACE_SNAPSHOT,
      cwd: props.panel.cwd,
    }
  }
  const selectedMode = model.diff.selectedMode
  return model.diff.snapshots[selectedMode] ?? {
    ...EMPTY_WORKSPACE_SNAPSHOT,
    mode: selectedMode,
    cwd: model.cwd,
  }
})
const isGitStatusMode = computed(() => props.panel.kind === 'workspace' && workspaceSnapshot.value.mode === 'gitStatus')
const workspaceCurrentBranch = computed(() => props.workspaceModel?.branch.currentBranch?.trim() ?? '--')
const showBaseBranchSelector = computed(() => props.panel.kind === 'workspace' && workspaceSnapshot.value.mode === 'branch')
const selectedBaseBranchValue = computed(() => props.workspaceModel?.branch.baseBranch ?? '')
const baseBranchOptions = computed(() => {
  const branches = props.workspaceModel?.branch.branches ?? []
  const currentBase = props.workspaceModel?.branch.baseBranch?.trim() ?? ''
  const rows = branches.map((branch) => branch.trim()).filter((branch) => branch.length > 0)
  if (currentBase && !rows.includes(currentBase)) {
    rows.unshift(currentBase)
  }
  return Array.from(new Set(rows)).sort((first, second) => first.localeCompare(second))
})
const workspaceStatusEntries = computed(() => props.workspaceModel?.gitStatus.entries ?? [])
const workspaceStatusSummaryLabels = computed(() => {
  const summary = props.workspaceModel?.gitStatus.summary
  if (!summary) return []
  const labels: string[] = []
  if (summary.trackedModified > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyTrackedModified', { count: summary.trackedModified }))
  if (summary.staged > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyStaged', { count: summary.staged }))
  if (summary.untracked > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyUntracked', { count: summary.untracked }))
  if (summary.conflicted > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyConflicted', { count: summary.conflicted }))
  if (summary.renamed > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyRenamed', { count: summary.renamed }))
  if (summary.deleted > 0) labels.push(tUi(normalizedLanguage.value, 'composer.branchDirtyDeleted', { count: summary.deleted }))
  return labels
})
const workspaceBlockedReasonLabels = computed(() => {
  const reasons = props.workspaceModel?.guard.blockedReasons ?? []
  return reasons.map((reason) => getWorkspaceBlockedReasonLabel(reason))
})

watch(
  () =>
    props.panel.kind === 'workspace'
      ? `${props.panel.cwd}:${workspaceSnapshot.value.mode}:${workspaceSnapshot.value.files.map((row) => row.path).join('|')}`
      : '',
  () => {
    if (props.panel.kind !== 'workspace') return
    resetExpandedWorkspacePaths(workspaceSnapshot.value.files.map((row) => row.path))
  },
  { immediate: true },
)

function getWorkspaceModeLabel(mode: UiWorkspaceDiffMode): string {
  if (mode === 'unstaged') return tUi(normalizedLanguage.value, 'diffPanel.mode.unstaged')
  if (mode === 'staged') return tUi(normalizedLanguage.value, 'diffPanel.mode.staged')
  if (mode === 'branch') return tUi(normalizedLanguage.value, 'diffPanel.mode.branch')
  if (mode === 'lastCommit') return tUi(normalizedLanguage.value, 'diffPanel.mode.lastCommit')
  return tUi(normalizedLanguage.value, 'diffPanel.mode.gitStatus')
}

const workspaceModeDescription = computed(() => {
  if (props.panel.kind !== 'workspace') return ''
  const mode = workspaceSnapshot.value.mode
  if (mode === 'unstaged') return tUi(normalizedLanguage.value, 'diffPanel.desc.unstaged')
  if (mode === 'staged') return tUi(normalizedLanguage.value, 'diffPanel.desc.staged')
  if (mode === 'branch') return tUi(normalizedLanguage.value, 'diffPanel.desc.branch')
  if (mode === 'lastCommit') return tUi(normalizedLanguage.value, 'diffPanel.desc.lastCommit')
  return tUi(normalizedLanguage.value, 'diffPanel.desc.gitStatus')
})

const workspaceModeRefs = computed(() => {
  if (props.panel.kind !== 'workspace') return ''
  const baseRef = workspaceSnapshot.value.baseRef?.trim() ?? ''
  const targetRef = workspaceSnapshot.value.targetRef?.trim() ?? ''
  if (!baseRef && !targetRef) return ''
  if (!baseRef) return targetRef
  if (!targetRef) return baseRef
  return `${baseRef} -> ${targetRef}`
})

const baseBranchResolutionText = computed(() => {
  if (props.panel.kind !== 'workspace' || workspaceSnapshot.value.mode !== 'branch') return ''
  const resolvedBaseRef = workspaceSnapshot.value.baseRef?.trim() ?? ''
  if (!resolvedBaseRef) return ''
  if (selectedBaseBranchValue.value) {
    return tUi(normalizedLanguage.value, 'diffPanel.baseBranchConfigured', { branch: resolvedBaseRef })
  }
  return tUi(normalizedLanguage.value, 'diffPanel.baseBranchInferred', { branch: resolvedBaseRef })
})

const workspaceEmptyMessage = computed(() => {
  if (props.panel.kind !== 'workspace') return ''
  if (workspaceSnapshot.value.warning) {
    return tUi(normalizedLanguage.value, 'diffPanel.empty.warning')
  }
  if (workspaceSnapshot.value.mode === 'branch' && !workspaceSnapshot.value.baseRef) {
    return tUi(normalizedLanguage.value, 'diffPanel.empty.branchBaseMissing')
  }
  return tUi(normalizedLanguage.value, 'diffPanel.empty.noChanges')
})

function getWorkspaceStatusKindLabel(kind: UiWorkspaceDirtyKind): string {
  if (kind === 'modified') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.modified')
  if (kind === 'added') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.added')
  if (kind === 'deleted') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.deleted')
  if (kind === 'renamed') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.renamed')
  if (kind === 'untracked') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.untracked')
  if (kind === 'conflicted') return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.conflicted')
  return tUi(normalizedLanguage.value, 'diffPanel.gitStatusKind.unknown')
}

function getWorkspaceBlockedReasonLabel(reason: WorkspaceBranchBlockReason): string {
  if (reason === 'not_repo') return tUi(normalizedLanguage.value, 'composer.branchBlockedNotRepo')
  if (reason === 'workspace_dirty') return tUi(normalizedLanguage.value, 'composer.branchBlockedDirty')
  if (reason === 'thread_in_progress') return tUi(normalizedLanguage.value, 'composer.branchBlockedInProgress')
  if (reason === 'queued_messages') return tUi(normalizedLanguage.value, 'composer.branchBlockedQueued')
  if (reason === 'pending_server_requests') return tUi(normalizedLanguage.value, 'composer.branchBlockedPendingRequests')
  return tUi(normalizedLanguage.value, 'composer.branchBlockedPersistedRequests')
}

function onBaseBranchChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update-workspace-base-branch', target?.value ?? '')
}

const highlightedPreviewHtml = computed(() => {
  if (props.panel.kind === 'workspace' || props.panel.kind === 'file') return ''
  const content = props.panel.diff
  try {
    return hljs.highlight(content, {
      language: 'diff',
      ignoreIllegals: true,
    }).value
  } catch {
    return hljs.highlightAuto(content).value
  }
})

const hasDiff = computed(() => {
  return Boolean(props.matchedFileDiff?.diff?.trim())
})

const renderableFilePreviewLines = computed<RenderableCodeLine[]>(() => {
  if (props.panel.kind !== 'file') return []

  const content = props.panel.payload.content
  const plainLines = content.split('\n')
  const language = detectHighlightLanguage(props.panel.payload.path)
  const highlightedLines = highlightCodeByLines(content, language)
  const change = props.matchedFileDiff

  if (!change || !change.diff) {
    return highlightedLines.map((lineHtml, index) => ({
      kind: 'ctx',
      oldLine: index + 1,
      newLine: null,
      html: lineHtml,
    }))
  }

  const annotations = buildFileDiffAnnotations(change.diff)
  const rendered: RenderableCodeLine[] = []

  for (let i = 0; i < plainLines.length; i += 1) {
    const lineNo = i + 1
    const deletedBefore = annotations.deletionsByNewPos.get(lineNo) ?? []
    for (const deleted of deletedBefore) {
      rendered.push({
        kind: 'del',
        oldLine: deleted.oldLine,
        newLine: null,
        html: highlightSingleLine(deleted.text, language),
      })
    }

    const isAdded = annotations.addedNewLines.has(lineNo)
    rendered.push({
      kind: isAdded ? 'add' : 'ctx',
      oldLine: isAdded ? null : lineNo,
      newLine: lineNo,
      html: highlightedLines[i] ?? '',
    })
  }

  const eofDeletions = annotations.deletionsByNewPos.get(plainLines.length + 1) ?? []
  for (const deleted of eofDeletions) {
    rendered.push({
      kind: 'del',
      oldLine: deleted.oldLine,
      newLine: null,
      html: highlightSingleLine(deleted.text, language),
    })
  }

  return rendered
})
</script>

<style scoped>
@reference "tailwindcss";

.content-code-preview {
  @apply min-h-0 min-w-0 w-full rounded-xl border border-zinc-200 bg-zinc-50 flex flex-col overflow-hidden;
}

.content-code-preview-header {
  @apply px-3 py-2 border-b border-zinc-200 bg-white flex items-start justify-between gap-2;
}

.content-code-preview-title-wrap {
  @apply min-w-0;
}

.content-code-preview-title {
  @apply m-0 text-xs leading-5 text-zinc-800 truncate;
}

.content-code-preview-subtitle {
  @apply m-0 text-[11px] leading-4 text-zinc-500;
}

.content-code-preview-close {
  @apply h-6 w-6 rounded-md border border-transparent bg-transparent text-zinc-500 flex items-center justify-center hover:border-zinc-200 hover:bg-zinc-100;
}

.content-code-preview-close-icon {
  @apply h-4 w-4;
}

.content-code-preview-body {
  @apply m-0 flex-1 min-h-0 overflow-auto px-2 py-1.5 text-[11px] leading-4 text-zinc-800 bg-zinc-50;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.content-code-preview-code {
  @apply block whitespace-pre;
}

.code-lines {
  @apply flex flex-col min-w-full;
}

.code-line-text {
  @apply px-2 text-xs leading-5 text-zinc-800 whitespace-pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.workspace-diff-panel {
  @apply m-0 flex-1 min-h-0 overflow-auto bg-zinc-50;
}

.workspace-diff-mode-tabs {
  @apply sticky top-0 z-10 flex flex-wrap gap-1 border-b border-zinc-200 bg-white px-2 py-2;
}

.workspace-diff-mode-tab {
  @apply rounded-full border px-2.5 py-1 text-[10px] font-medium transition;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
}

.workspace-diff-mode-tab:hover {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.workspace-diff-mode-tab.is-active {
  border-color: var(--color-interactive-strong);
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.workspace-diff-mode-meta {
  @apply border-b px-2.5 py-2;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
}

.workspace-diff-mode-description {
  @apply m-0 text-[11px] leading-4;
  color: var(--color-text-secondary);
}

.workspace-diff-mode-refs {
  @apply mt-1 mb-0 text-[10px] leading-4;
  color: var(--color-text-muted);
}

.workspace-diff-base-branch-row {
  @apply mt-2 flex items-center gap-2;
}

.workspace-diff-base-branch-label {
  @apply text-[10px] leading-4 shrink-0;
  color: var(--color-text-muted);
}

.workspace-diff-base-branch-select {
  @apply min-w-0 rounded-md border px-2 py-1 text-[11px] leading-4;
  border-color: var(--color-border-default);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.workspace-diff-base-branch-resolution {
  @apply mt-1 mb-0 text-[10px] leading-4;
  color: var(--color-text-muted);
}

.workspace-diff-warning {
  @apply m-0 border-b px-2.5 py-2 text-[11px] leading-4;
  border-color: var(--color-border-default);
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.workspace-diff-empty {
  @apply m-0 border-b px-2.5 py-3 text-[11px] leading-4;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
}

.workspace-diff-list {
  @apply list-none m-0 p-0;
}

.workspace-status-panel {
  @apply border-b;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
}

.workspace-status-summary {
  @apply px-2.5 py-2 border-b;
  border-color: var(--color-border-default);
}

.workspace-status-branch {
  @apply m-0 text-[11px] leading-4;
  color: var(--color-text-secondary);
}

.workspace-status-summary-chips {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-status-summary-chip,
.workspace-status-blocker-chip,
.workspace-status-item-tag {
  @apply inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] leading-4;
  border-color: var(--color-border-default);
  background: var(--color-chip-bg);
  color: var(--color-chip-text);
}

.workspace-status-blockers {
  @apply mt-2;
}

.workspace-status-blockers-title {
  @apply m-0 text-[10px] leading-4;
  color: var(--color-text-muted);
}

.workspace-status-list {
  @apply list-none m-0 p-0;
}

.workspace-status-item {
  @apply flex items-start justify-between gap-3 border-b px-2.5 py-2 last:border-b-0;
  border-color: var(--color-border-default);
}

.workspace-status-item-main {
  @apply min-w-0;
}

.workspace-status-item-path {
  @apply block text-[11px] leading-4 break-all;
  color: var(--color-text-primary);
}

.workspace-status-item-tags {
  @apply mt-1 flex flex-wrap gap-1.5;
}

.workspace-status-item-xy {
  @apply shrink-0 text-[10px] leading-4 font-mono;
  color: var(--color-text-muted);
}

.workspace-diff-item {
  @apply border-b last:border-b-0;
  border-color: var(--color-border-default);
}

.workspace-diff-item-button {
  @apply w-full px-2.5 py-1.5 text-left transition flex items-center justify-between gap-3;
  background: var(--color-bg-muted);
}

.workspace-diff-item-button:hover {
  background: var(--color-bg-muted-hover);
}

.workspace-diff-item-path {
  @apply text-[11px] leading-4 truncate;
  color: var(--color-text-primary);
}

.workspace-diff-item-stats {
  @apply inline-flex items-center gap-2 shrink-0;
}

.workspace-diff-item-body {
  @apply m-0 border-t px-2 py-1.5 overflow-auto text-[11px] leading-4;
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
}

.diff-lines {
  @apply flex flex-col min-w-full;
}

.diff-line {
  @apply grid items-start;
  grid-template-columns: 44px 44px minmax(0, 1fr);
}

.code-line-single {
  grid-template-columns: 44px minmax(0, 1fr);
}

.diff-line-add {
  background: var(--color-success-soft);
}

.diff-line-del {
  background: var(--color-danger-soft);
}

.diff-line-ctx {
  @apply bg-transparent;
}

.diff-ln-old,
.diff-ln-new {
  @apply text-right pr-1.5 text-[10px] leading-4 select-none border-r;
  color: var(--color-line-number);
  border-color: var(--color-border-default);
}

.diff-line-add .diff-ln-new {
  color: var(--color-success-text);
}

.diff-line-del .diff-ln-old {
  color: var(--color-danger-text);
}

.diff-line-text {
  @apply px-1.5 text-[11px] leading-4 whitespace-pre;
  color: var(--color-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.file-change-stats-add {
  @apply text-[11px] text-[#16a34a] font-medium;
}

.file-change-stats-del {
  @apply text-[11px] text-[#ef4444] font-medium;
}

@media (max-width: 720px) {
  .content-code-preview {
    min-height: min(58dvh, 34rem);
    max-height: 68dvh;
    background: var(--color-bg-overlay);
    border-color: var(--color-border-default);
    box-shadow: 0 14px 36px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
  }

  .content-code-preview-header,
  .workspace-diff-mode-tabs {
    background: var(--color-bg-surface);
    border-color: var(--color-border-default);
  }

  .content-code-preview-body,
  .workspace-diff-panel,
  .workspace-status-panel {
    background: var(--color-bg-elevated);
    -webkit-overflow-scrolling: touch;
  }

  .workspace-diff-mode-meta,
  .workspace-diff-item-button,
  .workspace-diff-empty {
    background: var(--color-bg-subtle);
  }

  .workspace-diff-item-body {
    background: var(--color-bg-surface);
  }

  .content-code-preview-title,
  .workspace-diff-item-path,
  .workspace-status-item-path,
  .diff-line-text,
  .code-line-text {
    color: var(--color-text-primary);
  }

  .content-code-preview-subtitle,
  .workspace-diff-mode-description,
  .workspace-status-branch {
    color: var(--color-text-secondary);
  }

  .workspace-diff-mode-refs,
  .workspace-diff-base-branch-label,
  .workspace-diff-base-branch-resolution,
  .workspace-status-blockers-title,
  .workspace-status-item-xy,
  .diff-ln-old,
  .diff-ln-new {
    color: var(--color-text-muted);
  }

  .diff-line-ctx {
    background: color-mix(in srgb, var(--color-bg-surface) 92%, transparent);
  }
}
</style>
