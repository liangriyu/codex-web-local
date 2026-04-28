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
              <div class="account-switcher-manage-quota">
                <span class="account-switcher-manage-quota-item">
                  周剩余 {{ resolveQuotaRemainingLabel(profile, 10080) }}
                </span>
                <span class="account-switcher-manage-quota-item">
                  5小时剩余 {{ resolveQuotaRemainingLabel(profile, 300) }}
                </span>
              </div>
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
import type { UiAccountProfile, UiRateLimitUsage } from '../../types/codex'

const props = defineProps<{
  accountProfiles: UiAccountProfile[]
  activeAccountProfileId: string
  accountRateLimitUsageByProfileId: Record<string, UiRateLimitUsage | null>
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

function resolveProfileRateLimitUsage(profile: UiAccountProfile): UiRateLimitUsage | null {
  return props.accountRateLimitUsageByProfileId[profile.profileId] ?? null
}

function resolveQuotaRemainingLabel(profile: UiAccountProfile, targetMinutes: number): string {
  const usage = resolveProfileRateLimitUsage(profile)
  if (!usage) return '--'

  const windows = (usage.windows ?? []).filter((row) =>
    typeof row.usedPercent === 'number'
    && Number.isFinite(row.usedPercent)
    && typeof row.windowDurationMins === 'number'
    && Number.isFinite(row.windowDurationMins)
    && row.windowDurationMins > 0,
  )

  const exactMatch = windows.find((row) => Math.round(row.windowDurationMins as number) === targetMinutes)
  const resolved = exactMatch ?? pickNearestWindow(windows, targetMinutes)
  if (resolved) {
    return `${Math.max(0, Math.round(100 - resolved.usedPercent))}%`
  }

  if (typeof usage.remainingPercent === 'number' && Number.isFinite(usage.remainingPercent)) {
    return `${Math.max(0, Math.round(usage.remainingPercent))}%`
  }
  return '--'
}

function pickNearestWindow(
  windows: Array<{ usedPercent: number; windowDurationMins: number | null; resetsAt: number | null }>,
  targetMinutes: number,
): { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null {
  let best: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null = null
  let minDiff = Number.POSITIVE_INFINITY

  for (const row of windows) {
    const duration = row.windowDurationMins
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) continue
    const diff = Math.abs(Math.round(duration) - targetMinutes)
    if (diff < minDiff) {
      best = row
      minDiff = diff
    }
  }

  const maxAllowedDiff = Math.max(60, Math.round(targetMinutes * 0.1))
  return minDiff <= maxAllowedDiff ? best : null
}
</script>

<style scoped>
.account-switcher {
  --account-accent: #0f766e;
  --account-accent-strong: #14b8a6;
  --account-accent-soft: rgba(15, 118, 110, 0.12);
  --account-glow: rgba(20, 184, 166, 0.3);
  --account-warn-soft: rgba(217, 119, 6, 0.14);
  --account-danger-soft: rgba(239, 68, 68, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

.account-switcher-shell {
  border: 1px solid color-mix(in srgb, var(--account-accent) 22%, var(--color-border-default));
  border-radius: 1rem;
  padding: 0.85rem;
  background:
    radial-gradient(circle at top right, var(--account-glow), transparent 46%),
    linear-gradient(168deg, color-mix(in srgb, var(--color-bg-elevated) 84%, #ffffff 16%), var(--color-bg-surface));
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  box-shadow:
    0 18px 34px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(148, 163, 184, 0.14);
  backdrop-filter: blur(8px);
}

.account-switcher-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.account-switcher-eyebrow {
  margin: 0;
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', monospace;
}

.account-switcher-title {
  margin: 0.16rem 0 0;
  font-size: 1rem;
  font-weight: 650;
  color: var(--color-text-primary);
}

.account-switcher-counter {
  font-size: 0.74rem;
  line-height: 1;
  border-radius: 999px;
  padding: 0.36rem 0.55rem;
  color: var(--account-accent);
  background: var(--account-accent-soft);
  border: 1px solid color-mix(in srgb, var(--account-accent) 38%, transparent);
  white-space: nowrap;
  font-weight: 600;
}

.account-switcher-active-card {
  border-radius: 0.92rem;
  border: 1px solid color-mix(in srgb, var(--account-accent) 28%, var(--color-border-default));
  padding: 0.72rem 0.76rem;
  background:
    linear-gradient(150deg, color-mix(in srgb, var(--color-bg-surface) 86%, #081222 14%), color-mix(in srgb, var(--color-bg-surface) 72%, var(--account-accent-soft) 28%));
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.1);
}

.account-switcher-active-caption {
  margin: 0;
  font-size: 0.74rem;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}

.account-switcher-active-name {
  margin: 0.28rem 0 0;
  font-size: 0.96rem;
  line-height: 1.35;
  color: var(--color-text-primary);
  word-break: break-all;
}

.account-switcher-active-meta {
  margin-top: 0.55rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.account-switcher-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 0.24rem 0.5rem;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-surface);
  font-weight: 560;
}

.account-switcher-chip-token-ready {
  color: #22c55e;
  border-color: color-mix(in srgb, #22c55e 40%, transparent);
  background: color-mix(in srgb, #22c55e 18%, transparent);
}

.account-switcher-chip-token-missing {
  color: var(--color-warning-text);
  border-color: color-mix(in srgb, var(--color-warning-text) 42%, transparent);
  background: var(--account-warn-soft);
}

.account-switcher-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.4rem;
}

.account-switcher-add-email-button {
  border: 1px solid color-mix(in srgb, var(--account-accent-strong) 34%, var(--color-border-default));
  border-radius: 0.72rem;
  padding: 0.56rem 0.7rem;
  font-size: 0.79rem;
  text-align: left;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--color-bg-surface) 68%, var(--account-accent-soft) 32%),
    color-mix(in srgb, var(--color-bg-elevated) 78%, var(--account-accent-soft) 22%)
  );
  color: var(--color-text-primary);
  font-weight: 640;
  box-shadow: 0 10px 20px rgba(2, 6, 23, 0.1);
}

.account-switcher-add-email-button:hover {
  transform: translateY(-1px) scale(1.003);
  border-color: color-mix(in srgb, var(--account-accent-strong) 48%, var(--color-border-default));
  box-shadow: 0 14px 24px rgba(2, 6, 23, 0.16);
}

.account-switcher-manage-section {
  margin-top: 0.18rem;
  border: 1px solid color-mix(in srgb, var(--account-accent) 26%, var(--color-border-default));
  border-radius: 0.9rem;
  padding: 0.68rem;
  background:
    linear-gradient(175deg, color-mix(in srgb, var(--color-bg-surface) 82%, var(--color-bg-elevated) 18%), color-mix(in srgb, var(--color-bg-surface) 90%, #0f172a 10%));
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.08);
}

.account-switcher-manage-header {
  margin-bottom: 0.64rem;
}

.account-switcher-manage-title {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 620;
  color: var(--color-text-primary);
}

.account-switcher-manage-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
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
  border: 1px solid color-mix(in srgb, #334155 64%, var(--color-border-default));
  border-radius: 0.8rem;
  padding: 0.66rem;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--color-bg-surface) 92%, #0b1324 8%), color-mix(in srgb, var(--color-bg-surface) 84%, #0f1b31 16%));
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.68rem;
  align-items: end;
  transition: border-color 140ms ease, transform 140ms ease;
}

.account-switcher-manage-item:hover {
  border-color: color-mix(in srgb, var(--account-accent-strong) 42%, var(--color-border-default));
  transform: translateY(-1px);
}

.account-switcher-manage-main {
  min-width: 0;
}

.account-switcher-manage-name {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--color-text-primary);
  word-break: break-all;
}

.account-switcher-manage-meta {
  margin: 0.24rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.account-switcher-manage-quota {
  margin-top: 0.36rem;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.42rem;
}

.account-switcher-manage-quota-item {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--account-accent-strong) 34%, var(--color-border-default));
  background: color-mix(in srgb, var(--color-bg-surface) 72%, var(--account-accent-soft) 28%);
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  line-height: 1;
  padding: 0.3rem 0.52rem;
  white-space: nowrap;
  font-weight: 560;
}

.account-switcher-manage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
  justify-content: flex-end;
}

