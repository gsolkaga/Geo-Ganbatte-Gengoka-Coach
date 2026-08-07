/**
 * タスク 18：data/countries.json を生成する
 *
 * AI を使わない。既存のファイルから機械的に組み立てるだけである。
 *
 *   data/countries-seed.json      コードと日本語名（人手作成。正典）
 *   data/regions.json             地域グループ（人手作成）
 *   data/countries-merged.json    多数決の結果とモデル別の生出力
 *   data/countries-overrides.json 人手による訂正と確認の記録
 *
 * 重要：検証済みかどうかをフィールド単位で持たせる。
 *
 * 多数決の結果をそのまま「事実」として出力すると、アプリが未検証の値を
 * 断定的に学習者へ提示することになる。ガーナで多数決が誤った実測があるため、
 * 検証状態を捨ててはならない。
 *
 * languages は出力しない。自由記述にしたため突き合わせが成立せず、採用値が存在しない。
 *
 * 使い方:
 *   node scripts/build-countries.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))

const seed = read('countries-seed.json')
const merged = read('countries-merged.json')
const overrides = read('countries-overrides.json')
const regions = read('regions.json')

const regionOf = new Map()
for (const [region, codes] of Object.entries(regions.regions ?? {})) {
    for (const code of codes) regionOf.set(code, region)
}

const mergedBy = new Map(merged.map((r) => [r.code, r]))

/** 人手で訂正した、または人手で確認したフィールドの集合 */
const humanTouched = new Set()
for (const o of overrides.overrides ?? []) {
    if (o.status === 'confirmed') humanTouched.add(`${o.code}:${o.field}`)
}
for (const v of overrides.verified ?? []) {
    humanTouched.add(`${v.code}:${v.field}`)
}

/**
 * モデル間で値が割れていたかをフィールド単位で判定する。
 *
 * countries-merged.json には traffic_side_by_model しか残っておらず、
 * scripts のモデル別出力が保存されていない（merge 時に落ちている）。
 * disputed は行単位のフラグであり、どのフィールドが割れたのかを表さない。
 *
 * そのため生成結果の原文から票を再集計する。原文を残しておいたから復元できた。
 */
const votesOf = new Map()

const GEN_DIR = path.join('docs', 'generated-countries')
if (fs.existsSync(GEN_DIR)) {
    for (const file of fs.readdirSync(GEN_DIR)) {
        if (!file.endsWith('.json')) continue
        let rows
        try {
            const body = JSON.parse(fs.readFileSync(path.join(GEN_DIR, file), 'utf8'))
            rows = JSON.parse(body.choices[0].message.content).countries ?? []
        } catch {
            continue
        }
        const model = file.replace(/-batch\d+\.json$/, '')
        for (const r of rows) {
            if (!r?.code) continue
            if (!votesOf.has(r.code)) votesOf.set(r.code, new Map())
            const byField = votesOf.get(r.code)
            for (const field of ['traffic_side', 'scripts']) {
                if (r[field] === undefined) continue
                if (!byField.has(field)) byField.set(field, [])
                byField.get(field).push({ model, value: r[field] })
            }
        }
    }
}

const serialise = (v) => (Array.isArray(v) ? [...v].sort().join(',') : String(v ?? ''))

function isDisputed(code, field) {
    const votes = votesOf.get(code)?.get(field)
    if (!Array.isArray(votes) || votes.length === 0) return null

    // 空配列は「割れている」ではなく「答えなかった」。票から除く
    const answered = votes.filter((v) => !(Array.isArray(v.value) && v.value.length === 0))
    if (answered.length === 0) return null

    return new Set(answered.map((v) => serialise(v.value))).size > 1
}

const out = []
const missingRegion = []
const missingMerged = []

for (const { code, name } of seed) {
    const row = mergedBy.get(code)
    if (!row) missingMerged.push(code)

    const region = regionOf.get(code) ?? null
    if (!region) missingRegion.push(code)

    out.push({
        code,
        name,
        region,
        traffic_side: row?.traffic_side ?? null,
        scripts: row?.scripts ?? null,
        /**
         * true は人間が一次情報源で確認したことを意味する。
         * false は「多数決の結果であり未検証」であって「誤り」ではない。
         */
        verified: {
            traffic_side: humanTouched.has(`${code}:traffic_side`),
            scripts: humanTouched.has(`${code}:scripts`),
        },
        /** モデル間で値が割れていたか。null は判定材料がない */
        disputed: {
            traffic_side: isDisputed(code, 'traffic_side'),
            scripts: isDisputed(code, 'scripts'),
        },
    })
}

const outPath = path.join(DATA_DIR, 'countries.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 4) + '\n', 'utf8')

const n = (f) => out.filter((r) => r.verified[f]).length
const d = (f) => out.filter((r) => r.disputed[f]).length

console.log(`${out.length} カ国を ${outPath} に出力した`)
console.log('')
console.log('| フィールド | 人手検証済み | モデル間不一致 |')
console.log(`| traffic_side | ${n('traffic_side')} | ${d('traffic_side')} |`)
console.log(`| scripts      | ${n('scripts')} | ${d('scripts')} |`)
console.log('')
console.log('languages は出力していない（自由記述のため採用値が存在しない）。')
if (missingRegion.length) console.log(`地域未割り当て: ${missingRegion.join(' ')}`)
if (missingMerged.length) console.log(`生成結果なし: ${missingMerged.join(' ')}`)
console.log('')
console.log('verified が false の値を、学習者に断定的に提示しないこと。')
