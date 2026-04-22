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

      <label class="account-switcher-label" for="sidebar-account-switcher-select">切换活跃账号</label>
      <div class="account-switcher-select-wrap">
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
      </div>

      <div class="account-switcher-actions">
        <button class="account-switcher-add-email-button" type="button" @click="onAddByEmailLogin">
          邮箱登录新增档案
        </button>
      </div>

      <button class="account-switcher-mobile-manage-button" type="button" @click="openMobileSheet">
        管理账号
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isMobileSheetOpen"
        class="account-switcher-sheet-backdrop"
        @click.self="closeMobileSheet"
      >
        <section class="account-switcher-sheet" role="dialog" aria-modal="true" aria-label="账号管理面板">
          <header class="account-switcher-sheet-head">
            <div>
              <p class="account-switcher-sheet-title">账号管理面板</p>
              <p class="account-switcher-sheet-subtitle">共 {{ visibleProfiles.length }} 个档案</p>
            </div>
            <button class="account-switcher-sheet-close" type="button" @click="closeMobileSheet">
              收起
            </button>
          </header>

          <ul v-if="visibleProfiles.length > 0" class="account-switcher-sheet-list">
            <li
              v-for="profile in visibleProfiles"
              :key="`sheet:${profile.profileId}`"
              class="account-switcher-sheet-item"
            >
              <div class="account-switcher-sheet-main">
                <p class="account-switcher-sheet-name">{{ formatProfileLabel(profile) }}</p>
                <p class="account-switcher-sheet-meta">{{ formatProfileMeta(profile) }}</p>
              </div>
              <div class="account-switcher-sheet-actions">
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

          <p v-else class="account-switcher-sheet-empty">暂无账号档案</p>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

const isMobileSheetOpen = ref(false)

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

function onSelect(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const profileId = target?.value?.trim() ?? ''
  if (!profileId || profileId === props.activeAccountProfileId) return
  emit('switch', profileId)
}

function openMobileSheet(): void {
  isMobileSheetOpen.value = true
}

function closeMobileSheet(): void {
  isMobileSheetOpen.value = false
}

function onSwitch(profileId: string): void {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId || normalizedProfileId === props.activeAccountProfileId) return
  emit('switch', normalizedProfileId)
  closeMobileSheet()
}

function onAddByEmailLogin(): void {
  emit('align')
  closeMobileSheet()
}

function onRemove(profile: UiAccountProfile): void {
  const normalizedProfileId = profile.profileId.trim()
  if (!normalizedProfileId) return
  if (isCurrentAccountProfile(profile)) return
  emit('remove', normalizedProfileId)
  closeMobileSheet()
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

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!isMobileSheetOpen.value) return
  closeMobileSheet()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
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

.account-switcher-label {
  font-size: 0.73rem;
  color: var(--color-text-secondary);
}

.account-switcher-select-wrap {
  position: relative;
}

.account-switcher-select {
  width: 100%;
  border: 1px solid var(--color-border-default);
  border-radius: 0.65rem;
  padding: 0.52rem 0.65rem;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, var(--color-bg-elevated) 18%);
  color: var(--color-text-primary);
  font-size: 0.82rem;
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
}

.account-switcher-add-email-button {
  background: color-mix(in srgb, var(--color-bg-surface) 74%, var(--account-accent-soft) 26%);
  color: var(--color-text-primary);
  font-weight: 620;
}

.account-switcher-add-email-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(2, 6, 23, 0.12);
}

.account-switcher-mobile-manage-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--account-accent) 34%, var(--color-border-default));
  background: color-mix(in srgb, var(--account-accent-soft) 68%, var(--color-bg-surface) 32%);
  color: var(--account-accent);
  border-radius: 0.7rem;
  padding: 0.5rem 0.62rem;
  font-size: 0.78rem;
  font-weight: 620;
  text-align: center;
  cursor: pointer;
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

.account-switcher-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(2, 6, 23, 0.48);
  display: flex;
  align-items: flex-end;
  justify-content: stretch;
}

.account-switcher-sheet {
  width: 100%;
  max-height: 78vh;
  overflow-y: auto;
  border-top-left-radius: 1rem;
  border-top-right-radius: 1rem;
  padding: 0.85rem 0.9rem 1rem;
  border-top: 1px solid color-mix(in srgb, var(--account-accent) 30%, var(--color-border-default));
  background:
    radial-gradient(circle at top right, var(--account-glow), transparent 52%),
    linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated));
  box-shadow: 0 -16px 38px rgba(2, 6, 23, 0.35);
}

.account-switcher-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.65rem;
}

.account-switcher-sheet-title {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-text-primary);
  font-weight: 650;
}

.account-switcher-sheet-subtitle {
  margin: 0.18rem 0 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.account-switcher-sheet-close {
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  border-radius: 0.52rem;
  padding: 0.3rem 0.56rem;
  font-size: 0.72rem;
  cursor: pointer;
}

.account-switcher-sheet-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.account-switcher-sheet-item {
  border: 1px solid var(--color-border-default);
  border-radius: 0.75rem;
  padding: 0.52rem;
  background: color-mix(in srgb, var(--color-bg-surface) 82%, var(--color-bg-elevated) 18%);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.account-switcher-sheet-main {
  min-width: 0;
}

.account-switcher-sheet-name {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.35;
  color: var(--color-text-primary);
  word-break: break-all;
}

.account-switcher-sheet-meta {
  margin: 0.2rem 0 0;
  font-size: 0.67rem;
  color: var(--color-text-muted);
}

.account-switcher-sheet-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.account-switcher-sheet-empty {
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
