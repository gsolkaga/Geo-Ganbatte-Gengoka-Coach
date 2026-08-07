<script setup lang="ts">
/**
 * 1 モデル分のフィードバック。**パネルごとに独立して描画・完了・失敗する。**
 *
 * 全件揃うまで待つ実装にしない。モデル別の実測は
 * gemma 17〜19 秒 / gpt-oss 22〜27 秒 / Qwen 38〜45 秒 / Kimi 89〜300 秒超であり、
 * 揃うまで待つと最も遅いモデルに引きずられ、Kimi が失敗すると画面全体が失敗に見える。
 *
 * 生成中は **`content` と `reasoning` の文字数を別々に表示する。**
 * 合計だけ出すと、何も生成していないのに健全に見える。
 * 実測で `chunks=17,600` / `content=0 文字` / `reasoning=22,262 文字` の打ち切りがあった。
 */
import type { ModelGrading } from '#shared/types'
import type { StreamProgress } from '#shared/grading-stream'

const props = defineProps<{
    model: string
    /** 生成中の進捗。完了後は null */
    progress: StreamProgress | null
    /** 完了した結果。生成中は null */
    result: ModelGrading | null
}>()

const emit = defineEmits<{ regrade: [string] }>()

const showRaw = ref(false)

/** 推論だけ増えて content が 0 のままなら打ち切りの兆候である */
const stalling = computed(
    () =>
        props.progress !== null
        && props.progress.contentChars === 0
        && props.progress.reasoningChars > 2000,
)
</script>

