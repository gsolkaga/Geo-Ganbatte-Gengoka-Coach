<script setup lang="ts">
/**
 * 候補国を選ぶグリッド。
 *
 * ## 国コードを覚えている前提を捨てる
 *
 * 以前は `<input maxlength="2">` に `datalist` を添えていた。
 * つまり **`KZ` を知らないとカザフスタンを選べなかった。**
 * 学習者が鍛えたいのは観察であって、ISO 3166-1 の暗記ではない。
 *
 * > **入力の形式を覚えることが、練習の一部になってはいけない。**
 *
 * ## 地域でまとめる
 *
 * 102 件を平らに並べると壁になる。人は「北欧のどこか」と絞ってから
 * 国を見比べるので、その順に並べる（`shared/region-labels.ts`）。
 *
 * ## コードは消さずに併記する
 *
 * 選ぶのに要らなくても、`KZ` を目にし続けることで自然に覚える。
 * **要らないものを消すのではなく、要る人にだけ効く場所に置く。**
 */
import { groupByRegion } from '#shared/region-labels'

interface CountryOption {
    code: string
    name: string
    region: string | null
}

const props = withDefaults(
    defineProps<{
        countries: CountryOption[]
        /** 選択済みの国コード */
        selected: string[]
        max: number
        disabled?: boolean
    }>(),
    { disabled: false },
)

const emit = defineEmits<{ toggle: [string] }>()

const query = ref('')

const selectedSet = computed(() => new Set(props.selected))

/**
 * 絞り込み。**日本語名の部分一致と、コードの前方一致**の両方を見る。
 * コードで探す人（`KZ` と打つ）と、名前で探す人（`カザ` と打つ）の両方が居る。
 */
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

const groups = computed(() => groupByRegion(filtered.value).filter((g) => g.items.length > 0))

/** 上限に達したら未選択のものは押せない。**選択済みは常に押せる**（外せなくなるため） */
function isBlocked(code: string): boolean {
    if (props.disabled) return true
    if (selectedSet.value.has(code)) return false
    return props.selected.length >= props.max
}

const atMax = computed(() => props.selected.length >= props.max)
</script>

<template>
    <div class="grid gap-2">
        <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5">
                <span class="text-xs text-slate-700">絞り込み</span>
                <input
                    v-model="query"
                    type="search"
                    :disabled="disabled"
                    placeholder="カザ / KZ"
                    class="w-32 rounded border border-slate-400 px-2 py-1 text-sm"
                >
            </label>
            <span class="text-xs text-slate-600">
                候補 {{ selected.length }} / {{ max }}
            </span>
            <span v-if="atMax" class="text-xs text-amber-700">
                上限に達している。外してから選ぶ
            </span>
            <span v-if="query && groups.length === 0" role="status" class="text-xs text-slate-600">
                一致する国が無い
            </span>
        </div>

        <!--
            **高さを区切って内部スクロールにする。** 区切らないと 102 件で
            確信度や採点ボタンが 2,000px 下へ押し出される。
        -->
        <div class="ggg-scroll max-h-[42dvh] overflow-y-scroll rounded border border-slate-300 p-2">
            <fieldset v-for="group in groups" :key="group.label" class="mb-2 last:mb-0">
                <legend class="mb-1 text-xs font-medium text-slate-700">
                    {{ group.label }}
                </legend>
                <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
                    <button
                        v-for="country in group.items"
                        :key="country.code"
                        type="button"
                        :aria-pressed="selectedSet.has(country.code)"
                        :disabled="isBlocked(country.code)"
                        class="flex items-baseline justify-between gap-1 rounded border px-2 py-1 text-left text-sm focus:outline-2 focus:outline-offset-2 focus:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                        :class="selectedSet.has(country.code)
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'"
                        @click="emit('toggle', country.code)"
                    >
                        <span class="truncate">{{ country.name }}</span>
                        <span
                            class="shrink-0 font-mono text-xs"
                            :class="selectedSet.has(country.code) ? 'text-slate-300' : 'text-slate-500'"
                        >{{ country.code }}</span>
                    </button>
                </div>
            </fieldset>
        </div>
    </div>
</template>
