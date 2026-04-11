<template>
  <article class="account-overview-card" :data-status="status">
    <header class="account-overview-header">
      <div>
        <p class="account-overview-eyebrow">{{ t('app.accountCenterCurrentAccount') }}</p>
        <h3 class="account-overview-title">{{ summaryTitle }}</h3>
      </div>
      <span class="account-overview-status" :data-status="status">{{ statusLabel }}</span>
    </header>

    <div v-if="account" class="account-overview-details">
      <div class="account-overview-row">
        <span class="account-overview-key">{{ t('app.accountCenterAuthMode') }}</span>
        <span class="account-overview-value">{{ accountTypeLabel }}</span>
      </div>
      <div v-if="account.email" class="account-overview-row">
        <span class="account-overview-key">{{ t('app.accountCenterEmail') }}</span>
        <span class="account-overview-value">{{ account.email }}</span>
      </div>
      <div class="account-overview-row">
        <span class="account-overview-key">{{ t('app.accountCenterPlan') }}</span>
        <span class="account-overview-value">{{ planLabel }}</span>
      </div>
    </div>

    <p v-else class="account-overview-empty">
      {{ emptyCopy }}
    </p>

    <div v-if="rateLimitSnapshot" class="account-overview-quota">
      <p class="account-overview-quota-title">{{ t('app.accountCenterQuotaTitle') }}</p>
      <div class="account-overview-quota-grid">
        <div class="account-overview-quota-item">
          <span>{{ t('app.accountCenterQuotaUsed') }}</span>
          <strong>{{ `${Math.round(rateLimitSnapshot.usedPercent)}%` }}</strong>
        </div>
        <div class="account-overview-quota-item">
          <span>{{ t('app.accountCenterQuotaRemaining') }}</span>
          <strong>{{ `${Math.round(rateLimitSnapshot.remainingPercent)}%` }}</strong>
        </div>
      </div>
    </div>

    <footer class="account-overview-actions">
      <button class="account-overview-primary" type="button" :disabled="isBusy" @click="$emit('show-methods')">
        {{ primaryActionLabel }}
      </button>
      <button class="account-overview-secondary" type="button" :disabled="isBusy" @click="$emit('refresh')">
        {{ t('app.accountCenterRefresh') }}
      </button>
      <button
        v-if="account"
        class="account-overview-secondary account-overview-danger"
        type="button"
        :disabled="isBusy"
        @click="$emit('logout')"
      >
        {{ t('app.accountCenterLogout') }}
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import type { UiAccount, UiAccountStatus } from '../../types/codex'
import type { AccountRateLimitSnapshot } from '../../api/codexGateway'

const props = defineProps<{
  status: UiAccountStatus
  account: UiAccount | null
  requiresOpenaiAuth: boolean
  rateLimitSnapshot: AccountRateLimitSnapshot | null
  uiLanguage: UiLanguage
  isBusy?: boolean
}>()

defineEmits<{
  (event: 'show-methods'): void
  (event: 'logout'): void
  (event: 'refresh'): void
}>()

function t(key: Parameters<typeof tUi>[1], params?: Record<string, number | string>): string {
  return tUi(props.uiLanguage, key, params)
}

const statusLabel = computed(() => {
  if (props.status === 'logged_in') return t('app.accountCenterStatusLoggedIn')
  if (props.status === 'logged_out') return t('app.accountCenterStatusLoggedOut')
  if (props.status === 'reauth_required') return t('app.accountCenterStatusReauthRequired')
  if (props.status === 'error') return t('app.accountCenterStatusError')
  return t('app.accountCenterStatusLoading')
})

const accountTypeLabel = computed(() => {
  if (props.account?.type === 'chatgpt') return t('app.accountCenterModeChatgpt')
  return t('app.accountCenterModeApiKey')
})

const planLabel = computed(() => {
  return props.account?.planType || props.rateLimitSnapshot?.planType || t('app.accountCenterPlanUnknown')
})

