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

/**
 * 過去の回答の選択肢の見出し。**出題 ID と保存日時だけにする。**
 *
 * 以前は `variant`・記述の件数・候補国・用語 ID の有無まで並べていた。
 * 40 件を超えると 1 行が長く、**どれを選ぶかの判断に使わない情報で埋まっていた。**
 *
 * `variant` を落としたのは、**戻すのが観察メモと回答だからである。**
 * v1 と v2 の違いは採点に何を渡したかであり、**入るスロットは同じ**である。
 * ここで見せると「v2 の回答」という存在しない区別を作ってしまう。
 *
 * > **選ぶための情報だけを出す。** 記録に入っている情報を全部出すことではない。
 *
 * 採点の記録を選ぶ方（`過去の採点`）は `variant` を残している。
 * あちらは**採点結果そのものを読み返す**ので、v1 と v2 で中身が違う。
 */
const runLabel = (r: RunSummary) => `${r.questionId}　${r.ts.slice(0, 16).replace('T', ' ')}`

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
 * v1 / v2 の切り替え。**既定は v2。**
 *
 * v2 は正解タグと用語辞書を渡す。**同じ画面・同じプロンプト骨格で、
 * 渡す情報だけを変える**のが対照実験の条件である（要件 9-3）。
 *
 * v2 では採点の前に観察メモを正規化する（1 リクエスト追加）。
 * 絞り込み力・積集合・次に見るべきスロットは**用語 ID の集合演算**で計算するため、
 * 正規化しないと全部「算出不能」になる（実測 2026-08-17）。
 *
 * ## 既定を v1 から v2 に変えた
 *
 * v1 は**対照実験のために残してある選択肢**であり、学習に使うものではない。
 * 正解タグも辞書も渡さないので、見落としの判定ができず、
 * 絞り込み力も積集合も「算出不能」になる。
 *
 * 既定を v1 にしていたため、**初めて触った人は最も情報の少ない採点を受ける**ことになった。
 * 「当たり障りのない褒め言葉しか返ってこない」のは v1 の性質である。
 *
 * > **既定は、比較のための条件ではなく、いちばん良い体験にする。**
 *
 * 消費は 1 → 2 に増える。押す前に画面へ出しているので黙って増えることはない。
 */
const variant = ref<Variant>('v2')

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

const answerPanel = ref<{ valid: boolean, issues: string[] } | null>(null)

/**
 * 採点を押せるか。**押せない理由も持つ。**
 *
 * ## 未定を「押してよい」と読まない
 *
 * 当初は `:disabled="answerPanel?.valid === false"` だった。
 * `answerPanel` が未束縛なら `undefined === false` は `false` になり、
 * **押せる状態になる。** 何も入力していなくても押せてしまう。
 *
 * > **未定を偽と読むと、危ない側に倒れる。** `=== true` で肯定を要求する。
 *
 * ## 押せない理由を出す
 *
 * 無効にするだけでは「押しても何も起きない」と同じである。
 * 何が足りないのかを並べる（`AnswerPanel` の `issues`）。
 */
const gradeBlockers = computed<string[]>(() => {
    const list: string[] = []
    if (phase.value !== 'input') list.push('採点結果を表示中である。編集するには問題を選び直す')
    if (grading.running.value) list.push('採点中である')
    const panel = answerPanel.value
    if (!panel) list.push('回答欄をまだ読み込めていない')
    else if (panel.valid !== true) list.push(...panel.issues)
    return list
})

