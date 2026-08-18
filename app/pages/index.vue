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
// **画面の中にロジックを書かない。** 書くと型検査もテストも届かない
import {
    countNormalizedSlots,
    emptyAnswerDraft,
    hasFormInput,
    mergeNormalizedTerms,
    runToFormState,
} from '#shared/run-form'
import { COMPARISON_MODELS } from '#shared/models'
import type { AnswerDraft, SlotRecord, Variant } from '#shared/types'

/**
 * `observe` と `answer` を `input` に統合した。**観察と回答は同じ画面で行う。**
 * 分けていた頃の「回答へ進む」「観察に戻る」ボタンは不要になったため削除した。
 */
type Phase = 'loading' | 'empty' | 'input' | 'grading' | 'result'

/**
 * 比較対象のモデルは `shared/models.ts` にある（既定は先頭 1 件のみ）。
 * **ここに書き写すと比較スクリプトとずれる**
 * （実測 2026-08-17、`preview/` の接頭辞が抜けて 3 モデルが全件 400 になった）。
 */

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

const emptyAnswer = (): AnswerDraft => emptyAnswerDraft()

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

/**
 * いま使っているデータセットと進捗。**ヘッダーに出す。**
 *
 * 「何問目か」が画面に出ていないと、進捗を記録する意味が薄い。
 * 取得に失敗しても学習は続けられるので、**副機能として扱う**（null のまま出さない）。
 */
const datasetInfo = ref<{ name: string, answered: number, total: number } | null>(null)
const datasetStatus = computed(() => {
    const d = datasetInfo.value
    if (!d) return null
    return `${d.name}　${d.answered} / ${d.total} 問`
})

async function loadDatasetInfo() {
    try {
        const r = await $fetch<{
            datasets: { id: string, name: string, active: boolean, progress: { answered: number, total: number } }[]
        }>('/api/datasets')
        const active = r.datasets.find((d) => d.active)
        datasetInfo.value = active
            ? { name: active.name, answered: active.progress.answered, total: active.progress.total }
            : null
    }
    catch {
        datasetInfo.value = null
    }
}

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
const hasInput = computed(() => hasFormInput(slots.value, answer.value))

const runLabel = (r: RunSummary) => {
    const when = r.ts.slice(0, 16).replace('T', ' ')
    const picks = r.candidates.map((c) => `${c.country}(${c.confidence})`).join(' ') || '候補なし'
    return `${r.questionId}　${when}　${r.variant}　記述 ${r.describedSlots}/14　${picks}${r.normalized ? '　用語ID済' : ''}`
}

/** 読み込みが失敗したときに画面へ出す。**コンソールだけに出して黙らない** */
const loadRunError = ref<string | null>(null)

// ---- 過去の採点結果を読み返す（消費 0） ----

/**
 * 現在の問題に対する過去の記録。**採点し直さずに講評を読み返せるようにする。**
 *
 * 講評を読み返すのに 1 リクエスト消費するのは無駄である。
 * 記録が存在するということは、その問題には既に答えたということなので、
 * **正解が見えても新しく漏れるものは無い。**
 */
const runsForCurrent = computed(() =>
    runs.value
        .filter((r) => r.questionId === current.value?.id)
        .sort((a, b) => b.ts.localeCompare(a.ts)),
)

/** 読み返しているとき、それが過去の記録であることを画面に出す */
const viewingRun = ref<{ file: string, ts: string, variant: string } | null>(null)
const viewRunError = ref<string | null>(null)

/**
 * 過去の採点結果を下段に流し込む。**消費 0。**
 *
 * フォームには触らない。`loadRun`（フォームへ戻す）とは別の操作である。
 * 混ぜると「読み返しただけなのに入力が消えた」が起きる。
 */
async function viewRun(file: string) {
    viewRunError.value = null
    try {
        const r = await $fetch<{
            record: { ts: string, variant: string, questionId: string, result: unknown }
            question: { id: string, country: string, region: string | null } | null
        }>('/api/run', { query: { file } })
        grading.showSaved(r.record.result as never, r.question ?? undefined)
        viewingRun.value = { file, ts: r.record.ts, variant: r.record.variant }
        phase.value = 'result'
        answerSheetOpen.value = false
    }
    catch (error) {
        viewRunError.value = `読み込みに失敗した: ${error instanceof Error ? error.message : String(error)}`
    }
}

