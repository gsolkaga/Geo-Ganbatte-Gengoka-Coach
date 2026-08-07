import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2026-08-07',
    devtools: { enabled: true },

    // SPA + Nitro のサーバルート。SSR は不要（単一利用者・ローカル実行前提）
    ssr: false,

    css: ['~/assets/css/main.css'],

    vite: {
        plugins: [tailwindcss()],
    },

    typescript: {
        typeCheck: false,
        strict: true,
    },

    /**
     * Nuxt が環境変数から自動で上書きするのは `NUXT_` 接頭辞の付いた名前だけである。
     * `.env.example` と `scripts/*.mjs` は接頭辞なしの名前（`SAKURA_AI_TOKEN` など）を使っており、
     * そちらを正典とするため、既定値として `process.env` から読む。
     * `NUXT_SAKURA_AI_TOKEN` 形式での実行時上書きも従来どおり効く。
     */
    runtimeConfig: {
        // サーバ側のみ。ブラウザには露出しない
        sakuraAiToken: process.env.SAKURA_AI_TOKEN ?? '',
        sakuraAiBaseUrl: process.env.SAKURA_AI_BASE_URL ?? 'https://api.ai.sakura.ad.jp/v1',
        sakuraAiModelDefault: process.env.SAKURA_AI_MODEL_DEFAULT ?? 'gpt-oss-120b',
        /** 正規化は 1 プレイごとに走るため速度を優先する */
        sakuraAiModelNormalize: process.env.SAKURA_AI_MODEL_NORMALIZE ?? 'preview/gemma-4-31B-it',
        /** 採点は内容の質を優先する */
        sakuraAiModelGrade: process.env.SAKURA_AI_MODEL_GRADE ?? 'gpt-oss-120b',
        /**
         * Street View の **メタデータ照会専用** キー。
         * 画像取得エンドポイント（/streetview）は課金対象であり、呼び出さない。
         */
        googleStreetviewMetadataKey: process.env.GOOGLE_STREETVIEW_METADATA_KEY ?? '',

        public: {
            /**
             * Maps Embed API のキー。iframe の URL に載るため隠蔽できない。
             * HTTP リファラー制限が唯一の防御である。Embed API のみに制限すること。
             */
            googleEmbedKey: '',
        },
    },
})
