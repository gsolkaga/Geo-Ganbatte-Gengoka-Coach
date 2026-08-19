<script setup lang="ts">
/**
 * 編集モード（タスク 19）。**教材そのものを作る画面である。**
 *
 * ## 2 つのことをする
 *
 *   新しい問題集を作る    出題を空にして、名前を付けて始める（辞書は引き継ぐ）
 *   いまの問題集を編集する 地点を足し、14 スロットに正解タグを付ける
 *
 * どちらも**消費 0**（AI を呼ばない）。
 *
 * ## なぜ画面にしたか
 *
 * それまでの手順はこうだった。
 *
 *   node tools/add-question.mjs --country ZA --lat ... --lng ...
 *   → data/questions.json を手で編集して 14 スロットを埋める
 *
 * これだと**風景を見ながら書けない。** 別の窓で Street View を開き、
 * JSON に戻って打つ。とくに視認可能性（`recognition`）は
 * **画面を見ないと判断できない項目**なので、手編集と相性が悪い。
 *
 * > **判断に必要なものが見えていない場所で、判断させない。**
 *
 * ## 学習画面と同じ部品を、違う色で使う
 *
 * `SlotForm` を `mode="admin"` で使い回す。**同じ 14 スロットの形でタグを付ける**
 * ので、学習者の回答と機械的に突き合わせられる。
 *
 * ただし**部品が同じだと画面を取り違える。** 学習画面は白地とスレート、
 * この画面は濃い藍と琥珀にしてある（`main.css` の `--color-edit-*`）。
 * 明るさ違いではなく色相を変えたのは、**画面写真でも区別できるようにする**ためである。
 *
 * > **取り違えると教材が壊れる画面は、見た瞬間に違うと分かること。**
 *
 * **認証がない。** ローカル実行前提である（README の「なぜローカル実行専用か」）。
 */
import { createEmptySlots } from '#shared/slots'
import { SLOT_DEFINITIONS } from '#shared/slots'
import { answerKeyProgress, validateAnswerKey } from '#shared/answer-key'
import type { SlotId } from '#shared/slots'
import type { Question, SlotRecord } from '#shared/types'

useHead({ title: '編集モード | GGG' })

type TermOption = { id: string, plain: string, countries: number, certainty: string }

interface Summary {
    id: string
    country: string
    difficulty: number
    captureDate: string | null
    decisiveSlots: SlotId[]
    progress: { confirmed: number, visible: number, withTerms: number, total: number }
}

interface DatasetItem {
    id: string
    name: string
    author: string
    questionCount: number
    active: boolean
    onShelf: boolean
}

const runtimeConfig = useRuntimeConfig()
const noMove = computed(() => String(runtimeConfig.public.streetviewMode ?? 'embed') === 'nomove')

/** 上のモード。**既定は編集**（作る方を既定にすると、開いた勢いで空にできてしまう） */
const mode = ref<'edit' | 'create'>('edit')

const summaries = ref<Summary[]>([])
const countryNameByCode = ref(new Map<string, string>())
const datasets = ref<DatasetItem[]>([])
const loadError = ref<string | null>(null)

const activeDataset = computed(() => datasets.value.find((d) => d.active) ?? null)
const shelf = computed(() => datasets.value.filter((d) => d.onShelf && !d.active))

/** 問題集ぜんたいのタグの埋まり具合。**1 問ずつ開かなくても残りが分かること** */
const setProgress = computed(() => {
    const total = summaries.value.reduce((n, s) => n + s.progress.total, 0)
    const confirmed = summaries.value.reduce((n, s) => n + s.progress.confirmed, 0)
    const done = summaries.value.filter((s) => s.progress.confirmed === s.progress.total).length
    return { total, confirmed, done, questions: summaries.value.length }
})

const selectedId = ref<string>('')
const question = ref<Question | null>(null)
const termsBySlot = ref<Record<string, TermOption[]>>({})

const slots = ref<SlotRecord>(createEmptySlots() as SlotRecord)
const decisiveSlots = ref<SlotId[]>([])
const note = ref<string>('')

