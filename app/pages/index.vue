<script setup lang="ts">
/**
 * 学習モード。出題読み込み → 観察 → 回答 → 採点 → 結果表示。
 *
 * 画面の優先順位を守る。**コード算出分（JudgementPanel）が主、`feedback` が従。**
 * `feedback` を最上部に大きく置かない。学習者が「次に何を見ればよいか」を得るのは
 * コード算出分である。
 *
 * **同時採点は既定にしない。** 明示的に選んだときだけ複数モデルへ投げる。
 * 学習者の注意が AI の比較に向くと、風景の観察が AI の観察になる。
 */
import { createEmptySlots } from '#shared/slots'
import { MAX_GRADING_MODELS } from '#shared/schemas'
import type { AnswerDraft, SlotRecord } from '#shared/types'

type Phase = 'loading' | 'observe' | 'answer' | 'grading' | 'result' | 'empty'

/** 比較対象のモデル。既定は先頭 1 件のみ */
const COMPARISON_MODELS = [
    'gpt-oss-120b',
    'preview/gemma-4-31B-it',
    'preview/Qwen3.6-35B-A3B',
    'preview/Kimi-K2.6',
] as const

const phase = ref<Phase>('loading')

/**
 * Street View の表示方式。既定は Embed（無料・無制限）。
 * `nomove` は Maps JavaScript API を使い移動を止められるが、Pro SKU で課金対象になる。
 */
const runtimeConfig = useRuntimeConfig()
const noMove = computed(() => String(runtimeConfig.public.streetviewMode ?? 'embed') === 'nomove')
const loadError = ref<string | null>(null)

const questions = ref<
    { id: string, panoId: string, fallback: { lat: number, lng: number, heading: number }, difficulty: number, copyright: string }[]
>([])
const currentIndex = ref(0)
const current = computed(() => questions.value[currentIndex.value] ?? null)

const slots = ref<SlotRecord>(createEmptySlots())
const answer = ref<AnswerDraft>({
    candidates: [{ country: '', confidence: 'medium' }],
    decisiveSlot: null,
    reasoning: null,
})

const countryOptions = ref<{ code: string, name: string }[]>([])
const countryNameByCode = computed(
    () => new Map(countryOptions.value.map((c) => [c.code, c.name])),
)

/** 同時採点は副機能。既定は 1 モデル */
const multiModel = ref(false)
const selectedModels = computed(() =>
    multiModel.value ? [...COMPARISON_MODELS].slice(0, MAX_GRADING_MODELS) : [COMPARISON_MODELS[0]],
)

const grading = useGrading()

onMounted(async () => {
    try {
        const [questionResponse, countryResponse] = await Promise.all([
            $fetch<{ questions: typeof questions.value }>('/api/questions'),
            $fetch<{ countries: { code: string, name: string }[] }>('/api/countries'),
        ])
        questions.value = questionResponse.questions
        countryOptions.value = countryResponse.countries
        phase.value = questions.value.length ? 'observe' : 'empty'
    }
    catch (error) {
        loadError.value = error instanceof Error ? error.message : String(error)
        phase.value = 'empty'
    }
})

const answerPanel = ref<{ valid: boolean } | null>(null)

async function submit() {
    if (!current.value) return
    phase.value = 'grading'
    await grading.grade({
        questionId: current.value.id,
        variant: 'v1',
        slots: slots.value,
        answer: answer.value,
        models: selectedModels.value,
    })
    phase.value = 'result'
}

/** 再採点は人間が押す。自動で再実行しない */
async function regrade(models: string[]) {
    if (!current.value) return
    await grading.grade({
        questionId: current.value.id,
        variant: 'v1',
        slots: slots.value,
        answer: answer.value,
        models,
    })
}

function nextQuestion() {
    if (currentIndex.value + 1 < questions.value.length) currentIndex.value += 1
    slots.value = createEmptySlots()
    answer.value = { candidates: [{ country: '', confidence: 'medium' }], decisiveSlot: null, reasoning: null }
    phase.value = 'observe'
}
</script>

