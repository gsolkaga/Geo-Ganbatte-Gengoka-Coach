/**
 * 地域の日本語ラベルと**並び順**。
 *
 * `data/countries.json` の `region` は `west_europe` のような英語の識別子である。
 * 画面に出すのは日本語にする（選択肢の文言を英語にしない、という方針に合わせる）。
 *
 * ## 並びは地理順にする。五十音順にしない
 *
 * 候補国を選ぶとき、人は**地図の形で探す。**「北欧のどこか」と思ってから
 * ノルウェーとスウェーデンを見比べる。五十音順に並べると
 * 隣り合うべき国が画面の端と端に分かれてしまう。
 *
 * > **探し方に合わせて並べる。** 名前順は探し方ではない。
 *
 * 順序は西から東、北から南に流す。ヨーロッパ → アジア → アフリカ → 南北アメリカ →
 * オセアニアの順で、GeoGuessr の学習者が地域をまとめて覚える順に近い。
 */

/** 表示順。`data/countries.json` に出る 19 地域をすべて含む */
export const REGION_ORDER = [
    'nordic',
    'baltic',
    'west_europe',
    'south_europe',
    'east_europe',
    'former_soviet_asia',
    'middle_east',
    'south_asia',
    'southeast_asia',
    'east_asia',
    'north_africa',
    'west_africa',
    'east_africa',
    'southern_africa',
    'indian_ocean',
    'north_america',
    'central_america_caribbean',
    'south_america',
    'oceania',
] as const

export type RegionId = typeof REGION_ORDER[number]

export const REGION_LABELS: Record<string, string> = {
    nordic: '北欧',
    baltic: 'バルト三国',
    west_europe: '西欧',
    south_europe: '南欧',
    east_europe: '東欧',
    former_soviet_asia: '旧ソ連（中央アジア）',
    middle_east: '中東',
    south_asia: '南アジア',
    southeast_asia: '東南アジア',
    east_asia: '東アジア',
    north_africa: '北アフリカ',
    west_africa: '西アフリカ',
    east_africa: '東アフリカ',
    southern_africa: '南部アフリカ',
    indian_ocean: 'インド洋',
    north_america: '北米',
    central_america_caribbean: '中米・カリブ',
    south_america: '南米',
    oceania: 'オセアニア',
}

/** 未知の地域が来ても落とさない。**データが増えたときに国が消えるのを防ぐ** */
export function regionLabel(region: string | null): string {
    if (!region) return 'その他'
    return REGION_LABELS[region] ?? region
}

/**
 * 地域ごとにまとめる。**`REGION_ORDER` に無い地域は末尾に回す。**
 *
 * 並び順の配列に無いものを捨てる実装にすると、
 * `countries.json` に地域が増えたときに**国が画面から消える。**
 * 気づきにくいので、知らないものは後ろに付けて必ず出す。
 */
export function groupByRegion<T extends { region: string | null }>(
    items: T[],
): { region: string | null, label: string, items: T[] }[] {
    const buckets = new Map<string, T[]>()
    for (const item of items) {
        const key = item.region ?? ''
        const list = buckets.get(key)
        if (list) list.push(item)
        else buckets.set(key, [item])
    }

    const known = REGION_ORDER.filter((r) => buckets.has(r)).map((r) => String(r))
    const unknown = [...buckets.keys()].filter((k) => !known.includes(k)).sort()

    return [...known, ...unknown].map((key) => ({
        region: key === '' ? null : key,
        label: regionLabel(key === '' ? null : key),
        items: buckets.get(key) ?? [],
    }))
}
