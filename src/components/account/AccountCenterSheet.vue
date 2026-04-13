<template>
  <Teleport to="body">
    <div v-if="open" class="account-center-layer" aria-live="polite">
      <button class="account-center-backdrop" type="button" :aria-label="t('app.accountCenterClose')" @click="$emit('close')" />
      <section class="account-center-sheet" role="dialog" aria-modal="true" :aria-label="t('app.accountCenterTitle')">
        <header class="account-center-sheet-header">
          <div class="account-center-sheet-handle" aria-hidden="true" />
          <div class="account-center-sheet-heading">
            <p class="account-center-sheet-eyebrow">{{ t('app.accountCenter') }}</p>
            <h2 class="account-center-sheet-title">{{ t('app.accountCenterTitle') }}</h2>
            <p class="account-center-sheet-subtitle">{{ t('app.accountCenterSubtitle') }}</p>
          </div>
          <button class="account-center-sheet-close" type="button" :aria-label="t('app.accountCenterClose')" @click="$emit('close')">
            ×
          </button>
        </header>

        <div class="account-center-sheet-body">
          <p v-if="status === 'error' && view === 'overview' && error" class="account-center-sheet-error">{{ error }}</p>

          <AccountOverviewCard
            v-if="view === 'overview'"
            :status="status"
            :account="account"
            :requires-openai-auth="requiresOpenaiAuth"
            :rate-limit-snapshot="rateLimitSnapshot"
            :account-profiles="accountProfiles"
            :active-profile-id="activeProfileId"
            :is-mobile-client="isMobileClient"
            :ui-language="uiLanguage"
            :is-busy="isBusy"
            @show-methods="$emit('show-methods')"
            @start-chatgpt-login-new-profile="$emit('start-chatgpt-login-new-profile')"
            @switch-profile="$emit('switch-profile', $event)"
            @logout="$emit('logout')"
            @refresh="$emit('refresh')"
          />

          <AccountLoginMethodPicker
            v-else-if="view === 'login_methods'"
            :available-methods="availableMethods"
            :login-flow="loginFlow"
            :api-key-draft="apiKeyDraft"
            :error="error"
            :is-mobile-client="isMobileClient"
            :ui-language="uiLanguage"
            :is-busy="isBusy"
            @back="$emit('go-overview')"
            @show-api-key-form="$emit('show-api-key-form')"
            @start-chatgpt-login="$emit('start-chatgpt-login')"
            @start-chatgpt-login-new-profile="$emit('start-chatgpt-login-new-profile')"
            @update-api-key="$emit('update-api-key', $event)"
            @submit-api-key="$emit('submit-api-key')"
          />

          <AccountLoginProgress
            v-else
            :login-flow="loginFlow"
            :pending-auth-url="pendingAuthUrl"
            :opens-auth-on-host-browser="opensAuthOnHostBrowser"
            :error="error"
            :ui-language="uiLanguage"
            :is-busy="isBusy"
            @reopen-auth="$emit('reopen-auth')"
            @cancel-login="$emit('cancel-login')"
            @retry="$emit('show-methods')"
            @back="$emit('go-overview')"
          />

          <p class="account-center-note">
            {{ t('app.accountCenterNote') }}
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Teleport } from 'vue'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import type {
  UiAccount,
  UiAccountProfile,
  UiAccountCenterView,
  UiAccountLoginFlow,
  UiAccountStatus,
} from '../../types/codex'
import type { AccountRateLimitSnapshot } from '../../api/codexGateway'
import AccountOverviewCard from './AccountOverviewCard.vue'
import AccountLoginMethodPicker from './AccountLoginMethodPicker.vue'
import AccountLoginProgress from './AccountLoginProgress.vue'

const props = defineProps<{
  open: boolean
  status: UiAccountStatus
  account: UiAccount | null
  requiresOpenaiAuth: boolean
  rateLimitSnapshot: AccountRateLimitSnapshot | null
  accountProfiles: UiAccountProfile[]
  activeProfileId: string
  isMobileClient: boolean
  availableMethods: Array<'chatgpt' | 'apiKey'>
  view: UiAccountCenterView
  loginFlow: UiAccountLoginFlow
  pendingAuthUrl: string
  opensAuthOnHostBrowser: boolean
  apiKeyDraft: string
  error: string
  uiLanguage: UiLanguage
  isBusy?: boolean
}>()

