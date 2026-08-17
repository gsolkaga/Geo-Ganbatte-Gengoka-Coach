<script setup lang="ts">
/**
 * コードが算出した判定結果。**画面の主役はここである。**
 *
 * `feedback` を最上部に大きく置かない（design.md「画面の優先順位」）。
 * コード算出分は**モデルを替えても変わらず、検証可能である**。
 * 変わらないものを主に、変わるものを従に置く。
 *
 * **`null` は「判定していない」と明示する。空欄にしない。**
 * `[]`（計算した結果、該当なし）と混ぜると「見落としゼロ」と読める。
 */
import { CONFIDENCE_LABELS, SLOT_DEFINITION_BY_ID } from '#shared/slots'
import type { SlotId } from '#shared/slots'
import type { CodeJudgement } from '#shared/types'

const props = defineProps<{
    judgement: CodeJudgement
    /** 正解国。採点後なので表示してよい */
    country: string
    region: string | null
    countryName?: string | null
}>()

const slotLabel = (id: SlotId | string) =>
    SLOT_DEFINITION_BY_ID[id as SlotId]?.label ?? id

/** 判定不能（null）の項目を列挙する。何が算出できなかったかを明示する */
const unavailable = computed(() => {
    const list: string[] = []
    const j = props.judgement
    if (j.missedSlots === null) list.push('見落としたスロット')
    if (j.wrongAbsentSlots === null) list.push('誤って「見えない」と判断したスロット')
    if (j.overclaimedSlots === null) list.push('過剰に申告したスロット')
    if (j.blindSlots === null) list.push('視認できないスロットの切り分け')
    if (j.filedElsewhere === null) list.push('別のスロットに書いた観察の切り分け')
    if (j.alternativeRoute === null) list.push('別ルートで正解したスロットの切り分け')
    if (j.failureModes === null) list.push('失敗モードの分類')
    if (j.narrowingPower === null) list.push('絞り込み力')
    if (j.intersection === null) list.push('積集合')
    if (j.nextPriority === null) list.push('次に見るべきスロット')
    if (j.discoveries === null) list.push('発見の記録')
    return list
})

/**
 * 見落としではないものが 1 件でもあるか。
 * **未観察のスロットと同じ枠に並べない。** 並べると色や順序に関係なく
 * 「できていない項目」として読まれる。
 */
const notMissed = computed(() => {
    const j = props.judgement
    return [
        ...(j.blindSlots ?? []),
        ...(j.filedElsewhere ?? []).map((f) => f.slot),
        ...(j.alternativeRoute ?? []),
    ]
})
</script>