.account-switcher-remove-button,
.account-switcher-switch-button {
  border: 1px solid color-mix(in srgb, #334155 78%, var(--color-border-default));
  border-radius: 0.56rem;
  padding: 0.38rem 0.72rem;
  background: color-mix(in srgb, var(--color-bg-surface) 90%, #0f172a 10%);
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-weight: 620;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease, transform 120ms ease;
}

.account-switcher-switch-button:not(:disabled):hover,
.account-switcher-remove-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.account-switcher-switch-button:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--account-accent-strong) 56%, var(--color-border-default));
  background: color-mix(in srgb, var(--account-accent-soft) 30%, var(--color-bg-surface));
  color: var(--account-accent-strong);
}

.account-switcher-remove-button:not(:disabled):hover {
  border-color: color-mix(in srgb, #ef4444 42%, var(--color-border-default));
  background: color-mix(in srgb, var(--account-danger-soft) 34%, var(--color-bg-surface));
  color: #f87171;
}

.account-switcher-switch-button:disabled,
.account-switcher-remove-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.account-switcher-manage-empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  padding: 0.4rem 0.2rem;
}

@media (min-width: 1080px) {
  .account-switcher-manage-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.62rem;
  }
}

@media (max-width: 860px) {
  .account-switcher-shell {
    padding: 0.65rem;
  }

  .account-switcher-manage-item {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .account-switcher-manage-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .account-switcher {
    gap: 0.62rem;
  }

  .account-switcher-shell {
    border-radius: 0.86rem;
    padding: 0.58rem;
    gap: 0.58rem;
  }

  .account-switcher-head {
    align-items: flex-start;
  }

  .account-switcher-title {
    font-size: 0.92rem;
  }

  .account-switcher-counter {
    font-size: 0.68rem;
    padding: 0.28rem 0.45rem;
  }

  .account-switcher-active-card {
    padding: 0.58rem;
    border-radius: 0.76rem;
  }

  .account-switcher-active-name {
    font-size: 0.88rem;
  }

  .account-switcher-chip {
    font-size: 0.66rem;
  }

  .account-switcher-add-email-button {
    font-size: 0.75rem;
    border-radius: 0.64rem;
    padding: 0.5rem 0.56rem;
  }

  .account-switcher-manage-section {
    border-radius: 0.76rem;
    padding: 0.52rem;
  }

  .account-switcher-manage-title {
    font-size: 0.86rem;
  }

  .account-switcher-manage-subtitle {
    font-size: 0.7rem;
    line-height: 1.35;
  }

  .account-switcher-manage-item {
    border-radius: 0.7rem;
    padding: 0.56rem;
    gap: 0.56rem;
  }

  .account-switcher-manage-name {
    font-size: 0.86rem;
  }

  .account-switcher-manage-meta {
    font-size: 0.74rem;
  }

  .account-switcher-manage-quota-item {
    font-size: 0.7rem;
  }

  .account-switcher-manage-actions {
    width: 100%;
    gap: 0.34rem;
  }

  .account-switcher-switch-button,
  .account-switcher-remove-button {
    flex: 1 1 auto;
    min-width: 5.2rem;
    text-align: center;
    font-size: 0.76rem;
    padding: 0.4rem 0.54rem;
  }
}
</style>