const summaryTitle = computed(() => {
  if (props.account?.email) return props.account.email
  if (props.account?.type === 'apiKey') return t('app.accountCenterApiKeyAccount')
  if (props.status === 'reauth_required') return t('app.accountCenterRequiresOpenaiAuth')
  if (props.status === 'error') return t('app.accountCenterErrorFallback')
  return t('app.accountCenterNotLoggedIn')
})

const emptyCopy = computed(() => {
  if (props.status === 'reauth_required' || props.requiresOpenaiAuth) {
    return t('app.accountCenterRequiresOpenaiAuth')
  }
  if (props.status === 'error') {
    return t('app.accountCenterErrorFallback')
  }
  return t('app.accountCenterLoggedOutHint')
})

const primaryActionLabel = computed(() => {
  if (props.account) return t('app.accountCenterChangeAccount')
  if (props.status === 'reauth_required') return t('app.accountCenterReauth')
  return t('app.accountCenterChooseMethod')
})
</script>

<style scoped>
@reference "tailwindcss";

.account-overview-card {
  @apply rounded-[1.25rem] border p-4;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 96%, white), color-mix(in srgb, var(--color-bg-muted) 88%, white));
}

.account-overview-header {
  @apply flex items-start justify-between gap-3;
}

.account-overview-eyebrow {
  @apply m-0 text-[11px] font-medium uppercase tracking-[0.18em];
  color: var(--color-text-muted);
}

.account-overview-title {
  @apply mt-1 mb-0 text-xl font-semibold leading-tight;
  color: var(--color-text-primary);
}

.account-overview-status {
  @apply inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold;
}

.account-overview-status[data-status='logged_in'] {
  @apply bg-emerald-50 text-emerald-700;
}

.account-overview-status[data-status='logged_out'] {
  @apply bg-zinc-100 text-zinc-700;
}

.account-overview-status[data-status='reauth_required'],
.account-overview-status[data-status='error'] {
  @apply bg-amber-50 text-amber-700;
}

.account-overview-status[data-status='loading'] {
  @apply bg-sky-50 text-sky-700;
}

.account-overview-details {
  @apply mt-4 flex flex-col gap-2;
}

.account-overview-row {
  @apply flex items-center justify-between gap-3 rounded-xl px-3 py-2;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, transparent);
}

.account-overview-key {
  @apply text-xs;
  color: var(--color-text-muted);
}

.account-overview-value {
  @apply text-sm font-medium break-all text-right;
  color: var(--color-text-primary);
}

.account-overview-empty {
  @apply mt-4 mb-0 rounded-xl px-3 py-3 text-sm leading-6;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, transparent);
  color: var(--color-text-secondary);
}

.account-overview-quota {
  @apply mt-4 rounded-xl border px-3 py-3;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 74%, transparent);
}

.account-overview-quota-title {
  @apply m-0 text-xs font-medium;
  color: var(--color-text-secondary);
}

.account-overview-quota-grid {
  @apply mt-2 grid grid-cols-2 gap-2;
}

.account-overview-quota-item {
  @apply rounded-lg px-3 py-2 text-xs;
  background: color-mix(in srgb, var(--color-bg-muted) 82%, white);
  color: var(--color-text-secondary);
}

.account-overview-quota-item strong {
  @apply mt-1 block text-base;
  color: var(--color-text-primary);
}

.account-overview-actions {
  @apply mt-4 flex flex-wrap gap-2;
}

.account-overview-primary,
.account-overview-secondary {
  @apply inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50;
}

.account-overview-primary {
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.account-overview-primary:hover {
  background: var(--color-interactive-strong-hover);
}

.account-overview-secondary {
  border: 1px solid color-mix(in srgb, var(--color-border-default) 86%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 86%, white);
  color: var(--color-text-primary);
}

.account-overview-secondary:hover {
  background: color-mix(in srgb, var(--color-bg-muted) 90%, white);
}

.account-overview-danger {
  color: #b91c1c;
}

@media (max-width: 720px) {
  .account-overview-card {
    @apply rounded-none border-x-0 border-t-0 px-0 pb-0 pt-1;
    background: transparent;
  }
}
</style>
