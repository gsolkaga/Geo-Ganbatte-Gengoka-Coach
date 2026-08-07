/**
 * `GET /api/pano-validate`
 *
 * pano ID の有効性を **無償のメタデータ照会** で確認する（要件 1-5〜1-9）。
 *
 * - **画像取得エンドポイントは呼ばない**（課金対象）
 * - 著作権表記が Google 提供でない場合は不採用として理由を返す
 * - `status` が異常な場合は保存済み座標から再解決を試みる
 * - 撮影年月は返すが、**学習者向けの応答には含めない**（撮影年そのものがメタである）
 *
 * 認証は無い。ローカル実行前提のため許容する。**公開ホスティングする場合は認証が必要である。**
 */
import { resolvePano } from '../utils/pano'
import type { RawPanoMetadata } from '../utils/pano'
import { appendPanoRejection } from '../utils/store'
import { localIsoString } from '../utils/ai'

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig(event)
    const key = String(
        config.googleStreetviewMetadataKey || process.env.GOOGLE_STREETVIEW_METADATA_KEY || '',
    )
    if (!key) {
        throw createError({
            statusCode: 500,
            statusMessage: 'GOOGLE_STREETVIEW_METADATA_KEY が設定されていない',
        })
    }

    const query = getQuery(event)
    const panoId = typeof query.panoId === 'string' && query.panoId ? query.panoId : null
    const lat = toNumberOrNull(query.lat)
    const lng = toNumberOrNull(query.lng)
    // 既定は学習者向け。撮影年月は管理モードのみに返す
    const mode = query.mode === 'admin' ? 'admin' : 'learner'

    if (!panoId && (lat === null || lng === null)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'panoId か lat/lng のいずれかが必要である',
        })
    }

    const { metadata, judgement } = await resolvePano(
        { panoId, lat, lng },
        key,
        (url) => $fetch<RawPanoMetadata>(url),
    )

    // 失効・不採用は理由とともに記録する（要件 1-7, 1-9）
    if (!judgement.accepted) {
        await appendPanoRejection({
            ts: localIsoString(),
            panoId: metadata.panoId ?? panoId,
            reason: judgement.reason ?? '不明',
            copyright: metadata.copyright,
            status: metadata.status,
        })
    }

    return {
        accepted: judgement.accepted,
        reason: judgement.reason,
        reresolved: judgement.reresolved,
        status: metadata.status,
        panoId: metadata.panoId,
        copyright: metadata.copyright,
        location: metadata.location,
        // 学習者向けの応答には撮影年月を含めない
        ...(mode === 'admin' ? { captureDate: metadata.captureDate } : {}),
    }
})

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}
