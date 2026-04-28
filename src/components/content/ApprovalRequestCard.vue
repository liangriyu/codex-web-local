<template>
  <article v-if="model" class="approval-card">
    <header class="approval-card-header">
      <div class="approval-header-topline">
        <p class="approval-eyebrow">{{ model.kind === 'command' ? '命令授权' : '文件改动授权' }}</p>
        <span class="approval-status-chip">待确认</span>
      </div>
      <div class="approval-title-row">
        <h3 class="approval-title">{{ model.title }}</h3>
      </div>
      <p class="approval-description">{{ model.description }}</p>
    </header>

    <section v-if="model.kind === 'command'" class="approval-panel">
      <p class="approval-panel-label">即将执行</p>
      <pre class="approval-code-block"><code>{{ model.command }}</code></pre>
      <dl class="approval-meta-list">
        <div class="approval-meta-row">
          <dt>{{ t('threadConversation.approvalCwdLabel') }}</dt>
          <dd>{{ model.cwd }}</dd>
        </div>
        <div class="approval-meta-row">
          <dt>{{ t('threadConversation.approvalReasonLabel') }}</dt>
          <dd>{{ model.reason }}</dd>
        </div>
        <div v-if="model.summary" class="approval-meta-row">
          <dt>{{ t('threadConversation.approvalSummaryLabel') }}</dt>
          <dd>{{ model.summary }}</dd>
        </div>
      </dl>
    </section>

    <section v-else class="approval-panel">
      <p class="approval-panel-label">改动摘要</p>
      <dl class="approval-meta-list">
        <div class="approval-meta-row">
          <dt>{{ t('threadConversation.approvalReasonLabel') }}</dt>
          <dd>{{ model.reason }}</dd>
        </div>
        <div class="approval-meta-row">
          <dt>{{ t('threadConversation.approvalGrantRootLabel') }}</dt>
          <dd>{{ model.grantRoot }}</dd>
        </div>
      </dl>

      <div class="approval-file-summary">
        <p class="approval-file-summary-title">
          {{ t('threadConversation.approvalFileSummary', { count: model.fileCount, additions: model.totalAdditions, deletions: model.totalDeletions }) }}
        </p>
        <div class="approval-file-pill-row">
          <span class="approval-file-pill approval-file-pill-neutral">{{ model.fileCount }} 个文件</span>
          <span class="approval-file-pill approval-file-pill-add">+{{ model.totalAdditions }}</span>
          <span class="approval-file-pill approval-file-pill-del">-{{ model.totalDeletions }}</span>
        </div>
        <ul v-if="model.files.length > 0" class="approval-file-list">
          <li v-for="file in model.files.slice(0, 4)" :key="file.path" class="approval-file-item">
            <span class="approval-file-path">{{ file.path }}</span>
            <span class="approval-file-stats">
              <span class="approval-file-add">+{{ file.additions }}</span>
              <span class="approval-file-del">-{{ file.deletions }}</span>
            </span>
          </li>
        </ul>
        <button
          v-if="model.files.length > 0"
          type="button"
          class="approval-diff-link"
          @click="$emit('openWorkspaceDiff')"
        >
          {{ t('threadConversation.approvalOpenDiff') }}
        </button>
      </div>
    </section>

    <section class="approval-options" role="radiogroup" :aria-label="model.title">
      <button
        v-for="option in model.options"
        :key="option.id"
        type="button"
        class="approval-option"
        :data-selected="selectedOptionId === option.id"
        @click="selectedOptionId = option.id"
      >
        <span class="approval-option-number">{{ option.number }}.</span>
        <span class="approval-option-indicator" aria-hidden="true">
          <span class="approval-option-indicator-dot" />
        </span>
        <span class="approval-option-content">
          <span class="approval-option-label">{{ option.label }}</span>
          <span class="approval-option-description">{{ option.description }}</span>
        </span>
        <span v-if="selectedOptionId === option.id" class="approval-option-state">已选择</span>
      </button>
    </section>

    <footer class="approval-actions">
      <p class="approval-selection-note">{{ selectedOptionLabel }}</p>
      <div class="approval-actions-buttons">
        <button type="button" class="approval-skip-button" @click="$emit('skip')">
          {{ t('threadConversation.approvalSkip') }}
        </button>
        <button type="button" class="approval-submit-button" @click="onSubmit">
          {{ t('threadConversation.approvalSubmit') }}
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { tUi, type UiLanguage, type UiTextKey } from '../../i18n/uiText'
import type { ApprovalDecision, ApprovalRequestDisplayModel } from '../../utils/approvalRequestDisplay'

const props = defineProps<{
  model: ApprovalRequestDisplayModel | null
  uiLanguage?: UiLanguage
}>()

