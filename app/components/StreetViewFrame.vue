<script setup lang="ts">
/**
 * Maps Embed API の iframe。
 *
 * 規約上の制約（design.md「実装時の禁止事項」1〜4）
 * - **画像データを保存・キャッシュしない。** 画像はブラウザ内の iframe にのみ存在する
 * - **帰属表記を改変・隠蔽しない。** iframe に重ねる要素を置かない
 * - 画像取得エンドポイント（Street View Static API）は呼ばない。課金対象である
 * - 保存するのは pano ID と座標のみ
 *
 * Embed API はリクエスト無制限で無料。キーは iframe の URL に載るため隠蔽できず、
 * **HTTP リファラー制限が唯一の防御である。**
 */
const props = withDefaults(
  defineProps<{
    /** Street View のパノラマ ID。保存が許容されている唯一の識別子 */
    panoId: string
    heading?: number
    pitch?: number
    fov?: number
    /** スクリーンリーダー向けの説明。何が表示されているかを伝える */
    title?: string
    /**
     * 親要素の高さいっぱいに広げる。
     * ペイン分割したレイアウトで使う（`aspect-video` では行の高さに追従しない）。
     */
    fill?: boolean
  }>(),
  {
    heading: undefined,
    pitch: undefined,
    fov: undefined,
    title: '出題地点の Street View。視点を回転・移動して観察する',
    fill: false,
  },
)

/** `fill` のときは高さを親に任せる。そうでなければ 16:9 を保つ */
const boxClass = computed(() => (props.fill ? 'size-full' : 'aspect-video w-full'))

const config = useRuntimeConfig()
const embedKey = computed(() => String(config.public.googleEmbedKey ?? ''))

const src = computed(() => {
  if (!embedKey.value || !props.panoId) return ''
  const url = new URL('https://www.google.com/maps/embed/v1/streetview')
  url.searchParams.set('key', embedKey.value)
  // pano を指定する。座標指定より確実に同一のパノラマを表示できる
  url.searchParams.set('pano', props.panoId)
  if (props.heading !== undefined) url.searchParams.set('heading', String(props.heading))
  if (props.pitch !== undefined) url.searchParams.set('pitch', String(props.pitch))
  if (props.fov !== undefined) url.searchParams.set('fov', String(props.fov))
  return url.toString()
})
</script>

<template>
  <div :class="fill ? 'size-full min-h-0' : 'w-full'">
    <div
      v-if="!embedKey"
      :class="boxClass"
      class="flex items-center justify-center rounded border border-amber-400 bg-amber-50 p-6 text-sm text-amber-900"
      role="status"
    >
      <p>
        <code>NUXT_PUBLIC_GOOGLE_EMBED_KEY</code> が設定されていないため Street View を表示できない。<br>
        Maps Embed API のみに制限したキーを設定し、HTTP リファラー制限をかけること。
      </p>
    </div>

    <div
      v-else-if="!panoId"
      :class="boxClass"
      class="flex items-center justify-center rounded border border-slate-300 bg-slate-50 text-sm text-slate-600"
      role="status"
    >
      pano ID が指定されていない
    </div>

    <!--
      帰属表記は iframe 内に Google が描画する。覆う要素を置いてはならない。
      画像の保存・キャッシュもしない（ダウンロード導線を設けない）。
    -->
    <iframe
      v-else
      :src="src"
      :title="title"
      :class="boxClass"
      class="rounded border border-slate-300"
      loading="lazy"
      allowfullscreen
      referrerpolicy="no-referrer-when-downgrade"
    />
  </div>
</template>
