<template>
  <section class="shared-session-status-card" :data-state="snapshot.state">
    <header class="shared-session-status-header">
      <span class="shared-session-status-chip" :data-state="snapshot.state">{{ stateLabel }}</span>
    </header>

    <div class="shared-session-status-body">
      <div v-if="visibleTimelineEntries.length > 0" class="shared-session-status-timeline">
        <article
          v-for="entry in visibleTimelineEntries"
          :key="entry.id"
          class="shared-session-status-entry"
          :data-kind="entry.kind"
        >
          <div class="shared-session-status-entry-meta">
            <span class="shared-session-status-entry-kind">{{ describeEntryKind(entry.kind) }}</span>
            <span v-if="formatEntryTime(entry.createdAtIso)" class="shared-session-status-entry-time">
              {{ formatEntryTime(entry.createdAtIso) }}
            </span>
          </div>
          <p class="shared-session-status-entry-text">{{ entry.text }}</p>
        </article>
      </div>
      <p v-else class="shared-session-status-summary">{{ summaryText }}</p>
      <p v-if="attentionText" class="shared-session-status-attention">{{ attentionText }}</p>
    </div>

    <div class="shared-session-status-meta">
      <span
        v-if="approvalPillText"
        class="shared-session-status-pill"
      >
        {{ approvalPillText }}
      </span>
      <span v-if="snapshot.activeTurnId" class="shared-session-status-pill">
        {{ t('app.sharedSessionActiveTurn') }} · {{ snapshot.activeTurnId }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiSharedSessionSnapshot } from '../../types/codex'
import { tUi, type UiLanguage, type UiTextKey } from '../../i18n/uiText'

const props = defineProps<{
  snapshot: UiSharedSessionSnapshot
  liveApprovalCount?: number
  persistedApprovalCount?: number
  uiLanguage?: UiLanguage
}>()

const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')

function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(normalizedLanguage.value, key, params)
}

const liveApprovalCount = computed(() =>
  typeof props.liveApprovalCount === 'number'
    ? props.liveApprovalCount
    : props.snapshot.attention.pendingApprovalCount,
)

const persistedApprovalCount = computed(() => props.persistedApprovalCount ?? 0)
const pendingAttentionCount = computed(() => props.snapshot.attention.pendingAttentionCount ?? 0)

const hasPersistedApprovalRecords = computed(() =>
  persistedApprovalCount.value > 0 && liveApprovalCount.value === 0,
)

function buildApprovalAttentionText(): string {
  if (hasPersistedApprovalRecords.value) {
    return [
      t('app.sharedSessionPersistedApprovalRecords', { count: persistedApprovalCount.value }),
      t('app.sharedSessionApprovalNeedsReplay', { count: persistedApprovalCount.value }),
    ].join(' · ')
  }
  if (liveApprovalCount.value > 0) {
    return t('app.sharedSessionPendingApprovals', { count: liveApprovalCount.value })
  }
  return ''
}

function buildAttentionText(snapshot: UiSharedSessionSnapshot): string {
  const parts: string[] = []
  if (snapshot.attention.latestErrorMessage) {
    parts.push(tUi(normalizedLanguage.value, 'app.sharedSessionLatestError', { message: snapshot.attention.latestErrorMessage }))
  }
  const approvalAttentionText = buildApprovalAttentionText()
  if (approvalAttentionText) {
    parts.push(approvalAttentionText)
  }
  if (pendingAttentionCount.value > 0) {
    parts.push(t('app.sharedSessionPendingAttentionRequests', { count: pendingAttentionCount.value }))
  }
  return parts.join(' · ')
}

const stateLabel = computed(() => {
  switch (props.snapshot.state) {
    case 'running':
      return t('app.sharedSessionStatusRunning')
    case 'needs_attention':
      return t('app.sharedSessionStatusNeedsAttention')
    case 'failed':
      return t('app.sharedSessionStatusFailed')
    case 'interrupted':
      return t('app.sharedSessionStatusInterrupted')
    case 'stale_owner':
      return t('app.sharedSessionStatusStaleOwner')
    default:
      return t('app.sharedSessionStatusIdle')
  }
})

const summaryText = computed(() => {
  const latestSummary = props.snapshot.latestTurnSummary?.summary?.trim() ?? ''
  if (latestSummary) {
    return latestSummary
  }

  const latestAssistantMessage = [...props.snapshot.timeline]
    .reverse()
    .find((entry) => entry.kind === 'assistant_message' || entry.kind === 'turn_summary')

  if (latestAssistantMessage?.text?.trim()) {
    return latestAssistantMessage.text.trim()
  }

  return t('app.sharedSessionLatestTurn')
})

const attentionText = computed(() => buildAttentionText(props.snapshot))

const approvalPillText = computed(() => {
  if (hasPersistedApprovalRecords.value) {
    return t('app.sharedSessionPersistedApprovalRecordsShort', { count: persistedApprovalCount.value })
  }
  if (liveApprovalCount.value > 0) {
    return t('app.sharedSessionPendingApprovalsShort', { count: liveApprovalCount.value })
  }
  if (pendingAttentionCount.value > 0) {
    return t('app.sharedSessionPendingAttentionRequestsShort', { count: pendingAttentionCount.value })
  }
  return ''
})

