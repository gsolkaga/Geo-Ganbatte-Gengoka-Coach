<script setup lang="ts">
/**
 * データセットの管理画面。取り込み・切り替え・削除。
 *
 * ## CLI と同じ規律を画面でも守る
 *
 * `npm run dataset -- install/use/remove` と同じことをする。**振る舞いを変えない。**
 * 画面だから緩めるということをしない。
 *
 * - 同じ ID が既にあれば**両方を見せて止まる。** 上書きは明示的に選ばせる
 * - 切り替えの前に控えを取る（サーバ側で `.backup/<日時>/`）
 * - 削除しても**進捗は残す**（入れ直せば戻る）
 * - **アクティブなものも削除できる。** 棚に 1 つだけのとき切り替え先が無く、
 *   以前は一生消せなかった。由来を `library.json` に写しているので出典表示は残る
 *
 * ## 出典表示を必ず見せる
 *
 * データは CC BY 4.0 である。**そのまま貼れる文を画面に出す。**
 * 「どこかに書いてある」ではなく、使う場所に置く。
 */
import type { DatasetListItem } from '~~/server/api/datasets.get'

useHead({ title: 'データセットの管理 — Geo-Ganbatte-Gengoka-Coach' })

const datasets = ref<DatasetListItem[]>([])
const activeId = ref<string | null>(null)
const activeQuestionCount = ref(0)
const loading = ref(true)
const busy = ref<string | null>(null)

/** 操作の結果。**成功も失敗も画面に出す。** 押しても何も起きないを作らない */
const notice = ref<string | null>(null)
const error = ref<string | null>(null)

/** 同じ ID が既にあったときの確認。上書きは明示的に選ばせる */
const conflict = ref<{
    id: string
    mine: { name: string, questionCount: number, createdAt: string }
    theirs: { name: string, questionCount: number, createdAt: string }
} | null>(null)

/** 読み込んだファイルの中身。上書きを選んだときに投げ直すため持っておく */
const pending = ref<unknown | null>(null)
const fileName = ref<string | null>(null)
const warnings = ref<{ check: string, message: string }[]>([])

async function reload() {
    loading.value = true
    try {
        const r = await $fetch<{ datasets: DatasetListItem[], activeId: string | null, activeQuestionCount: number }>('/api/datasets')
        datasets.value = r.datasets
        activeId.value = r.activeId
        activeQuestionCount.value = r.activeQuestionCount
    }
    catch (e) {
        error.value = `一覧の取得に失敗した: ${message(e)}`
    }
    finally {
        loading.value = false
    }
}

const message = (e: unknown) => {
    const d = (e as { data?: { statusMessage?: string, message?: string } })?.data
    return d?.statusMessage ?? d?.message ?? (e instanceof Error ? e.message : String(e))
}

onMounted(reload)

/**
 * ファイルを読む。**読むだけで取り込まない。**
 * JSON として壊れていればここで分かる（サーバへ投げる前に気づける）。
 */
async function takeFile(file: File | null | undefined) {
    reset()
    if (!file) return
    fileName.value = file.name
    fileSize.value = file.size
    try {
        pending.value = JSON.parse(await file.text())
    }
    catch (e) {
        error.value = `JSON として読めない: ${message(e)}`
        pending.value = null
        return
    }
    await install(false)
}

async function onFile(event: Event) {
    const input = event.target as HTMLInputElement
    await takeFile(input.files?.[0])
    // **同じファイルを選び直せるようにする。** 値が残ると change が起きない
    input.value = ''
}

/**
 * ## ファイルを置ける場所を、見える大きさで用意する
 *
 * 素の `<input type="file">` は小さく、**取り込みの入口だと分かりにくい。**
 * 押せる大きさの領域と、ドラッグして落とせる領域を兼ねさせる。
 *
 * `<input>` は消さずに視覚的に隠すだけにする（`sr-only`）。
 * **`label` と結び付いているので、キーボードでも到達できる。**
 * 見た目のためにボタンを置いて `<input>` を消すと、支援技術から入口が消える。
 */
const dragging = ref(false)
const fileSize = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onDragOver(event: DragEvent) {
    event.preventDefault()
    dragging.value = true
}

function onDragLeave() {
    dragging.value = false
}

async function onDrop(event: DragEvent) {
    event.preventDefault()
    dragging.value = false
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    // **拡張子で弾かない。** 中身を読んで JSON かどうかで判断する
    await takeFile(file)
}

