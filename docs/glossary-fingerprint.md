# 用語辞書の指紋

生成: 2026-08-18T09:44:33.204Z　`node tools/glossary-fingerprint.mjs --write`

## なぜ残すのか

到達 6 / 10 は、**辞書を作るときに使った 10 問**での数字である。
読者から見れば「その 10 問に合わせて辞書を作ったのでは」と疑える。

別の 10 地点で測れば汎化を示せるが、そのとき
**「辞書は 1 語も足していない」が信じられなければ意味がない。**

> **主張の前提は、主張と一緒に検証できる形で置く。**

この記録より後に測った到達は、`--verify` が通る限り
**同じ辞書での結果である。**

## 記録

| 項目 | 値 |
|---|---|
| 用語数 | 262 |
| 絞り込みに使える語 | 180 |
| 由来 `human` | 28 |
| 由来 `reference` | 172 |
| 由来 `ai` | 62 |

sha256: `909441b29d1483201aacffc69f1b6ddb1e8c49b8cf9335899077c0ae7de69554`

## 指紋に入れているもの

**絞り込みの結果を変える項目だけ**である。
`note` や `plain` の文言を直しても指紋は変わらない。
変わってはいけないのは、**どの用語がどの国に対応するか**である。

```
id | slot | certainty | source | disputed | exhaustive | countries | excludes
```

`certainty` と `disputed` と `exhaustive` を入れているのは、
これらが「積集合に入れるか」を決めるためである（`server/utils/narrowing.ts`）。

## 確かめ方

```bash
node tools/glossary-fingerprint.mjs --verify
```