const visibleTimelineEntries = computed(() => {
  const entries = props.snapshot.timeline.filter((entry) =>
    entry.kind !== 'user_message' && entry.text.trim().length > 0,
  )
  const latestSummary = props.snapshot.latestTurnSummary?.summary?.trim() ?? ''
  if (latestSummary && !entries.some((entry) => entry.kind === 'turn_summary' && entry.text.trim() === latestSummary)) {
    const createdAtIso =
      props.snapshot.latestTurnSummary?.completedAtIso
      ?? props.snapshot.latestTurnSummary?.startedAtIso
      ?? props.snapshot.updatedAtIso
    if (props.snapshot.latestTurnSummary?.status === 'running') {
      entries.push({
        id: `latest-turn-${props.snapshot.activeTurnId ?? props.snapshot.updatedAtIso}`,
        kind: 'assistant_message',
        text: latestSummary,
        createdAtIso,
      })
    } else {
      entries.push({
        id: `latest-turn-${props.snapshot.activeTurnId ?? props.snapshot.updatedAtIso}`,
        kind: 'turn_summary',
        text: latestSummary,
        createdAtIso,
        turnId: props.snapshot.latestTurnSummary?.turnId ?? props.snapshot.activeTurnId ?? 'unknown-turn',
        status:
          props.snapshot.latestTurnSummary?.status === 'completed'
            ? 'completed'
            : props.snapshot.latestTurnSummary?.status === 'failed'
              ? 'failed'
              : 'interrupted',
      })
    }
  }

  const derivedAttentionText = buildAttentionText(props.snapshot)
  if (
    derivedAttentionText
    && !entries.some((entry) => entry.kind === 'attention' && entry.text.trim() === derivedAttentionText)
  ) {
    entries.push({
      id: `attention-${props.snapshot.updatedAtIso}`,
      kind: 'attention',
      text: derivedAttentionText,
      createdAtIso: props.snapshot.updatedAtIso,
      attentionKind:
        props.snapshot.attention.latestErrorMessage
          ? 'error'
          : liveApprovalCount.value > 0 || hasPersistedApprovalRecords.value
            ? 'approval'
            : 'attention',
    })
  }

  return entries.slice(-3)
})

function describeEntryKind(kind: UiSharedSessionSnapshot['timeline'][number]['kind']): string {
  switch (kind) {
    case 'assistant_message':
      return 'AI'
    case 'turn_summary':
      return '状态'
    case 'attention':
      return '提醒'
    default:
      return '进展'
  }
}

function formatEntryTime(value: string): string {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return ''
  return new Intl.DateTimeFormat(normalizedLanguage.value === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
</script>

<style scoped>
@reference "tailwindcss";

.shared-session-status-card {
  @apply w-full max-w-180 mx-auto rounded-2xl border px-4 py-3 flex flex-col gap-3;
  border-color: var(--color-border-default);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-bg-elevated) 92%, white 8%), var(--color-bg-surface));
  box-shadow: 0 14px 36px color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

.shared-session-status-card[data-state='needs_attention'] {
  border-color: color-mix(in srgb, #f59e0b 55%, var(--color-border-default));
}

.shared-session-status-card[data-state='failed'] {
  border-color: color-mix(in srgb, #ef4444 55%, var(--color-border-default));
}

.shared-session-status-card[data-state='running'] {
  border-color: color-mix(in srgb, #16a34a 45%, var(--color-border-default));
}

.shared-session-status-header {
  @apply flex items-center gap-3 flex-wrap;
}

.shared-session-status-chip {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-semibold;
  color: var(--color-text-primary);
  background: var(--color-bg-subtle);
}

.shared-session-status-chip[data-state='running'] {
  background: color-mix(in srgb, #16a34a 14%, var(--color-bg-subtle));
  color: #166534;
}

.shared-session-status-chip[data-state='needs_attention'] {
  background: color-mix(in srgb, #f59e0b 16%, var(--color-bg-subtle));
  color: #92400e;
}

.shared-session-status-chip[data-state='failed'] {
  background: color-mix(in srgb, #ef4444 14%, var(--color-bg-subtle));
  color: #991b1b;
}

.shared-session-status-chip[data-state='interrupted'],
.shared-session-status-chip[data-state='stale_owner'],
.shared-session-status-chip[data-state='idle'] {
  color: var(--color-text-secondary);
}

.shared-session-status-body {
  @apply flex flex-col gap-1.5;
}

.shared-session-status-timeline {
  @apply flex flex-col gap-2;
}

.shared-session-status-entry {
  @apply rounded-xl px-3 py-2 flex flex-col gap-1;
  background: color-mix(in srgb, var(--color-bg-surface) 88%, var(--color-bg-muted));
}

.shared-session-status-entry-meta {
  @apply flex items-center justify-between gap-2;
}

.shared-session-status-entry-kind {
  @apply inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium;
  color: var(--color-text-secondary);
  background: var(--color-bg-muted);
}

.shared-session-status-entry-time {
  @apply text-[11px] leading-4 shrink-0;
  color: var(--color-text-muted);
}

.shared-session-status-entry-text {
  @apply m-0 text-sm leading-5 whitespace-pre-wrap break-words;
  color: var(--color-text-primary);
}

.shared-session-status-summary {
  @apply m-0 text-sm leading-5 font-medium whitespace-pre-wrap break-words;
  color: var(--color-text-primary);
}

.shared-session-status-attention {
  @apply m-0 text-xs leading-5 whitespace-pre-wrap break-words;
  color: var(--color-text-secondary);
}

.shared-session-status-meta {
  @apply flex flex-wrap gap-2;
}

.shared-session-status-pill {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] leading-4;
  color: var(--color-text-secondary);
  background: var(--color-bg-muted);
}
</style>
