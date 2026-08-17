/**
 * 無償枠の消費判定の単体テスト。**AI を使わない。**
 *
 * ## 何が起きたか（実測 2026-08-17）
 *
 * `preview/` の接頭辞が抜けたモデル ID で 65 リクエストの実行を始めた。
 * 4 モデルのうち 3 つが 400 になり、**15 回分が「消費 15」として記録された。**
 * 実際には 1 つも消費していない。届いたが推論に入る前に弾かれている。
 *
 * > **届いたことと、使われたことは別である。**
 *
 * 逆方向の誤りも一度やっている。打ち切り（`truncated`）を
 * 「成功していないから消費していない」と数えかけた。
 * **HTTP 200 で受け取っているのだから消費している。**
 */
import { describe, expect, it } from 'vitest'
import { httpStatusOf, isClientError, wasBilled } from '../shared/billing'

describe('httpStatusOf', () => {
    it('例外オブジェクトの status を読む（OpenAI SDK の APIError）', () => {
        expect(httpStatusOf({ status: 400 })).toBe(400)
        expect(httpStatusOf({ status: 504 })).toBe(504)
    })

    it('Error のメッセージから拾う', () => {
        expect(httpStatusOf(new Error('400 model not found'))).toBe(400)
        expect(httpStatusOf('Request failed 503 Service Unavailable')).toBe(503)
    })

    /** **max_tokens やチャンク数を状態コードと読んではならない** */
    it('本文中の他の数字を拾わない', () => {
        expect(httpStatusOf('finish_reason=length。max_tokens=8000 で打ち切られた')).toBeNull()
        expect(httpStatusOf('17600 チャンク受信、content 0 文字')).toBeNull()
        /**
         * **これは最初の実行で落ちた。** 512 は打ち切りの閾値であり状態コードではない。
         * しかもこのメッセージは `truncated`（= 消費している側）のものである。
         * 5xx と読むと、消費した呼び出しを消費していないと数えることになった。
         */
        expect(httpStatusOf('空白が 512 字以上続いたため打ち切った')).toBeNull()
        expect(httpStatusOf('候補 413 件を突き合わせた')).toBeNull()
        expect(httpStatusOf('生成に 428 秒かかった')).toBeNull()
    })

    /** 印があれば数量と区別できる */
    it('HTTP や status の印があれば拾う', () => {
        expect(httpStatusOf('HTTP 400: Bad Request')).toBe(400)
        expect(httpStatusOf('status: 429')).toBe(429)
        expect(httpStatusOf('status code 503')).toBe(503)
    })

    it('取れなければ null', () => {
        expect(httpStatusOf(null)).toBeNull()
        expect(httpStatusOf(undefined)).toBeNull()
        expect(httpStatusOf({})).toBeNull()
        expect(httpStatusOf({ status: 'bad' })).toBeNull()
    })

    /** 1xx〜3xx は状態コードとして拾わない（正規表現が 4xx/5xx だけを見る） */
    it('4xx と 5xx だけを拾う', () => {
        expect(httpStatusOf('200 OK')).toBeNull()
        expect(httpStatusOf('404 Not Found')).toBe(404)
    })
})

describe('isClientError', () => {
    it('4xx を true にする', () => {
        expect(isClientError(400)).toBe(true)
        expect(isClientError(404)).toBe(true)
        // **レート制限も消費していない。** 待たされただけである
        expect(isClientError(429)).toBe(true)
    })

    it('5xx と null を false にする', () => {
        expect(isClientError(500)).toBe(false)
        expect(isClientError(504)).toBe(false)
        expect(isClientError(null)).toBe(false)
    })
})

describe('wasBilled', () => {
    it('ok は消費する', () => {
        expect(wasBilled({ status: 'ok', error: null, totalMs: 5000 })).toBe(true)
    })

    /** **HTTP 200 で受け取っている。途中までしか来ていないだけである** */
    it('truncated は消費する', () => {
        expect(wasBilled({
            status: 'truncated',
            error: 'finish_reason=length。max_tokens=8000 で打ち切られた',
            totalMs: 119_900,
        })).toBe(true)
    })

    it('truncated は 0ms でも消費する（判定順序の確認）', () => {
        // 打ち切りの判定は所要時間より先に効く
        expect(wasBilled({ status: 'truncated', error: null, totalMs: 0 })).toBe(true)
    })

    /** **これが直したかった挙動である** */
    it('4xx は消費しない（httpStatus から）', () => {
        expect(wasBilled({
            status: 'error', error: 'model not found', httpStatus: 400, totalMs: 320,
        })).toBe(false)
    })

    it('4xx は消費しない（エラー文から）', () => {
        expect(wasBilled({
            status: 'error', error: '400 The model `gemma-4-31B-it` does not exist', totalMs: 320,
        })).toBe(false)
    })

    /** **504 は 300 秒待たされた後に返る。推論は動いていた** */
    it('5xx は消費する', () => {
        expect(wasBilled({
            status: 'error', error: '504 Gateway Timeout', httpStatus: 504, totalMs: 303_000,
        })).toBe(true)
    })

    it('トークン未設定は消費しない', () => {
        expect(wasBilled({
            status: 'error', error: 'SAKURA_AI_TOKEN が設定されていない', totalMs: 0,
        })).toBe(false)
    })

    /** 送信していれば必ず時間がかかる。0ms は組み立て段階の失敗である */
    it('0ms は消費しない', () => {
        expect(wasBilled({ status: 'error', error: '組み立てに失敗した', totalMs: 0 })).toBe(false)
    })

    it('状態が取れない error で時間がかかっていれば消費として数える', () => {
        // **分からないときは消費側に寄せる。** 少なく見せる方が危ない
        expect(wasBilled({ status: 'error', error: 'socket hang up', totalMs: 45_000 })).toBe(true)
    })
})
