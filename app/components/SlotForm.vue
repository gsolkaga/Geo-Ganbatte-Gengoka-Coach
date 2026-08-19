<script setup lang="ts">
/**
 * 14 スロットの観察入力フォーム。
 *
 * **学習モードと管理モードで同一のコンポーネントを使う。** 差分は `mode` のみ。
 * v1 / v2 で UI を完全に同一にする要件（9-3）のため、variant による分岐も持たない。
 *
 * スロットの正典は `.kiro/specs/geo-observation-coach/slot-definitions.md`（14 件）。
 */
import { SLOT_DEFINITIONS, SLOT_STATE_LABELS } from '#shared/slots'
import type { SlotId } from '#shared/slots'
import type { SlotEntry, SlotRecord } from '#shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: SlotRecord
    mode?: 'learn' | 'admin'
    /** 管理モードで下書き表示するスロット */
    draftSlots?: SlotId[]
    /** 管理モードで選べる用語。スロット ID で引く */
    termsBySlot?: Record<string, { id: string, plain: string, countries: number, certainty: string }[]>
  }>(),
  { mode: 'learn', draftSlots: () => [], termsBySlot: () => ({}) },
)

const emit = defineEmits<{ 'update:modelValue': [SlotRecord] }>()

const draftSet = computed(() => new Set(props.draftSlots))

function updateSlot(id: SlotId, entry: SlotEntry) {
  emit('update:modelValue', { ...props.modelValue, [id]: entry })
}

/** 管理モードの保存条件（要件 7-4, 7-5）。未確認が 1 件でも残れば保存できない */
const unconfirmedSlots = computed(() =>
  SLOT_DEFINITIONS.filter((d) => props.modelValue[d.id]?.confirmed !== true).map((d) => d.id),
)

defineExpose({ unconfirmedSlots })
</script>

<template>
  <section aria-labelledby="slot-form-heading">
    <h2 id="slot-form-heading" class="text-lg font-semibold text-slate-900">
      見えたものを書く（{{ SLOT_DEFINITIONS.length }} 項目）
    </h2>

    <!-- absent と unknown の違いを画面上でも説明する。失敗モードの診断の前提になる -->
    <dl class="my-3 rounded bg-slate-50 p-3 text-xs text-slate-700">
      <div v-for="(info, state) in SLOT_STATE_LABELS" :key="state" class="flex gap-2">
        <dt class="w-16 shrink-0 font-medium">
          {{ info.label }}
        </dt>
        <dd>{{ info.meaning }}</dd>
      </div>
      <p class="mt-2">
        「見えない」は<strong>判断の結果</strong>であり、「未確認」は<strong>観察漏れの候補</strong>である。
        分からないものを「見えない」にしないこと。
      </p>
    </dl>

    <div class="grid gap-3">
      <SlotField
        v-for="definition in SLOT_DEFINITIONS"
        :key="definition.id"
        :definition="definition"
        :model-value="modelValue[definition.id]"
        :mode="mode"
        :draft="draftSet.has(definition.id)"
        :term-options="termsBySlot[definition.id] ?? []"
        @update:model-value="updateSlot(definition.id, $event)"
      />
    </div>

    <p v-if="mode === 'admin'" class="mt-3 text-sm" :class="unconfirmedSlots.length ? 'text-amber-700' : 'text-slate-700'">
      未確認のスロット: {{ unconfirmedSlots.length }} 件
      <span v-if="unconfirmedSlots.length">（すべて確認するまで保存できない）</span>
    </p>
  </section>
</template>
