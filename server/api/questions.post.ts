/**
 * `POST /api/questions` — 出題データの登録（タスク 12）。
 *
 * 座標を受け取り、**無償のメタデータ照会**で pano を解決してから登録する。
 * - **画像取得エンドポイントは呼ばない**（課金対象）
 * - **著作権表記が Google 提供のものだけを採用する**（要件 1-8, 1-9）。
 *   個人投稿の全天球写真は権利者が投稿者であるため教材にしない
 * - 保存するのは pano ID と座標のみ（要件 1-4）
 * - **タグ（`slots`）はこの時点では空**（全スロット `unknown`）。タグ付けはタスク 20
 * - 撮影年月は保存するが、学習者向けレスポンス（`GET /api/questions`）では返さない
 *
 * タグ付け UI（管理モード）はタスク 19 である。ここは登録だけを行う。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import { z } from 'zod'
import { countryCodeSchema } from '../../shared/schemas'
import { createEmptySlots } from '../../shared/slots'
import type { Question } from '../../shared/types'
import { resolvePano } from '../utils/pano'
import type { RawPanoMetadata } from '../utils/pano'
import { appendPanoRejection, readCountries, readQuestions, writeQuestions } from '../utils/store'
import { localIsoString } from '../utils/ai'

const bodySchema = z.object({
    country: countryCodeSchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    heading: z.number().default(0),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** 既知の pano ID があれば優先して検証する。無ければ座標から解決する */
    panoId: z.string().min(1).nullable().default(null),
    region: z.string().nullable().default(null),
    note: z.string().nullable().default(null),
})

interface CountryRow {
    code: string
    name?: string
    region?: string
}

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

    const parsed = bodySchema.safeParse(await readBody(event))
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: `リクエストの形式が不正である: ${parsed.error.message}`,
        })
    }
    const body = parsed.data

    // 国コードの打ち間違いをここで弾く。countries.json は 102 カ国
    const countries = (await readCountries()) as unknown as CountryRow[]
    const countryRow = Array.isArray(countries)
        ? countries.find((c) => c.code === body.country)
        : undefined
    if (!countryRow) {
        throw createError({
            statusCode: 400,
            statusMessage: `countries.json に存在しない国コードである: ${body.country}`,
        })
    }

    const { metadata, judgement } = await resolvePano(
        { panoId: body.panoId, lat: body.lat, lng: body.lng },
        key,
        (url) => $fetch<RawPanoMetadata>(url),
    )

    if (!judgement.accepted || !metadata.panoId) {
        // 不採用は理由とともに記録して除外する（要件 1-9）
        await appendPanoRejection({
            ts: localIsoString(),
            panoId: metadata.panoId ?? body.panoId,
            reason: judgement.reason ?? '不明',
            copyright: metadata.copyright,
            status: metadata.status,
        })
        throw createError({
            statusCode: 422,
            statusMessage: `出題候補として採用しない: ${judgement.reason ?? '不明'}`,
        })
    }

    const existing = await readQuestions()
    if (existing.some((q) => q.panoId === metadata.panoId)) {
        throw createError({
            statusCode: 409,
            statusMessage: `この pano ID は既に登録されている: ${metadata.panoId}`,
        })
    }

    const sequence = existing.filter((q) => q.country === body.country).length + 1
    const question: Question = {
        id: `q-${body.country.toLowerCase()}-${String(sequence).padStart(2, '0')}`,
        panoId: metadata.panoId,
        fallback: {
            // 再解決した場合はメタデータ側の座標を採用する
            lat: metadata.location?.lat ?? body.lat,
            lng: metadata.location?.lng ?? body.lng,
            heading: body.heading,
        },
        country: body.country,
        region: body.region ?? countryRow.region ?? null,
        difficulty: body.difficulty,
        copyright: metadata.copyright ?? '',
        captureDate: metadata.captureDate,
        // タグ付けはタスク 20。この時点では全スロット unknown
        slots: createEmptySlots(),
        decisiveSlots: [],
        note: body.note,
        source: { draftBy: [] },
    }

    await writeQuestions([...existing, question])

    return {
        created: question,
        reresolved: judgement.reresolved,
        total: existing.length + 1,
    }
})