const prettySize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
        : `${Math.max(1, Math.round(bytes / 1024))}KB`

function reset() {
    notice.value = null
    error.value = null
    conflict.value = null
    warnings.value = []
}

async function install(force: boolean) {
    if (!pending.value) return
    busy.value = 'install'
    conflict.value = null
    try {
        const r = await $fetch<{ id: string, installed: { name: string, questionCount: number, termCount: number }, warnings: typeof warnings.value }>(
            '/api/datasets',
            { method: 'POST', body: { action: 'install', dataset: pending.value, force } },
        )
        warnings.value = r.warnings ?? []
        notice.value = `取り込んだ: ${r.installed.name}（出題 ${r.installed.questionCount} 件 / 用語 ${r.installed.termCount} 語）`
            + '。**使うには切り替えが必要である**'
        pending.value = null
        fileName.value = null
        fileSize.value = null
        await reload()
    }
    catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        const data = (e as { data?: { data?: unknown } }).data?.data
        if (status === 409) {
            // **黙って上書きしない。** 両方を見せて選ばせる
            conflict.value = data as typeof conflict.value
            return
        }
        if (status === 422) {
            const issues = (data as { issues?: { level: string, check: string, message: string }[] })?.issues ?? []
            error.value = `検証に失敗した（${issues.filter((i) => i.level === 'error').length} 件）。**1 件も取り込んでいない**\n`
                + issues.filter((i) => i.level === 'error').slice(0, 8).map((i) => `[${i.check}] ${i.message}`).join('\n')
            return
        }
        error.value = `取り込みに失敗した: ${message(e)}`
    }
    finally {
        busy.value = null
    }
}

async function use(id: string) {
    reset()
    // eslint-disable-next-line no-alert
    if (!confirm(`アクティブなデータを「${id}」で置き換える。\n\n控えは .backup/ に取る。続けるか？`)) return
    busy.value = id
    try {
        const r = await $fetch<{ backup: string, questionCount: number, attribution: string }>(
            '/api/datasets',
            { method: 'POST', body: { action: 'use', id } },
        )
        notice.value = `切り替えた（出題 ${r.questionCount} 件）。控え: ${r.backup}\n出典表示: ${r.attribution}`
        await reload()
    }
    catch (e) {
        error.value = `切り替えに失敗した: ${message(e)}`
    }
    finally {
        busy.value = null
    }
}

async function remove(id: string) {
    reset()
    const isActive = datasets.value.find((d) => d.id === id)?.active === true
    const extra = isActive
        // **いま使っているものを消す場合は、何が残るのかを先に言う**
        ? '\n\nこれはいま使っているデータである。出題（data/questions.json）は残るので学習は続けられる。'
            + '\n棚に戻すには配布物を取り込み直す。'
        : ''
    // eslint-disable-next-line no-alert
    if (!confirm(`「${id}」をライブラリから消す。\n\n進捗は残る（入れ直せば戻る）。${extra}\n\n続けるか？`)) return
    busy.value = id
    try {
        const r = await $fetch<{ removedActive: boolean, note: string }>(
            '/api/datasets',
            { method: 'POST', body: { action: 'remove', id } },
        )
        notice.value = `ライブラリから消した: ${id}。${r.note}`
        await reload()
    }
    catch (e) {
        error.value = `削除に失敗した: ${message(e)}`
    }
    finally {
        busy.value = null
    }
}
</script>

