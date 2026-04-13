<template>
  <section class="account-method-picker">
    <header class="account-method-picker-header">
      <button class="account-method-picker-back" type="button" @click="$emit('back')">
        {{ t('app.accountCenterBack') }}
      </button>
      <div>
        <h3 class="account-method-picker-title">{{ title }}</h3>
        <p class="account-method-picker-hint">{{ hint }}</p>
      </div>
    </header>

    <p v-if="error" class="account-method-picker-error">{{ error }}</p>

    <p v-if="isMobileClient" class="account-method-picker-mobile-note">
      {{ t('app.accountCenterMobileOnlySwitchHint') }}
    </p>

    <form
      v-else-if="loginFlow === 'api_key_form'"
      class="account-method-picker-form"
      @submit.prevent="$emit('submit-api-key')"
    >
      <label class="account-method-picker-label" for="account-center-api-key">
        {{ t('app.accountCenterApiKeyLabel') }}
      </label>
      <textarea
        id="account-center-api-key"
        class="account-method-picker-textarea"
        :value="apiKeyDraft"
        :placeholder="t('app.accountCenterApiKeyPlaceholder')"
        :disabled="isBusy"
        rows="5"
        @input="$emit('update-api-key', ($event.target as HTMLTextAreaElement).value)"
      />
      <button class="account-method-picker-submit" type="submit" :disabled="isBusy">
        {{ t('app.accountCenterApiKeySubmit') }}
      </button>
    </form>

    <div v-else class="account-method-picker-list">
      <button
        v-if="availableMethods.includes('chatgpt')"
        class="account-method-picker-card"
        type="button"
        :disabled="isBusy"
        @click="$emit('start-chatgpt-login')"
      >
        <strong>{{ t('app.accountCenterLoginWithChatgpt') }}</strong>
        <span>{{ t('app.accountCenterLoginWithChatgptHint') }}</span>
      </button>
      <button
        v-if="availableMethods.includes('chatgpt')"
        class="account-method-picker-card"
        type="button"
        :disabled="isBusy"
        @click="$emit('start-chatgpt-login-new-profile')"
      >
        <strong>{{ t('app.accountCenterLoginWithChatgptNewProfile') }}</strong>
        <span>{{ t('app.accountCenterLoginWithChatgptNewProfileHint') }}</span>
      </button>
      <button
        v-if="availableMethods.includes('apiKey')"
        class="account-method-picker-card"
        type="button"
        :disabled="isBusy"
        @click="$emit('show-api-key-form')"
      >
        <strong>{{ t('app.accountCenterLoginWithApiKey') }}</strong>
        <span>{{ t('app.accountCenterLoginWithApiKeyHint') }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tUi, type UiLanguage } from '../../i18n/uiText'
import type { UiAccountLoginFlow } from '../../types/codex'

const props = defineProps<{
  availableMethods: Array<'chatgpt' | 'apiKey'>
  loginFlow: UiAccountLoginFlow
  apiKeyDraft: string
  error: string
  isMobileClient: boolean
  uiLanguage: UiLanguage
  isBusy?: boolean
}>()

defineEmits<{
  (event: 'back'): void
  (event: 'show-api-key-form'): void
  (event: 'start-chatgpt-login'): void
  (event: 'start-chatgpt-login-new-profile'): void
  (event: 'update-api-key', value: string): void
  (event: 'submit-api-key'): void
}>()

function t(key: Parameters<typeof tUi>[1], params?: Record<string, number | string>): string {
  return tUi(props.uiLanguage, key, params)
}

const title = computed(() =>
  props.loginFlow === 'api_key_form'
    ? t('app.accountCenterLoginWithApiKey')
    : t('app.accountCenterChooseMethod'),
)

const hint = computed(() =>
  props.isMobileClient
    ? t('app.accountCenterMobileOnlySwitchHint')
    :
  props.loginFlow === 'api_key_form'
    ? t('app.accountCenterApiKeyFormHint')
    : t('app.accountCenterChooseMethodHint'),
)
</script>

<style scoped>
@reference "tailwindcss";

.account-method-picker {
  @apply flex flex-col gap-3;
}

.account-method-picker-header {
  @apply flex items-start gap-3;
}

.account-method-picker-back {
  @apply inline-flex min-h-9 items-center justify-center rounded-full px-3 text-sm font-medium transition;
  background: color-mix(in srgb, var(--color-bg-muted) 88%, white);
  color: var(--color-text-primary);
}

.account-method-picker-back:hover {
  background: color-mix(in srgb, var(--color-bg-muted-hover) 88%, white);
}

.account-method-picker-title {
  @apply m-0 text-lg font-semibold;
  color: var(--color-text-primary);
}

.account-method-picker-hint {
  @apply mt-1 mb-0 text-sm leading-6;
  color: var(--color-text-secondary);
}

.account-method-picker-error {
  @apply m-0 rounded-xl border px-3 py-2 text-sm;
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.account-method-picker-mobile-note {
  @apply m-0 rounded-xl border px-3 py-3 text-sm leading-6;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 88%, white);
  color: var(--color-text-secondary);
}

.account-method-picker-list {
  @apply grid gap-3;
}

.account-method-picker-card {
  @apply rounded-[1.25rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 96%, white), color-mix(in srgb, var(--color-bg-muted) 90%, white));
}

.account-method-picker-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 40px color-mix(in srgb, black 8%, transparent);
}

.account-method-picker-card strong {
  @apply block text-base;
  color: var(--color-text-primary);
}

.account-method-picker-card span {
  @apply mt-1 block text-sm leading-6;
  color: var(--color-text-secondary);
}

.account-method-picker-form {
  @apply flex flex-col gap-3 rounded-[1.25rem] border p-4;
  border-color: color-mix(in srgb, var(--color-border-default) 84%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 94%, white);
}

.account-method-picker-label {
  @apply text-sm font-medium;
  color: var(--color-text-primary);
}

.account-method-picker-textarea {
  @apply min-h-32 rounded-2xl border px-3 py-3 text-sm leading-6 outline-none transition;
  border-color: color-mix(in srgb, var(--color-border-default) 86%, white);
  background: color-mix(in srgb, var(--color-bg-surface) 98%, white);
  color: var(--color-text-primary);
}

.account-method-picker-textarea:focus {
  border-color: var(--color-border-strong);
}

.account-method-picker-textarea::placeholder {
  color: var(--color-text-muted);
}

.account-method-picker-submit {
  @apply inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50;
  background: var(--color-interactive-strong);
  color: var(--color-text-inverse);
}

.account-method-picker-submit:hover {
  background: var(--color-interactive-strong-hover);
}
</style>
