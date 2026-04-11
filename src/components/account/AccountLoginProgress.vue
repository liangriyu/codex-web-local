<template>
  <section class="account-login-progress">
    <div class="account-login-progress-state">
      <div class="account-login-progress-orb" :data-flow="loginFlow" />
      <div>
        <h3 class="account-login-progress-title">{{ title }}</h3>
        <p class="account-login-progress-copy">{{ copy }}</p>
      </div>
    </div>

    <p v-if="error" class="account-login-progress-error">{{ error }}</p>

    <div class="account-login-progress-actions">
      <button
        v-if="loginFlow === 'waiting_completion'"
        class="account-login-progress-primary"
        type="button"
        :disabled="isBusy || !pendingAuthUrl"
        @click="$emit('reopen-auth')"
      >
        {{ t('app.accountCenterReopenAuth') }}
      </button>
      <button
        v-if="loginFlow === 'waiting_completion'"
        class="account-login-progress-secondary"
        type="button"
        :disabled="isBusy"
        @click="$emit('cancel-login')"
      >
        {{ t('app.accountCenterCancelLogin') }}
      </button>
      <button
        v-if="loginFlow === 'failed'"
        class="account-login-progress-primary"
        type="button"
        :disabled="isBusy"
        @click="$emit('retry')"
      >
        {{ t('app.accountCenterRetry') }}
      </button>
      <button
        v-if="loginFlow === 'failed'"
        class="account-login-progress-secondary"
        type="button"
        :disabled="isBusy"
        @click="$emit('back')"
      >
        {{ t('app.accountCenterBack') }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import type { UiAccountLoginFlow } from '../../types/codex'

const props = defineProps<{
  loginFlow: UiAccountLoginFlow
  pendingAuthUrl: string
  opensAuthOnHostBrowser: boolean
  error: string
  uiLanguage: UiLanguage
  isBusy?: boolean
}>()

defineEmits<{
  (event: 'reopen-auth'): void
  (event: 'cancel-login'): void
  (event: 'retry'): void
  (event: 'back'): void
}>()

function t(key: Parameters<typeof tUi>[1], params?: Record<string, number | string>): string {
  return tUi(props.uiLanguage, key, params)
}

const title = computed(() => {
  if (props.loginFlow === 'opening_oauth') return t('app.accountCenterOAuthOpening')
  if (props.loginFlow === 'failed') return t('app.accountCenterStatusError')
  return t('app.accountCenterOAuthWaiting')
})

const copy = computed(() => {
  if (props.loginFlow === 'opening_oauth') return t('app.accountCenterOAuthOpeningHint')
  if (props.loginFlow === 'failed') return t('app.accountCenterOAuthFailedHint')
  if (props.opensAuthOnHostBrowser) return t('app.accountCenterOAuthWaitingHostHint')
  return t('app.accountCenterOAuthWaitingHint')
})
</script>

<style scoped>
@reference "tailwindcss";

.account-login-progress {
  @apply flex flex-col gap-4 rounded-[1.25rem] border p-4;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 96%, white), color-mix(in srgb, var(--color-bg-muted) 90%, white));
}

.account-login-progress-state {
  @apply flex items-start gap-3;
}

.account-login-progress-orb {
  @apply h-12 w-12 shrink-0 rounded-full;
  background: radial-gradient(circle at 30% 30%, #f8fafc 0%, #cbd5e1 45%, #64748b 100%);
}

.account-login-progress-orb[data-flow='waiting_completion'] {
  background: radial-gradient(circle at 30% 30%, #fefce8 0%, #facc15 40%, #ca8a04 100%);
}

.account-login-progress-orb[data-flow='failed'] {
  background: radial-gradient(circle at 30% 30%, #fef2f2 0%, #fb7185 45%, #be123c 100%);
}

.account-login-progress-title {
  @apply m-0 text-lg font-semibold;
  color: var(--color-text-primary);
}

.account-login-progress-copy {
  @apply mt-1 mb-0 text-sm leading-6;
  color: var(--color-text-secondary);
}

.account-login-progress-error {
  @apply m-0 rounded-xl border px-3 py-2 text-sm;
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.account-login-progress-actions {
  @apply flex flex-wrap gap-2;
}

.account-login-progress-primary,
.account-login-progress-secondary {
  @apply inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50;
}

.account-login-progress-primary {
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.account-login-progress-primary:hover {
  background: var(--color-interactive-strong-hover);
}

.account-login-progress-secondary {
  border: 1px solid color-mix(in srgb, var(--color-border-default) 86%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 86%, white);
  color: var(--color-text-primary);
}

.account-login-progress-secondary:hover {
  background: color-mix(in srgb, var(--color-bg-muted) 90%, white);
}
</style>
