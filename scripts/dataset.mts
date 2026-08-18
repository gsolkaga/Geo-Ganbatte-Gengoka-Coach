/**
 * 学習用データセットの配布・取り込み・切り替え・ログ公開（AI 未使用、消費 0）。
 *
 * ```
 * npm run dataset -- list                       持っているデータセットと進捗
 * npm run dataset -- export                     いまのアクティブを配布形式で書き出す
 * npm run dataset -- install <file>             ライブラリに入れる
 * npm run dataset -- use <id>                   アクティブを切り替える
 * npm run dataset -- log                        回答ログを配布形式で書き出す
 * ```
 *
 * ## アクティブとライブラリを分ける
 *
 * ```
 * data/datasets/<id>/dataset.json   ライブラリ（取り込んだもの。読むだけ）
 * data/questions.json               アクティブ（道具が全部これを見る）
 * data/glossary.json                アクティブ
 * data/library.json                 一覧と、いま何が選ばれているか
 * data/progress.json                データセットごとの進捗
 * ```
 *
 * **道具（`combo` / `coverage` / `normalize:keys` / `compare`）を書き換えないため**に
 * アクティブの置き場所を変えなかった。切り替えはライブラリからアクティブへの複製である。
 *
 * > **既にあるものを壊さずに層を足す。**
 *
 * 切り替えの前に必ず控えを取る（`.backup/<日時>/`）。**取り消せない操作にしない。**
 */
import fs from 'node:fs'
import path from 'node:path'
import {
    DATASET_FORMAT_VERSION,
    DATASET_KIND,
    LIBRARY_FORMAT_VERSION,
    PROGRESS_FORMAT_VERSION,
    buildLogExport,
    collectSources,
    datasetId as makeDatasetId,
    initProgress,
    nextQuestion,
    selectUsedTerms,
    summarizeProgress,
    validateDataset,
    validateLogExport,
} from '../shared/dataset'
import type { Dataset, Library, ProgressFile } from '../shared/dataset'
import type { Question, Term } from '../shared/types'

const DATA = 'data'
const QUESTIONS = path.join(DATA, 'questions.json')
const GLOSSARY = path.join(DATA, 'glossary.json')
const LIBRARY = path.join(DATA, 'library.json')
const PROGRESS = path.join(DATA, 'progress.json')
const LIB_DIR = path.join(DATA, 'datasets')
const RUNS = path.join(DATA, 'runs')

const [sub, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flag = (n: string) => process.argv.includes(`--${n}`)
const opt = (n: string) => {
    const i = process.argv.indexOf(`--${n}`)
    return i >= 0 ? process.argv[i + 1] : undefined
}

const readJson = <T>(p: string, fallback: T): T =>
    fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback
const writeJson = (p: string, v: unknown, indent = 4) => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, `${JSON.stringify(v, null, indent)}\n`, 'utf8')
}

/**
 * ライブラリ。**一覧はディレクトリから読む。**
 *
 * `data/library.json` に一覧を持たせると、**配布物を置いただけでは使えない。**
 * リポジトリに追加のデータセットを同梱しても、取り込み操作を通すまで見えなくなる。
 *
 * > **置いてあるものが一覧である。索引を正典にしない。**
 *
 * `library.json` は「いま何が選ばれているか」だけを持つ。
 * 索引が消えても復元できるので、**利用者ごとの状態として `.gitignore` に入れられる。**
 */
function loadLibrary(): Library {
    const saved = readJson<Partial<Library>>(LIBRARY, {})
    return {
        formatVersion: LIBRARY_FORMAT_VERSION,
        activeId: saved.activeId ?? null,
        entries: scanLibraryDir(),
    }
}

