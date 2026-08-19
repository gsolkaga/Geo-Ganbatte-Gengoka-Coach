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
    /**
     * 管理モードで選べる用語（このスロットのものだけ）。
     * **該当国数の少ない順で渡す。** 絞り込み力の強い用語を先に見せる
     */
    termOptions?: { id: string, plain: string, countries: number, certainty: string }[]
  }>(),
  { mode: 'learn', draft: false, termOptions: () => [] },
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

/**
 * 視認可能性（管理モードのみ）。**既定値を置かない。**
 *
 * 既定を `easy` にすると「確認していない」が「見えるはず」に化けて、
 * タグ付けの手抜きが学習者の失敗として表示される（`SlotEntry.recognition` の注記）。
 * だから未選択という状態を残し、保存時に `validateAnswerKey` が弾く。
 */
const RECOGNITIONS = [
  { value: 'easy', label: '見ればすぐ', meaning: '見ればすぐ分かる' },
  { value: 'hard', label: '探せば', meaning: '意識して探せば見える' },
  { value: 'blind', label: '気づけない', meaning: '写っているが認識できない。見落としに数えない' },
] as const

function setRecognition(value: 'easy' | 'hard' | 'blind') {
  emit('update:modelValue', { ...props.modelValue, recognition: value })
}

/**
 * 用語 ID の開閉（管理モードのみ）。
 *
 * **人手で選べるようにしたのは、消費 0 で済むからである。**
 * `npm run normalize:keys` は AI に任せる代わりに出題数ぶんのリクエストを使う。
 * タグ付けの時点で分かっているなら、そこで入れておけば枠を使わない。
 */
const termSet = computed(() => new Set(props.modelValue.terms))

function toggleTerm(id: string) {
  const next = termSet.value.has(id)
    ? props.modelValue.terms.filter((t) => t !== id)
    : [...props.modelValue.terms, id]
  emit('update:modelValue', { ...props.modelValue, terms: next })
}

/** 「見えた」なのに記述が空。**`validateAnswerKey` が止める条件と同じ** */
const needsPlain = computed(
  () => props.mode === 'admin'
    && isVisible.value
    && (!props.modelValue.plain || props.modelValue.plain.trim() === ''),
)

const termsForDraft = computed(
  () => props.termOptions.filter((t) => termSet.value.has(t.id)),
)

/**
 * 選んだ用語から記述の**下書き**を作る。
 *
 * **自動では入れない。** 押したときだけ入れる。
 * 記述は「この地点に何が写っているか」であり、用語は「一般にどの国にあるか」である。
 * 黙って埋めると、辞書の一般語が**その地点の観察として記録される。**
 *
 * > **人間が書いたことにしてよいのは、人間が押したときだけである。**
 *
 * 入れた後は手で直せる。ここを空にしたまま保存する道は塞いである。
 */
function draftFromTerms() {
  const text = termsForDraft.value.map((t) => t.plain).join('、')
  if (text === '') return
  emit('update:modelValue', { ...props.modelValue, plain: text })
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

    <!--
      **記述が主で、用語は従である。** 管理モードでは下に用語ピッカーが付くので、
      ラベルが sr-only のままだと**選択式の欄に見えた**（実測 2026-08-19）。
      用語だけ選んで保存しようとして 7 件で弾かれた。

      > **必須の欄は、必須と書く。**
    -->
    <label class="block">
      <span v-if="mode === 'admin'" class="mb-1 block text-xs text-slate-700">
        何が見えたか（<strong>必須</strong>。これが学習者への説明の元になる）
      </span>
      <span v-else class="sr-only">{{ definition.label }} の記述</span>
      <textarea
        :id="fieldId"
        :value="modelValue.plain ?? ''"
        :placeholder="definition.placeholder"
        :disabled="!isVisible"
        :aria-describedby="`${fieldId}-hint`"
        :aria-invalid="needsPlain || undefined"
        rows="2"
        class="w-full rounded border p-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        :class="needsPlain ? 'border-2 border-amber-600 bg-amber-50' : 'border-slate-300'"
        @input="setPlain(($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <p v-if="!isVisible" class="mt-1 text-xs text-slate-500">
      「見えた」を選ぶと記述欄が使える
    </p>

    <!-- **保存できない理由をその場に出す。** 一覧の下まで行かないと分からない状態にしない -->
    <div v-else-if="needsPlain" class="mt-1 flex flex-wrap items-center gap-2">
      <p class="text-xs text-amber-800">
        記述が空だと保存できない。用語を選んでも記述の代わりにはならない
      </p>
      <button
        v-if="termsForDraft.length"
        type="button"
        class="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
        @click="draftFromTerms"
      >
        選んだ用語から下書きする
      </button>
    </div>

    <!--
      用語 ID。**該当国数を併記する。**
      「その表現では 91 カ国」が見えていないと、粗い用語を選んだことに気づけない。
    -->
    <fieldset v-if="mode === 'admin' && isVisible && termOptions.length" class="mt-2">
      <!--
        **記述の代わりではない。** 用語は絞り込みの計算（コード）に使い、
        記述は学習者への説明（AI）に使う。送り先が違うので片方では足りない。
      -->
      <legend class="text-xs text-slate-700">
        用語（任意。<strong>記述の代わりにはならない</strong>／該当国数は少ないほど強い）
      </legend>
      <div class="ggg-scroll mt-1 max-h-40 overflow-y-scroll rounded border border-slate-200 p-1">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="term in termOptions"
            :key="term.id"
            type="button"
            :aria-pressed="termSet.has(term.id)"
            :title="`${term.id}（${term.certainty}）`"
            class="rounded border px-2 py-0.5 text-xs focus:outline-2 focus:outline-offset-2 focus:outline-slate-900"
            :class="termSet.has(term.id)
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
            @click="toggleTerm(term.id)"
          >
            {{ term.plain }}
            <span :class="termSet.has(term.id) ? 'text-slate-300' : 'text-slate-500'">
              {{ term.countries }}
            </span>
          </button>
        </div>
      </div>
      <p v-if="!modelValue.terms.length" class="mt-1 text-xs text-slate-600">
        未選択（後から <code>npm run normalize:keys</code> でも埋められる）
      </p>
    </fieldset>

    <!--
      視認可能性は「見えた」のときだけ意味を持つ。
      写っていないものに「見やすさ」は無い（スキーマ側でも落としている）。
    -->
    <fieldset v-if="mode === 'admin' && isVisible" class="mt-2">
      <legend class="text-xs text-slate-700">
        この学習者に見えるか
      </legend>
      <div class="mt-1 flex flex-wrap gap-2">
        <button
          v-for="option in RECOGNITIONS"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="modelValue.recognition === option.value"
          :title="option.meaning"
          class="rounded border px-2 py-1 text-xs focus:outline-2 focus:outline-offset-2 focus:outline-slate-900"
          :class="modelValue.recognition === option.value
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
          @click="setRecognition(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <p v-if="!modelValue.recognition" class="mt-1 text-xs text-amber-700">
        未設定（保存できない）
      </p>
    </fieldset>

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
