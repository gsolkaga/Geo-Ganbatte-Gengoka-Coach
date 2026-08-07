/**
 * タスク 12：出題データを 1 件登録する。
 *
 * 起動中の開発サーバの `POST /api/questions` を叩く。
 * pano の解決と著作権表記の確認はサーバ側（`server/utils/pano.ts`）で行われる。
 * **画像取得エンドポイントは呼ばない**（メタデータ照会のみ。無料でクォータも消費しない）。
 *
 * 座標は**人間が選ぶ**。選び方の注意。
 * - **有名観光地を避ける。** 個人投稿の全天球写真を拾いやすく、著作権表記が Google にならない
 * - **道路上の座標を選ぶ。** 出題は Street View の走行データを前提にしている
 * - 迷ったら複数の座標で試す。メタデータ照会は無料である
 *
 * 実行方法（開発サーバを起動した状態で）。
 *   node tools/add-question.mjs --country JP --lat 35.123 --lng 139.456 --difficulty 1
 *
 * 任意の引数: --heading 90 --note "メモ" --pano CAoSLEFG... --base http://localhost:3000
 */
const args = process.argv.slice(2)

function arg(name, fallback = null) {
    const index = args.indexOf(`--${name}`)
    if (index < 0 || index + 1 >= args.length) return fallback
    return args[index + 1]
}

const country = arg('country')
const lat = arg('lat')
const lng = arg('lng')
const difficulty = arg('difficulty')
const base = arg('base', 'http://localhost:3000')

if (!country || lat === null || lng === null || difficulty === null) {
    console.error('必須の引数が足りない。')
    console.error('  node tools/add-question.mjs --country JP --lat 35.1 --lng 139.4 --difficulty 1')
    console.error('')
    console.error('出題する国は curriculum.md の「出題リスト（10 問）」から引く。')
    process.exit(1)
}

const body = {
    country,
    lat: Number(lat),
    lng: Number(lng),
    difficulty: Number(difficulty),
    heading: Number(arg('heading', '0')),
    note: arg('note'),
    panoId: arg('pano'),
}

const response = await fetch(`${base}/api/questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
})

const text = await response.text()

if (!response.ok) {
    console.error(`登録しなかった（HTTP ${response.status}）`)
    console.error(text)
    // 422 は「著作権表記が Google 以外」など、仕様どおりの不採用である
    if (response.status === 422) {
        console.error('')
        console.error('別の座標を試すこと。メタデータ照会は無料なので何度試してもよい。')
    }
    process.exit(1)
}

const result = JSON.parse(text)
console.log('登録した。')
console.log(`  id         : ${result.created.id}`)
console.log(`  panoId     : ${result.created.panoId}`)
console.log(`  copyright  : ${result.created.copyright}`)
console.log(`  captureDate: ${result.created.captureDate}（学習者には表示されない）`)
console.log(`  再解決      : ${result.reresolved ? 'あり（座標から解決した）' : 'なし'}`)
console.log(`  登録件数    : ${result.total}`)
