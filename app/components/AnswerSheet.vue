<script setup lang="ts">
/**
 * 回答欄を下からスライドさせる被せ板（ボトムシート）。
 *
 * ## なぜ風景の上に被せるのか
 *
 * それまでは左列を上下に割って、上に風景、下に回答欄を置いていた。
 * **回答するときに見たいのは観察欄（右列）である。**
 *
 * 決め手の欄を選び、候補国を並べるとき、学習者は
 * 「自分が何を書いたか」を読み返す。ところが回答欄を左下に置くと、
 * 縦が詰まって観察欄が細くなり、**読み返しながら書けなかった。**
 *
 * だから回答欄を**風景の上に被せる。** 風景は回答の瞬間には要らない。
 * 観察欄（右列）は最後まで見えている必要がある。
 *
 * > **被せてよいものと、被せてはいけないものを分ける。**
 *
 * ## 閉じ込めない（`dialog` にしない）
 *
 * 見た目はモーダルに近いが、**モーダルにしてはならない。**
 * 焦点を閉じ込めると、観察欄を読み返せなくなる。それが目的だったのに逆になる。
 *
 * したがって
 *
 * - `role="dialog"` を使わない。焦点を閉じ込めない
 * - 背景を暗くしない（右列を読ませる）
 * - 外側を触っても閉じない
 *
 * 開閉は `aria-expanded` を持つボタンで示す。**開示（disclosure）である。**
 *
 * ## 開いたら焦点を移す。閉じたら戻す
 *
 * 開いても焦点が動かないと、キーボードだけの利用者には
 * **何も起きていないのと区別できない。** 逆に閉じたときに焦点が消えると、
 * どこにいるのか分からなくなる。開いた元のボタンへ戻す。
 *
 * `Escape` で閉じる。閉じ込めていないので、`Tab` で外へ出られる。
 *
 * ## 動きを強制しない
 *
 * スライドは `prefers-reduced-motion` を尊重して止める。
 * **動きが目的ではない。** 位置が変わったことが分かれば足りる。
 */
const open = defineModel<boolean>({ required: true })

const props = defineProps<{
    /** 閉じているときに帯へ出す要約。**閉じても状態が読めること** */
    summary: string
    /** 入力できない状態（採点中・採点後）。**値は見せるが編集させない** */
    readonly?: boolean
    /**
     * 被せる対象（`view` スロット）の枠に付けるクラス。
     *
     * **縦横比は呼び出し側が決める。** 何を被せるかを知っているのはページであり、
     * この部品は「その上に板を出す」ことだけを知っている。
     */
    frameClass?: string
}>()

const sheet = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)

/** 開いたら中へ焦点を移す。**キーボードだけの利用者に変化を伝える** */
watch(open, async (isOpen) => {
    await nextTick()
    if (isOpen) {
        // 見出しに焦点を当てる。入力欄に直接当てると、読む前に打ち始めてしまう
        sheet.value?.querySelector<HTMLElement>('[data-sheet-focus]')?.focus()
    }
    else {
        // **閉じたら戻す。** どこにいるか分からなくなるのを防ぐ
        toggle.value?.focus()
    }
})

function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open.value) return
    // **閉じ込めていないので、Escape は「閉じる」だけでよい**
    event.stopPropagation()
    open.value = false
}
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1">
    <!--
        被せる対象を中に置く。**板の基準になるので `relative` を持つ。**

        枠は呼び出し側が渡したクラスで縦横比を決める。
        `aspect-ratio` は確定した高さを与えるので、板の `max-h-*` が解決する。

        > **百分率の高さは、親の高さが決まっていて初めて意味を持つ。**
    -->
    <div class="relative overflow-hidden rounded" :class="props.frameClass">
        <slot name="view" />

        <!--
            板を受け止める枠。**`inset-0` にする。`bottom-0` だけでは高さが決まらない。**

            当初は `inset-x-0 bottom-0` だった。上端が無いので高さが内容依存になり、
            子の `max-h-[85%]` が**何に対する 85% か決まらなかった。**
            結果、板は中身なりに伸びて風景の上へはみ出し、
            **先頭の候補国の欄が切れたうえにスクロールバーも出なかった**（実測 2026-08-18）。

            `pointer-events-none` で全面を覆っても風景の操作を妨げない。
            受け取る板だけが `pointer-events-auto` を持つ。
        -->
        <div class="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end">
        <!--
            開いたときの板。**高さを上限で止める。**
            全面を覆うと「被せ板」ではなく画面遷移になり、戻る手段が分からなくなる。
            風景が少し見えていることで、上に重なっていると分かる。
        -->
        <!--
            **`v-show` だけではスライドしない。** `display: none` からの復帰は
            トランジションの対象にならないため、瞬間的に現れる。
            `Transition` に入退場のクラスを渡して初めて動く。

            `motion-reduce:transition-none` で動きを止める。
            **動きが目的ではない。** 位置が変わったことが分かれば足りる。
        -->
        <Transition
            enter-active-class="transition-transform duration-200 ease-out motion-reduce:transition-none"
            enter-from-class="translate-y-full"
            enter-to-class="translate-y-0"
            leave-active-class="transition-transform duration-150 ease-in motion-reduce:transition-none"
            leave-from-class="translate-y-0"
            leave-to-class="translate-y-full"
        >
            <section
                v-show="open"
                id="answer-sheet"
                ref="sheet"
                aria-labelledby="answer-sheet-heading"
                class="pointer-events-auto flex max-h-[85%] flex-col rounded-t-lg border border-slate-300 bg-white shadow-2xl"
                @keydown="onKeydown"
            >
                <div class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                    <h2
                        id="answer-sheet-heading"
                        data-sheet-focus
                        tabindex="-1"
                        class="text-sm font-semibold text-slate-900"
                    >
                        回答
                        <span v-if="props.readonly" class="ml-1 text-xs font-normal text-slate-600">
                            （採点済み。編集できない）
                        </span>
                    </h2>
                    <button
                        type="button"
                        :aria-expanded="open"
                        aria-controls="answer-sheet"
                        class="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        @click="open = false"
                    >
                        閉じる（Esc）
                    </button>
                </div>

                <!--
                    中身は内部スクロール。**観察欄（右列）は覆わない。**

                    `scrollbar-gutter: stable` で溝を先に確保する。
                    出たり消えたりすると**中身の幅が動いて読みにくい。**

                    `overflow-y-scroll`（`auto` ではない）にして**常に見えるようにする。**
                    スクロールできることが分からないと、下にボタンがあることに気づけない。
                -->
                <div class="ggg-scroll min-h-0 flex-1 overflow-y-scroll p-3">
                    <slot />
                </div>
            </section>
        </Transition>
        </div>
    </div>

    <!--
        閉じているときの帯。**風景の外（枠の下）に置く。**

        当初は枠の中に重ねていた。開いていないときでも**風景の下端を隠していた**
        （実測 2026-08-18）。被せてよいのは「開いたとき」だけである。

        > **常に出ているものを、見たいものの上に置かない。**

        開くボタンと要約を兼ねる。閉じた状態でも「何を答えたか」が読める。
    -->
    <div
        v-show="!open"
        class="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2"
    >
        <button
            ref="toggle"
            type="button"
            :aria-expanded="open"
            aria-controls="answer-sheet"
            class="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            @click="open = true"
        >
            回答を開く
        </button>
        <p class="min-w-0 flex-1 truncate text-xs text-slate-700">
            {{ summary }}
        </p>
    </div>
    </div>
</template>