defineEmits<{
  (event: 'close'): void
  (event: 'go-overview'): void
  (event: 'show-methods'): void
  (event: 'show-api-key-form'): void
  (event: 'start-chatgpt-login'): void
  (event: 'start-chatgpt-login-new-profile'): void
  (event: 'switch-profile', profileId: string): void
  (event: 'update-api-key', value: string): void
  (event: 'submit-api-key'): void
  (event: 'cancel-login'): void
  (event: 'reopen-auth'): void
  (event: 'logout'): void
  (event: 'refresh'): void
}>()

function t(key: Parameters<typeof tUi>[1], params?: Record<string, number | string>): string {
  return tUi(props.uiLanguage, key, params)
}
</script>

<style scoped>
@reference "tailwindcss";

.account-center-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}

.account-center-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-bg-overlay) 62%, transparent);
  backdrop-filter: blur(10px);
}

.account-center-sheet {
  position: relative;
  z-index: 1;
  width: min(34rem, calc(100vw - 2rem));
  max-height: min(84vh, 46rem);
  overflow: hidden;
  border-radius: 1.5rem;
  border: 1px solid color-mix(in srgb, var(--color-border-default) 82%, white);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-bg-muted) 92%, white), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 98%, white), color-mix(in srgb, var(--color-bg-muted) 92%, white));
  box-shadow: 0 32px 120px color-mix(in srgb, black 24%, transparent);
}

.account-center-sheet-header {
  @apply sticky top-0 z-10 flex items-start gap-3 px-5 pb-3 pt-4;
  background: color-mix(in srgb, var(--color-bg-surface) 94%, transparent);
}

.account-center-sheet-handle {
  display: none;
}

.account-center-sheet-heading {
  @apply min-w-0 flex-1;
}

.account-center-sheet-eyebrow {
  @apply m-0 text-[11px] font-medium uppercase tracking-[0.18em];
  color: var(--color-text-muted);
}

.account-center-sheet-title {
  @apply mt-1 mb-0 text-[1.4rem] font-semibold leading-tight;
  color: var(--color-text-primary);
}

.account-center-sheet-subtitle {
  @apply mt-1 mb-0 text-sm leading-6;
  color: var(--color-text-secondary);
}

.account-center-sheet-close {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg leading-none transition;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 92%, white);
  color: var(--color-text-secondary);
}

.account-center-sheet-close:hover {
  background: color-mix(in srgb, var(--color-bg-muted) 90%, white);
  color: var(--color-text-primary);
}

.account-center-sheet-body {
  @apply flex max-h-[calc(84vh-5.5rem)] flex-col gap-4 overflow-y-auto px-5 pb-5;
}

.account-center-sheet-error {
  @apply m-0 rounded-xl border px-3 py-2 text-sm;
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.account-center-note {
  @apply m-0 rounded-[1.15rem] px-4 py-3 text-sm leading-6;
  background: color-mix(in srgb, var(--color-bg-subtle) 92%, white);
  color: var(--color-text-secondary);
}

@media (max-width: 720px) {
  .account-center-layer {
    place-items: stretch;
  }

  .account-center-sheet {
    width: 100vw;
    max-height: 100vh;
    border-radius: 0;
    border: 0;
    box-shadow: none;
  }

  .account-center-sheet-header {
    padding-top: calc(0.65rem + env(safe-area-inset-top, 0px));
  }

  .account-center-sheet-handle {
    display: block;
    position: absolute;
    top: 0.6rem;
    left: 50%;
    width: 2.5rem;
    height: 0.28rem;
    margin-left: -1.25rem;
    border-radius: 999px;
    background: var(--color-border-default);
  }

  .account-center-sheet-body {
    max-height: none;
    padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