const saving = ref(false)
const saveMessage = ref<string | null>(null)
const saveErrors = ref<string[]>([])

/** 下書き（AI・国定数テーブル由来）はグレーで出す。**確認済みと見分けられること** */
const draftSlots = computed<SlotId[]>(() => {
    if (!question.value) return []
    if (question.value.source.draftBy.length === 0) return []
    return (Object.keys(slots.value) as SlotId[]).filter(
        (id) => slots.value[id]?.confirmed !== true && slots.value[id]?.state !== 'unknown',
    )
})

const progress = computed(() => answerKeyProgress(slots.value))

/**
 * 保存できるかを**サーバと同じ関数で**判定する。
 * 押してから 422 で弾かれるのではなく、押す前に理由が見えている状態にする。
 */
const localIssues = computed(() => {
    const lookup = {
        slotOf: (termId: string): SlotId | undefined => {
            for (const [slot, list] of Object.entries(termsBySlot.value)) {
                if (list.some((t) => t.id === termId)) return slot as SlotId
            }
            return undefined
        },
    }
    return validateAnswerKey(slots.value, decisiveSlots.value, lookup)
})

const canSave = computed(() => question.value !== null && localIssues.value.errors.length === 0)

async function loadList() {
    loadError.value = null
    try {
        const [list, countries, library] = await Promise.all([
            $fetch<{ questions: Summary[] }>('/api/answer-key'),
            $fetch<{ countries: { code: string, name: string }[] }>('/api/countries'),
            $fetch<{ datasets: DatasetItem[] }>('/api/datasets'),
        ])
        summaries.value = list.questions
        countryNameByCode.value = new Map(countries.countries.map((c) => [c.code, c.name]))
        datasets.value = library.datasets
    }
    catch (error) {
        loadError.value = error instanceof Error ? error.message : String(error)
    }
}

async function loadQuestion(id: string) {
    if (!id) {
        question.value = null
        return
    }
    saveMessage.value = null
    saveErrors.value = []
    try {
        const r = await $fetch<{ question: Question, termsBySlot: Record<string, TermOption[]> }>(
            '/api/answer-key',
            { query: { questionId: id } },
        )
        question.value = r.question
        termsBySlot.value = r.termsBySlot
        // **構造を共有しない。** そのまま入れると編集が一覧側にも及ぶ
        slots.value = JSON.parse(JSON.stringify(r.question.slots)) as SlotRecord
        decisiveSlots.value = [...r.question.decisiveSlots]
        note.value = r.question.note ?? ''
    }
    catch (error) {
        loadError.value = error instanceof Error ? error.message : String(error)
    }
}

watch(selectedId, (id) => { loadQuestion(id) })

function toggleDecisive(id: SlotId) {
    decisiveSlots.value = decisiveSlots.value.includes(id)
        ? decisiveSlots.value.filter((s) => s !== id)
        : [...decisiveSlots.value, id]
}

/** 「見えた」にしたスロットだけを決め手の候補にする */
const visibleSlots = computed(() =>
    SLOT_DEFINITIONS.filter((d) => slots.value[d.id]?.state === 'visible'),
)

async function save() {
    if (!question.value || !canSave.value) return
    saving.value = true
    saveMessage.value = null
    saveErrors.value = []
    try {
        const r = await $fetch<{ saved: boolean, warnings: string[] }>('/api/answer-key', {
            method: 'POST',
            body: {
                questionId: question.value.id,
                slots: slots.value,
                decisiveSlots: decisiveSlots.value,
                note: note.value.trim() === '' ? null : note.value,
            },
        })
        saveMessage.value = r.warnings.length
            ? `保存した（注意 ${r.warnings.length} 件）`
            : '保存した'
        saveErrors.value = r.warnings
        await loadList()
    }
    catch (error) {
        // **サーバが挙げた理由をそのまま出す。** 「保存に失敗」だけでは直せない
        const data = (error as { data?: { data?: { errors?: string[] } } }).data?.data
        saveErrors.value = data?.errors ?? [
            error instanceof Error ? error.message : String(error),
        ]
        saveMessage.value = '保存しなかった'
    }
    finally {
        saving.value = false
    }
}

