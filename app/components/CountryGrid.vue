<script setup lang="ts">
/**
 * 候補国を選ぶドロップダウン。**開いた中がグリッドになっている。**
 *
 * ## 国コードを覚えている前提を捨てる
 *
 * 以前は `<input maxlength="2">` に `datalist` を添えていた。
 * つまり **`KZ` を知らないとカザフスタンを選べなかった。**
 * 学習者が鍛えたいのは観察であって、ISO 3166-1 の暗記ではない。
 *
 * > **入力の形式を覚えることが、練習の一部になってはいけない。**
 *
 * ## 開くまでは畳んでおく
 *
 * 最初は 102 件を出したままにしていた。**閉じられないので場所を取り続け、**
 * 確信度と採点ボタンが下へ押し出された（実測 2026-08-19）。
 * 選ぶのは 1 プレイに 1〜3 回なので、**必要なときだけ開く。**
 *
 * ## 地域でまとめるのをやめた
 *
 * 「北欧」「東欧」で括って地理順に並べていた。**却って探しにくかった**（実測）。
 * 目当ての国がどの括りに入るかを先に考える必要があり、
 * その判断が 1 手増える。カテゴリの当て方を間違えると見つからない。
 *
 * > **分類は、分類を知っている人にしか効かない。**
 *
 * いまは五十音順の平らなグリッドで、絞り込み欄で詰める。
 * **順番を覚えなくても、頭の 2 文字を打てば出る。**
 */
interface CountryOption {
    code: string
    name: string
}

const props = withDefaults(
    defineProps<{
        countries: CountryOption[]
        /** 選択済みの国コード */
        selected: string[]
        max: number
        disabled?: boolean
        /**
         * 1 件だけ選ぶ。**選んだら閉じる。**
         *
         * 出題の国のように答えが 1 つの欄で使う。
         * `max=1` の複数選択で代用すると、**別の国に変えるのに 2 手かかる**
         * （外してから選ぶ）。選び直しは 1 手であるべきである。
         */
        single?: boolean
        /**
         * 配色。編集モード（`/admin`）は濃い藍の中に置くので、
         * **周りの入力欄と揃える。** 白いままだと 1 つだけ浮く。
         */
        tone?: 'learn' | 'edit'
    }>(),
    { disabled: false, single: false, tone: 'learn' },
)

const emit = defineEmits<{ toggle: [string] }>()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const filterInput = ref<HTMLInputElement | null>(null)
const panelId = useId()

const selectedSet = computed(() => new Set(props.selected))
const nameByCode = computed(() => new Map(props.countries.map((c) => [c.code, c.name])))

/** 絞り込み。**日本語名の部分一致と、コードの前方一致**の両方を見る */
const filtered = computed(() => {
    const raw = query.value.trim()
    if (!raw) return props.countries
    const lower = raw.toLowerCase()
    const upper = raw.toUpperCase()
    return props.countries.filter(
        (c) => c.name.includes(raw)
            || c.name.toLowerCase().includes(lower)
            || c.code.startsWith(upper),
    )
})

/** 1 件選びの場合は上限で塞がない。**押した国に入れ替わる** */
const atMax = computed(() => !props.single && props.selected.length >= props.max)

/** 上限に達したら未選択のものは押せない。**選択済みは常に押せる**（外せなくなるため） */
function isBlocked(code: string): boolean {
    if (selectedSet.value.has(code)) return false
    return atMax.value
}

/** 閉じているときの表示。**開かなくても何を選んだか分かること** */
const summary = computed(() => {
    if (props.selected.length === 0) return '国を選ぶ'
    return props.selected.map((code) => nameByCode.value.get(code) ?? code).join('、')
})

/** 1 件選びなら選んだ時点で閉じる。**用が済んだ板を残さない** */
function pick(code: string) {
    emit('toggle', code)
    if (props.single) close()
}

async function toggleOpen() {
    if (props.disabled) return
    open.value = !open.value
    if (!open.value) return
    // 開いたら絞り込みへ入れる。**打ち始められる状態にする**
    await nextTick()
    filterInput.value?.focus()
}

function close() {
    open.value = false
    query.value = ''
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open.value) {
        event.stopPropagation()
        close()
    }
}

/** 外を押したら閉じる。**開いたことを忘れて他を触れる状態にしない** */
function onPointerDown(event: PointerEvent) {
    if (!open.value) return
    if (root.value && !root.value.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
    <div ref="root" class="relative" @keydown="onKeydown">
        <button
            type="button"
            :disabled="disabled"
            :aria-expanded="open"
            :aria-controls="panelId"
            class="flex w-full max-w-md items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
            :class="tone === 'edit'
                ? 'border-edit-border bg-edit-bg text-edit-text hover:bg-edit-panel'
                : 'border-slate-400 bg-white hover:bg-slate-50'"
            @click="toggleOpen"
        >
            <span
                :class="tone === 'edit'
                    ? (selected.length ? 'text-edit-text' : 'text-edit-muted')
                    : (selected.length ? 'text-slate-900' : 'text-slate-500')"
            >
                {{ summary }}
            </span>
            <span class="shrink-0 text-xs" :class="tone === 'edit' ? 'text-edit-muted' : 'text-slate-600'">
                <!-- 1 件選びで「1 / 1」と出しても何も伝わらない -->
                <template v-if="!single">{{ selected.length }} / {{ max }}</template>
                <span aria-hidden="true">{{ open ? '▲' : '▼' }}</span>
            </span>
        </button>

        <div
            v-if="open"
            :id="panelId"
            class="absolute z-20 mt-1 w-full max-w-md rounded border border-slate-400 bg-white p-2 shadow-lg"
        >
            <div class="mb-2 flex flex-wrap items-center gap-2">
                <input
                    ref="filterInput"
                    v-model="query"
                    type="search"
                    placeholder="カザ / KZ で絞り込む"
                    class="min-w-0 flex-1 rounded border border-slate-400 px-2 py-1 text-sm"
                >
                <button
                    type="button"
                    class="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    @click="close"
                >
                    閉じる
                </button>
            </div>

            <p v-if="atMax" class="mb-1 text-xs text-amber-700">
                上限に達している。外してから選ぶ
            </p>
            <!--
                **無いことを、無いと言う。** 候補は `data/countries.json` の国だけである。
                以前は「一致する国が無い」だけを出していたが、
                打ち間違いなのか一覧に無いのかが**区別できなかった。**
            -->
            <p v-if="query && filtered.length === 0" role="status" class="text-xs text-slate-600">
                一致する国が無い。候補は {{ countries.length }} カ国ぶんしか持っていない
                （<code>data/countries.json</code>）
            </p>

            <!--
                **地域で括らない。** 五十音順の平らな並びにして、絞り込みで詰める。
                高さを区切るのは、開いた板が画面より長くならないため。
            -->
            <div class="ggg-scroll max-h-[38dvh] overflow-y-scroll">
                <div class="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    <button
                        v-for="country in filtered"
                        :key="country.code"
                        type="button"
                        :aria-pressed="selectedSet.has(country.code)"
                        :disabled="isBlocked(country.code)"
                        class="flex items-baseline justify-between gap-1 rounded border px-2 py-1 text-left text-sm focus:outline-2 focus:outline-offset-2 focus:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                        :class="selectedSet.has(country.code)
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'"
                        @click="pick(country.code)"
                    >
                        <span class="truncate">{{ country.name }}</span>
                        <span
                            class="shrink-0 font-mono text-xs"
                            :class="selectedSet.has(country.code) ? 'text-slate-300' : 'text-slate-500'"
                        >{{ country.code }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
