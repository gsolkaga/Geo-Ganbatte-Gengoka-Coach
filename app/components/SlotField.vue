<script setup lang="ts">
/**
 * スロット 1 件の入力欄。
 *
 * - 3 状態（見えた / 見えない / 未確認）のトグルを持つ
 * - **`visible` 以外では記述欄を無効化する**（要件 2-5）
 * - ラベルは平易表現を主とし正規用語を括弧で併記、プレースホルダに入力例を表示する
 * - 管理モードでは「確認済み」トグルを持ち、未確認の下書きをグレー表示する
 * - **一括承認ボタンは実装しない**
 */
import { SLOT_STATES, SLOT_STATE_LABELS } from '#shared/slots'
import type { SlotDefinition, SlotState } from '#shared/slots'
import type { SlotEntry } from '#shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: SlotEntry
    definition: SlotDefinition
    /** 学習モードと管理モードで同一コンポーネントを共用する */
    mode?: 'learn' | 'admin'
    /** 管理モードで、値が AI または国定数テーブル由来の下書きであるか */
    draft?: boolean
  }>(),
  { mode: 'learn', draft: false },
)

const emit = defineEmits<{ 'update:modelValue': [SlotEntry] }>()

const fieldId = useId()

const isVisible = computed(() => props.modelValue.state === 'visible')

/** 管理モードで未確認の下書きはグレー表示にして、確認済みと区別する */
const showAsDraft = computed(
  () => props.mode === 'admin' && props.draft && props.modelValue.confirmed !== true,
)

function setState(state: SlotState) {
  // visible 以外へ移すときは記述と用語 ID を落とす。検証側（Zod）と同じ規則にする
  if (state === 'visible') {
    emit('update:modelValue', { ...props.modelValue, state })
    return
  }
  emit('update:modelValue', { ...props.modelValue, state, plain: null, terms: [] })
}

function setPlain(value: string) {
  const trimmed = value.trim()
  emit('update:modelValue', { ...props.modelValue, plain: trimmed === '' ? null : value })
}

function setConfirmed(value: boolean) {
  emit('update:modelValue', { ...props.modelValue, confirmed: value })
}

const stateClasses: Record<SlotState, string> = {
  visible: 'border-state-visible bg-state-visible/10 text-state-visible',
  absent: 'border-state-absent bg-state-absent/10 text-state-absent',
  unknown: 'border-state-unknown bg-state-unknown/10 text-state-unknown',
}
</script>

<template>
  <fieldset
    class="rounded border border-slate-300 p-3"
    :class="showAsDraft ? 'opacity-60' : ''"
  >
    <legend class="px-1 text-sm font-medium text-slate-900">
      {{ definition.label }}
      <span v-if="showAsDraft" class="ml-1 text-xs font-normal text-slate-500">（未確認の下書き）</span>
    </legend>

    <p :id="`${fieldId}-hint`" class="mb-2 text-xs text-slate-600">
      {{ definition.hint }}
    </p>

    <div class="mb-2 flex flex-wrap gap-2" role="radiogroup" :aria-label="`${definition.label} の状態`">
      <button
        v-for="state in SLOT_STATES"
        :key="state"
        type="button"
        role="radio"
        :aria-checked="modelValue.state === state"
        :title="SLOT_STATE_LABELS[state].meaning"
        class="rounded border px-3 py-1 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-slate-900"
        :class="modelValue.state === state
          ? stateClasses[state]
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
        @click="setState(state)"
      >
        {{ SLOT_STATE_LABELS[state].label }}
      </button>
    </div>

    <label class="block">
      <span class="sr-only">{{ definition.label }} の記述</span>
      <textarea
        :id="fieldId"
        :value="modelValue.plain ?? ''"
        :placeholder="definition.placeholder"
        :disabled="!isVisible"
        :aria-describedby="`${fieldId}-hint`"
        rows="2"
        class="w-full rounded border border-slate-300 p-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        @input="setPlain(($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <p v-if="!isVisible" class="mt-1 text-xs text-slate-500">
      「見えた」を選ぶと記述欄が使える
    </p>

    <label v-if="mode === 'admin'" class="mt-2 flex items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        :checked="modelValue.confirmed === true"
        class="size-4"
        @change="setConfirmed(($event.target as HTMLInputElement).checked)"
      >
      確認済み
    </label>
  </fieldset>
</template>
