<template>
  <section class="account-switcher" aria-label="account-switcher">
    <div class="account-switcher-shell">
      <header class="account-switcher-head">
        <div>
          <p class="account-switcher-eyebrow">账号</p>
          <p class="account-switcher-title">账号中心</p>
        </div>
        <span class="account-switcher-counter">{{ visibleProfiles.length }} 档</span>
      </header>

      <div v-if="activeProfileDisplay" class="account-switcher-active-card">
        <p class="account-switcher-active-caption">当前会话</p>
        <p class="account-switcher-active-name">{{ formatProfileLabel(activeProfileDisplay) }}</p>
        <div class="account-switcher-active-meta">
          <span class="account-switcher-chip">{{ resolvePlanLabel(activeProfileDisplay) }}</span>
          <span
            class="account-switcher-chip"
            :class="activeProfileDisplay.tokenState === 'available'
              ? 'account-switcher-chip-token-ready'
              : 'account-switcher-chip-token-missing'"
          >
            {{ activeProfileDisplay.tokenState === 'available' ? 'Token 可用' : 'Token 缺失' }}
          </span>
        </div>
      </div>

      <div class="account-switcher-actions">
        <button class="account-switcher-add-email-button" type="button" @click="onAddByEmailLogin">
          邮箱登录新增档案
        </button>
      </div>

      <section class="account-switcher-manage-section" aria-label="account-manage-list">
        <header class="account-switcher-manage-header">
          <p class="account-switcher-manage-title">管理账号</p>
          <p class="account-switcher-manage-subtitle">直接在页面中切换或删除档案</p>
        </header>

        <ul v-if="visibleProfiles.length > 0" class="account-switcher-manage-list">
          <li
            v-for="profile in visibleProfiles"
            :key="`manage:${profile.profileId}`"
            class="account-switcher-manage-item"
          >
            <div class="account-switcher-manage-main">
              <p class="account-switcher-manage-name">{{ formatProfileLabel(profile) }}</p>
              <p class="account-switcher-manage-meta">{{ formatProfileMeta(profile) }}</p>
            </div>
            <div class="account-switcher-manage-actions">
              <button
                class="account-switcher-switch-button"
                type="button"
                :disabled="isCurrentAccountProfile(profile)"
                :title="isCurrentAccountProfile(profile) ? '当前账号' : '切换到该账号'"
                @click="onSwitch(profile.profileId)"
              >
                {{ isCurrentAccountProfile(profile) ? '当前' : '切换' }}
              </button>
              <button
                class="account-switcher-remove-button"
                type="button"
                :disabled="isCurrentAccountProfile(profile)"
                :title="isCurrentAccountProfile(profile) ? '当前档案不可删除' : '删除档案'"
                @click="onRemove(profile)"
              >
                {{ isCurrentAccountProfile(profile) ? '当前档案不可删除' : '删除' }}
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="account-switcher-manage-empty">暂无账号档案</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiAccountProfile } from '../../types/codex'

const props = defineProps<{
  accountProfiles: UiAccountProfile[]
  activeAccountProfileId: string
}>()

const emit = defineEmits<{
  switch: [profileId: string]
  align: []
  remove: [profileId: string]
}>()

function parseIsoTime(value: string | null): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getIdentityKey(profile: UiAccountProfile): string {
  if (profile.chatgptAccountId) return `chatgpt:${profile.chatgptAccountId}`
  if (profile.accountId) return `account:${profile.accountId}`
  if (profile.email) return `email:${profile.email}`
  return `profile:${profile.profileId}`
}

const activeProfile = computed<UiAccountProfile | null>(() => {
  return props.accountProfiles.find((profile) => profile.profileId === props.activeAccountProfileId) ?? null
})

const visibleProfiles = computed<UiAccountProfile[]>(() => {
  const sortedProfiles = [...props.accountProfiles].sort((first, second) => {
    if (first.profileId === props.activeAccountProfileId) return -1
    if (second.profileId === props.activeAccountProfileId) return 1
    return parseIsoTime(second.lastUsedAtIso) - parseIsoTime(first.lastUsedAtIso)
  })
  const seenIdentityKeys = new Set<string>()
  const rows: UiAccountProfile[] = []
  for (const profile of sortedProfiles) {
    const key = getIdentityKey(profile)
    if (seenIdentityKeys.has(key)) continue
    seenIdentityKeys.add(key)
    rows.push(profile)
  }
  return rows
})

const activeProfileDisplay = computed<UiAccountProfile | null>(() => {
  return activeProfile.value ?? visibleProfiles.value[0] ?? null
})

function isCurrentAccountProfile(profile: UiAccountProfile): boolean {
  if (profile.profileId === props.activeAccountProfileId) return true
  const active = activeProfile.value
  if (!active) return false
  return getIdentityKey(profile) === getIdentityKey(active)
}

function onSwitch(profileId: string): void {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId || normalizedProfileId === props.activeAccountProfileId) return
  emit('switch', normalizedProfileId)
}

function onAddByEmailLogin(): void {
  emit('align')
}

function onRemove(profile: UiAccountProfile): void {
  const normalizedProfileId = profile.profileId.trim()
  if (!normalizedProfileId) return
  if (isCurrentAccountProfile(profile)) return
  emit('remove', normalizedProfileId)
}