<template>
    <section aria-labelledby="judgement-heading" class="grid gap-4">
        <h2 id="judgement-heading" class="text-lg font-semibold text-slate-900">
            判定（コードで計算した結果）
        </h2>
        <p class="text-xs text-slate-600">
            ここはモデルを替えても変わらない。正解タグと用語辞書から計算した検証可能な結果である。
        </p>

        <div
            class="rounded border p-4"
            :class="judgement.hit ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50'"
        >
            <p class="font-medium text-slate-900">
                正解は {{ countryName ? `${countryName}（${country}）` : country }}
                <span v-if="region" class="text-sm text-slate-600">/ {{ region }}</span>
            </p>
            <p class="mt-1 text-sm text-slate-800">
                {{ judgement.hit ? '候補集合に含まれていた' : '候補集合に含まれていなかった' }}
                <span v-if="judgement.hitConfidence">
                    （そのときの確信度: {{ CONFIDENCE_LABELS[judgement.hitConfidence].label }}）
                </span>
            </p>
        </div>

        <div v-if="judgement.confusionPairs.length">
            <h3 class="text-sm font-medium text-slate-900">
                併記した国の組（区別できていない可能性のある組）
            </h3>
            <ul class="mt-1 flex flex-wrap gap-2 text-sm">
                <li
                    v-for="pair in judgement.confusionPairs"
                    :key="pair.join('-')"
                    class="rounded bg-slate-100 px-2 py-1"
                >
                    {{ pair[0] }} ↔ {{ pair[1] }}
                </li>
            </ul>
        </div>

        <!-- 算出できた項目のみ表示する。null は下の「判定していない」にまとめる -->
        <div v-if="judgement.missedSlots?.length">
            <h3 class="text-sm font-medium text-slate-900">
                見落としたスロット（写っていたが未確認だった）
            </h3>
            <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                <li v-for="slot in judgement.missedSlots" :key="slot">
                    {{ slotLabel(slot) }}
                </li>
            </ul>
        </div>

        <div v-if="judgement.wrongAbsentSlots?.length">
            <h3 class="text-sm font-medium text-slate-900">
                誤って「見えない」と判断したスロット
            </h3>
            <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                <li v-for="slot in judgement.wrongAbsentSlots" :key="slot">
                    {{ slotLabel(slot) }}
                </li>
            </ul>
        </div>

        <div v-if="judgement.overclaimedSlots?.length">
            <h3 class="text-sm font-medium text-slate-900">
                写っていないのに「見えた」としたスロット
            </h3>
            <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                <li v-for="slot in judgement.overclaimedSlots" :key="slot">
                    {{ slotLabel(slot) }}
                </li>
            </ul>
        </div>

        <!--
            見落としではないもの。**未観察と並べない。**
            同じ枠に並べると、色や順序が違っても「できていない項目」として読まれる。
        -->
        <div
            v-if="notMissed.length"
            class="rounded border border-sky-300 bg-sky-50 p-3"
        >
            <h3 class="text-sm font-medium text-slate-900">
                これはあなたの見落としではない
            </h3>
            <p class="mt-1 text-xs text-slate-600">
                写っていたが未観察だったスロットのうち、<strong>見落としと数えないもの</strong>である。
            </p>

            <div v-if="judgement.blindSlots?.length" class="mt-2">
                <p class="text-sm font-medium text-slate-900">
                    見えていても認識できない項目
                </p>
                <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                    <li v-for="slot in judgement.blindSlots" :key="slot">
                        {{ slotLabel(slot) }}
                    </li>
                </ul>
                <p class="mt-1 text-xs text-slate-600">
                    国を特定できることと、あなたが視認できることは別である。
                    <strong>次に見るべき項目にも出さない。</strong>
                </p>
            </div>

            <div v-if="judgement.filedElsewhere?.length" class="mt-2">
                <p class="text-sm font-medium text-slate-900">
                    別の欄に書いていた観察
                </p>
                <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                    <li v-for="item in judgement.filedElsewhere" :key="item.slot">
                        {{ slotLabel(item.slot) }}
                        → 記述があった欄:
                        {{ item.foundIn.map(slotLabel).join('、') }}
                    </li>
                </ul>
                <p class="mt-1 text-xs text-slate-600">
                    見ている。書いた場所が違うだけである。<strong>訓練しているのは観察であって分類ではない。</strong>
                </p>
            </div>

            <div v-if="judgement.alternativeRoute?.length" class="mt-2">
                <p class="text-sm font-medium text-slate-900">
                    今回は必要なかった項目（別ルートで正解した）
                </p>
                <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                    <li v-for="slot in judgement.alternativeRoute" :key="slot">
                        {{ slotLabel(slot) }}
                    </li>
                </ul>
                <p class="mt-1 text-xs text-slate-600">
                    正解している。知らないメタがあっても別の道で当てられた。次はこれも使える。
                </p>
            </div>
        </div>

        <div v-if="judgement.discoveries?.length">
            <h3 class="text-sm font-medium text-slate-900">
                自力で見つけた名前のない手がかり
            </h3>
            <ul class="mt-1 list-inside list-disc text-sm text-slate-800">
                <li v-for="item in judgement.discoveries" :key="item">
                    {{ item }}
                </li>
            </ul>
            <p class="mt-1 text-xs text-slate-600">
                用意された項目の外を見た記録である。項目に収まらなかったことは減点にならない。
            </p>
        </div>

        <div v-if="judgement.intersection">
            <h3 class="text-sm font-medium text-slate-900">
                達成された絞り込み（挙げた用語の積集合）
            </h3>
            <p v-if="judgement.intersection.countries.length" class="mt-1 text-sm text-slate-800">
                {{ judgement.intersection.countries.length }} カ国
                <span class="text-slate-600">[{{ judgement.intersection.countries.join(' ') }}]</span>
                /
                {{ judgement.intersection.containsAnswer ? '正解を含む' : '正解を含まない' }}
            </p>
            <!-- **0 カ国は絞り込みの成功ではない。** 1 カ国の延長として見せない -->
            <p v-else class="mt-1 text-sm text-amber-800">
                0 カ国。<strong>絞り込めたのではなく矛盾している。</strong>
                観察か用語辞書のどちらかが誤っている。
            </p>
        </div>

        <div v-if="judgement.nextPriority?.length">
            <h3 class="text-sm font-medium text-slate-900">
                次に見るべきスロット（積集合の縮小量から計算）
            </h3>
            <ol class="mt-1 list-inside list-decimal text-sm text-slate-800">
                <li v-for="item in judgement.nextPriority" :key="item.slot">
                    {{ slotLabel(item.slot) }} → 残り {{ item.resultingSize }} カ国
                </li>
            </ol>
        </div>

        <!-- 判定不能を隠さない。空欄にすると「該当なし」と読める -->
        <div v-if="unavailable.length" class="rounded border border-slate-300 bg-slate-50 p-3">
            <h3 class="text-sm font-medium text-slate-900">
                判定していない項目
            </h3>
            <p class="mt-1 text-xs text-slate-600">
                {{ judgement.variant === 'v1'
                    ? 'v1 は正解タグと用語辞書を持たないため、以下は計算できない。'
                    : '以下は必要なデータが揃っていないため計算できない。' }}
                <strong>「該当なし」ではなく「未計算」である。</strong>
            </p>
            <ul class="mt-2 list-inside list-disc text-sm text-slate-700">
                <li v-for="item in unavailable" :key="item">
                    {{ item }}
                </li>
            </ul>
        </div>
    </section>
</template>
