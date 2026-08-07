/**
 * `GET /api/countries` — 候補国の選択肢。
 *
 * `code` と `name` は人手作成の `countries-seed.json` が出典で、検証済みである。
 *
 * **`traffic_side` と `scripts` は返さない。** `verified: false` の値が大半であり
 * （`traffic_side` 9/102、`scripts` 1/102 のみ人手検証済み）、学習者に断定的に提示すると
 * 未検証の値を事実として渡すことになる。ガーナで多数決が誤った実測がある。
 *
 * **`languages` は `countries.json` に存在しない。** 自由記述にしたため突き合わせが成立せず、
 * 採用値が存在しない。期待するコードを書かないこと。
 */
import { readCountries } from '../utils/store'

interface CountryRow {
    code: string
    name?: string
    region?: string
}

export default defineEventHandler(async () => {
    const raw = (await readCountries()) as unknown as CountryRow[]
    const rows = Array.isArray(raw) ? raw : []
    return {
        count: rows.length,
        countries: rows
            .map((c) => ({ code: c.code, name: c.name ?? c.code, region: c.region ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    }
})