<template>
    <div class="mx-auto grid max-w-7xl gap-4 p-4">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
                <h1 class="text-xl font-bold text-slate-900">
                    Geo-Ganbatte-Gengoka-Coach
                </h1>
                <p class="text-sm text-slate-600">
                    風景を見て、気づいたことを書く。書いたものを採点する。
                </p>
            </div>
            <p class="text-xs text-slate-500">
                このセッションの消費: {{ grading.requestsConsumed.value }} リクエスト
            </p>
        </header>

        <p v-if="phase === 'loading'" role="status">
            読み込み中…
        </p>

        <section v-else-if="phase === 'empty'" class="rounded border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
            <p v-if="loadError">
                出題の読み込みに失敗した: {{ loadError }}
            </p>
            <template v-else>
                <p class="font-medium">
                    出題データがまだ 1 件もない。
                </p>
                <p class="mt-1">
                    タスク 12 で <code>data/questions.json</code> に登録する。
                    <code>POST /api/questions</code> に座標と国コードを渡すと、
                    メタデータ照会で著作権表記を確認してから登録される。
                </p>
            </template>
        </section>

        <template v-else-if="current">
            <p class="text-sm text-slate-600">
                問題 {{ currentIndex + 1 }} / {{ questions.length }}（難易度 {{ current.difficulty }}）
            </p>

            <!--
                上段は 2 ペイン。左に風景、右に観察の記入欄。
                **風景を見ながらスロットを埋めるための配置である。**
                縦に積むと、見て書くたびにスクロールが発生して観察が途切れる。
            -->
            <div class="grid items-start gap-4 xl:grid-cols-2">
                <div class="xl:sticky xl:top-4">
                    <!--
                        既定は Embed（無料・無制限）。`NUXT_PUBLIC_STREETVIEW_MODE=nomove` で
                        JavaScript API に切り替わり移動を止められるが、Pro SKU で課金対象になる。
                    -->
                    <StreetViewNoMove v-if="noMove" :pano-id="current.panoId" />
                    <StreetViewFrame v-else :pano-id="current.panoId" />
                    <p v-if="!noMove" class="mt-1 text-xs text-slate-500">
                        この表示は移動できる。<strong>移動すると正解タグと一致しなくなる。</strong>
                        視点の回転だけで観察する。
                    </p>
                </div>

                <!--
                    採点後も入力した値を残す。消さない。
                    自分が何を書いたかを見ながら講評を読めないと、指摘の意味が分からない。
                    ただし記録は保存済みなので、採点後は編集を止める。
                -->
                <fieldset :disabled="phase === 'grading' || phase === 'result'" class="min-w-0">
                    <SlotForm v-model="slots" mode="learn" />
                </fieldset>
            </div>

            <button
                v-if="phase === 'observe'"
                type="button"
                class="justify-self-start rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                @click="phase = 'answer'"
            >
                回答へ進む
            </button>

            <!-- 下段は全幅。回答と、その下に採点結果を積む -->
            <template v-if="phase !== 'observe'">
                <fieldset :disabled="phase !== 'answer'" class="min-w-0">
                    <AnswerPanel ref="answerPanel" v-model="answer" :country-options="countryOptions" />
                </fieldset>
            </template>

            <template v-if="phase === 'answer'">
                <fieldset class="rounded border border-slate-300 p-3">
                    <legend class="px-1 text-sm font-medium text-slate-900">
                        採点に使うモデル
                    </legend>
                    <label class="flex items-center gap-2 text-sm text-slate-800">
                        <input v-model="multiModel" type="checkbox" class="size-4">
                        4 モデルで同時に採点する（比較用）
                    </label>
                    <p class="mt-1 text-xs text-slate-600">
                        既定は 1 モデル。同時採点は解釈のばらつきを見るための副機能である。
                        <strong>消費: {{ selectedModels.length }} リクエスト</strong>
                    </p>
                </fieldset>

                <div class="flex flex-wrap gap-2">
                    <button
                        type="button"
                        class="rounded border border-slate-400 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
                        @click="phase = 'observe'"
                    >
                        観察に戻る
                    </button>
                    <button
                        type="button"
                        :disabled="answerPanel?.valid === false"
                        class="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        @click="submit"
                    >
                        採点する（{{ selectedModels.length }} リクエスト）
                    </button>
                </div>
            </template>

            <!--
                採点中も同じブロックを描画する。`grading` を外すと
                ストリーミングの進捗が画面に出なくなる（打ち切りの兆候が見えなくなる）。
            -->
            <template v-else-if="phase === 'grading' || phase === 'result'">
                <!-- 主：コードで確定した判定。モデルを替えても変わらない -->
                <JudgementPanel
                    v-if="grading.judgement.value && grading.questionInfo.value"
                    :judgement="grading.judgement.value"
                    :country="grading.questionInfo.value.country"
                    :region="grading.questionInfo.value.region"
                    :country-name="countryNameByCode.get(grading.questionInfo.value.country) ?? null"
                />

                <p v-if="grading.error.value" class="rounded border border-rose-400 bg-rose-50 p-3 text-sm text-rose-800">
                    {{ grading.error.value }}
                </p>

                <!-- 従：AI の解釈。パネルごとに独立して描画する -->
                <section aria-labelledby="feedback-heading" class="grid gap-3">
                    <h2 id="feedback-heading" class="text-base font-semibold text-slate-900">
                        AI の解釈（モデルごと）
                    </h2>
                    <p class="text-xs text-slate-600">
                        上の判定は変わらない。ここだけがモデルによって変わる。
                        <span v-if="grading.activeModels.value.length > 1">
                            解釈が一致しないことは、記述の曖昧さを意味しない。
                        </span>
                    </p>
                    <ModelFeedbackPanel
                        v-for="model in grading.activeModels.value"
                        :key="model"
                        :model="model"
                        :progress="grading.progress.value[model] ?? null"
                        :result="grading.results.value[model] ?? null"
                        @regrade="regrade([$event])"
                    />
                </section>

                <p v-if="grading.runFile.value" class="text-xs text-slate-500">
                    記録: {{ grading.runFile.value }}
                </p>

                <div class="flex flex-wrap gap-2">
                    <button
                        type="button"
                        :disabled="grading.running.value"
                        class="rounded border border-slate-400 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                        @click="regrade(selectedModels)"
                    >
                        同じメモで再採点する（{{ selectedModels.length }} リクエスト）
                    </button>
                    <button
                        v-if="currentIndex + 1 < questions.length"
                        type="button"
                        class="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                        @click="nextQuestion"
                    >
                        次の問題へ
                    </button>
                </div>
            </template>
        </template>
    </div>
</template>
