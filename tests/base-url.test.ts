/**
 * 接続先の解決（回帰テスト）。
 *
 * ## なぜこのテストがあるか
 *
 * `npm run normalize:keys` が `fetch failed` を 10 回並べて終了した（2026-08-17）。
 * 接続先が `localhost:3000` 決め打ちで、開発サーバは別のポートに居た。
 *
 * 表示されたのは `fetch failed` だけである。
 * **どこへ繋ごうとしたのかも、何をすればよいのかも出なかった。**
 *
 * 消費は 0 だったが、**繋がるかを確認する前に本処理へ入る作りだった。**
 * 消費する処理の前に確認する。
 */
import { describe, expect, it } from 'vitest'
import { resolveBaseUrl } from '../scripts/lib/base-url'
import type { Fetcher } from '../scripts/lib/base-url'

/** 指定した URL だけが応答する fetch。呼ばれた URL を記録する */
function fakeFetcher(responders: Record<string, unknown>) {
    const calls: string[] = []
    const fetcher: Fetcher = async (url) => {
        calls.push(url)
        const body = responders[url]
        if (body === undefined) throw new Error('fetch failed')
        return { ok: true, json: async () => body }
    }
    return { fetcher, calls }
}

const questions = (n: number) => ({ questions: Array.from({ length: n }, (_, i) => ({ id: `q-${i}` })) })

describe('resolveBaseUrl', () => {
    it('3000 で見つかれば他を試さない', async () => {
        const { fetcher, calls } = fakeFetcher({ 'http://localhost:3000/api/questions': questions(10) })
        const result = await resolveBaseUrl(fetcher)
        expect(result.baseUrl).toBe('http://localhost:3000')
        expect(result.questionCount).toBe(10)
        expect(calls).toEqual(['http://localhost:3000/api/questions'])
    })

    /** **これが実際に起きた条件である。** Nuxt は 3000 が埋まると 3001 に移る */
    it('3000 が埋まっていても 3001 を見つける', async () => {
        const { fetcher, calls } = fakeFetcher({ 'http://localhost:3001/api/questions': questions(10) })
        const result = await resolveBaseUrl(fetcher)
        expect(result.baseUrl).toBe('http://localhost:3001')
        expect(calls.length).toBe(2)
    })

    /** ポートに別のサービスが居る場合に取り違えない */
    it('応答が questions の形でなければ採用しない', async () => {
        const { fetcher } = fakeFetcher({
            'http://localhost:3000/api/questions': { message: 'これは別のサービスである' },
            'http://localhost:3001/api/questions': questions(10),
        })
        expect((await resolveBaseUrl(fetcher)).baseUrl).toBe('http://localhost:3001')
    })

    it('どこにも無ければ手順を添えて例外にする', async () => {
        const { fetcher } = fakeFetcher({})
        await expect(resolveBaseUrl(fetcher)).rejects.toThrow(/npm run dev/)
        await expect(resolveBaseUrl(fetcher)).rejects.toThrow(/GGG_BASE_URL/)
        // **消費していないことを明示する**
        await expect(resolveBaseUrl(fetcher)).rejects.toThrow(/消費していない/)
    })

    describe('GGG_BASE_URL が指定された場合', () => {
        const setEnv = (value: string | undefined) => {
            if (value === undefined) delete process.env.GGG_BASE_URL
            else process.env.GGG_BASE_URL = value
        }

        it('指定された URL を使う', async () => {
            setEnv('http://localhost:3010')
            try {
                const { fetcher, calls } = fakeFetcher({ 'http://localhost:3010/api/questions': questions(10) })
                expect((await resolveBaseUrl(fetcher)).baseUrl).toBe('http://localhost:3010')
                expect(calls).toEqual(['http://localhost:3010/api/questions'])
            }
            finally {
                setEnv(undefined)
            }
        })

        it('末尾のスラッシュを落とす', async () => {
            setEnv('http://localhost:3010/')
            try {
                const { fetcher } = fakeFetcher({ 'http://localhost:3010/api/questions': questions(1) })
                expect((await resolveBaseUrl(fetcher)).baseUrl).toBe('http://localhost:3010')
            }
            finally {
                setEnv(undefined)
            }
        })

        /** **指定されたものを勝手に別のポートへ読み替えない** */
        it('繋がらなければ既定のポートへ逃げない', async () => {
            setEnv('http://localhost:3010')
            try {
                const { fetcher, calls } = fakeFetcher({ 'http://localhost:3000/api/questions': questions(10) })
                await expect(resolveBaseUrl(fetcher)).rejects.toThrow(/3010/)
                expect(calls).toEqual(['http://localhost:3010/api/questions'])
            }
            finally {
                setEnv(undefined)
            }
        })
    })
})