const canGrade = computed(() => gradeBlockers.value.length === 0)

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
        ページの高さを固定しない。

        以前は入力中だけ `xl:h-dvh xl:overflow-hidden` で画面高さに固定し、
        ペインに残りを埋めさせていた。計算は不要になるが、
        **風景の縦横比が窓の形に引きずられた。**

        いまは風景が幅から 16:9 で高さを決めるので、固定する必要がない。
        高さは内容が決め、足りなければページがスクロールする。

        > **形を保ちたいものがあるなら、そこを基準にして周りを従わせる。**
    -->
    <!--
        **横幅を使う。** `max-w-7xl`（1280px）では広い画面で左右が余っていた。
        風景が幅から高さを決めるので、**幅を許すほど風景が大きくなる。**
        ただし無制限にはしない。観察欄の 1 行が長くなりすぎると読みにくい。
    -->
    <div class="mx-auto flex max-w-[110rem] flex-col gap-4 p-4">
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
            <!--
                **行き先を書く。** 以前は「タスク 12 で data/questions.json に登録する」
                と書いていた。開発中の覚え書きがそのまま残っていたもので、
                **読んだ人がこの画面から次にどこへ行けばよいか分からない。**

                > **直し方を知っている人に向けて書かない。**
            -->
            <template v-else>
                <p class="font-medium">
                    出題データがまだ 1 件もない。
                </p>
                <p class="mt-1">
                    <NuxtLink to="/datasets" class="underline">
                        データセット画面
                    </NuxtLink>
                    で問題集を取り込むか、
                    <NuxtLink to="/admin" class="underline">
                        編集モード
                    </NuxtLink>
                    で地点を登録する。
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

                <!--
                    この問題の過去の採点。**採点し直さずに読み返せる（消費 0）。**
                    講評を読むために 1 リクエストを使うのは無駄である。
                    フォームには触らない。「読み返しただけなのに入力が消えた」を作らない。

                    **並べたボタンから選択肢に変えた。** 記録が増えると横幅を食い、
                    問題移動の行が押し出されていた。**行の右端に寄せて 1 つにまとめる。**
                -->
                <div v-if="runsForCurrent.length" class="ml-auto flex items-center gap-2">
                    <label for="view-run-select" class="text-xs font-medium text-slate-700">
                        過去の採点
                    </label>
                    <select
                        id="view-run-select"
                        :value="viewingRun?.file ?? ''"
                        :disabled="grading.running.value"
                        class="rounded border border-slate-400 px-2 py-1 text-xs"
                        @change="viewRun(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">
                            {{ runsForCurrent.length }} 件（消費 0）
                        </option>
                        <option v-for="r in runsForCurrent" :key="r.file" :value="r.file">
                            {{ r.ts.slice(0, 16).replace('T', ' ') }}　{{ r.variant }}
                        </option>
                    </select>
                    <span v-if="viewRunError" role="alert" class="text-xs font-medium text-rose-700">
                        {{ viewRunError }}
                    </span>
                    <span v-else-if="viewingRun" class="text-xs text-slate-600">
                        <strong>表示中</strong>。入力は変えていない
                    </span>
                </div>
            </div>

            <!--
                2 列。左が風景（回答は上に被せる）、右が観察欄。横は 7 : 3。

                **観察と回答を同じ画面に置く。** 決め手の欄は観察欄を見ながら選ぶ。
                画面を分けると、選ぶ時点で自分が何を書いたか見えなくなる。

                ## 高さをビューポートで決めるのをやめた

                以前は「画面の残りを埋める」形だった（`xl:flex-1` とページの `h-dvh`）。
                そのため**窓の大きさで風景の縦横比が大きく変わった。**
                細長い窓では縦に伸び、横長の窓では潰れる。
                同じ地点でも**見えている範囲が変わるので、観察の練習にならない。**

                > **見る対象の形は、窓の形で決まってはならない。**

                いまは幅から 16:9 で高さを出す（`aspect-video`）。
                行の高さは左列が決め、右列はそれに従う。
            -->
            <!--
                ## 余った幅は右へ渡す

                以前は `grid-cols-[7fr_3fr]` で 7 : 3 に割っていた。
                風景の高さに上限があるため、**低い窓では上限が先に当たる。**
                そのとき風景は左列の中で中央に寄り、
                **左右に説明のつかない余白ができた**（実測 2026-08-18）。

                列の幅を先に決めていたことが原因である。
                `flex` にして、左列は「上限まで」とし、**余りを右列に渡す。**
                余白が消えるだけでなく、観察欄が広くなる。

                > **余った場所は、埋めるのではなく、使うものに渡す。**
            -->
            <div class="flex flex-col gap-4 xl:flex-row">
                <!--
                    左列：風景。**回答欄は上に被せる**（`AnswerSheet`）。
                    上下に割っていたときは、回答する瞬間に観察欄（右列）が細くて
                    読み返せなかった。風景は回答の瞬間には要らない。
                -->
                <!--
                    左列：風景。**幅の上限をここで持つ。**

                    `xl:w-[68%]` を望みの幅とし、`xl:max-w-[calc(78dvh*4/3)]` で上限を掛ける。
                    上限が当たったときは列そのものが縮むので、
                    **余りは右列（`xl:flex-1`）が取る。** 風景の左右に余白が出ない。
                -->
                <div class="flex min-w-0 flex-col gap-1 xl:w-[68%] xl:max-w-[calc(78dvh*4/3)]">
                    <!--
                        既定は Embed（無料・無制限）。`NUXT_PUBLIC_STREETVIEW_MODE=nomove` で
                        JavaScript API に切り替わり移動を止められるが、Pro SKU で課金対象になる。
                    -->
                    <!--
                        **幅から高さを決める。** `aspect-[4/3]` で比率を固定する。

                        16:9 から 4:3 に変えた。**同じ幅で上下が広く見える。**
                        観察するのは路面・ボラード・電柱・空であり、
                        横に広いより縦に見えた方が数えられるものが増える。

                        高さが伸びすぎないように上限を置くが、**上限は高さに掛けない。**
                        `max-height` で止めると、幅はそのままなので**比率が崩れる**
                        （`aspect-ratio` は幅と高さの両方が拘束されると無視される）。

                        代わりに**幅の上限を高さから逆算する**。上限は列側に持たせたので
                        （`xl:max-w-[calc(78dvh*4/3)]`）、ここは列の幅いっぱいで済む。
                        **中央寄せは要らない。** 列そのものが縮むので余白が出ない。

                        > **比率を保ちたいなら、拘束するのは片側だけにする。**

                        ## 縦積みのときだけ比率を諦める

                        `xl` 未満では左右に並べず縦に積む。そのとき風景は幅いっぱいなので、
                        4:3 だと**高さが幅の 3/4 になり、観察欄が画面の外まで押し下げられた**
                        （実測 2026-08-18）。

                        `max-xl:max-h-[55dvh]` で高さを止める。
                        幅は変えないので**比率は崩れる**（4:3 より横長になる）。

                        比率を守るなら幅を絞ることになるが、そうすると
                        **狭い画面で左右に余白ができる。** 直したばかりの問題が戻る。

                        > **狭い画面では、比率よりも両方が見えることを採る。**

                        比率の保証は `xl` 以上、つまり**実際に練習する画面幅**で効く。

                        枠と帯の組み立ては `AnswerSheet` が持つ。
                        **閉じている帯は枠の外に出る**ので、風景は全部見える。
                    -->
                    <AnswerSheet
                        v-model="answerSheetOpen"
                        :summary="answerSummary"
                        :readonly="phase !== 'input'"
                        frame-class="aspect-[4/3] w-full max-xl:max-h-[55dvh]"
                    >
                        <template #view>
                            <StreetViewNoMove v-if="noMove" :pano-id="current.panoId" fill />
                            <StreetViewFrame v-else :pano-id="current.panoId" fill />
                        </template>

                            <div class="grid min-w-0 gap-3">
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

                            </fieldset>

                            <!--
                                **押す前に消費数が分かること。** 実行後に知らせても遅い。

                                無効の条件は `canGrade` に集めた。**未定を「押してよい」と読まない。**
                                無効にするだけでは「押しても何も起きない」と同じなので、
                                足りないものを下に並べる。

                                **この行は `fieldset` の外に置く。**
                                中に入れると採点後（`phase !== 'input'`）に閉じるボタンまで
                                無効になり、**開けたのに閉じられない板**ができる。
                                採点ボタンは `canGrade` が自分で条件を持っているので、
                                `fieldset` に頼る必要がない。
                            -->
                            <div class="grid gap-1">
                                <div class="flex flex-wrap items-center gap-2">
                                    <!--
                                        **閉じるボタンを採点の隣にも置く。**

                                        板の見出しにも閉じるボタンがあるが、
                                        書き終わる場所は下端であり、そこから見出しまで戻るのは遠い。
                                        **操作が終わる場所に、次の操作を置く。**

                                        `Escape` でも閉じられるが、マウスで書いている人には見えない。
                                    -->
                                    <button
                                        type="button"
                                        class="rounded border border-slate-400 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                        @click="answerSheetOpen = false"
                                    >
                                        閉じる
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="!canGrade"
                                        :aria-describedby="canGrade ? undefined : 'grade-blockers'"
                                        class="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                        @click="submit"
                                    >
                                        {{ variant }} で採点する（{{ requestCost }} リクエスト）
                                    </button>
                                </div>
                                <ul
                                    v-if="!canGrade"
                                    id="grade-blockers"
                                    class="grid gap-0.5 text-xs text-amber-800"
                                >
                                    <li v-for="reason in gradeBlockers" :key="reason">
                                        ・{{ reason }}
                                    </li>
                                </ul>
                            </div>

                            <!-- 正規化の結果を隠さない。**失敗しても採点は続けるが、成功したことにしない** -->
                            <p v-if="normalizeNote" class="text-xs text-slate-700">
                                {{ normalizeNote }}
                            </p>
                            </div>
                    </AnswerSheet>
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
                <div class="relative min-w-0 xl:flex-1">
                <!--
                    **広い画面では行の高さに従わせる**（`xl:absolute xl:inset-0`）。
                    14 の欄は 2,000px を超えるので、そのまま置くと行の高さを支配する。
                    絶対配置にして**高さの決定に参加させない。**

                    **狭い画面では通常の流れに戻す。** 縦に積むので行の高さが無く、
                    絶対配置のままだと**高さ 0 になって観察欄が消える。**
                    代わりに上限を置いて内部スクロールさせる。

                    > **絶対配置は、親の高さが決まっている場所でしか使えない。**
                -->
                <div class="ggg-scroll max-h-[70dvh] overflow-y-scroll pr-1 xl:absolute xl:inset-0 xl:max-h-none">
                    <!--
                        過去の回答をフォームへ戻す。**書く場所の真上に置く。**

                        **14 の欄を埋める労力に対し、採点 1 回で使い捨てるのは不経済である。**
                        モデルや `variant` を変えて再採点するときに打ち直しをさせない。

                        以前は画面上部の独立した帯だった。**書く場所から遠かった。**
                        「打ち直したくない」と思うのは書き始める瞬間なので、
                        そのとき目に入る位置に置く。小さくして観察欄を圧迫しない。
                    -->
                    <div
                        v-if="runs.length"
                        class="mb-2 grid gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5"
                    >
                        <div class="flex items-center gap-1.5">
                            <label for="run-select" class="shrink-0 text-xs text-slate-600">
                                過去の回答
                            </label>
                            <select
                                id="run-select"
                                v-model="selectedRunFile"
                                :disabled="grading.running.value"
                                class="min-w-0 flex-1 rounded border border-slate-400 px-1.5 py-0.5 text-xs"
                            >
                                <option value="">
                                    選ぶ（{{ runs.length }} 件）
                                </option>
                                <option v-for="r in runOptions" :key="r.file" :value="r.file">
                                    {{ runLabel(r) }}
                                </option>
                            </select>
                            <button
                                type="button"
                                :disabled="!selectedRunFile || grading.running.value"
                                class="shrink-0 rounded border border-slate-500 bg-white px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30"
                                @click="loadRun"
                            >
                                入れる
                            </button>
                            <button
                                type="button"
                                :disabled="grading.running.value"
                                class="shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30"
                                @click="clearInput"
                            >
                                空に
                            </button>
                        </div>
                        <!-- **失敗を黙らせない。** コンソールにだけ出すと「押しても何も起きない」になる -->
                        <p v-if="loadRunError" role="alert" class="text-xs font-medium text-rose-700">
                            {{ loadRunError }}
                        </p>
                        <p v-else-if="loadedFrom" class="text-xs text-emerald-700">
                            読み込み済み。編集して再採点できる
                        </p>
                    </div>

                    <fieldset :disabled="phase !== 'input'" class="min-w-0">
                        <SlotForm v-model="slots" mode="learn" />
                    </fieldset>
                </div>
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
