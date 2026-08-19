<script setup lang="ts">
/**
 * 管理モード（タスク 19）。**正解タグを風景を見ながら付ける。**
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
 * ## 学習画面と同じ部品を使う
 *
 * `SlotForm` は `mode="admin"` を最初から持っていた。載せる画面が無かっただけである。
 * 同じ部品を使うので、**学習者が見るのと同じ 14 スロットの形でタグを付ける。**
 * 形が違うと突き合わせが機械的にできない。
 *
 * **認証がない。** ローカル実行前提である（README の「なぜローカル実行専用か」）。
 */
import { createEmptySlots } from '#shared/slots'
import { SLOT_DEFINITIONS } from '#shared/slots'
import { answerKeyProgress, validateAnswerKey } from '#shared/answer-key'
import type { SlotId } from '#shared/slots'
import type { Question, SlotRecord } from '#shared/types'

useHead({ title: '正解タグの管理 | GGG' })

type TermOption = { id: string, plain: string, countries: number, certainty: string }

interface Summary {
    id: string
    country: string
    region: string | null
    difficulty: number
    captureDate: string | null
    decisiveSlots: SlotId[]
    progress: { confirmed: number, visible: number, withTerms: number, total: number }
}

const runtimeConfig = useRuntimeConfig()
const noMove = computed(() => String(runtimeConfig.public.streetviewMode ?? 'embed') === 'nomove')

