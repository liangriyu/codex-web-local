<template>
  <div class="sidebar-thread-controls">
    <button
      class="sidebar-thread-controls-button"
      type="button"
      :aria-label="sidebarToggleLabel"
      :title="sidebarToggleLabel"
      @click="$emit('toggle-sidebar')"
    >
      <IconTablerLayoutSidebarFilled v-if="isSidebarCollapsed" class="sidebar-thread-controls-icon" />
      <IconTablerLayoutSidebar v-else class="sidebar-thread-controls-icon" />
    </button>

    <button
      class="sidebar-thread-controls-button"
      type="button"
      :aria-pressed="isAutoRefreshEnabled"
      :aria-label="autoRefreshButtonLabel"
      :title="autoRefreshButtonLabel"
      @click="$emit('toggle-auto-refresh')"
    >
      <IconTablerRefresh class="sidebar-thread-controls-icon" />
    </button>

    <slot />

    <button
      v-if="showNewThreadButton"
      class="sidebar-thread-controls-button"
      type="button"
      :aria-label="t('sidebar.startNewThread')"
      :title="t('sidebar.startNewThread')"
      @click="$emit('start-new-thread')"
    >
      <IconTablerFilePencil class="sidebar-thread-controls-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tUi, type UiLanguage, type UiTextKey } from '../../i18n/uiText'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerLayoutSidebar from '../icons/IconTablerLayoutSidebar.vue'
import IconTablerLayoutSidebarFilled from '../icons/IconTablerLayoutSidebarFilled.vue'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  isSidebarCollapsed: boolean
  isAutoRefreshEnabled: boolean
  autoRefreshButtonLabel: string
  showNewThreadButton?: boolean
  uiLanguage?: UiLanguage
}>()

defineEmits<{
  'toggle-sidebar': []
  'toggle-auto-refresh': []
  'start-new-thread': []
}>()

const normalizedLanguage = computed<UiLanguage>(() => props.uiLanguage ?? 'zh')

function t(key: UiTextKey, params?: Record<string, number | string>): string {
  return tUi(normalizedLanguage.value, key, params)
}

const sidebarToggleLabel = computed(() =>
  props.isSidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse'),
)
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-thread-controls {
  @apply flex flex-row flex-nowrap items-center gap-2;
}

.sidebar-thread-controls-button {
  @apply h-6.75 w-6.75 rounded-md border border-transparent bg-transparent flex items-center justify-center transition;
  color: var(--color-text-secondary);
}

.sidebar-thread-controls-button[aria-pressed='true'] {
  border-color: var(--color-border-default);
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.sidebar-thread-controls-button[aria-pressed='false'] {
  color: var(--color-text-muted);
}

.sidebar-thread-controls-button:hover {
  border-color: var(--color-border-default);
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
}

.sidebar-thread-controls-icon {
  @apply w-4 h-4;
}
</style>