// ---- 新しい問題集を作る ----

const newSet = ref({ name: '', author: '', description: '' })
/** **一段では作らせない。** 出題が空になる操作なので、何が起きるかを見せてから押させる */
const confirming = ref(false)
const creating = ref(false)
const createMessage = ref<string | null>(null)
const createFailure = ref<string | null>(null)

const canCreate = computed(
    () => newSet.value.name.trim() !== '' && newSet.value.author.trim() !== '',
)

async function createSet() {
    if (!canCreate.value) return
    creating.value = true
    createMessage.value = null
    createFailure.value = null
    try {
        const r = await $fetch<{
            id: string
            backup: string
            created: { name: string, termCount: number }
        }>('/api/datasets', {
            method: 'POST',
            body: {
                action: 'create',
                name: newSet.value.name.trim(),
                author: newSet.value.author.trim(),
                description: newSet.value.description.trim() || undefined,
            },
        })
        createMessage.value = `作った: ${r.created.name}（${r.id}）`
            + `／辞書 ${r.created.termCount} 語を引き継いだ`
            + `／控え ${r.backup}`
        confirming.value = false
        newSet.value = { name: '', author: '', description: '' }
        selectedId.value = ''
        question.value = null
        await loadList()
        // 作ったら編集に移る。**次にすることは地点の登録である**
        mode.value = 'edit'
    }
    catch (error) {
        const message = (error as { statusMessage?: string }).statusMessage
            ?? (error instanceof Error ? error.message : String(error))
        createFailure.value = `作らなかった: ${message}`
    }
    finally {
        creating.value = false
    }
}

// ---- 問題集を切り替える ----

const switchTarget = ref('')
const switching = ref(false)
const switchMessage = ref<string | null>(null)

/** 棚から戻す。**控えを取ってから入れ替える**（`POST /api/datasets` の `use`） */
async function switchSet() {
    if (!switchTarget.value) return
    switching.value = true
    switchMessage.value = null
    try {
        const r = await $fetch<{ id: string, backup: string, questionCount: number }>(
            '/api/datasets',
            { method: 'POST', body: { action: 'use', id: switchTarget.value } },
        )
        switchMessage.value = `切り替えた: ${r.id}（${r.questionCount} 問）／控え ${r.backup}`
        switchTarget.value = ''
        selectedId.value = ''
        question.value = null
        await loadList()
    }
    catch (error) {
        const message = (error as { statusMessage?: string }).statusMessage
            ?? (error instanceof Error ? error.message : String(error))
        switchMessage.value = `切り替えなかった: ${message}`
    }
    finally {
        switching.value = false
    }
}

// ---- 新しい地点を登録する ----

const draft = ref({ country: '', lat: '', lng: '', heading: '0', difficulty: '2', note: '' })
const adding = ref(false)
const addMessage = ref<string | null>(null)

/**
 * 座標から出題を作る。**pano の解決と著作権の確認はサーバが行う**
 * （`POST /api/questions`。画像取得エンドポイントは呼ばない）。
 */
async function addQuestion() {
    adding.value = true
    addMessage.value = null
    try {
        const r = await $fetch<{ created: { id: string }, reresolved: boolean }>('/api/questions', {
            method: 'POST',
            body: {
                country: draft.value.country.trim().toUpperCase(),
                lat: Number(draft.value.lat),
                lng: Number(draft.value.lng),
                heading: Number(draft.value.heading || '0'),
                difficulty: Number(draft.value.difficulty),
                note: draft.value.note.trim() === '' ? null : draft.value.note,
            },
        })
        addMessage.value = `登録した: ${r.created.id}`
            + (r.reresolved ? '（座標から再解決した）' : '')
        await loadList()
        selectedId.value = r.created.id
        draft.value = { country: '', lat: '', lng: '', heading: '0', difficulty: '2', note: '' }
    }
    catch (error) {
        const message = (error as { statusMessage?: string }).statusMessage
            ?? (error instanceof Error ? error.message : String(error))
        addMessage.value = `登録しなかった: ${message}`
    }
    finally {
        adding.value = false
    }
}