/** `data/datasets/<id>/dataset.json` を読んで一覧を作る */
function scanLibraryDir() {
    if (!fs.existsSync(LIB_DIR)) return []
    const out = []
    for (const id of fs.readdirSync(LIB_DIR)) {
        const file = path.join(LIB_DIR, id, 'dataset.json')
        if (!fs.existsSync(file)) continue
        try {
            const d: Dataset = JSON.parse(fs.readFileSync(file, 'utf8'))
            out.push({
                id,
                name: d.meta.name,
                author: d.meta.author,
                license: d.meta.license,
                attribution: d.meta.attribution,
                questionCount: d.questions.length,
                termCount: d.glossary.terms.length,
                installedAt: fs.statSync(file).mtime.toISOString(),
                createdAt: d.meta.createdAt,
            })
        }
        catch {
            console.log(`  **読めないデータセットがある: ${file}**`)
        }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
}

function loadProgress(): ProgressFile {
    return readJson<ProgressFile>(PROGRESS, { formatVersion: PROGRESS_FORMAT_VERSION, byDataset: {} })
}
function knownCountries(): string[] {
    const c = readJson<any>(path.join(DATA, 'countries.json'), [])
    return (Array.isArray(c) ? c : c.countries).map((x: { code: string }) => x.code)
}

/** 控えを取る。**取り消せない操作にしない** */
function backup(files: string[]): string {
    const dir = path.join('.backup', new Date().toISOString().replace(/[:.]/g, '-'))
    fs.mkdirSync(dir, { recursive: true })
    for (const f of files) {
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)))
    }
    return dir
}

function reportIssues(issues: ReturnType<typeof validateDataset>, stopOnError: boolean): boolean {
    const errors = issues.filter((i) => i.level === 'error')
    const warnings = issues.filter((i) => i.level === 'warning')
    if (warnings.length) {
        console.log(`## 警告 ${warnings.length} 件`)
        for (const w of warnings.slice(0, 15)) console.log(`  [${w.check}] ${w.message}`)
        if (warnings.length > 15) console.log(`  … 他 ${warnings.length - 15} 件`)
        console.log('')
    }
    if (!errors.length) return true
    console.log(`## **エラー ${errors.length} 件**`)
    for (const e of errors.slice(0, 30)) console.log(`  [${e.check}] ${e.message}`)
    if (errors.length > 30) console.log(`  … 他 ${errors.length - 30} 件`)
    console.log('')
    if (stopOnError) {
        console.log('**半分入った状態は、どちらのデータなのか分からなくなる。1 件も入れない。**')
        process.exit(1)
    }
    return false
}

// ============================================================
// list
// ============================================================

function cmdList() {
    const lib = loadLibrary()
    const prog = loadProgress()

    console.log('# 持っているデータセット（AI 未使用、消費 0）')
    console.log('')

    if (!lib.entries.length) {
        console.log('ライブラリは空である。**アクティブなデータだけがある。**')
        const q = readJson<Question[]>(QUESTIONS, [])
        console.log(`  data/questions.json: 出題 ${q.length} 件`)
        console.log('')
        console.log('配布形式にするには: npm run dataset -- export')
        return
    }

    console.log('| | id | 名前 | 作成者 | 出題 | 用語 | 進捗 |')
    console.log('|---|---|---|---|---|---|---|')
    for (const e of lib.entries) {
        const active = e.id === lib.activeId ? '**→**' : ''
        const p = prog.byDataset[e.id]
        const ids = datasetQuestionIds(e.id)
        const s = p ? summarizeProgress(p, ids) : { answered: 0, total: ids.length, remaining: ids.length, done: false }
        console.log(`| ${active} | \`${e.id}\` | ${e.name} | ${e.author} | ${e.questionCount} | ${e.termCount} | ${s.answered} / ${s.total}${s.done ? ' **完了**' : ''} |`)
    }
    console.log('')

    if (lib.activeId) {
        const p = prog.byDataset[lib.activeId]
        const ids = datasetQuestionIds(lib.activeId)
        const nx = p ? nextQuestion(p, ids) : null
        if (nx) console.log(`次に出るのは **${nx.index} / ${nx.total} 問目**（\`${nx.questionId}\`）`)
        else if (p) console.log('**このデータセットは 1 周した。** 先頭に戻さない（1 周したことが分からなくなる）')
    }
    console.log('')
    console.log('切り替え: npm run dataset -- use <id>')
    console.log('出典表示は各データセットの attribution を使う（npm run dataset -- list の後に dataset.json を見よ）')
}

