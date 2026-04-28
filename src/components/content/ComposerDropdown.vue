<template>
  <div ref="rootRef" class="composer-dropdown">
    <button
      class="composer-dropdown-trigger"
      type="button"
      :disabled="disabled"
      :title="triggerTitle || undefined"
      @click="onToggle"
    >
      <component
        :is="selectedIcon"
        v-if="selectedIcon"
        class="composer-dropdown-trigger-icon"
        v-bind="selectedIconProps"
      />
      <span class="composer-dropdown-value">{{ selectedLabel }}</span>
      <IconTablerChevronDown class="composer-dropdown-chevron" />
    </button>

    <div
      v-if="isOpen"
      class="composer-dropdown-menu-wrap"
      :class="{
        'composer-dropdown-menu-wrap-up': openDirection === 'up',
        'composer-dropdown-menu-wrap-down': openDirection === 'down',
      }"
    >
      <p v-if="menuTitle" class="composer-dropdown-menu-title">{{ menuTitle }}</p>
      <ul
        class="composer-dropdown-menu"
        :class="{
          'composer-dropdown-menu-wide': menuWidth === 'wide',
          'composer-dropdown-menu-model': menuWidth === 'model',
        }"
        role="listbox"
      >
        <li v-for="option in options" :key="option.value">
          <button
            class="composer-dropdown-option"
            :class="{ 'is-selected': option.value === modelValue }"
            type="button"
            @click="onSelect(option.value)"
          >
            <component
              :is="option.icon"
              v-if="option.icon && showOptionIcons"
              class="composer-dropdown-option-icon"
              v-bind="option.iconProps"
            />
            <span class="composer-dropdown-option-label">{{ option.label }}</span>
            <IconTablerCheck v-if="option.value === modelValue" class="composer-dropdown-option-check" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import IconTablerCheck from '../icons/IconTablerCheck.vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'

type DropdownOption = {
  value: string
  label: string
  icon?: Component
  iconProps?: Record<string, unknown>
}

const props = defineProps<{
  modelValue: string
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  openDirection?: 'up' | 'down'
  menuTitle?: string
  triggerTitle?: string
  menuWidth?: 'default' | 'model' | 'wide'
  showOptionIcons?: boolean
}>()

const showOptionIcons = computed(() => props.showOptionIcons !== false)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder?.trim() || ''
})

const openDirection = computed(() => props.openDirection ?? 'down')
const selectedOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue) ?? null,
)
const selectedIcon = computed(() => selectedOption.value?.icon)
const selectedIconProps = computed(() => selectedOption.value?.iconProps ?? {})

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<style scoped>
@reference "tailwindcss";

.composer-dropdown {
  @apply relative inline-flex min-w-0;
}

.composer-dropdown-trigger {
  @apply inline-flex h-7 items-center gap-1 border-0 bg-transparent p-0 text-[11px] leading-none text-zinc-600 outline-none transition;
}

.composer-dropdown-trigger:disabled {
  @apply cursor-not-allowed text-zinc-500;
}

.composer-dropdown-value {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left;
}

.composer-dropdown-trigger-icon {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.composer-dropdown-chevron {
  @apply mt-px h-3 w-3 shrink-0 text-zinc-500;
}

.composer-dropdown-menu-wrap {
  @apply absolute left-0 z-30;
}

.composer-dropdown-menu-wrap-down {
  @apply top-[calc(100%+8px)];
}

.composer-dropdown-menu-wrap-up {
  @apply bottom-[calc(100%+8px)];
}

.composer-dropdown-menu {
  @apply m-0 min-w-30 list-none rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.composer-dropdown-menu-wide {
  @apply min-w-64;
}

.composer-dropdown-menu-model {
  @apply min-w-38;
}

.composer-dropdown-menu-title {
  @apply m-0 px-2 py-1 text-[11px] font-medium text-zinc-500;
}

.composer-dropdown-option {
  @apply flex w-full items-center rounded-lg border-0 bg-transparent px-2 py-1 text-left text-[11px] text-zinc-700 transition hover:bg-zinc-100;
}

.composer-dropdown-option-icon {
  @apply mr-1.5 h-3.5 w-3.5 shrink-0 text-zinc-600;
}

.composer-dropdown-option-label {
  @apply min-w-0 flex-1 whitespace-nowrap;
}

.composer-dropdown-option-check {
  @apply ml-1.5 h-3.5 w-3.5 shrink-0 text-zinc-700;
}

.composer-dropdown-option.is-selected {
  @apply bg-zinc-100;
}
</style>
