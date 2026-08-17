/**
 * 開発サーバの接続先を決める。
 *
 * ## なぜ必要か（実測 2026-08-17）
 *
 * `npm run normalize:keys` が `fetch failed` を 10 回並べて終了した。
 *
 * ```
 * [1/10] q-jp-01 失敗: fetch failed
 * ...
 * [10/10] q-za-01 失敗: fetch failed
 * ```
 *
 * 原因は **接続先が `localhost:3000` 決め打ち**で、
 * 開発サーバが別のポートで起動していたことである（3000 が使用中だと Nuxt は 3001 に移る）。
 *
 * 問題は 3 つあった。
 *
 * 1. **どこへ繋ごうとしたのかを表示していない。** `fetch failed` だけでは分からない
 * 2. **接続できないと分かってから 10 回繰り返した。** 1 回目で止めるべきである
 * 3. **繋がるかを先に確認していない。** 消費するかもしれない処理の前に確かめる
 *
 * 幸い消費は 0 だった（送信できていないため）が、**運が良かっただけである。**
 *
 * ## やること
 *
 * 実行前に 1 回だけ確認する。**AI を呼ばない無償のエンドポイントを使う。**
 * `GGG_BASE_URL` があればそれだけを見る。無ければ既定のポートを順に試す。
 */

/** Nuxt が空きを探して移動する範囲。**闇雲に広げない** */
const CANDIDATE_PORTS = [3000, 3001, 3002, 3003] as const

export interface ProbeResult {
    baseUrl: string
    questionCount: number
}

export type Fetcher = (url: string) => Promise<{ ok: boolean, json: () => Promise<unknown> }>

/**
 * この URL が本アプリの API かを確認する。
 *
 * **`/api/questions` を使う。AI を呼ばず、リクエストを消費しない。**
 * 応答が `{ questions: [...] }` の形であることまで見る。
 * ポートに別のサービスが居る場合に取り違えないため。
 */
async function probe(baseUrl: string, fetcher: Fetcher): Promise<ProbeResult | null> {
    try {
        const response = await fetcher(`${baseUrl}/api/questions`)
        if (!response.ok) return null
        const body = (await response.json()) as { questions?: unknown }
        if (!Array.isArray(body.questions)) return null
        return { baseUrl, questionCount: body.questions.length }
    }
    catch {
        return null
    }
}

/**
 * 接続先を決める。見つからなければ**何をすればよいかを添えて**例外にする。
 *
 * @param fetcher テスト用に差し替える。既定は `fetch`
 */
export async function resolveBaseUrl(fetcher: Fetcher = defaultFetcher): Promise<ProbeResult> {
    const configured = process.env.GGG_BASE_URL?.replace(/\/+$/, '')

    if (configured) {
        const result = await probe(configured, fetcher)
        if (result) return result
        // **指定されたものを勝手に別のポートへ読み替えない**
        throw new Error(
            `GGG_BASE_URL に指定された ${configured} へ繋がらない。\n`
            + '  - 開発サーバが起動しているか（npm run dev）\n'
            + '  - URL とポートが合っているか\n'
            + 'を確認すること。',
        )
    }

    for (const port of CANDIDATE_PORTS) {
        const result = await probe(`http://localhost:${port}`, fetcher)
        if (result) return result
    }

    throw new Error(
        `開発サーバが見つからない（試したポート: ${CANDIDATE_PORTS.join(', ')}）。\n`
        + '  1. 別のターミナルで npm run dev を起動する\n'
        + '  2. 起動時に表示される URL のポートを確認する\n'
        + '  3. 3000〜3003 以外なら GGG_BASE_URL で指定する\n'
        + '     例: $env:GGG_BASE_URL="http://localhost:3010"\n'
        + '**リクエストは 1 つも消費していない。**',
    )
}

const defaultFetcher: Fetcher = async (url) => {
    const response = await fetch(url)
    return { ok: response.ok, json: () => response.json() as Promise<unknown> }
}