function datasetQuestionIds(id: string): string[] {
    const p = path.join(LIB_DIR, id, 'dataset.json')
    if (!fs.existsSync(p)) return []
    const d: Dataset = JSON.parse(fs.readFileSync(p, 'utf8'))
    return d.questions.map((q) => q.id)
}

// ============================================================
// export
// ============================================================

function cmdExport() {
    const out = opt('out') ?? path.join('dist', 'ggg-dataset.json')
    const name = opt('name') ?? 'Geo-Ganbatte-Gengoka-Coach 標準データセット'
    const author = opt('author') ?? 'gsolkaga'
    const repo = 'https://github.com/gsolkaga/Geo-Ganbatte-Gengoka-Coach'

    const questionsAll = readJson<Question[]>(QUESTIONS, [])
    const glossaryAll = readJson<{ terms: Term[] }>(GLOSSARY, { terms: [] }).terms

    const pick = opt('questions')?.split(',').map((s) => s.trim()).filter(Boolean)
    const questions = pick ? questionsAll.filter((q) => pick.includes(q.id)) : questionsAll
    if (pick) {
        const missing = pick.filter((id) => !questions.some((q) => q.id === id))
        if (missing.length) {
            console.error(`**知らない出題 ID がある: ${missing.join(', ')}**`)
            process.exit(1)
        }
    }

    // **既定は辞書を丸ごと配る。** 絞ると「次に見るべき欄」の計算が痩せる
    const terms = flag('used-terms-only') ? selectUsedTerms(questions, glossaryAll) : glossaryAll

    const dataset: Dataset = {
        kind: DATASET_KIND,
        formatVersion: DATASET_FORMAT_VERSION,
        meta: {
            name,
            author,
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: `${name} (${author}), CC BY 4.0 — ${repo}`,
            sources: collectSources(terms),
            createdAt: new Date().toISOString(),
            description: opt('description')
                ?? '出題は pano ID のみを保持する（Street View の画像は含まない）。'
                + '**間違いは自分で直せる。** 検証ツールを同梱している。',
        },
        questions,
        glossary: { terms },
    }

    console.log('# データセットの書き出し（AI 未使用、消費 0）')
    console.log('')
    console.log(`出題 ${questions.length} 件 / 用語 ${terms.length} 語 / 出典 ${dataset.meta.sources.length} 件`)
    console.log(`id: \`${makeDatasetId(author, name)}\``)
    console.log('')
    reportIssues(validateDataset(dataset, { knownCountries: knownCountries() }), true)

    writeJson(out, dataset, 2)
    console.log(`## 画像の検査: 通った`)
    console.log('')
    console.log('**欄を用意しないことは、入っていないことの保証にならない。**')
    console.log('`data:` URL・画像への参照・Street View 画像 API の URL・base64 らしい長い文字列を')
    console.log('中身を走査して弾いている。**配る人が規約を破らないための仕組みである。**')
    console.log('')
    console.log(`保存先: ${out}（${Math.round(fs.statSync(out).size / 1024)}KB）`)
    console.log('')
    console.log('受け取った側:')
    console.log(`  npm run dataset -- install ${path.basename(out)}`)
    console.log(`  npm run dataset -- use ${makeDatasetId(author, name)}`)
}

// ============================================================
// install
// ============================================================

