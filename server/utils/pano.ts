/**
 * Street View の **メタデータ照会** のみを扱う。
 *
 * 禁止事項（design.md「実装時の禁止事項」1〜4）
 * - **画像取得エンドポイント（`/maps/api/streetview`）を呼ばない。** 課金対象である
 * - 画像データを保存・キャッシュしない
 * - 画像を AI へ送信しない
 *
 * このモジュールが組み立てる URL は `/maps/api/streetview/metadata` のみであり、
 * 画像のバイト列を一切扱わない（Property 9）。
 *
 * Nuxt の自動 import に依存しない純関数として書く。単体テストから直接読み込むためである。
 */
import type { PanoJudgement, PanoMetadata } from '../../shared/types'

/** メタデータ照会は無償。画像取得エンドポイントとは別物である */
export const STREETVIEW_METADATA_ENDPOINT
    = 'https://maps.googleapis.com/maps/api/streetview/metadata'

/** 座標から再解決するときの探索半径（メートル） */
export const RERESOLVE_RADIUS_M = 50

/** メタデータ照会の生レスポンス */
export interface RawPanoMetadata {
    status?: string
    copyright?: string
    date?: string
    pano_id?: string
    location?: { lat?: number, lng?: number }
}

export interface PanoLookupTarget {
    panoId?: string | null
    lat?: number | null
    lng?: number | null
}

export type MetadataFetcher = (url: string) => Promise<RawPanoMetadata>

/**
 * 照会 URL を組み立てる。
 * **必ず metadata エンドポイントを指す。** 画像取得の URL は組み立てない。
 */
export function buildMetadataUrl(params: {
    key: string
    panoId?: string | null
    lat?: number | null
    lng?: number | null
    radius?: number
}): string {
    const url = new URL(STREETVIEW_METADATA_ENDPOINT)
    url.searchParams.set('key', params.key)

    if (params.panoId) {
        url.searchParams.set('pano', params.panoId)
    }
    else if (typeof params.lat === 'number' && typeof params.lng === 'number') {
        url.searchParams.set('location', `${params.lat},${params.lng}`)
        url.searchParams.set('radius', String(params.radius ?? RERESOLVE_RADIUS_M))
    }
    else {
        throw new Error('panoId か座標のいずれかが必要である')
    }
    return url.toString()
}

export function normalizeMetadata(raw: RawPanoMetadata | null | undefined): PanoMetadata {
    return {
        status: raw?.status ?? 'UNKNOWN_ERROR',
        panoId: raw?.pano_id ?? null,
        copyright: raw?.copyright ?? null,
        // 撮影年月。管理モードのタグ付け補助にのみ使う。学習者には見せない
        captureDate: raw?.date ?? null,
        location:
            typeof raw?.location?.lat === 'number' && typeof raw?.location?.lng === 'number'
                ? { lat: raw.location.lat, lng: raw.location.lng }
                : null,
    }
}

/**
 * 著作権表記が Google 提供かを判定する（要件 1-8, 1-9）。
 *
 * 外部投稿のパノラマは権利者が投稿者であるため、出題データに採用しない。
 * 実際の表記は `© Google`、`© Google, Inc.` など。投稿者のものは `© 山田太郎` の形になる。
 */
export function isGoogleCopyright(copyright: string | null | undefined): boolean {
    if (!copyright) return false
    // 先頭の © / (c) / 空白を落としてから、Google で始まるかを見る。
    // 「© Alice Google」のような表記を誤って採用しないため、部分一致では判定しない
    const cleaned = copyright
        .replace(/^[\s©]*/, '')
        .replace(/^\(c\)\s*/i, '')
        .trim()
    return /^google\b/i.test(cleaned)
}

/**
 * 採用可否を判定する。
 *
 * - `status` が `OK` 以外 → 不採用（要件 1-7）
 * - 著作権表記が Google 以外 → 不採用（要件 1-9）
 */
export function judgePanoMetadata(
    meta: PanoMetadata,
    options: { reresolved?: boolean } = {},
): PanoJudgement {
    const reresolved = options.reresolved ?? false

    if (meta.status !== 'OK') {
        return {
            accepted: false,
            reason: `メタデータの status が ${meta.status} である`,
            reresolved,
        }
    }
    if (!isGoogleCopyright(meta.copyright)) {
        return {
            accepted: false,
            reason: `著作権表記が Google 提供でない（${meta.copyright ?? '表記なし'}）`,
            reresolved,
        }
    }
    return { accepted: true, reason: null, reresolved }
}

export interface PanoResolution {
    metadata: PanoMetadata
    judgement: PanoJudgement
}

/**
 * pano ID を検証し、失効している場合は保存済みの座標から再解決する（要件 1-5, 1-6, 1-7）。
 *
 * 再解決も失敗した場合は `accepted: false` を返す。呼び出し側がその出題をスキップする。
 */
export async function resolvePano(
    target: PanoLookupTarget,
    key: string,
    fetcher: MetadataFetcher,
): Promise<PanoResolution> {
    const hasCoords = typeof target.lat === 'number' && typeof target.lng === 'number'

    if (target.panoId) {
        const byPano = normalizeMetadata(
            await fetcher(buildMetadataUrl({ key, panoId: target.panoId })),
        )
        if (byPano.status === 'OK') {
            return { metadata: byPano, judgement: judgePanoMetadata(byPano) }
        }
        if (!hasCoords) {
            return {
                metadata: byPano,
                judgement: {
                    accepted: false,
                    reason: `pano ID が失効し、再解決用の座標も持っていない（status=${byPano.status}）`,
                    reresolved: false,
                },
            }
        }
    }

    if (!hasCoords) {
        throw new Error('panoId か座標のいずれかが必要である')
    }

    const byLocation = normalizeMetadata(
        await fetcher(buildMetadataUrl({ key, lat: target.lat, lng: target.lng })),
    )
    if (byLocation.status !== 'OK') {
        return {
            metadata: byLocation,
            judgement: {
                accepted: false,
                reason: `座標からの再解決も失敗した（status=${byLocation.status}）`,
                reresolved: true,
            },
        }
    }
    return {
        metadata: byLocation,
        judgement: judgePanoMetadata(byLocation, { reresolved: true }),
    }
}