/**
 * 記録をフォームへ戻す。
 *
 * **上書きの確認を出す。** 書きかけの観察メモを黙って消すと、
 * 14 スロット分の入力が一度で失われる。取り消しは用意していない。
 *
 * 記録が別の問題のものなら、その問題へ移動してから流し込む。
 * 移動を先にしないと、`goToQuestion` の復元処理が流し込んだ値を上書きする。
 *
 * 変換は `#shared/run-form` に切り出してある。
 * **画面の中に書いていたら検査もテストもされない。**
 * 実際に `structuredClone` がリアクティブプロキシで例外になり、
 * **画面には何も起きずコンソールにだけエラーが出る**状態を作った。
 */
function loadRun() {
    loadRunError.value = null
    const record = runs.value.find((r) => r.file === selectedRunFile.value)
    if (!record) {
        loadRunError.value = '記録が見つからない。一覧を選び直す'
        return
    }

    if (hasInput.value
        // eslint-disable-next-line no-alert
        && !confirm('いま入力している観察メモと回答を、選んだ記録で置き換える。取り消せない。続けるか？')) {
        return
    }

    try {
        const index = questions.value.findIndex((q) => q.id === record.questionId)
        if (index >= 0 && index !== currentIndex.value) goToQuestion(index)

        // **構造を共有しない。** 記録をそのまま入れるとフォームの編集が一覧側にも及ぶ
        const state = runToFormState(record.answer)
        slots.value = state.slots
        answer.value = state.answer

        // 問題ごとの保持側にも反映する。移動して戻ってきたときに消えないため
        if (current.value) {
            slotsByQuestion.value[current.value.id] = slots.value
            answerByQuestion.value[current.value.id] = answer.value
        }

        loadedFrom.value = record.file
        phase.value = 'input'
    }
    catch (error) {
        // **例外を握り潰さない。** 握り潰すと「押しても何も起きない」になる
        loadRunError.value = `読み込みに失敗した: ${error instanceof Error ? error.message : String(error)}`
    }
}

