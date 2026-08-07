<script setup lang="ts">
/**
 * Maps JavaScript API による NoMove 表示。**既定では使わない。**
 *
 * `NUXT_PUBLIC_STREETVIEW_MODE=nomove` のときだけ有効になる。
 *
 * ## なぜ必要か
 *
 * **移動されると正解タグが無効になる。** タグは `panoId` に写っているものを記述している。
 * 学習者が別の地点へ移動して観察すると、見落とし判定と過剰申告判定の両方が狂う。
 * 利便性の問題ではなく**採点の正しさに関わる問題である。**
 *
 * Maps Embed API には移動を止めるパラメータがない（`pano` `location` `heading` `pitch` `fov` のみ）。
 * iframe の中なのでクリックを外側から止めることもできない。
 *
 * ## 課金（2026-08 時点で確認）
 *
 * | SKU | カテゴリ | 無料枠（月・SKU ごと） |
 * |---|---|---|
 * | 埋め込み（Embed） | Essentials | 無料・無制限 |
 * | **Dynamic Street View**（これ） | **Pro** | **5,000 リクエスト** |
 *
 * 無料枠は SKU ごとであり**プールされない**。Embed の利用が Pro 枠を消費することはない。
 * https://developers.google.com/maps/billing-and-pricing/pricing-categories
 *
 * **既定にしないのは、課金経路を既定で作らないためである。**
 *
 * ## 規約上の制約（Embed 版と同じ）
 *
 * - **画像データを保存・キャッシュしない。** 画像はブラウザ内にのみ存在する
 * - **帰属表記を改変・隠蔽しない。** `disableDefaultUI` で Google のロゴと利用規約リンクを消さない
 * - 画像取得エンドポイント（Street View Static API）は呼ばない
 */
const props = withDefaults(
  defineProps<{
    panoId: string
    heading?: number
    pitch?: number
  }>(),
  { heading: 0, pitch: 0 },
)

const config = useRuntimeConfig()
const jsKey = computed(() => String(config.public.googleMapsJsKey ?? ''))

const host = useTemplateRef<HTMLDivElement>('host')
const error = ref<string | null>(null)
let panorama: google.maps.StreetViewPanorama | null = null

/**
 * Maps JavaScript API を読み込む。多重読み込みを避けるため 1 度だけ注入する。
 */
function loadMapsApi(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { __ggg_maps_promise?: Promise<void> }
  if (w.__ggg_maps_promise) return w.__ggg_maps_promise

  w.__ggg_maps_promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const url = new URL('https://maps.googleapis.com/maps/api/js')
    url.searchParams.set('key', key)
    url.searchParams.set('v', 'weekly')
    url.searchParams.set('loading', 'async')
    script.src = url.toString()
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Maps JavaScript API の読み込みに失敗した'))
    document.head.append(script)
  })
  return w.__ggg_maps_promise
}

/**
 * パノラマを生成する。
 *
 * **既定値のままでは答えが漏れる。** 以下は必ず切ること。
 *
 * | オプション | 既定 | なぜ切るか |
 * |---|---|---|
 * | `addressControl` | 表示 | **住所と地名が出る。正解そのものである** |
 * | `showRoadLabels` | 表示 | **道路名が出る。言語と国が分かる** |
 * | `linksControl` | 表示 | 隣接パノラマへの矢印。移動できてしまう |
 * | `clickToGo` | 有効 | 地面のクリックで移動できてしまう |
 *
 * `disableDefaultUI` は使わない。**Google の帰属表記まで消える恐れがあるため。**
 * 必要なものだけを個別に false にする。
 */
function render(): void {
  if (!host.value || !props.panoId) return
  panorama = new google.maps.StreetViewPanorama(host.value, {
    pano: props.panoId,
    pov: { heading: props.heading, pitch: props.pitch },
    // --- NoMove ---
    clickToGo: false,
    linksControl: false,
    // --- 答えの漏洩を防ぐ ---
    addressControl: false,
    showRoadLabels: false,
    // --- 観察に必要なものは残す ---
    zoomControl: true,
    panControl: true,
    fullscreenControl: true,
    motionTracking: false,
    motionTrackingControl: false,
  })
}

onMounted(async () => {
  if (!jsKey.value) {
    error.value = 'NUXT_PUBLIC_GOOGLE_MAPS_JS_KEY が設定されていない'
    return
  }
  try {
    await loadMapsApi(jsKey.value)
    render()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

// 出題が切り替わったら同じインスタンスの pano を差し替える。作り直さない
watch(
  () => props.panoId,
  (next) => {
    if (panorama && next) panorama.setPano(next)
  },
)
</script>

<template>
  <div class="w-full">
    <div
      v-if="error"
      class="flex aspect-video w-full items-center justify-center rounded border border-amber-400 bg-amber-50 p-6 text-sm text-amber-900"
      role="status"
    >
      <p>
        {{ error }}<br>
        NoMove 表示には <strong>Maps JavaScript API を許可したブラウザ用キー</strong>が必要である。
        Embed 用のキーは Embed API のみに制限しているため使えない。
      </p>
    </div>

    <!--
      Google が帰属表記をこの要素の中に描画する。覆う要素を重ねてはならない。
      画像の保存・キャッシュもしない（ダウンロード導線を設けない）。
    -->
    <div
      v-else
      ref="host"
      class="aspect-video w-full rounded border border-slate-300"
      role="application"
      aria-label="出題地点の Street View。視点は回転できるが移動はできない"
    />
  </div>
</template>
