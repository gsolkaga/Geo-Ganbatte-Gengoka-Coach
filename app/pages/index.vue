<script setup lang="ts">
/**
 * 学習モード。出題読み込み → 観察と回答（同一画面）→ 採点 → 結果表示。
 *
 * **観察と回答を画面で分けない。**
 * 決め手スロットは観察欄を見ながら選ぶものであり、画面遷移で片方が隠れてはならない。
 * 当初は観察フェーズと回答フェーズを分けていたが、決め手スロットを選ぶ時点で
 * 自分が何を書いたか見えなくなるため誤りだった。
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

/**
 * `observe` と `answer` を `input` に統合した。**観察と回答は同じ画面で行う。**
 * 分けていた頃の「回答へ進む」「観察に戻る」ボタンは不要になったため削除した。
 */
type Phase = 'loading' | 'empty' | 'input' | 'grading' | 'result'

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

const emptyAnswer = (): AnswerDraft => ({
    candidates: [{ country: '', confidence: 'medium' }],
    decisiveSlot: null,
    reasoning: null,
})

const slots = ref<SlotRecord>(createEmptySlots())
const answer = ref<AnswerDraft>(emptyAnswer())

/**
 * 問題ごとの入力を保持する。**行き来しても消えない。**
 *
 * 正解タグ付けのために Street View だけ見て回りたい、という用途がある。
 * そのとき入力が消えると、書いたものを失うのが怖くて移動できなくなる。
 */
const slotsByQuestion = ref<Record<string, SlotRecord>>({})
const answerByQuestion = ref<Record<string, AnswerDraft>>({})

/**
 * 問題を移動する。**採点しない。**
 * 現在の入力を保存してから、移動先の入力を復元する。
 */
function goToQuestion(index: number) {
    const target = questions.value[index]
    if (!target) return

    const from = current.value
    if (from) {
        slotsByQuestion.value[from.id] = slots.value
        answerByQuestion.value[from.id] = answer.value
    }

    currentIndex.value = index
    slots.value = slotsByQuestion.value[target.id] ?? createEmptySlots()
    answer.value = answerByQuestion.value[target.id] ?? emptyAnswer()

    // 採点結果は前の問題のものなので隠す。消しはしない
    phase.value = 'input'
}

const countryOptions = ref<{ code: string, name: string }[]>([])
const countryNameByCode = computed(
    () => new Map(countryOptions.value.map((c) => [c.code, c.name])),
)

// ---- 過去の回答の読み込み（打ち直しをさせない） ----

/**
 * **14 スロットを埋める労力に対し、採点 1 回で使い捨てるのは不経済である。**
 * 保存済みの観察メモをフォームに戻す。
 *
 * 応答には `result` が含まれない（`server/api/runs.get.ts` で外している）。
 * **フィードバック本文には正解国が書かれているため、読み込み経路では返さない。**
 */
interface RunSummary {
    file: string
    id: string
    ts: string
    variant: 'v1' | 'v2'
    questionId: string
    describedSlots: number
    normalized: boolean
    candidates: AnswerDraft['candidates']
    answer: { slots: SlotRecord } & AnswerDraft
}

const runs = ref<RunSummary[]>([])
const selectedRunFile = ref<string>('')
const loadedFrom = ref<string | null>(null)

/** 現在の問題の記録を上に出す。他の問題の記録も選べるが、選ぶと移動する */
const runOptions = computed(() => {
    const id = current.value?.id
    return [...runs.value].sort((a, b) => {
        const ai = a.questionId === id ? 0 : 1
        const bi = b.questionId === id ? 0 : 1
        return ai - bi || b.ts.localeCompare(a.ts)
    })
})

/** 現在のフォームに何か書かれているか。上書きの確認を出すかどうかの判断に使う */
const hasInput = computed(() =>
    Object.values(slots.value).some((e) => e.state !== 'unknown' || Boolean(e.plain?.trim()))
    || answer.value.candidates.some((c) => c.country !== '')
    || Boolean(answer.value.reasoning?.trim()),
)

const runLabel = (r: RunSummary) => {
    const when = r.ts.slice(0, 16).replace('T', ' ')
    const picks = r.candidates.map((c) => `${c.country}(${c.confidence})`).join(' ') || '候補なし'
    return `${r.questionId}　${when}　${r.variant}　記述 ${r.describedSlots}/14　${picks}${r.normalized ? '　用語ID済' : ''}`
}

/**
 * 記録をフォームへ戻す。
 *
 * **上書きの確認を出す。** 書きかけの観察メモを黙って消すと、
 * 14 スロット分の入力が一度で失われる。取り消しは用意していない。
 *
 * 記録が別の問題のものなら、その問題へ移動してから流し込む。
 * 移動を先にしないと、`goToQuestion` の復元処理が流し込んだ値を上書きする。
 */