const emit = defineEmits<{
  submit: [decision: ApprovalDecision]
  skip: []
  openWorkspaceDiff: []
}>()

const selectedOptionId = ref('')
const selectedOptionLabel = computed(() => {
  if (!props.model) return ''
  const selected = props.model.options.find((option) => option.id === selectedOptionId.value) ?? props.model.options[0]
  return selected ? `当前选择：${selected.number}. ${selected.label}` : ''
})

watch(
  () => props.model,
  (value) => {
    selectedOptionId.value = value?.defaultOptionId ?? ''
  },
  { immediate: true },
)

function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(props.uiLanguage ?? 'zh', key, params)
}

function onSubmit(): void {
  if (!props.model) return
  const selected = props.model.options.find((option) => option.id === selectedOptionId.value) ?? props.model.options[0]
  if (!selected) return
  emit('submit', selected.decision)
}
</script>

<style scoped>
@reference "tailwindcss";

.approval-card {
  @apply w-full max-w-[min(52rem,100%)] rounded-[1.4rem] border px-4 py-4 flex flex-col gap-4;
  border-color: color-mix(in srgb, var(--color-border-default) 76%, #f59e0b 24%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-elevated) 90%, #fff6db 10%) 0%, var(--color-bg-elevated) 100%);
  box-shadow:
    0 18px 40px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.approval-card-header {
  @apply flex flex-col gap-2;
}

.approval-header-topline {
  @apply flex items-center justify-between gap-3;
}

.approval-eyebrow {
  @apply m-0 text-[11px] leading-4 font-semibold tracking-[0.18em] uppercase;
  color: color-mix(in srgb, var(--color-text-secondary) 74%, #b45309 26%);
}

.approval-status-chip {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium;
  background: color-mix(in srgb, var(--color-bg-subtle) 72%, #fff2c2 28%);
  color: color-mix(in srgb, var(--color-text-secondary) 58%, #92400e 42%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-border-default) 70%, #fbbf24 30%);
}

.approval-title-row {
  @apply flex items-start justify-between gap-3;
}

.approval-title {
  @apply m-0 text-lg leading-6 font-semibold;
  color: var(--color-text-primary);
  letter-spacing: -0.015em;
}

.approval-description {
  @apply m-0 text-sm leading-5;
  color: var(--color-text-secondary);
}

.approval-panel {
  @apply rounded-2xl border px-3 py-3 flex flex-col gap-3;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, #fbbf24 16%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-muted) 86%, #fffaf0 14%) 0%, color-mix(in srgb, var(--color-bg-muted) 94%, #fffbeb 6%) 100%);
}

.approval-panel-label {
  @apply m-0 text-[11px] leading-4 font-semibold tracking-[0.14em] uppercase;
  color: color-mix(in srgb, var(--color-text-secondary) 68%, #b45309 32%);
}

.approval-code-block {
  @apply m-0 rounded-xl border px-3 py-3 overflow-x-auto text-sm leading-6;
  border-color: color-mix(in srgb, var(--color-border-default) 82%, #f59e0b 18%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-elevated) 82%, #fffdfa 18%) 0%, color-mix(in srgb, var(--color-bg-elevated) 94%, #fff9eb 6%) 100%);
  color: var(--color-code-text);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.approval-meta-list {
  @apply m-0 flex flex-col gap-2;
}

.approval-meta-row {
  @apply grid gap-1;
  grid-template-columns: minmax(5rem, 7rem) minmax(0, 1fr);
}

.approval-meta-row dt {
  @apply text-xs leading-5 font-medium;
  color: var(--color-text-secondary);
}

.approval-meta-row dd {
  @apply m-0 text-sm leading-5 break-words;
  color: var(--color-text-primary);
}

.approval-file-summary {
  @apply flex flex-col gap-2;
}

.approval-file-summary-title {
  @apply m-0 text-sm leading-5 font-medium;
  color: var(--color-text-primary);
}

.approval-file-pill-row {
  @apply flex flex-wrap gap-2;
}

.approval-file-pill {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-xs leading-4 font-medium;
}

.approval-file-pill-neutral {
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
}

.approval-file-pill-add {
  background: color-mix(in srgb, #dcfce7 78%, var(--color-bg-elevated) 22%);
  color: #166534;
}

.approval-file-pill-del {
  background: color-mix(in srgb, #ffe4e6 78%, var(--color-bg-elevated) 22%);
  color: #be123c;
}

.approval-file-list {
  @apply list-none m-0 p-0 flex flex-col gap-1.5;
}

.approval-file-item {
  @apply rounded-xl border px-3 py-2 flex items-center justify-between gap-2;
  border-color: color-mix(in srgb, var(--color-border-default) 88%, #fcd34d 12%);
  background: color-mix(in srgb, var(--color-bg-elevated) 92%, #ffffff 8%);
}

.approval-file-path {
  @apply min-w-0 text-sm leading-5 truncate;
  color: var(--color-text-primary);
}

.approval-file-stats {
  @apply shrink-0 inline-flex items-center gap-1.5 text-xs leading-4;
}

.approval-file-add {
  @apply font-medium text-emerald-600;
}

.approval-file-del {
  @apply font-medium text-rose-600;
}

.approval-diff-link {
  @apply self-start text-sm leading-5 underline underline-offset-2;
  color: var(--color-link);
}

.approval-diff-link:hover {
  color: var(--color-link-hover);
}

.approval-options {
  @apply flex flex-col gap-2;
}

.approval-option {
  @apply w-full rounded-2xl border px-3 py-3 text-left flex items-start gap-3 transition;
  border-color: var(--color-border-default);
  background: color-mix(in srgb, var(--color-bg-elevated) 94%, #fff 6%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.approval-option[data-selected='true'] {
  border-color: color-mix(in srgb, var(--color-link) 58%, #f59e0b 42%);
  background: color-mix(in srgb, var(--color-bg-subtle) 74%, #fffbeb 26%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--color-link) 22%, transparent 78%),
    0 10px 24px rgba(15, 23, 42, 0.08);
}

.approval-option-indicator {
  @apply mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border;
  border-color: color-mix(in srgb, var(--color-border-default) 78%, #d97706 22%);
  background: color-mix(in srgb, var(--color-bg-elevated) 92%, #fffdf7 8%);
}

.approval-option-indicator-dot {
  @apply h-2.5 w-2.5 rounded-full opacity-0 transition;
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
}

.approval-option[data-selected='true'] .approval-option-indicator {
  border-color: #d97706;
}

.approval-option[data-selected='true'] .approval-option-indicator-dot {
  @apply opacity-100;
}

.approval-option-number {
  @apply text-sm leading-5 font-semibold;
  color: color-mix(in srgb, var(--color-text-secondary) 72%, #b45309 28%);
}

.approval-option-content {
  @apply flex flex-col gap-1 min-w-0;
}

.approval-option-label {
  @apply text-sm leading-5 font-medium;
  color: var(--color-text-primary);
}

.approval-option-description {
  @apply text-xs leading-4;
  color: var(--color-text-secondary);
}

.approval-option-state {
  @apply shrink-0 rounded-full px-2 py-0.5 text-[10px] leading-4 font-medium;
  background: color-mix(in srgb, var(--color-bg-elevated) 48%, #111827 52%);
  color: white;
}

.approval-actions {
  @apply flex flex-col gap-3 rounded-2xl border px-3 py-3;
  border-color: color-mix(in srgb, var(--color-border-default) 86%, #fbbf24 14%);
  background: color-mix(in srgb, var(--color-bg-elevated) 92%, #fffaf0 8%);
}

.approval-actions-buttons {
  @apply flex flex-col gap-2;
}

.approval-selection-note {
  @apply m-0 text-xs leading-5;
  color: var(--color-text-secondary);
}

.approval-submit-button,
.approval-skip-button {
  @apply w-full rounded-xl px-4 py-2.5 text-sm leading-5 font-medium transition;
}

.approval-submit-button {
  @apply border border-transparent;
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  color: white;
}

.approval-submit-button:hover {
  filter: brightness(1.05);
}

.approval-skip-button {
  @apply border;
  border-color: var(--color-border-default);
  background: transparent;
  color: var(--color-text-secondary);
}

.approval-skip-button:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

@media (max-width: 640px) {
  .approval-card {
    @apply rounded-[1.15rem] px-3.5 py-3.5;
  }

  .approval-meta-row {
    @apply grid-cols-1 gap-0.5;
  }

  .approval-actions {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: 0.25rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    background: color-mix(in srgb, var(--color-bg-elevated) 88%, #fffaf0 12%);
    backdrop-filter: blur(18px);
    box-shadow:
      0 -10px 24px rgba(15, 23, 42, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.42);
  }

  .approval-actions-buttons {
    @apply grid grid-cols-2 gap-2;
  }

  .approval-selection-note {
    @apply text-[11px] leading-4;
  }
}

@media (min-width: 640px) {
  .approval-actions {
    @apply flex-row items-center justify-between;
  }

  .approval-actions-buttons {
    @apply flex-row items-center gap-2 shrink-0;
  }

  .approval-submit-button,
  .approval-skip-button {
    @apply w-auto;
  }
}

@media (min-width: 768px) {
  .approval-card {
    @apply px-5 py-5;
  }
}
</style>