/** フォームを空にする。**読み込みと同じく確認を出す** */
function clearInput() {
    // eslint-disable-next-line no-alert
    if (hasInput.value && !confirm('入力を空にする。取り消せない。続けるか？')) return
    slots.value = createEmptySlots()
    answer.value = emptyAnswer()
    loadedFrom.value = null
    loadRunError.value = null
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

/**
 * v1 / v2 の切り替え。**既定は v1。**
 *
 * v2 は正解タグと用語辞書を渡す。**同じ画面・同じプロンプト骨格で、
 * 渡す情報だけを変える**のが対照実験の条件である（要件 9-3）。
 *
 * v2 では採点の前に観察メモを正規化する（1 リクエスト追加）。
 * 絞り込み力・積集合・次に見るべきスロットは**用語 ID の集合演算**で計算するため、
 * 正規化しないと全部「算出不能」になる（実測 2026-08-17）。
 */
const variant = ref<Variant>('v1')

/** 実行前に消費数を出す（要件 26.1）。**押す前に分かること** */
const requestCost = computed(() => selectedModels.value.length + (variant.value === 'v2' ? 1 : 0))

const normalizeNote = ref<string | null>(null)

const grading = useGrading()

/**
 * v2 の前処理。観察メモを用語 ID に正規化する。
 *
 * **失敗しても採点は続ける。** 正規化は補助であり、
 * 落ちたときは正解タグだけの v2（絞り込みは算出不能）になる。
 * ただし**成功したことにしない。** 画面に結果を出す。
 */
async function normalizeBeforeGrading(): Promise<number> {
    normalizeNote.value = null
    if (!current.value) return 0
    try {
        const response = await $fetch<{
            requestsConsumed: number
            ok: boolean
            slots: { slot: string, terms: string[], none: boolean }[]
        }>('/api/normalize', {
            method: 'POST',
            body: { slots: slots.value, questionId: current.value.id },
        })
        if (!response.ok) {
            normalizeNote.value = '正規化に失敗した。絞り込み力と積集合は算出不能になる'
            return response.requestsConsumed
        }
        slots.value = mergeNormalizedTerms(slots.value, response.slots)
        const filled = countNormalizedSlots(slots.value)
        const none = response.slots.filter((s) => s.none).length
        normalizeNote.value = `正規化: 用語 ID が入ったスロット ${filled} 件`
            + (none ? ` / 辞書に無かった記述 ${none} 件（追加候補として記録した）` : '')
        return response.requestsConsumed
    }
    catch (error) {
        normalizeNote.value = `正規化に失敗した: ${error instanceof Error ? error.message : String(error)}`
        return 0
    }
}

onMounted(async () => {
    try {
        const [questionResponse, countryResponse] = await Promise.all([
            $fetch<{ questions: typeof questions.value }>('/api/questions'),
            $fetch<{ countries: { code: string, name: string }[] }>('/api/countries'),
        ])
        questions.value = questionResponse.questions
        countryOptions.value = countryResponse.countries
        phase.value = questions.value.length ? 'input' : 'empty'

        // 記録の一覧と進捗は失敗しても出題の表示を止めない。**副機能である**
        await Promise.all([refreshRuns(), loadDatasetInfo()])
    }
    catch (error) {
        loadError.value = error instanceof Error ? error.message : String(error)
        phase.value = 'empty'
    }
})

const answerPanel = ref<{ valid: boolean } | null>(null)

/**
 * 回答の被せ板の開閉。**既定は閉じている。**
 *
 * 開いた状態で始めると、風景を見る前に回答を書く画面が出る。
 * 順序は「見る → 書く → 答える」であり、最後だけが被せ板である。
 */
const answerSheetOpen = ref(false)

/**
 * 閉じているときに帯へ出す要約。**閉じても状態が読めること。**
 *
 * 開かないと何を答えたか分からない作りにすると、
 * 確認のために毎回開くことになり、被せた意味が無くなる。
 */
const answerSummary = computed(() => {
    const picks = answer.value.candidates
        .filter((c) => c.country)
        .map((c) => `${countryNameByCode.value.get(c.country) ?? c.country}（${c.confidence}）`)
    const decisive = answer.value.decisiveSlot
    const parts: string[] = []
    parts.push(picks.length ? `候補: ${picks.join('、')}` : '候補は未入力')
    if (decisive) parts.push(`決め手: ${decisive}`)
    parts.push(`${variant.value} / ${requestCost.value} リクエスト`)
    return parts.join('　')
})

/**
 * 問題を移動したら閉じる。**前の問題の回答を開いたまま見せない。**
 * 採点が終わったら開く。**結果を見る前に、何を答えたかを確認させる。**
 */
watch(currentIndex, () => {
    answerSheetOpen.value = false
    // **前の問題の講評を残さない。** 別の問題の結果を見ていると誤解する
    viewingRun.value = null
    viewRunError.value = null
})
watch(phase, (p) => { if (p === 'result') answerSheetOpen.value = false })

async function submit() {
    if (!current.value) return
    phase.value = 'grading'
    // **v2 は正規化を先に通す。** 用語 ID がないと絞り込みが算出不能になる
    if (variant.value === 'v2') await normalizeBeforeGrading()
    await grading.grade({
        questionId: current.value.id,
        variant: variant.value,
        slots: slots.value,
        answer: answer.value,
        models: selectedModels.value,
    })
    phase.value = 'result'
    // 採点が終わると記録が 1 件増え、進捗も進む。**画面の数字を実態に合わせる**
    viewingRun.value = null
    await Promise.all([refreshRuns(), loadDatasetInfo()])
}

/** 記録の一覧を取り直す。**副機能なので失敗しても学習を止めない** */
async function refreshRuns() {
    try {
        runs.value = (await $fetch<{ runs: RunSummary[] }>('/api/runs')).runs
    }
    catch { /* 一覧が古いままでも学習は続けられる */ }
}

/**
 * 再採点は人間が押す。自動で再実行しない。
 *
 * **正規化はやり直さない。** 同じ記述に同じ用語 ID が付くだけで、
 * 1 リクエストを無駄に消費する。既に `slots` に入っている。
 */
async function regrade(models: string[]) {
    if (!current.value) return
    await grading.grade({
        questionId: current.value.id,
        variant: variant.value,
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
            <div class="flex items-center gap-3">
                <!-- 進捗。**何問目かを言えることが目的である** -->
                <p v-if="datasetStatus" class="text-xs text-slate-600">
                    {{ datasetStatus }}
                </p>
                <p class="text-xs text-slate-500">
                    このセッションの消費: {{ grading.requestsConsumed.value }} リクエスト
                </p>
                <NuxtLink
                    to="/datasets"
                    class="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                    データセット
                </NuxtLink>
            </div>
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
                この問題の過去の採点結果。**採点し直さずに読み返せる（消費 0）。**
                講評を読むために 1 リクエスト使うのは無駄である。
                フォームには触らない。「読み返しただけなのに入力が消えた」を作らない。
            -->
            <div
                v-if="runsForCurrent.length"
                class="shrink-0 flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5"
            >
                <span class="text-xs font-medium text-slate-700">
                    この問題の過去の採点（{{ runsForCurrent.length }} 件・<strong>消費 0</strong>）
                </span>
                <button
                    v-for="r in runsForCurrent.slice(0, 6)"
                    :key="r.file"
                    type="button"
                    :disabled="grading.running.value"
                    class="rounded border px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30"
                    :class="viewingRun?.file === r.file ? 'border-slate-900 bg-slate-100 font-medium' : 'border-slate-400'"
                    @click="viewRun(r.file)"
                >
                    {{ r.ts.slice(5, 16).replace('T', ' ') }}　{{ r.variant }}
                </button>
                <span v-if="viewRunError" role="alert" class="text-xs font-medium text-rose-700">
                    {{ viewRunError }}
                </span>
                <span v-else-if="viewingRun" class="text-xs text-slate-600">
                    <strong>過去の記録を表示中</strong>（{{ viewingRun.ts.slice(0, 16).replace('T', ' ') }}）。
                    フォームの入力は変えていない
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
                <!-- **失敗を黙らせない。** コンソールにだけ出すと「押しても何も起きない」になる -->
                <span v-if="loadRunError" role="alert" class="text-xs font-medium text-rose-700">
                    {{ loadRunError }}
                </span>
                <span v-else-if="loadedFrom" class="text-xs text-emerald-700">
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
                <!--
                    左列：風景。**回答欄は上に被せる**（`AnswerSheet`）。
                    上下に割っていたときは、回答する瞬間に観察欄（右列）が細くて
                    読み返せなかった。風景は回答の瞬間には要らない。
                -->
                <div class="flex min-h-0 flex-col gap-1">
                    <!--
                        既定は Embed（無料・無制限）。`NUXT_PUBLIC_STREETVIEW_MODE=nomove` で
                        JavaScript API に切り替わり移動を止められるが、Pro SKU で課金対象になる。
                    -->
                    <!-- 被せ板の基準にするため `relative` を持つ -->
                    <div class="relative min-h-0 flex-1 overflow-hidden rounded">
                        <StreetViewNoMove v-if="noMove" :pano-id="current.panoId" fill />
                        <StreetViewFrame v-else :pano-id="current.panoId" fill />

                        <AnswerSheet
                            v-model="answerSheetOpen"
                            :summary="answerSummary"
                            :readonly="phase !== 'input'"
                        >
                            <fieldset :disabled="phase !== 'input'" class="grid min-w-0 gap-3">
                            <AnswerPanel ref="answerPanel" v-model="answer" :country-options="countryOptions" />

                            <!--
                                v1 / v2 の切り替え。**画面もプロンプト骨格も同一で、渡す情報だけが違う。**
                                UI を分けると対照実験（要件 9-3）が無効になる。
                            -->
                            <div class="rounded border border-slate-300 p-3">
                                <p class="text-sm font-medium text-slate-900">
                                    採点に渡す情報
                                </p>
                                <div class="mt-1 grid gap-1 text-sm text-slate-800">
                                    <label class="flex items-start gap-2">
                                        <input v-model="variant" type="radio" value="v1" class="mt-1 size-4">
                                        <span>
                                            <strong>v1</strong>：観察メモと回答だけを渡す
                                            <span class="block text-xs text-slate-600">
                                                正解タグも用語辞書も渡さない。見落としの判定はできない
                                            </span>
                                        </span>
                                    </label>
                                    <label class="flex items-start gap-2">
                                        <input v-model="variant" type="radio" value="v2" class="mt-1 size-4">
                                        <span>
                                            <strong>v2</strong>：正解タグと用語辞書も渡す
                                            <span class="block text-xs text-slate-600">
                                                採点の前に観察メモを用語 ID へ正規化する（<strong>+1 リクエスト</strong>）。
                                                絞り込み力と積集合はここで初めて計算できる
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </div>

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
                                </p>
                            </div>

                            <!-- **押す前に消費数が分かること。** 実行後に知らせても遅い -->
                            <button
                                type="button"
                                :disabled="answerPanel?.valid === false"
                                class="justify-self-start rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                @click="submit"
                            >
                                {{ variant }} で採点する（{{ requestCost }} リクエスト）
                            </button>

                            <!-- 正規化の結果を隠さない。**失敗しても採点は続けるが、成功したことにしない** -->
                            <p v-if="normalizeNote" class="text-xs text-slate-700">
                                {{ normalizeNote }}
                            </p>
                            </fieldset>
                        </AnswerSheet>
                    </div>
                    <p v-if="!noMove" class="shrink-0 text-xs text-slate-500">
                        この表示は移動できる。<strong>移動すると正解タグと一致しなくなる。</strong>
                        視点の回転だけで観察する。
                    </p>
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
