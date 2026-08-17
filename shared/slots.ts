/**
 * スロット定義（確定文言）。
 *
 * 正典は `.kiro/specs/geo-observation-coach/slot-definitions.md` である。
 * このファイルはその表を逐語で定数化したものであり、勝手に言い換えてはならない。
 *
 * 設計方針（slot-definitions.md より）
 * - ラベルは平易な表現を主とし、正規用語は括弧で添える
 * - プレースホルダは素人語で書く（学習者に期待する粒度と語彙水準を示す）
 * - 補助テキストで「どこを見るか」を示す
 */

export const SLOT_IDS = [
    'traffic_side',
    'road_marking',
    'bollard',
    'pole',
    'sign',
    'script',
    'ground',
    'terrain_vegetation',
    'architecture',
    'vehicle',
    'pavement',
    'camera',
    'season',
    /** 他のどのスロットにも入らない観察の受け皿。辞書を育てる入口として機能する */
    'other',
] as const

export type SlotId = (typeof SLOT_IDS)[number]

export const SLOT_STATES = ['visible', 'absent', 'unknown'] as const
export type SlotState = (typeof SLOT_STATES)[number]

export const CONFIDENCES = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCES)[number]

export interface SlotDefinition {
    id: SlotId
    /** 平易表現を主とし、正規用語を括弧で併記する */
    label: string
    /** 入力例。素人語で書く */
    placeholder: string
    /** どこを見るかを示す補助テキスト */
    hint: string
}

export const SLOT_DEFINITIONS: readonly SlotDefinition[] = [
    {
        id: 'traffic_side',
        label: '車はどちら側を走っている？（走行車線）',
        placeholder: '右側通行',
        hint: '対向車、停車中の車の向き、追越車線の位置から判断する',
    },
    {
        id: 'road_marking',
        label: '道路の白線・黄線（路面標示）',
        placeholder: '白い破線の中央線、路肩に線はない',
        hint: '中央線の色（白か黄）、実線か破線か、路肩線の有無と色',
    },
    {
        id: 'bollard',
        label: '車道脇の短い杭・ポール（ボラード）',
        placeholder: '白い本体で上が黒、赤い反射板つき',
        hint: '断面の形（丸・角・三角）、色の組み合わせ、反射板の色と数、高さ',
    },
    {
        id: 'pole',
        label: '電柱・街灯の形',
        placeholder: '細いコンクリの柱、上が逆 L 字に曲がっている',
        hint: '素材（木・コンクリート・金属）、腕木の形、碍子の数、街灯の傘の形',
    },
    {
        id: 'sign',
        label: '標識の形・色',
        placeholder: '三角形で白地に赤い縁',
        hint: '警戒標識の形（三角かひし形か）、縁の色、支柱の色と模様',
    },
    {
        id: 'script',
        label: '看板の文字（読めなくて OK、形を書く）',
        placeholder: 'A の上に点が 2 つある文字、逆さの e みたいな字',
        hint: '読めなくてよい。見た目を書く。アルファベット以外か、変わった記号や飾りが付いているか',
    },
    {
        id: 'ground',
        label: '地面・土の色',
        placeholder: '赤茶色の土、白っぽい砂',
        hint: '路肩や畑の土の色。赤土・黒土・白砂は絞り込みが強い手がかりになる',
    },
    {
        id: 'terrain_vegetation',
        label: '地形・植生',
        placeholder: '急な山が近い、乾いた低木ばかり',
        hint: '平地か山か、乾燥か湿潤か、木の種類（針葉樹・ヤシ・ユーカリなど）',
    },
    {
        id: 'architecture',
        label: '建物・屋根の形',
        placeholder: '赤い瓦屋根で白い壁',
        hint: '屋根の材質と色、壁の材質、窓の形、塀や柵の作り',
    },
    {
        id: 'vehicle',
        label: '車・ナンバープレート',
        placeholder: '黄色くて横長のナンバー',
        hint: 'ナンバーの色と縦横比、車種の傾向、ハンドルの位置',
    },
    {
        id: 'pavement',
        label: '車道の舗装',
        placeholder: '未舗装の砂利道、補修の跡だらけ',
        hint: 'アスファルト・コンクリート・未舗装、ひび割れ、補修痕の入り方',
    },
    {
        id: 'camera',
        label: '撮影車・カメラの世代',
        placeholder: '車の屋根が映り込んでいる、画質が粗くて色が薄い',
        hint: '車体の映り込み、機材の影、画質の粗さ、色調、ぼかしの入り方',
    },
    {
        id: 'season',
        label: '季節・太陽',
        placeholder: '葉が落ちている、影がとても長い',
        hint: '落葉・新緑・雪、影の長さと向き、日射の強さ',
    },
    {
        id: 'other',
        label: 'その他の気づき（上のどれにも当てはまらないもの）',
        placeholder: 'ゴミがまったく落ちていない、撮影者が歩いて撮っている',
        hint: '他のどのスロットにも入らない観察を書く。決め手になることがある',
    },
] as const

export const SLOT_DEFINITION_BY_ID: Readonly<Record<SlotId, SlotDefinition>> =
    Object.fromEntries(SLOT_DEFINITIONS.map((d) => [d.id, d])) as Record<SlotId, SlotDefinition>