function cmdInstall() {
    const file = rest[0]
    if (!file) { console.error('使い方: npm run dataset -- install <ファイル>'); process.exit(1) }
    if (!fs.existsSync(file)) { console.error(`**ファイルが無い: ${file}**`); process.exit(1) }

    let raw: unknown
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch (e) { console.error(`**JSON として読めない: ${(e as Error).message}**`); process.exit(1) }

    console.log('# データセットの取り込み（AI 未使用、消費 0）')
    console.log('')
    reportIssues(validateDataset(raw, { knownCountries: knownCountries() }), true)

    const d = raw as Dataset
    const id = opt('id') ?? makeDatasetId(d.meta.author, d.meta.name)

    console.log(`id: \`${id}\``)
    console.log(`名前: ${d.meta.name} / 作成者: ${d.meta.author}`)
    console.log(`ライセンス: ${d.meta.license}`)
    console.log('')
    console.log('**出典表示にこれを使う。**')
    console.log(`  ${d.meta.attribution}`)
    console.log('')
    console.log(`出題 ${d.questions.length} 件 / 用語 ${d.glossary.terms.length} 語 / 参照元 ${d.meta.sources.length} 件`)
    console.log('')

    const lib = loadLibrary()
    const existing = lib.entries.find((e) => e.id === id)
    if (existing && !flag('force')) {
        console.log(`## **同じ id が既にある: ${id}**`)
        console.log(`  こちら: ${existing.name}（出題 ${existing.questionCount} / 作成 ${existing.createdAt}）`)
        console.log(`  先方  : ${d.meta.name}（出題 ${d.questions.length} / 作成 ${d.meta.createdAt}）`)
        console.log('')
        console.log('**上書きしない。** `--force` を付けるか `--id <別の名前>` で入れる。')
        console.log('> **取り込みが直した内容を消すなら意味が無い。**')
        process.exit(1)
    }

    if (!flag('apply')) {
        console.log('**まだ書き込んでいない。** `--apply` を付けると `data/datasets/` に入れる。')
        return
    }

    writeJson(path.join(LIB_DIR, id, 'dataset.json'), d, 2)

    // **索引は書かない。** 一覧はディレクトリから読む（`loadLibrary`）

    // 進捗を用意する。**並びを固定する**（毎回並べ替えると「3 問目」が別の問題になる）
    const prog = loadProgress()
    if (!prog.byDataset[id]) {
        prog.byDataset[id] = initProgress(d.questions.map((q) => q.id))
        prog.formatVersion = PROGRESS_FORMAT_VERSION
        writeJson(PROGRESS, prog)
    }

    console.log(`ライブラリに入れた: data/datasets/${id}/dataset.json`)
    console.log('')
    console.log(`**アクティブにはまだしていない。** 切り替えるには:`)
    console.log(`  npm run dataset -- use ${id}`)
}

// ============================================================
// use
// ============================================================

function cmdUse() {
    const id = rest[0]
    const lib = loadLibrary()
    if (!id) {
        console.error('使い方: npm run dataset -- use <id>')
        console.error(`持っている id: ${lib.entries.map((e) => e.id).join(', ') || '（なし）'}`)
        process.exit(1)
    }
    const entry = lib.entries.find((e) => e.id === id)
    const file = path.join(LIB_DIR, id, 'dataset.json')
    if (!entry || !fs.existsSync(file)) {
        console.error(`**ライブラリに無い: ${id}**`)
        console.error(`持っている id: ${lib.entries.map((e) => e.id).join(', ') || '（なし）'}`)
        process.exit(1)
    }

    const d: Dataset = JSON.parse(fs.readFileSync(file, 'utf8'))

    console.log('# アクティブなデータセットの切り替え（AI 未使用、消費 0）')
    console.log('')
    console.log(`${lib.activeId ?? '（未選択）'} → **${id}**`)
    console.log(`${d.meta.name}（${d.meta.author}）出題 ${d.questions.length} 件 / 用語 ${d.glossary.terms.length} 語`)
    console.log('')

    if (!flag('apply')) {
        console.log('切り替えると `data/questions.json` と `data/glossary.json` が置き換わる。')
        console.log('**控えは `.backup/` に取る。** `--apply` を付けると実行する。')
        return
    }

    const dir = backup([QUESTIONS, GLOSSARY])
    console.log(`控え: ${dir}`)

    writeJson(QUESTIONS, d.questions)
    const glossaryDoc = readJson<Record<string, unknown>>(GLOSSARY, {})
    writeJson(GLOSSARY, { ...glossaryDoc, terms: d.glossary.terms })

    // **選ばれているものだけを書く。** 一覧はディレクトリが正典である
    writeJson(LIBRARY, { formatVersion: LIBRARY_FORMAT_VERSION, activeId: id })

    const prog = loadProgress()
    if (!prog.byDataset[id]) {
        prog.byDataset[id] = initProgress(d.questions.map((q) => q.id))
        writeJson(PROGRESS, prog)
    }
    const s = summarizeProgress(prog.byDataset[id]!, d.questions.map((q) => q.id))
    const nx = nextQuestion(prog.byDataset[id]!, d.questions.map((q) => q.id))

    console.log('')
    console.log(`進捗: ${s.answered} / ${s.total}`)
    if (nx) console.log(`次に出るのは **${nx.index} / ${nx.total} 問目**（\`${nx.questionId}\`）`)
    else console.log('**このデータセットは 1 周している。**')
    console.log('')
    console.log('道具はアクティブを見るので、そのまま使える:')
    console.log('  npm run combo          到達を測る（消費 0）')
    console.log('  npm run validate:keys  整合性（消費 0）')
    console.log('  npm run dev            自分の API キーで採点')
}

