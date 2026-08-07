/**
 * タスク 6.1：pano ID 検証の単体テスト。
 *
 * 検証する性質
 * - 著作権表記が Google 以外のレスポンスを不採用と判定する（要件 1-9）
 * - `status` が異常な場合は座標から再解決する（要件 1-6）
 * - 再解決も失敗した場合は不採用とする（要件 1-7）
 * - Property 9: 画像取得エンドポイントを呼ばない
 */
import { describe, expect, it, vi } from 'vitest'
import {
    STREETVIEW_METADATA_ENDPOINT,
    buildMetadataUrl,
    isGoogleCopyright,
    judgePanoMetadata,
    normalizeMetadata,
    resolvePano,
} from '../server/utils/pano'
import type { RawPanoMetadata } from '../server/utils/pano'

const KEY = 'test-key'

describe('isGoogleCopyright', () => {
    it.each(['© Google', '©Google', '© Google, Inc.', '(c) Google'])(
        'Google 提供の表記を受理する: %s',
        (copyright) => {
            expect(isGoogleCopyright(copyright)).toBe(true)
        },
    )

    it.each(['© 山田太郎', '© Alice Google', '© Kenji Suzuki', '', null, undefined])(
        'Google 以外の表記を拒否する: %s',
        (copyright) => {
            expect(isGoogleCopyright(copyright)).toBe(false)
        },
    )
})

describe('judgePanoMetadata', () => {
    it('著作権表記が Google 以外なら不採用とし、理由を返す（要件 1-9）', () => {
        const judgement = judgePanoMetadata(
            normalizeMetadata({ status: 'OK', copyright: '© 山田太郎', pano_id: 'p1' }),
        )
        expect(judgement.accepted).toBe(false)
        expect(judgement.reason).toContain('Google 提供でない')
    })

    it('status が OK かつ Google 提供なら採用する', () => {
        const judgement = judgePanoMetadata(
            normalizeMetadata({ status: 'OK', copyright: '© Google', pano_id: 'p1' }),
        )
        expect(judgement.accepted).toBe(true)
        expect(judgement.reason).toBeNull()
    })

    it('status が OK 以外なら不採用とする', () => {
        const judgement = judgePanoMetadata(normalizeMetadata({ status: 'ZERO_RESULTS' }))
        expect(judgement.accepted).toBe(false)
        expect(judgement.reason).toContain('ZERO_RESULTS')
    })
})

describe('buildMetadataUrl', () => {
    it('メタデータ照会のエンドポイントのみを組み立てる（画像取得を呼ばない）', () => {
        const url = buildMetadataUrl({ key: KEY, panoId: 'p1' })
        expect(url.startsWith(`${STREETVIEW_METADATA_ENDPOINT}?`)).toBe(true)
        expect(url).toContain('pano=p1')
        // 画像取得エンドポイントは `/streetview?` で終わる。metadata が必ず付くこと
        expect(new URL(url).pathname).toBe('/maps/api/streetview/metadata')
    })

    it('座標指定では radius を付ける', () => {
        const url = buildMetadataUrl({ key: KEY, lat: 35.1, lng: 139.2 })
        expect(url).toContain('location=35.1%2C139.2')
        expect(url).toContain('radius=50')
    })

    it('panoId も座標も無ければ例外を投げる', () => {
        expect(() => buildMetadataUrl({ key: KEY })).toThrow()
    })
})

describe('resolvePano', () => {
    it('pano ID が有効なら再解決しない', async () => {
        const fetcher = vi.fn(async (): Promise<RawPanoMetadata> => ({
            status: 'OK',
            copyright: '© Google',
            pano_id: 'p1',
            date: '2023-06',
            location: { lat: 1, lng: 2 },
        }))

        const { metadata, judgement } = await resolvePano({ panoId: 'p1', lat: 1, lng: 2 }, KEY, fetcher)

        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(judgement).toEqual({ accepted: true, reason: null, reresolved: false })
        expect(metadata.captureDate).toBe('2023-06')
    })

    it('pano ID が失効していれば座標から再解決する（要件 1-6）', async () => {
        const fetcher = vi
            .fn<(url: string) => Promise<RawPanoMetadata>>()
            .mockResolvedValueOnce({ status: 'NOT_FOUND' })
            .mockResolvedValueOnce({ status: 'OK', copyright: '© Google', pano_id: 'p2' })

        const { metadata, judgement } = await resolvePano(
            { panoId: 'p1', lat: 35.1, lng: 139.2 },
            KEY,
            fetcher,
        )

        expect(fetcher).toHaveBeenCalledTimes(2)
        expect(fetcher.mock.calls[1]![0]).toContain('location=')
        expect(judgement.accepted).toBe(true)
        expect(judgement.reresolved).toBe(true)
        expect(metadata.panoId).toBe('p2')
    })

    it('再解決も失敗すれば不採用とする（要件 1-7）', async () => {
        const fetcher = vi
            .fn<(url: string) => Promise<RawPanoMetadata>>()
            .mockResolvedValue({ status: 'ZERO_RESULTS' })

        const { judgement } = await resolvePano({ panoId: 'p1', lat: 35.1, lng: 139.2 }, KEY, fetcher)

        expect(judgement.accepted).toBe(false)
        expect(judgement.reresolved).toBe(true)
        expect(judgement.reason).toContain('再解決も失敗')
    })

    it('再解決した先が Google 以外の投稿なら不採用とする', async () => {
        const fetcher = vi
            .fn<(url: string) => Promise<RawPanoMetadata>>()
            .mockResolvedValueOnce({ status: 'NOT_FOUND' })
            .mockResolvedValueOnce({ status: 'OK', copyright: '© 山田太郎', pano_id: 'p2' })

        const { judgement } = await resolvePano({ panoId: 'p1', lat: 1, lng: 2 }, KEY, fetcher)

        expect(judgement.accepted).toBe(false)
        expect(judgement.reason).toContain('Google 提供でない')
    })

    it('座標を持たない失効 pano ID は再解決を試みない', async () => {
        const fetcher = vi
            .fn<(url: string) => Promise<RawPanoMetadata>>()
            .mockResolvedValue({ status: 'NOT_FOUND' })

        const { judgement } = await resolvePano({ panoId: 'p1' }, KEY, fetcher)

        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(judgement.accepted).toBe(false)
        expect(judgement.reason).toContain('座標も持っていない')
    })
})