<template>
    <article class="rounded border border-slate-300 p-4">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="font-medium text-slate-900">
                {{ model }}
            </h3>
            <p v-if="result" class="text-xs text-slate-600">
                {{ (result.totalMs / 1000).toFixed(1) }} 秒
                <span v-if="result.firstByteMs !== null">
                    / 初バイト {{ (result.firstByteMs / 1000).toFixed(1) }} 秒
                </span>
                / {{ result.chunks }} チャンク
            </p>
        </header>

        <!-- 生成中 -->
        <div v-if="!result" class="mt-2 text-sm text-slate-700" role="status" aria-live="polite">
            <p v-if="!progress">
                リクエスト送信中…
            </p>
            <template v-else>
                <p>
                    生成中 — 本文 <strong>{{ progress.contentChars }}</strong> 文字 /
                    推論 <strong>{{ progress.reasoningChars }}</strong> 文字 /
                    {{ progress.chunks }} チャンク / {{ (progress.elapsedMs / 1000).toFixed(0) }} 秒
                </p>
                <p v-if="stalling" class="mt-1 text-amber-700">
                    推論だけが増えて本文が 0 文字である。打ち切られる兆候である。
                    このまま待つか、中断して別のモデルで採点するかを選べる。
                </p>
            </template>
        </div>

        <!-- 打ち切り・エラー。生テキストは捨てない -->
        <div v-else-if="result.status !== 'ok'" class="mt-2 text-sm">
            <p class="text-rose-700">
                {{ result.status === 'truncated' ? '打ち切られた' : '失敗した' }}：{{ result.error }}
            </p>
            <p class="mt-1 text-xs text-slate-600">
                finish_reason: {{ result.finishReason ?? 'なし' }} —
                <strong>HTTP 200 は成功を意味しない。</strong>
            </p>

            <div v-if="result.rawContent || result.reasoning" class="mt-2">
                <button
                    type="button"
                    class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    @click="showRaw = !showRaw"
                >
                    {{ showRaw ? '生テキストを隠す' : '生テキストを見る' }}
                </button>
                <div v-if="showRaw" class="mt-2 grid gap-2">
                    <div v-if="result.rawContent">
                        <p class="text-xs font-medium text-slate-700">
                            本文（{{ result.rawContent.length }} 文字）
                        </p>
                        <pre class="max-h-64 overflow-auto rounded bg-slate-100 p-2 text-xs whitespace-pre-wrap">{{ result.rawContent }}</pre>
                    </div>
                    <div v-if="result.reasoning">
                        <p class="text-xs font-medium text-slate-700">
                            推論（{{ result.reasoning.length }} 文字）
                        </p>
                        <pre class="max-h-64 overflow-auto rounded bg-slate-100 p-2 text-xs whitespace-pre-wrap">{{ result.reasoning }}</pre>
                    </div>
                </div>
            </div>

            <!-- 再採点は人間が押す。自動で再実行しない -->
            <button
                type="button"
                class="mt-2 rounded border border-slate-400 px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                @click="emit('regrade', model)"
            >
                このモデルで再採点する（1 リクエスト消費）
            </button>
        </div>

        <!-- 成功 -->
        <div v-else-if="result.feedback" class="mt-2 grid gap-3 text-sm text-slate-800">
            <p>{{ result.feedback.summary }}</p>

            <p v-if="result.feedback.judgmentUnavailable" class="text-xs text-slate-600">
                このモデルは「見落としの判定はできない」と申告している。
            </p>
            <p v-else-if="!result.feedback.missedClues.length" class="text-xs text-slate-600">
                見落としの指摘はなかった。
            </p>

            <div v-if="result.feedback.failureModeExplanation">
                <h4 class="text-xs font-medium text-slate-700">
                    失敗モードの説明
                </h4>
                <p>{{ result.feedback.failureModeExplanation }}</p>
            </div>

            <div v-if="result.feedback.missedClues.length">
                <h4 class="text-xs font-medium text-slate-700">
                    見落とした手がかり
                </h4>
                <ul class="list-inside list-disc">
                    <li v-for="clue in result.feedback.missedClues" :key="clue.slot">
                        <strong>{{ clue.slot }}</strong>: {{ clue.whatWasThere }} — {{ clue.whyItMatters }}
                    </li>
                </ul>
            </div>

            <div v-if="result.feedback.wrongReasoning.length">
                <h4 class="text-xs font-medium text-slate-700">
                    誤った根拠
                </h4>
                <ul class="list-inside list-disc">
                    <li v-for="item in result.feedback.wrongReasoning" :key="item.slot">
                        <strong>{{ item.slot }}</strong>: {{ item.explanation }}
                    </li>
                </ul>
            </div>

            <div v-if="result.feedback.vocabulary.length">
                <h4 class="text-xs font-medium text-slate-700">
                    素人語と正規用語
                </h4>
                <ul class="list-inside list-disc">
                    <li v-for="item in result.feedback.vocabulary" :key="item.learnerWrote">
                        「{{ item.learnerWrote }}」→ {{ item.canonicalTerm }}（{{ item.note }}）
                    </li>
                </ul>
            </div>

            <div v-if="result.feedback.discriminationHint">
                <h4 class="text-xs font-medium text-slate-700">
                    候補の区別
                </h4>
                <p>{{ result.feedback.discriminationHint }}</p>
            </div>

            <div v-if="result.feedback.nextPriority.length">
                <h4 class="text-xs font-medium text-slate-700">
                    次に見るべき項目（このモデルの提案）
                </h4>
                <ol class="list-inside list-decimal">
                    <li v-for="slot in result.feedback.nextPriority" :key="slot">
                        {{ slot }}
                    </li>
                </ol>
            </div>

            <div v-if="result.feedback.discoveries.length">
                <h4 class="text-xs font-medium text-slate-700">
                    発見（名前のない手がかりを自力で見つけた）
                </h4>
                <ul class="list-inside list-disc">
                    <li v-for="item in result.feedback.discoveries" :key="item">
                        {{ item }}
                    </li>
                </ul>
            </div>

            <details v-if="result.reasoning" class="text-xs text-slate-600">
                <summary class="cursor-pointer">
                    推論を見る（{{ result.reasoning.length }} 文字）
                </summary>
                <pre class="mt-1 max-h-64 overflow-auto rounded bg-slate-100 p-2 whitespace-pre-wrap">{{ result.reasoning }}</pre>
            </details>
        </div>
    </article>
</template>