// ============================================================
// log
// ============================================================

function cmdLog() {
    const out = opt('out') ?? path.join('dist', 'ggg-log.json')
    const anonymize = flag('anonymize')
    const lib = loadLibrary()
    const prog = loadProgress()

    const id = opt('dataset') ?? lib.activeId ?? 'unknown'
    const entry = lib.entries.find((e) => e.id === id)
    const questions = readJson<Question[]>(QUESTIONS, [])
    const validIds = new Set(questions.map((q) => q.id))

    if (!fs.existsSync(RUNS)) {
        console.error('**`data/runs/` が無い。** まだ 1 度も回答していない')
        process.exit(1)
    }
    const runs = fs.readdirSync(RUNS)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')))
        // **アクティブなデータセットの出題だけを出す。** 混ぜると何のログか分からなくなる
        .filter((r) => validIds.has(r.questionId ?? r.answer?.questionId))

    const order = prog.byDataset[id]?.order ?? questions.map((q) => q.id)
    const orderIndex: Record<string, number> = {}
    order.forEach((qid, i) => { orderIndex[qid] = i + 1 })

    const log = buildLogExport(runs, {
        datasetId: id,
        datasetName: entry?.name ?? '（ライブラリ未登録のアクティブ）',
        datasetAttribution: entry?.attribution ?? `${id}（出典表示が未設定）`,
        author: opt('author') ?? 'unknown',
        anonymize,
        orderIndex,
    })

    console.log('# 回答ログの書き出し（AI 未使用、消費 0）')
    console.log('')
    console.log(`データセット: ${log.meta.datasetName}（\`${id}\`）`)
    console.log(`記録 ${log.entries.length} 件 / 記述を落とす: ${anonymize ? '**はい**' : 'いいえ'}`)
    console.log('')

    const issues = validateLogExport(log)
    if (!reportIssues(issues, false)) {
        console.log('**書き出さない。** 公開物に入ってはいけないものが検出された')
        process.exit(1)
    }

    writeJson(out, log, 2)
    console.log(`保存先: ${out}（${Math.round(fs.statSync(out).size / 1024)}KB）`)
    console.log('')
    console.log('入れていないもの:')
    console.log('  画像（元々持っていない） / AI の生の応答（数十 KB あり配って読むものではない）')
    console.log('  API キー（記録に入れていない。それでも検査している）')
    console.log('')
    if (!anonymize) {
        console.log('**学習者本人が書いた文章が入っている。** 公開する前に中身を読むこと。')
        console.log('落とすなら: npm run dataset -- log --anonymize')
    }
}

// ============================================================

switch (sub) {
    case 'list': cmdList(); break
    case 'export': cmdExport(); break
    case 'install': cmdInstall(); break
    case 'use': cmdUse(); break
    case 'log': cmdLog(); break
    default:
        console.log('# データセットの操作（AI 未使用、消費 0）')
        console.log('')
        console.log('  npm run dataset -- list                    持っているものと進捗')
        console.log('  npm run dataset -- export                  アクティブを配布形式で書き出す')
        console.log('  npm run dataset -- install <file> --apply   ライブラリに入れる')
        console.log('  npm run dataset -- use <id> --apply         アクティブを切り替える')
        console.log('  npm run dataset -- log [--anonymize]       回答ログを書き出す')
        console.log('')
        console.log('主な旗:')
        console.log('  export : --out --name --author --questions a,b --used-terms-only')
        console.log('  install: --id <別名> --force')
        console.log('  log    : --dataset <id> --anonymize --author')
        if (sub) process.exit(1)
}