function loadRun() {
    const record = runs.value.find((r) => r.file === selectedRunFile.value)
    if (!record) return

    if (hasInput.value
        // eslint-disable-next-line no-alert
        && !confirm('いま入力している観察メモと回答を、選んだ記録で置き換える。取り消せない。続けるか？')) {
        return
    }

    const index = questions.value.findIndex((q) => q.id === record.questionId)
    if (index >= 0 && index !== currentIndex.value) goToQuestion(index)

    // **構造を共有しない。** 記録の配列をそのまま入れるとフォームの編集が一覧側にも及ぶ
    slots.value = structuredClone(record.answer.slots)
    answer.value = {
        candidates: record.answer.candidates.length
            ? structuredClone(record.answer.candidates)
            : emptyAnswer().candidates,
        decisiveSlot: record.answer.decisiveSlot,
        reasoning: record.answer.reasoning,
    }

    // 問題ごとの保持側にも反映する。移動して戻ってきたときに消えないため
    if (current.value) {
        slotsByQuestion.value[current.value.id] = slots.value
        answerByQuestion.value[current.value.id] = answer.value
    }

    loadedFrom.value = record.file
    phase.value = 'input'
}

/** フォームを空にする。**読み込みと同じく確認を出す** */
function clearInput() {
    // eslint-disable-next-line no-alert
    if (hasInput.value && !confirm('入力を空にする。取り消せない。続けるか？')) return
    slots.value = createEmptySlots()
    answer.value = emptyAnswer()
    loadedFrom.value = null
    if (current.value) {
        slotsByQuestion.value[current.value.id] = slots.value
        answerByQuestion.value[current.value.id] = answer.value
    }
}

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
        phase.value = questions.value.length ? 'input' : 'empty'

        // 記録の一覧は失敗しても出題の表示を止めない。**副機能である**
        try {
            runs.value = (await $fetch<{ runs: RunSummary[] }>('/api/runs')).runs
        }
        catch {
            runs.value = []
        }
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
    goToQuestion(currentIndex.value + 1)
}
</script>