function formatProfileLabel(profile: UiAccountProfile): string {
  const base = profile.email || profile.accountId
  const isRuntimeFallback = profile.profileId.startsWith('current:') && profile.tokenState === 'missing'
  if (isRuntimeFallback) {
    return `${base}（当前 Web 运行时）`
  }
  return base
}

function resolvePlanLabel(profile: UiAccountProfile): string {
  return profile.chatgptPlanType || profile.planType || 'Plan 未知'
}

function formatProfileMeta(profile: UiAccountProfile): string {
  const tokenLabel = profile.tokenState === 'available' ? 'Token 可用' : 'Token 缺失'
  const statusLabel = profile.status === 'active' ? '活跃' : '备用'
  return `${resolvePlanLabel(profile)} · ${statusLabel} · ${tokenLabel}`
}
</script>

<style scoped>
.account-switcher {
  --account-accent: #0f766e;
  --account-accent-soft: rgba(15, 118, 110, 0.12);
  --account-glow: rgba(15, 118, 110, 0.26);
  --account-warn-soft: rgba(217, 119, 6, 0.14);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

.account-switcher-shell {
  border: 1px solid var(--color-border-default);
  border-radius: 0.95rem;
  padding: 0.7rem;
  background:
    radial-gradient(circle at top right, var(--account-glow), transparent 52%),
    linear-gradient(165deg, color-mix(in srgb, var(--color-bg-elevated) 88%, #ffffff 12%), var(--color-bg-surface));
  display: flex;
  flex-direction: column;
  gap: 0.58rem;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
}

.account-switcher-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.account-switcher-eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', monospace;
}

.account-switcher-title {
  margin: 0.12rem 0 0;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--color-text-primary);
}

.account-switcher-counter {
  font-size: 0.68rem;
  line-height: 1;
  border-radius: 999px;
  padding: 0.3rem 0.46rem;
  color: var(--account-accent);
  background: var(--account-accent-soft);
  border: 1px solid color-mix(in srgb, var(--account-accent) 35%, transparent);
  white-space: nowrap;
}

.account-switcher-active-card {
  border-radius: 0.82rem;
  border: 1px solid color-mix(in srgb, var(--account-accent) 26%, var(--color-border-default));
  padding: 0.56rem 0.62rem;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, var(--account-accent-soft) 18%);
}

.account-switcher-active-caption {
  margin: 0;
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.account-switcher-active-name {
  margin: 0.24rem 0 0;
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--color-text-primary);
  word-break: break-all;
}

.account-switcher-active-meta {
  margin-top: 0.45rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.account-switcher-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 0.66rem;
  padding: 0.2rem 0.44rem;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-surface);
}

.account-switcher-chip-token-ready {
  color: var(--color-success-text);
  border-color: color-mix(in srgb, var(--color-success-text) 32%, transparent);
  background: var(--color-success-soft);
}

.account-switcher-chip-token-missing {
  color: var(--color-warning-text);
  border-color: color-mix(in srgb, var(--color-warning-text) 42%, transparent);
  background: var(--account-warn-soft);
}

.account-switcher-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.35rem;
}

.account-switcher-add-email-button {
  border: 1px solid color-mix(in srgb, var(--account-accent) 30%, var(--color-border-default));
  border-radius: 0.62rem;
  padding: 0.44rem 0.58rem;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
  background: color-mix(in srgb, var(--color-bg-surface) 74%, var(--account-accent-soft) 26%);
  color: var(--color-text-primary);
  font-weight: 620;
}

.account-switcher-add-email-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(2, 6, 23, 0.12);
}

.account-switcher-manage-section {
  margin-top: 0.22rem;
  border: 1px solid color-mix(in srgb, var(--account-accent) 22%, var(--color-border-default));
  border-radius: 0.82rem;
  padding: 0.6rem;
  background: color-mix(in srgb, var(--color-bg-surface) 80%, var(--color-bg-elevated) 20%);
}

.account-switcher-manage-header {
  margin-bottom: 0.52rem;
}

.account-switcher-manage-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 620;
  color: var(--color-text-primary);
}

.account-switcher-manage-subtitle {
  margin: 0.18rem 0 0;
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.account-switcher-manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.account-switcher-manage-item {
  border: 1px solid var(--color-border-default);
  border-radius: 0.75rem;
  padding: 0.52rem;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, var(--color-bg-elevated) 18%);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.account-switcher-manage-main {
  min-width: 0;
}

.account-switcher-manage-name {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.35;
  color: var(--color-text-primary);
  word-break: break-all;
}

.account-switcher-manage-meta {
  margin: 0.2rem 0 0;
  font-size: 0.67rem;
  color: var(--color-text-muted);
}

.account-switcher-manage-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.account-switcher-remove-button,
.account-switcher-switch-button {
  border: 1px solid var(--color-border-default);
  border-radius: 0.42rem;
  padding: 0.22rem 0.45rem;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  cursor: pointer;
  white-space: nowrap;
}

.account-switcher-switch-button:not(:disabled):hover,
.account-switcher-remove-button:not(:disabled):hover {
  border-color: var(--account-accent);
  color: var(--account-accent);
}

.account-switcher-switch-button:disabled,
.account-switcher-remove-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.account-switcher-manage-empty {
  margin: 0;
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

@media (max-width: 860px) {
  .account-switcher-shell {
    padding: 0.62rem;
  }
}
</style>