const summaries = ref<Summary[]>([])
const countryNameByCode = ref(new Map<string, string>())
const loadError = ref<string | null>(null)

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
        const [list, countries] = await Promise.all([
            $fetch<{ questions: Summary[] }>('/api/answer-key'),
            $fetch<{ countries: { code: string, name: string }[] }>('/api/countries'),
        ])
        summaries.value = list.questions
        countryNameByCode.value = new Map(countries.countries.map((c) => [c.code, c.name]))
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
    <div class="mx-auto flex max-w-[110rem] flex-col gap-4 p-4">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
                <h1 class="text-xl font-bold text-slate-900">
                    正解タグの管理
                </h1>
                <p class="text-sm text-slate-600">
                    風景を見ながらタグを付ける。<strong>すべて消費 0</strong>（AI を使わない）
                </p>
            </div>
            <NuxtLink to="/" class="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                学習画面へ
            </NuxtLink>
        </header>

        <p v-if="loadError" role="alert" class="rounded border border-rose-400 bg-rose-50 p-3 text-sm text-rose-800">
            {{ loadError }}
        </p>

        <!-- 出題を選ぶ -->
        <section class="flex flex-wrap items-center gap-2 rounded border border-slate-300 p-3">
            <label for="admin-question" class="text-sm font-medium text-slate-900">出題</label>
            <select
                id="admin-question"
                v-model="selectedId"
                class="rounded border border-slate-400 px-2 py-1 text-sm"
            >
                <option value="">
                    選ぶ（{{ summaries.length }} 件）
                </option>
                <option v-for="s in summaries" :key="s.id" :value="s.id">
                    {{ s.id }}　{{ countryNameByCode.get(s.country) ?? s.country }}　難易度 {{ s.difficulty }}　確認 {{ s.progress.confirmed }}/{{ s.progress.total }}
                </option>
            </select>
            <span v-if="question" class="text-xs text-slate-600">
                {{ countryNameByCode.get(question.country) ?? question.country }}
                <span v-if="question.captureDate">／撮影 {{ question.captureDate }}</span>
            </span>
        </section>

        <template v-if="question">
            <div class="flex flex-col gap-4 xl:flex-row">
                <!-- 左：風景。学習画面と同じ 4:3 -->
                <div class="flex min-w-0 flex-col gap-1 xl:w-[68%] xl:max-w-[calc(78dvh*4/3)]">
                    <div class="aspect-[4/3] w-full max-xl:max-h-[55dvh]">
                        <StreetViewNoMove v-if="noMove" :pano-id="question.panoId" fill />
                        <StreetViewFrame v-else :pano-id="question.panoId" fill />
                    </div>
                    <p class="text-xs text-slate-500">
                        正解は <strong>{{ countryNameByCode.get(question.country) ?? question.country }}</strong>。
                        写っているものを 14 スロットに記録する
                    </p>
                </div>

                <!-- 右：タグ入力 -->
                <div class="relative min-w-0 xl:flex-1">
                    <div class="ggg-scroll max-h-[70dvh] overflow-y-scroll pr-1 xl:absolute xl:inset-0 xl:max-h-none">
                        <div class="mb-2 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                            確認 {{ progress.confirmed }} / {{ progress.total }}　
                            見えた {{ progress.visible }}　
                            用語入り {{ progress.withTerms }} / {{ progress.visible }}
                        </div>

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

                        <!-- 保存 -->
                        <div class="mt-3 grid gap-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    :disabled="!canSave || saving"
                                    class="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                    @click="save"
                                >
                                    {{ saving ? '保存中…' : '正解タグを保存する（消費 0）' }}
                                </button>
                                <span v-if="saveMessage" class="text-sm text-slate-800">{{ saveMessage }}</span>
                            </div>

                            <!-- **押せない理由を並べる。** 無効にするだけでは「押しても何も起きない」と同じ -->
                            <ul v-if="localIssues.errors.length" class="grid gap-0.5 text-xs text-amber-800">
                                <li v-for="issue in localIssues.errors" :key="issue">
                                    ・{{ issue }}
                                </li>
                            </ul>
                            <ul v-if="localIssues.warnings.length" class="grid gap-0.5 text-xs text-slate-600">
                                <li v-for="warn in localIssues.warnings" :key="warn">
                                    ・{{ warn }}
                                </li>
                            </ul>
                            <ul v-if="saveErrors.length" class="grid gap-0.5 text-xs text-rose-700" role="alert">
                                <li v-for="e in saveErrors" :key="e">
                                    ・{{ e }}
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- 新しい地点 -->
        <section class="rounded border border-slate-300 p-3">
            <h2 class="text-base font-semibold text-slate-900">
                新しい地点を登録する
            </h2>
            <p class="mt-1 text-xs text-slate-600">
                <strong>座標は人間が選ぶ。</strong>有名観光地は個人投稿の全天球写真を拾いやすく、
                著作権表記が Google にならないため避ける。道路上の座標を選ぶ。
                <strong>メタデータ照会は無料でクォータも消費しない</strong>ので、採用されるまで何度でも試せる
            </p>

            <div class="mt-2 flex flex-wrap items-end gap-2">
                <label class="grid gap-1">
                    <span class="text-xs text-slate-700">国コード</span>
                    <input v-model="draft.country" maxlength="2" placeholder="ZA" class="w-16 rounded border border-slate-400 px-2 py-1 text-sm uppercase">
                </label>
                <label class="grid gap-1">
                    <span class="text-xs text-slate-700">緯度</span>
                    <input v-model="draft.lat" inputmode="decimal" placeholder="-25.7" class="w-28 rounded border border-slate-400 px-2 py-1 text-sm">
                </label>
                <label class="grid gap-1">
                    <span class="text-xs text-slate-700">経度</span>
                    <input v-model="draft.lng" inputmode="decimal" placeholder="28.2" class="w-28 rounded border border-slate-400 px-2 py-1 text-sm">
                </label>
                <label class="grid gap-1">
                    <span class="text-xs text-slate-700">向き</span>
                    <input v-model="draft.heading" inputmode="numeric" class="w-20 rounded border border-slate-400 px-2 py-1 text-sm">
                </label>
                <label class="grid gap-1">
                    <span class="text-xs text-slate-700">難易度</span>
                    <select v-model="draft.difficulty" class="rounded border border-slate-400 px-2 py-1 text-sm">
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
                    class="rounded border border-slate-500 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    @click="addQuestion"
                >
                    {{ adding ? '照会中…' : '登録する' }}
                </button>
            </div>

            <p v-if="addMessage" class="mt-2 text-sm text-slate-800">
                {{ addMessage }}
            </p>
        </section>
    </div>
</template>