<template>
    <!--
        入力中はページを画面高さに固定し、ペインだけを内部スクロールさせる。
        **高さをマジックナンバーで引き算しない。** ヘッダーの実高さと合わず、
        ページ全体が画面より高くなって外側のスクロールバーと余白が出る。
        flex で残りを埋めさせれば計算不要になる。

        採点後は結果を下に積むためページのスクロールを許す。
    -->
    <div
        class="mx-auto flex max-w-7xl flex-col gap-4 p-4"
        :class="phase === 'input' ? 'xl:h-dvh xl:overflow-hidden' : ''"
    >
        <header class="shrink-0 flex flex-wrap items-baseline justify-between gap-2">
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
            <!--
                回答せずに問題を移動できる。正解タグ付けのために風景だけ見て回る用途がある。
                入力は問題ごとに保持されるので、行き来しても消えない。
            -->
            <div class="shrink-0 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <button
                    type="button"
                    :disabled="currentIndex === 0 || grading.running.value"
                    class="rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-30"
                    @click="goToQuestion(currentIndex - 1)"
                >
                    ← 前の問題
                </button>

                <select
                    :value="currentIndex"
                    :disabled="grading.running.value"
                    class="rounded border border-slate-400 px-2 py-1 text-xs"
                    aria-label="問題を選ぶ"
                    @change="goToQuestion(Number(($event.target as HTMLSelectElement).value))"
                >
                    <option v-for="(q, i) in questions" :key="q.id" :value="i">
                        {{ i + 1 }} / {{ questions.length }}　{{ q.id }}（難易度 {{ q.difficulty }}）
                    </option>
                </select>

                <button
                    type="button"
                    :disabled="currentIndex + 1 >= questions.length || grading.running.value"
                    class="rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-30"
                    @click="goToQuestion(currentIndex + 1)"
                >
                    次の問題 →
                </button>

                <span class="text-xs text-slate-500">
                    採点せずに移動できる。入力は問題ごとに保持される
                </span>
            </div>

            <!--
                過去の回答をフォームへ戻す。
                **14 スロットを埋める労力に対し、採点 1 回で使い捨てるのは不経済である。**
                モデルや variant を変えて再採点するときに打ち直しをさせない。
            -->
            <div
                v-if="runs.length"
                class="shrink-0 flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-slate-50 px-2 py-1.5"
            >
                <label for="run-select" class="text-xs font-medium text-slate-700">
                    過去の回答を読み込む
                </label>
                <select
                    id="run-select"
                    v-model="selectedRunFile"
                    :disabled="grading.running.value"
                    class="min-w-0 flex-1 rounded border border-slate-400 px-2 py-1 text-xs"
                >
                    <option value="">
                        選択してください（{{ runs.length }} 件）
                    </option>
                    <option v-for="r in runOptions" :key="r.file" :value="r.file">
                        {{ runLabel(r) }}
                    </option>
                </select>
                <button
                    type="button"
                    :disabled="!selectedRunFile || grading.running.value"
                    class="rounded border border-slate-500 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-30"
                    @click="loadRun"
                >
                    フォームに入れる
                </button>
                <button
                    type="button"
                    :disabled="grading.running.value"
                    class="rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30"
                    @click="clearInput"
                >
                    入力を空にする
                </button>
                <span v-if="loadedFrom" class="text-xs text-emerald-700">
                    読み込み済み。編集して再採点できる
                </span>
                <!-- **正解は出さない。** 記録の判定結果とフィードバックは取得していない -->
                <span v-else class="text-xs text-slate-500">
                    選んだ記録の問題へ移動して流し込む。上書き前に確認する
                </span>
            </div>

            <!--
                3 ペイン。左上に風景（大きく）、左下に回答、右列すべてに観察欄。
                左列の縦比は 7:3。

                **観察と回答を同じ画面に置く。** 決め手スロットは観察欄を見ながら選ぶ。
                画面を分けると、選ぶ時点で自分が何を書いたか見えなくなる。

                高さを固定して各ペインを内部スクロールさせる。
                こうしないと 14 スロットの縦長さに引きずられて回答欄が画面外に出る。
            -->
            <!--
                採点後もペインの高さを保つ。**外すと崩れる。**
                右列（14 スロット）が全高に伸びて 2,000px を超え、左列は短いので
                巨大な空白ができる。内部スクロールを維持したまま、結果は下に積む。

                入力中は flex-1 で画面の残りを埋める（ページを固定しているため計算不要）。
                採点後はページ固定を外すので、比率で高さを与えて fr 行を解決させる。
            -->
            <div
                class="grid gap-4 xl:min-h-0 xl:grid-cols-[7fr_3fr]"
                :class="phase === 'input' ? 'xl:flex-1' : 'xl:h-[60dvh]'"
            >
                <div class="grid min-h-0 gap-4 xl:grid-rows-[7fr_3fr]">
                    <!-- 左上：風景 -->
                    <div class="flex min-h-0 flex-col gap-1">
                        <!--
                            既定は Embed（無料・無制限）。`NUXT_PUBLIC_STREETVIEW_MODE=nomove` で
                            JavaScript API に切り替わり移動を止められるが、Pro SKU で課金対象になる。
                        -->
                        <!-- 親の高さは全フェーズで確定しているので fill が効く -->
                        <div class="min-h-0 flex-1">
                            <StreetViewNoMove v-if="noMove" :pano-id="current.panoId" fill />
                            <StreetViewFrame v-else :pano-id="current.panoId" fill />
                        </div>
                        <p v-if="!noMove" class="shrink-0 text-xs text-slate-500">
                            この表示は移動できる。<strong>移動すると正解タグと一致しなくなる。</strong>
                            視点の回転だけで観察する。
                        </p>
                    </div>

                    <!-- 左下：回答。採点後も値を残し、編集だけ止める -->
                    <div class="min-h-0 overflow-y-auto pr-1">
                        <fieldset :disabled="phase !== 'input'" class="grid min-w-0 gap-3">
                            <AnswerPanel ref="answerPanel" v-model="answer" :country-options="countryOptions" />

                            <div class="rounded border border-slate-300 p-3">
                                <p class="text-sm font-medium text-slate-900">
                                    採点に使うモデル
                                </p>
                                <label class="mt-1 flex items-center gap-2 text-sm text-slate-800">
                                    <input v-model="multiModel" type="checkbox" class="size-4">
                                    4 モデルで同時に採点する（比較用）
                                </label>
                                <p class="mt-1 text-xs text-slate-600">
                                    既定は 1 モデル。同時採点は解釈のばらつきを見るための副機能である。
                                    <strong>消費: {{ selectedModels.length }} リクエスト</strong>
                                </p>
                            </div>

                            <button
                                type="button"
                                :disabled="answerPanel?.valid === false"
                                class="justify-self-start rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                @click="submit"
                            >
                                採点する（{{ selectedModels.length }} リクエスト）
                            </button>
                        </fieldset>
                    </div>
                </div>

                <!--
                    右列：観察欄。14 スロットは縦に長いので、この列だけを内部スクロールさせる。
                    採点後も入力した値を残す。消さない。
                    自分が何を書いたかを見ながら講評を読めないと、指摘の意味が分からない。
                -->
                <div class="min-h-0 overflow-y-auto pr-1">
                    <fieldset :disabled="phase !== 'input'" class="min-w-0">
                        <SlotForm v-model="slots" mode="learn" />
                    </fieldset>
                </div>
            </div>

            <!--
                採点中も同じブロックを描画する。`grading` を外すと
                ストリーミングの進捗が画面に出なくなる（打ち切りの兆候が見えなくなる）。
            -->
            <!--
                下段は全幅。採点中も描画する。`grading` を外すと
                ストリーミングの進捗が出なくなり、打ち切りの兆候が見えなくなる。
            -->
            <template v-if="phase === 'grading' || phase === 'result'">
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
