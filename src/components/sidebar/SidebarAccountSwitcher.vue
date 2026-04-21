<template>
  <section class="account-switcher" aria-label="account-switcher">
    <label class="account-switcher-label" for="sidebar-account-switcher-select">账号</label>
    <select
      id="sidebar-account-switcher-select"
      class="account-switcher-select"
      :value="activeAccountProfileId"
      @change="onSelect"
    >
      <option v-if="visibleProfiles.length === 0" value="" disabled>暂无账号档案</option>
      <option
        v-for="profile in visibleProfiles"
        :key="profile.profileId"
        :value="profile.profileId"
      >
        {{ formatProfileLabel(profile) }}
      </option>
    </select>
    <button class="account-switcher-align-button" type="button" @click="onAlign">
      对齐账号
    </button>
    <button class="account-switcher-add-email-button" type="button" @click="onAddByEmailLogin">
      邮箱登录新增档案
    </button>
    <ul v-if="visibleProfiles.length > 0" class="account-switcher-manage-list">
      <li v-for="profile in visibleProfiles" :key="`manage:${profile.profileId}`" class="account-switcher-manage-item">
        <span class="account-switcher-manage-label">{{ formatProfileLabel(profile) }}</span>
        <span class="account-switcher-manage-actions">
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
        </span>
      </li>
    </ul>
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

function isCurrentAccountProfile(profile: UiAccountProfile): boolean {
  if (profile.profileId === props.activeAccountProfileId) return true
  const active = activeProfile.value
  if (!active) return false
  return getIdentityKey(profile) === getIdentityKey(active)
}

function onSelect(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const profileId = target?.value?.trim() ?? ''
  if (!profileId || profileId === props.activeAccountProfileId) return
  emit('switch', profileId)
}

function onSwitch(profileId: string): void {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId || normalizedProfileId === props.activeAccountProfileId) return
  emit('switch', normalizedProfileId)
}

function onAlign(): void {
  emit('align')
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
</script>

<style scoped>
.account-switcher {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.account-switcher-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.account-switcher-select {
  width: 100%;
  border: 1px solid var(--color-border-default);
  border-radius: 0.5rem;
  padding: 0.45rem 0.55rem;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  font-size: 0.83rem;
}

.account-switcher-align-button {
  border: 1px solid var(--color-border-default);
  border-radius: 0.5rem;
  padding: 0.4rem 0.55rem;
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}

.account-switcher-add-email-button {
  border: 1px solid var(--color-border-default);
  border-radius: 0.5rem;
  padding: 0.35rem 0.55rem;
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  font-size: 0.74rem;
  text-align: left;
  cursor: pointer;
}

.account-switcher-manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.account-switcher-manage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.account-switcher-manage-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.account-switcher-manage-label {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-switcher-remove-button {
  border: 1px solid var(--color-border-default);
  border-radius: 0.4rem;
  padding: 0.2rem 0.45rem;
  background: var(--color-surface-primary);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  cursor: pointer;
}

.account-switcher-switch-button {
  border: 1px solid var(--color-border-default);
  border-radius: 0.4rem;
  padding: 0.2rem 0.45rem;
  background: var(--color-surface-primary);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  cursor: pointer;
}

.account-switcher-switch-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.account-switcher-remove-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