onMounted(loadList)
</script>

<template>
    <!--
        **色で場所を伝える。** 学習画面（白地・スレート）と 1 色も共有していない。
        枠の内側にある白いカードは `SlotForm` などの部品で、学習画面と同じ形である。
    -->
    <div class="min-h-dvh bg-edit-bg text-edit-text">
        <!-- 常時出す帯。**スクロールしても編集中だと分かる** -->
        <div class="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b-4 border-edit-accent bg-edit-panel px-4 py-2">
            <div class="flex flex-wrap items-center gap-2">
                <span class="rounded bg-edit-accent px-2 py-0.5 text-xs font-bold text-edit-accent-text">
                    編集モード
                </span>
                <span class="text-sm font-semibold">教材を作る・直す</span>
                <span class="text-xs text-edit-muted">すべて消費 0（AI を呼ばない）</span>
            </div>
            <NuxtLink
                to="/"
                class="rounded border border-edit-border px-2 py-1 text-xs text-edit-text hover:bg-edit-bg"
            >
                学習画面へ戻る
            </NuxtLink>
        </div>

        <div class="mx-auto flex max-w-[110rem] flex-col gap-4 p-4">
            <p v-if="loadError" role="alert" class="rounded border border-rose-300 bg-rose-950 p-3 text-sm text-rose-100">
                {{ loadError }}
            </p>

            <!-- いま何を編集しているか -->
            <section class="rounded border border-edit-border bg-edit-panel p-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 class="text-base font-semibold">
                        いま編集している問題集
                    </h2>
                    <span class="text-xs text-edit-muted">
                        {{ setProgress.questions }} 問／タグ完了 {{ setProgress.done }} 問／確認 {{ setProgress.confirmed }} / {{ setProgress.total }} スロット
                    </span>
                </div>

                <p v-if="activeDataset" class="mt-1 text-sm">
                    <strong class="text-edit-accent">{{ activeDataset.name }}</strong>
                    <span class="text-edit-muted">／{{ activeDataset.author }}／{{ activeDataset.id }}</span>
                    <span v-if="!activeDataset.onShelf" class="text-edit-muted">（棚には無い）</span>
                </p>
                <p v-else class="mt-1 text-sm text-edit-muted">
                    アクティブな問題集の記録が無い（<code>data/library.json</code>）
                </p>

                <!-- 棚から戻す。**新しく作っても前のものは残っている** -->
                <div v-if="shelf.length" class="mt-2 flex flex-wrap items-center gap-2">
                    <label for="admin-switch" class="text-xs text-edit-muted">棚にある問題集に切り替える</label>
                    <select
                        id="admin-switch"
                        v-model="switchTarget"
                        class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text"
                    >
                        <option value="">
                            選ぶ
                        </option>
                        <option v-for="d in shelf" :key="d.id" :value="d.id">
                            {{ d.name }}（{{ d.questionCount }} 問）
                        </option>
                    </select>
                    <button
                        type="button"
                        :disabled="!switchTarget || switching"
                        class="rounded border border-edit-border px-2 py-1 text-xs hover:bg-edit-bg disabled:cursor-not-allowed disabled:opacity-40"
                        @click="switchSet"
                    >
                        {{ switching ? '切り替え中…' : '切り替える（控えを取る）' }}
                    </button>
                </div>
                <p v-if="switchMessage" class="mt-1 text-xs text-edit-muted">
                    {{ switchMessage }}
                </p>
            </section>

            <!-- モード -->
            <div role="tablist" aria-label="編集の種類" class="flex flex-wrap gap-2">
                <button
                    v-for="tab in ([
                        { id: 'edit', label: 'いまの問題集を編集する' },
                        { id: 'create', label: '新しい問題集を作る' },
                    ] as const)"
                    :key="tab.id"
                    type="button"
                    role="tab"
                    :aria-selected="mode === tab.id"
                    class="rounded border px-3 py-1.5 text-sm"
                    :class="mode === tab.id
                        ? 'border-edit-accent bg-edit-accent font-semibold text-edit-accent-text'
                        : 'border-edit-border bg-edit-panel text-edit-text hover:bg-edit-bg'"
                    @click="mode = tab.id"
                >
                    {{ tab.label }}
                </button>
            </div>

            <!-- ================= 新しい問題集を作る ================= -->
            <section v-if="mode === 'create'" class="rounded border border-edit-border bg-edit-panel p-3">
                <h2 class="text-base font-semibold">
                    新しい問題集を作る
                </h2>
                <p class="mt-1 text-sm text-edit-muted">
                    出題が空の問題集を作り、それをアクティブにする。
                    <strong class="text-edit-text">辞書は引き継ぐ</strong>ので、
                    同じ 262 語のまま別の地点で測れる（汎化テストの前提）
                </p>

                <div class="mt-3 grid max-w-xl gap-2">
                    <label class="grid gap-1">
                        <span class="text-xs text-edit-muted">問題集の名前（必須。出典表示に使う）</span>
                        <input
                            v-model="newSet.name"
                            placeholder="Generalization 10"
                            class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text"
                        >
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs text-edit-muted">作成者（必須。CC BY の帰属表示に使う）</span>
                        <input
                            v-model="newSet.author"
                            placeholder="gsol-kaga"
                            class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text"
                        >
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs text-edit-muted">説明（任意）</span>
                        <input
                            v-model="newSet.description"
                            class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text"
                        >
                    </label>
                </div>

                <!-- **何が起きるかを見せてから押させる。** 出題が空になる操作である -->
                <div v-if="!confirming" class="mt-3">
                    <button
                        type="button"
                        :disabled="!canCreate"
                        class="rounded bg-edit-accent px-4 py-2 text-sm font-semibold text-edit-accent-text hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        @click="confirming = true"
                    >
                        作る前に、何が起きるか見る
                    </button>
                    <p v-if="!canCreate" class="mt-1 text-xs text-edit-muted">
                        名前と作成者を入れる
                    </p>
                </div>

                <div v-else class="mt-3 rounded border-2 border-edit-accent bg-edit-bg p-3">
                    <p class="text-sm font-semibold text-edit-accent">
                        これから起きること
                    </p>
                    <ul class="mt-1 grid gap-0.5 text-sm">
                        <li>
                            ・<code>data/questions.json</code> の
                            <strong>{{ setProgress.questions }} 問が外れて、出題 0 件で始まる</strong>
                        </li>
                        <li>・その前に控えを取る（<code>.backup/&lt;日時&gt;/</code>）</li>
                        <li>
                            ・<strong>辞書（<code>data/glossary.json</code>）は変更しない。</strong>
                            指紋が一致したままになる
                        </li>
                        <li>
                            ・いまの問題集
                            <template v-if="activeDataset?.onShelf">
                                <strong>「{{ activeDataset.name }}」は棚に残る</strong>ので、上の切り替えで戻せる
                            </template>
                            <template v-else>
                                は<strong>棚に無い</strong>。控えからしか戻せない
                            </template>
                        </li>
                    </ul>
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            :disabled="creating"
                            class="rounded bg-edit-accent px-4 py-2 text-sm font-semibold text-edit-accent-text hover:opacity-90 disabled:opacity-40"
                            @click="createSet"
                        >
                            {{ creating ? '作成中…' : `「${newSet.name}」を作る` }}
                        </button>
                        <button
                            type="button"
                            class="rounded border border-edit-border px-3 py-2 text-sm hover:bg-edit-panel"
                            @click="confirming = false"
                        >
                            やめる
                        </button>
                    </div>
                </div>

                <p v-if="createMessage" class="mt-2 text-sm text-edit-accent">
                    {{ createMessage }}
                </p>
                <p v-if="createFailure" role="alert" class="mt-2 text-sm text-rose-200">
                    {{ createFailure }}
                </p>

                <p class="mt-3 text-xs text-edit-muted">
                    出来た問題集を配るには
                    <code class="text-edit-text">npm run dataset -- export --name "..."</code>
                    を使う（<code>dist/ggg-dataset.json</code> が出る）
                </p>
            </section>

            <!-- ================= いまの問題集を編集する ================= -->
            <template v-if="mode === 'edit'">
                <!-- 出題を選ぶ -->
                <section class="flex flex-wrap items-center gap-2 rounded border border-edit-border bg-edit-panel p-3">
                    <label for="admin-question" class="text-sm font-medium">出題</label>
                    <select
                        id="admin-question"
                        v-model="selectedId"
                        class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text"
                    >
                        <option value="">
                            選ぶ（{{ summaries.length }} 件）
                        </option>
                        <option v-for="s in summaries" :key="s.id" :value="s.id">
                            {{ s.id }}　{{ countryNameByCode.get(s.country) ?? s.country }}　難易度 {{ s.difficulty }}　確認 {{ s.progress.confirmed }}/{{ s.progress.total }}
                        </option>
                    </select>
                    <span v-if="question" class="text-xs text-edit-muted">
                        {{ countryNameByCode.get(question.country) ?? question.country }}
                        <span v-if="question.captureDate">／撮影 {{ question.captureDate }}</span>
                    </span>
                    <span v-if="!summaries.length" class="text-xs text-edit-muted">
                        出題が無い。下の「新しい地点を登録する」から始める
                    </span>
                </section>

                <div v-if="question" class="flex flex-col gap-4 xl:flex-row">
                    <!-- 左：風景。学習画面と同じ 4:3 -->
                    <div class="flex min-w-0 flex-col gap-1 xl:w-[68%] xl:max-w-[calc(78dvh*4/3)]">
                        <div class="aspect-[4/3] w-full max-xl:max-h-[55dvh]">
                            <StreetViewNoMove v-if="noMove" :pano-id="question.panoId" fill />
                            <StreetViewFrame v-else :pano-id="question.panoId" fill />
                        </div>
                        <p class="text-xs text-edit-muted">
                            正解は <strong class="text-edit-accent">{{ countryNameByCode.get(question.country) ?? question.country }}</strong>。
                            写っているものを 14 スロットに記録する
                        </p>
                    </div>

                    <!-- 右：タグ入力。**中身は学習画面と同じ部品なので白いまま** -->
                    <div class="relative min-w-0 xl:flex-1">
                        <div class="ggg-scroll max-h-[70dvh] overflow-y-scroll pr-1 xl:absolute xl:inset-0 xl:max-h-none">
                            <div class="mb-2 rounded border border-edit-border bg-edit-panel px-2 py-1.5 text-xs">
                                確認 {{ progress.confirmed }} / {{ progress.total }}　
                                見えた {{ progress.visible }}　
                                用語入り {{ progress.withTerms }} / {{ progress.visible }}
                            </div>

                            <div class="rounded bg-white p-2">
                                <SlotForm
                                    v-model="slots"
                                    mode="admin"
                                    :draft-slots="draftSlots"
                                    :terms-by-slot="termsBySlot"
                                />

                                <!-- 決め手 -->
                                <fieldset class="mt-3 rounded border border-slate-300 p-3">
                                    <legend class="px-1 text-sm font-medium text-slate-900">
                                        決め手にできるスロット
                                    </legend>
                                    <p class="mb-2 text-xs text-slate-600">
                                        候補を弁別できるもの。「見えた」にしたスロットから選ぶ
                                    </p>
                                    <div v-if="visibleSlots.length" class="flex flex-wrap gap-1">
                                        <button
                                            v-for="definition in visibleSlots"
                                            :key="definition.id"
                                            type="button"
                                            :aria-pressed="decisiveSlots.includes(definition.id)"
                                            class="rounded border px-2 py-1 text-xs"
                                            :class="decisiveSlots.includes(definition.id)
                                                ? 'border-slate-900 bg-slate-900 text-white'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
                                            @click="toggleDecisive(definition.id)"
                                        >
                                            {{ definition.label }}
                                        </button>
                                    </div>
                                    <p v-else class="text-xs text-slate-600">
                                        「見えた」のスロットがまだ無い
                                    </p>
                                </fieldset>

                                <label class="mt-3 grid gap-1">
                                    <span class="text-sm font-medium text-slate-900">メモ（任意）</span>
                                    <textarea
                                        v-model="note"
                                        rows="2"
                                        class="w-full rounded border border-slate-300 p-2 text-sm"
                                    />
                                </label>
                            </div>

                            <!-- 保存 -->
                            <div class="mt-3 grid gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        :disabled="!canSave || saving"
                                        class="rounded bg-edit-accent px-4 py-2 text-sm font-semibold text-edit-accent-text hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                        @click="save"
                                    >
                                        {{ saving ? '保存中…' : '正解タグを保存する（消費 0）' }}
                                    </button>
                                    <span v-if="saveMessage" class="text-sm">{{ saveMessage }}</span>
                                </div>

                                <!-- **押せない理由を並べる。** 無効にするだけでは「押しても何も起きない」と同じ -->
                                <ul v-if="localIssues.errors.length" class="grid gap-0.5 text-xs text-edit-accent">
                                    <li v-for="issue in localIssues.errors" :key="issue">
                                        ・{{ issue }}
                                    </li>
                                </ul>
                                <ul v-if="localIssues.warnings.length" class="grid gap-0.5 text-xs text-edit-muted">
                                    <li v-for="warn in localIssues.warnings" :key="warn">
                                        ・{{ warn }}
                                    </li>
                                </ul>
                                <ul v-if="saveErrors.length" class="grid gap-0.5 text-xs text-rose-200" role="alert">
                                    <li v-for="e in saveErrors" :key="e">
                                        ・{{ e }}
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 新しい地点 -->
                <section class="rounded border border-edit-border bg-edit-panel p-3">
                    <h2 class="text-base font-semibold">
                        新しい地点を登録する
                    </h2>
                    <p class="mt-1 text-xs text-edit-muted">
                        <strong class="text-edit-text">座標は人間が選ぶ。</strong>有名観光地は個人投稿の全天球写真を拾いやすく、
                        著作権表記が Google にならないため避ける。道路上の座標を選ぶ。
                        <strong class="text-edit-text">メタデータ照会は無料でクォータも消費しない</strong>ので、採用されるまで何度でも試せる
                    </p>

                    <div class="mt-2 flex flex-wrap items-end gap-2">
                        <label class="grid gap-1">
                            <span class="text-xs text-edit-muted">国コード</span>
                            <input v-model="draft.country" maxlength="2" placeholder="ZA" class="w-16 rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm uppercase text-edit-text">
                        </label>
                        <label class="grid gap-1">
                            <span class="text-xs text-edit-muted">緯度</span>
                            <input v-model="draft.lat" inputmode="decimal" placeholder="-25.7" class="w-28 rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text">
                        </label>
                        <label class="grid gap-1">
                            <span class="text-xs text-edit-muted">経度</span>
                            <input v-model="draft.lng" inputmode="decimal" placeholder="28.2" class="w-28 rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text">
                        </label>
                        <label class="grid gap-1">
                            <span class="text-xs text-edit-muted">向き</span>
                            <input v-model="draft.heading" inputmode="numeric" class="w-20 rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text">
                        </label>
                        <label class="grid gap-1">
                            <span class="text-xs text-edit-muted">難易度</span>
                            <select v-model="draft.difficulty" class="rounded border border-edit-border bg-edit-bg px-2 py-1 text-sm text-edit-text">
                                <option value="1">
                                    1
                                </option>
                                <option value="2">
                                    2
                                </option>
                                <option value="3">
                                    3
                                </option>
                            </select>
                        </label>
                        <button
                            type="button"
                            :disabled="adding || !draft.country || !draft.lat || !draft.lng"
                            class="rounded border border-edit-border px-3 py-1.5 text-sm hover:bg-edit-bg disabled:cursor-not-allowed disabled:opacity-40"
                            @click="addQuestion"
                        >
                            {{ adding ? '照会中…' : '登録する' }}
                        </button>
                    </div>

                    <p v-if="addMessage" class="mt-2 text-sm">
                        {{ addMessage }}
                    </p>
                </section>
            </template>
        </div>
    </div>
</template>
