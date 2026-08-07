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
        /**
         * `google` 名前空間の型を読み込む。`StreetViewNoMove.vue` で使う。
         *
         * 型検査を効かせる目的は補完ではない。**`addressControl` と `showRoadLabels` を
         * 取り違えると住所と道路名が表示され、正解が漏れる。** そこを型で守る。
         */
        tsConfig: {
            compilerOptions: {
                types: ['google.maps'],
            },
        },
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

            /**
             * Street View の表示方式。**既定は `embed`（無料・無制限）。**
             *
             *   embed   Maps Embed API。移動できてしまう
             *   nomove  Maps JavaScript API。移動を止められるが **Pro SKU で課金対象**
             *
             * `nomove` にする理由は利便性ではない。**移動されると正解タグが無効になる。**
             * タグは pano ID に写っているものを記述しているため、学習者が動くと
             * 見落とし判定と過剰申告判定の両方が狂う。
             *
             * 既定にしないのは、**課金経路を既定で作らない**ためである。
             */
            streetviewMode: process.env.NUXT_PUBLIC_STREETVIEW_MODE ?? 'embed',

            /**
             * Maps JavaScript API のキー。`streetviewMode=nomove` のときのみ使う。
             *
             * **Embed 用のキーは流用できない。** あちらは Embed API のみに制限しているため、
             * JavaScript API の呼び出しは弾かれる。別のキーを作り、
             * Maps JavaScript API のみに制限して HTTP リファラー制限をかけること。
             *
             * Dynamic Street View SKU（Pro カテゴリ）は**パノラマ単位の従量課金**である。
             * 無料枠は月 5,000 リクエスト（SKU ごと。他の SKU とプールされない）。
             */
            googleMapsJsKey: '',
        },
    },
})