/**
 * 状態の表示文言。
 *
 * `absent` と `unknown` の違いを画面上でも説明する。
 * 「見えない」は判断の結果であり、「未確認」は観察漏れの候補である。
 */
/**
 * 境界が迷いやすいスロットの隣接関係。**対称であること。**
 *
 * ## なぜ必要か
 *
 * **スロットの境界は入力時に迷う。** とくに路面まわり。
 * 実測（2026-08-10、v1 の 10 問）で、`bollard` に「ガードレールが黄色い」と
 * 記入された。ガードレールとボラードは一体化していることがあり
 * （`data/bollard-axes.json` の `guardrail_relation`）、これは正当な観察である。
 *
 * このとき「`bollard` を見落とした」と判定すると**誤りになる。**
 * 実際には見ていて、別の欄に書いただけである。
 *
 * > **訓練しているのは観察であって分類ではない。**
 *
 * ## どう使うか
 *
 * 正解タグが `visible` なのに学習者が `unknown` のスロットについて、
 * 隣接スロットに記述があれば `missedSlots` ではなく `filedElsewhere` に入れる。
 *
 * **コードは「隣接スロットに記述がある」という事実だけを出す。**
 * 同じものを指しているかの解釈は AI に渡す。曖昧さの解釈は AI の仕事である。
 *
 * ## 網羅を目指していない
 *
 * 実測で迷いが確認された組だけを入れる。**推測で増やさない。**
 * 増やすほど「見落とし」の検出力が落ちるため、根拠のない隣接は害になる。
 */
const SLOT_NEIGHBOR_PAIRS: readonly (readonly [SlotId, SlotId])[] = [
    // 路面まわり。入力時に迷うと明言された範囲
    ['road_marking', 'pavement'],
    ['road_marking', 'ground'],
    ['pavement', 'ground'],
    // ガードレール一体型のボラードは路面まわりの記述に混ざる（実測）
    ['bollard', 'road_marking'],
    ['bollard', 'pavement'],
    // 縦に立つ人工物。支柱の形状はどちらにも書ける
    ['pole', 'sign'],
    // 標識の文字は script にも書かれる
    ['sign', 'script'],
    // 地面の状態と植生・季節は連続している
    ['ground', 'terrain_vegetation'],
    ['terrain_vegetation', 'season'],
    // 車体とカメラは同じ「撮影車」の観察として混ざる
    ['vehicle', 'camera'],
]

/**
 * スロットごとの隣接集合。`SLOT_NEIGHBOR_PAIRS` から対称に展開する。
 *
 * 対称性は `tests/slot-neighbors.test.ts` で固定している。
 * 手で書いた隣接表は非対称になりやすく、非対称だと片方向だけ見落とし判定が甘くなる。
 */
export const SLOT_NEIGHBORS: Readonly<Record<SlotId, readonly SlotId[]>> = (() => {
    const sets: Partial<Record<SlotId, Set<SlotId>>> = {}
    for (const id of SLOT_IDS) sets[id] = new Set<SlotId>()

    for (const [a, b] of SLOT_NEIGHBOR_PAIRS) {
        sets[a]?.add(b)
        sets[b]?.add(a)
    }

    const result: Partial<Record<SlotId, readonly SlotId[]>> = {}
    for (const id of SLOT_IDS) result[id] = [...(sets[id] ?? [])]
    return result as Record<SlotId, readonly SlotId[]>
})()

export const SLOT_STATE_LABELS: Readonly<
    Record<SlotState, { label: string; meaning: string }>
> = {
    visible: { label: '見えた', meaning: '写っていると判断した' },
    absent: { label: '見えない', meaning: '写っていないと判断した' },
    unknown: { label: '未確認', meaning: 'まだ見ていない、判断していない' },
}

/** 確信度の表示文言と補助文言 */
export const CONFIDENCE_LABELS: Readonly<
    Record<Confidence, { label: string; meaning: string }>
> = {
    high: { label: '高', meaning: 'たぶんこれで合っている' },
    medium: { label: '中', meaning: '可能性はある' },
    low: { label: '低', meaning: '念のため挙げておく' },
}

/** 回答欄の文言 */
export const ANSWER_LABELS = {
    candidates: 'どこの国だと思う？（最大 3 つ）',
    candidatesNote: '1 つでもよい',
    confidence: '確信度',
    confidenceNote: '「高」は 1 つだけ選べる。本命を 1 つ決めることが練習になります',
    decisiveSlot: '一番の決め手にした項目',
    decisiveSlotNote: 'スロットから 1 つ選ぶ',
    reasoning: 'なぜそう思ったか（任意）',
} as const

/** 候補国の上限。要件 2-7 */
export const MAX_CANDIDATES = 3
/** 確信度「高」の上限。要件 2-9 */
export const MAX_HIGH_CONFIDENCE = 1

/** 全スロットを `unknown` で初期化する。初期状態は全スロット `unknown` とする */
export function createEmptySlots(): Record<SlotId, { state: SlotState; plain: string | null; terms: string[] }> {
    return Object.fromEntries(
        SLOT_IDS.map((id) => [id, { state: 'unknown' as SlotState, plain: null, terms: [] as string[] }]),
    ) as Record<SlotId, { state: SlotState; plain: string | null; terms: string[] }>
}