<template>
    <div class="mx-auto grid max-w-5xl gap-4 p-4">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
                <h1 class="text-xl font-bold text-slate-900">
                    データセットの管理
                </h1>
                <p class="text-sm text-slate-600">
                    配布された問題セットと用語辞書を取り込んで、切り替える。<strong>AI を使わない。消費 0。</strong>
                </p>
            </div>
            <NuxtLink to="/" class="rounded border border-slate-400 px-3 py-1.5 text-sm hover:bg-slate-50">
                学習に戻る
            </NuxtLink>
        </header>

        <!-- 取り込み -->
        <section aria-labelledby="install-heading" class="grid gap-2 rounded border border-slate-300 p-4">
            <h2 id="install-heading" class="text-base font-semibold text-slate-900">
                取り込む
            </h2>
            <p class="text-sm text-slate-700">
                <code>npm run dataset -- export</code> で書き出したファイルを選ぶ。
                <strong>検証に失敗したら 1 件も取り込まない。</strong>
            </p>

            <!--
                **入口を見える大きさにする。** 素の `<input type="file">` は小さく、
                取り込みの入口だと分かりにくかった。

                `<input>` は消さず `sr-only` で隠すだけにする。`label` と結び付いているので
                **キーボードでも到達できる。** 見た目のために `<input>` を消すと、
                支援技術から入口が消える。
            -->
            <div
                class="grid justify-items-center gap-2 rounded border-2 border-dashed p-6 transition-colors"
                :class="dragging
                    ? 'border-slate-900 bg-slate-100'
                    : 'border-slate-400 bg-slate-50'"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
            >
                <p class="text-sm text-slate-700">
                    ここにファイルを<strong>ドラッグ</strong>する
                </p>
                <p class="text-xs text-slate-500">
                    または
                </p>
                <label
                    class="cursor-pointer rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-900"
                    :class="busy !== null ? 'cursor-not-allowed opacity-40' : ''"
                >
                    ファイルを選ぶ…
                    <input
                        ref="fileInput"
                        type="file"
                        accept="application/json,.json"
                        :disabled="busy !== null"
                        class="sr-only"
                        @change="onFile"
                    >
                </label>
                <p v-if="fileName" class="text-xs text-slate-700">
                    選んだファイル: <strong>{{ fileName }}</strong>
                    <span v-if="fileSize">（{{ prettySize(fileSize) }}）</span>
                </p>
                <p v-else class="text-xs text-slate-500">
                    <code>.json</code> の配布ファイル（画像は含まれない）
                </p>
            </div>

            <p class="text-xs text-slate-600">
                画像・<code>data:</code> URL・API キーらしい文字列が入っていれば弾く。
                <strong>規約は読めば分かる。守られているかはコードで確かめる。</strong>
            </p>
        </section>

        <!-- 同じ ID があったときの確認 -->
        <section
            v-if="conflict"
            role="alert"
            aria-labelledby="conflict-heading"
            class="grid gap-2 rounded border border-amber-500 bg-amber-50 p-4"
        >
            <h2 id="conflict-heading" class="text-base font-semibold text-amber-900">
                同じ ID のデータセットが既にある：<code>{{ conflict.id }}</code>
            </h2>
            <div class="grid gap-1 text-sm text-amber-900 sm:grid-cols-2">
                <p>
                    <strong>こちら</strong>：{{ conflict.mine.name }}<br>
                    出題 {{ conflict.mine.questionCount }} 件 / 作成 {{ conflict.mine.createdAt.slice(0, 10) }}
                </p>
                <p>
                    <strong>先方</strong>：{{ conflict.theirs.name }}<br>
                    出題 {{ conflict.theirs.questionCount }} 件 / 作成 {{ conflict.theirs.createdAt.slice(0, 10) }}
                </p>
            </div>
            <p class="text-sm font-medium text-amber-900">
                自分で直した辞書が他人のデータで戻ると、直せることが売りなのに意味が無い。
                <strong>上書きは選んで行う。</strong>
            </p>
            <div class="flex flex-wrap gap-2">
                <button
                    type="button"
                    :disabled="busy !== null"
                    class="rounded bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-800 disabled:opacity-40"
                    @click="install(true)"
                >
                    上書きして取り込む
                </button>
                <button
                    type="button"
                    class="rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
                    @click="reset()"
                >
                    やめる
                </button>
            </div>
        </section>

        <p v-if="error" role="alert" class="whitespace-pre-line rounded border border-rose-400 bg-rose-50 p-3 text-sm text-rose-800">
            {{ error }}
        </p>
        <p v-if="notice" role="status" class="whitespace-pre-line rounded border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
            {{ notice }}
        </p>
        <div v-if="warnings.length" class="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <p class="font-medium">
                警告 {{ warnings.length }} 件（取り込みは済んでいる）
            </p>
            <ul class="mt-1 list-disc pl-5 text-xs">
                <li v-for="(w, i) in warnings.slice(0, 10)" :key="i">
                    [{{ w.check }}] {{ w.message }}
                </li>
            </ul>
        </div>

        <!-- 一覧 -->
        <section aria-labelledby="library-heading" class="grid gap-3">
            <h2 id="library-heading" class="text-base font-semibold text-slate-900">
                ライブラリ
            </h2>

            <p v-if="loading" role="status" class="text-sm text-slate-600">
                読み込み中…
            </p>

            <div v-else-if="!datasets.length" class="rounded border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                <p class="font-medium">
                    ライブラリは空である。<strong>同梱のデータだけがある</strong>（出題 {{ activeQuestionCount }} 件）。
                </p>
                <p class="mt-1 text-xs">
                    <code>npm run dataset -- export</code> で配布形式にすると、ここに並べられる。
                </p>
            </div>

            <article
                v-for="d in datasets"
                :key="d.id"
                class="grid gap-2 rounded border p-4"
                :class="d.active ? 'border-slate-900 bg-slate-50' : 'border-slate-300'"
            >
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 class="text-sm font-semibold text-slate-900">
                        <span v-if="d.active" class="mr-1 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white">
                            使用中
                        </span>
                        {{ d.name }}
                    </h3>
                    <code class="text-xs text-slate-600">{{ d.id }}</code>
                </div>

                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 sm:grid-cols-4">
                    <div>
                        <dt class="text-slate-500">作成者</dt>
                        <dd>{{ d.author }}</dd>
                    </div>
                    <div>
                        <dt class="text-slate-500">出題</dt>
                        <dd>{{ d.questionCount }} 件</dd>
                    </div>
                    <div>
                        <dt class="text-slate-500">用語</dt>
                        <dd>{{ d.termCount }} 語</dd>
                    </div>
                    <div>
                        <dt class="text-slate-500">出典元</dt>
                        <dd>{{ d.sources.length }} 件</dd>
                    </div>
                </dl>

                <!-- 進捗。**何問目かを言えることがこの機能の目的である** -->
                <div class="grid gap-1">
                    <div class="flex items-center gap-2">
                        <div
                            class="h-2 flex-1 overflow-hidden rounded bg-slate-200"
                            role="progressbar"
                            :aria-valuenow="d.progress.answered"
                            :aria-valuemin="0"
                            :aria-valuemax="d.progress.total"
                            :aria-label="`${d.name} の進捗`"
                        >
                            <div
                                class="h-full bg-slate-700"
                                :style="{ width: d.progress.total ? `${(d.progress.answered / d.progress.total) * 100}%` : '0%' }"
                            />
                        </div>
                        <p class="shrink-0 text-xs text-slate-700">
                            {{ d.progress.answered }} / {{ d.progress.total }}
                            <strong v-if="d.progress.done" class="text-emerald-700">完了</strong>
                        </p>
                    </div>
                    <p v-if="d.next" class="text-xs text-slate-600">
                        次に出るのは <strong>{{ d.next.index }} / {{ d.next.total }} 問目</strong>（<code>{{ d.next.questionId }}</code>）
                    </p>
                    <p v-else-if="d.progress.total" class="text-xs text-slate-600">
                        <strong>1 周した。</strong>先頭に戻さない（1 周したことが分からなくなるため）
                    </p>
                </div>

                <!-- 出典表示。**使う場所に置く** -->
                <div class="rounded bg-white p-2 text-xs">
                    <p class="text-slate-500">
                        出典表示（{{ d.license }}）。<strong>そのまま貼れる</strong>
                    </p>
                    <p class="mt-0.5 break-all font-mono text-slate-800">
                        {{ d.attribution }}
                    </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-if="!d.active && d.onShelf"
                        type="button"
                        :disabled="busy !== null"
                        class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
                        @click="use(d.id)"
                    >
                        これを使う
                    </button>

                    <!--
                        **アクティブなものも消せる。** 棚に 1 つだけのとき切り替え先が無く、
                        以前は一生消せなかった。由来を `library.json` に写しているので
                        棚を消しても出典表示は残る。
                    -->
                    <button
                        v-if="d.onShelf"
                        type="button"
                        :disabled="busy !== null"
                        class="rounded border border-rose-500 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        @click="remove(d.id)"
                    >
                        ライブラリから消す
                    </button>

                    <span v-if="d.active && !d.onShelf" class="text-xs text-slate-700">
                        <strong>棚には無いが、いま使っている。</strong>
                        学習は続けられる（出題は <code>data/questions.json</code> にある）。
                        棚に戻すには配布物を取り込み直す。
                    </span>
                    <span v-else-if="d.active" class="text-xs text-slate-600">
                        いま使っている。消しても学習は続けられる
                    </span>
                </div>
            </article>
        </section>

        <!-- **認証がないことを隠さない** -->
        <p class="rounded border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
            この画面はファイルを書き換えて消す。<strong>認証は無い。</strong>
            ローカル実行専用として設計しているため許容している。<strong>公開ホスティングしないこと。</strong>
        </p>
    </div>
</template>
