<script setup lang="ts">
/**
 * 回答パネル。
 *
 * - 候補国は最大 3 件（要件 2-7）、1 件以上必須（要件 2-6）
 * - 各候補に確信度（高・中・低）を必須で指定（要件 2-8）
 * - **「高」を 2 件以上選択できないよう UI 側でも制御する**（要件 2-9）。Zod でも拒否する
 * - 決め手スロットの指定を候補全体で 1 件求める（要件 2-10）
 * - 総合推論の自由記述欄を任意項目として提供する（要件 2-11）
 *
 * 選択肢の文言は日本語にする。英語の選択肢は使わない。
 */
import {
  ANSWER_LABELS,
  CONFIDENCES,
  CONFIDENCE_LABELS,
  MAX_CANDIDATES,
  MAX_HIGH_CONFIDENCE,
  SLOT_DEFINITIONS,
} from '#shared/slots'
import type { Confidence, SlotId } from '#shared/slots'
import type { AnswerDraft } from '#shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: AnswerDraft
    /** 国定数テーブル（タスク 18）が揃えば候補の選択肢として渡す */
    countryOptions?: { code: string, name: string }[]
    disabled?: boolean
  }>(),
  { countryOptions: () => [], disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [AnswerDraft] }>()

const listId = useId()

function patch(partial: Partial<AnswerDraft>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

const highCount = computed(
  () => props.modelValue.candidates.filter((c) => c.confidence === 'high').length,
)

/** 既に「高」が上限に達している場合、他の候補では「高」を選べなくする */
function isConfidenceDisabled(index: number, confidence: Confidence): boolean {
  if (confidence !== 'high') return false
  if (props.modelValue.candidates[index]?.confidence === 'high') return false
  return highCount.value >= MAX_HIGH_CONFIDENCE
}

const canAdd = computed(() => props.modelValue.candidates.length < MAX_CANDIDATES)

function addCandidate() {
  if (!canAdd.value) return
  patch({
    candidates: [...props.modelValue.candidates, { country: '', confidence: 'medium' }],
  })
}

function removeCandidate(index: number) {
  patch({ candidates: props.modelValue.candidates.filter((_, i) => i !== index) })
}

function setCountry(index: number, value: string) {
  const candidates = props.modelValue.candidates.map((c, i) =>
    i === index ? { ...c, country: value.trim().toUpperCase() } : c,
  )
  patch({ candidates })
}

function setConfidence(index: number, confidence: Confidence) {
  const candidates = props.modelValue.candidates.map((c, i) =>
    i === index ? { ...c, confidence } : c,
  )
  patch({ candidates })
}

/** UI 側の入力チェック。確定判定は Zod（answerSchema）で行う */
const issues = computed(() => {
  const list: string[] = []
  const candidates = props.modelValue.candidates
  if (candidates.length === 0) list.push('候補国を 1 件以上入力する')
  if (candidates.some((c) => !/^[A-Z]{2}$/.test(c.country))) {
    list.push('国コードは英字 2 文字（ISO 3166-1 alpha-2）で入力する')
  }
  const codes = candidates.map((c) => c.country).filter(Boolean)
  if (new Set(codes).size !== codes.length) list.push('同じ国を重複して挙げることはできない')
  if (highCount.value > MAX_HIGH_CONFIDENCE) list.push('確信度「高」は 1 件までである')
  if (!props.modelValue.decisiveSlot) list.push('一番の決め手にした項目を 1 つ選ぶ')
  return list
})

const valid = computed(() => issues.value.length === 0)
defineExpose({ valid, issues })
</script>

<template>
  <section aria-labelledby="answer-panel-heading" class="grid gap-4">
    <h2 id="answer-panel-heading" class="text-lg font-semibold text-slate-900">
      回答
    </h2>

    <div>
      <p class="text-sm font-medium text-slate-900">
        {{ ANSWER_LABELS.candidates }}
      </p>
      <p class="text-xs text-slate-600">
        {{ ANSWER_LABELS.candidatesNote }} / {{ ANSWER_LABELS.confidenceNote }}
      </p>

      <datalist :id="listId">
        <option v-for="option in countryOptions" :key="option.code" :value="option.code">
          {{ option.name }}
        </option>
      </datalist>

      <ul class="mt-2 grid gap-2">
        <li
          v-for="(candidate, index) in modelValue.candidates"
          :key="index"
          class="flex flex-wrap items-end gap-3 rounded border border-slate-300 p-3"
        >
          <label class="grid gap-1">
            <span class="text-xs text-slate-700">国コード（例 JP）</span>
            <input
              :value="candidate.country"
              :list="countryOptions.length ? listId : undefined"
              :disabled="disabled"
              type="text"
              autocapitalize="characters"
              maxlength="2"
              size="4"
              class="w-20 rounded border border-slate-300 p-2 text-sm uppercase"
              @input="setCountry(index, ($event.target as HTMLInputElement).value)"
            >
          </label>

          <fieldset class="grid gap-1">
            <legend class="text-xs text-slate-700">
              {{ ANSWER_LABELS.confidence }}
            </legend>
            <div class="flex gap-2">
              <button
                v-for="confidence in CONFIDENCES"
                :key="confidence"
                type="button"
                role="radio"
                :aria-checked="candidate.confidence === confidence"
                :disabled="disabled || isConfidenceDisabled(index, confidence)"
                :title="CONFIDENCE_LABELS[confidence].meaning"
                class="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                :class="candidate.confidence === confidence
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
                @click="setConfidence(index, confidence)"
              >
                {{ CONFIDENCE_LABELS[confidence].label }}
              </button>
            </div>
          </fieldset>

          <p class="text-xs text-slate-500">
            {{ CONFIDENCE_LABELS[candidate.confidence].meaning }}
          </p>

          <button
            type="button"
            :disabled="disabled"
            class="ml-auto rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            @click="removeCandidate(index)"
          >
            この候補を消す
          </button>
        </li>
      </ul>

      <button
        type="button"
        :disabled="disabled || !canAdd"
        class="mt-2 rounded border border-slate-400 px-3 py-1 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        @click="addCandidate"
      >
        候補を追加（{{ modelValue.candidates.length }} / {{ MAX_CANDIDATES }}）
      </button>
    </div>

    <label class="grid gap-1">
      <span class="text-sm font-medium text-slate-900">{{ ANSWER_LABELS.decisiveSlot }}</span>
      <span class="text-xs text-slate-600">{{ ANSWER_LABELS.decisiveSlotNote }}</span>
      <select
        :value="modelValue.decisiveSlot ?? ''"
        :disabled="disabled"
        class="w-full max-w-xl rounded border border-slate-300 p-2 text-sm"
        @change="patch({ decisiveSlot: (($event.target as HTMLSelectElement).value || null) as SlotId | null })"
      >
        <option value="">
          選んでください
        </option>
        <option v-for="definition in SLOT_DEFINITIONS" :key="definition.id" :value="definition.id">
          {{ definition.label }}
        </option>
      </select>
    </label>

    <label class="grid gap-1">
      <span class="text-sm font-medium text-slate-900">{{ ANSWER_LABELS.reasoning }}</span>
      <textarea
        :value="modelValue.reasoning ?? ''"
        :disabled="disabled"
        rows="3"
        class="w-full rounded border border-slate-300 p-2 text-sm"
        @input="patch({ reasoning: ($event.target as HTMLTextAreaElement).value || null })"
      />
    </label>

    <ul v-if="issues.length" class="list-inside list-disc text-sm text-amber-700" role="status">
      <li v-for="issue in issues" :key="issue">
        {{ issue }}
      </li>
    </ul>
  </section>
</template>
