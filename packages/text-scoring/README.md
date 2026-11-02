# @rin-language/text-scoring

A pure, deterministic, offline text-difficulty scorer. Not published to a registry: it is built from this repository and linked locally. The full documentation, in a form meant for AI readers, is in [docs/text-scoring.md](../../docs/text-scoring.md).

## Build

```sh
pnpm install
pnpm --filter @rin-language/text-scoring build   # writes packages/text-scoring/dist
pnpm --filter @rin-language/text-scoring check-build
```

`dist/` is git-ignored. The package exposes `.` and `./sudachi` through its `exports`, so plain Node ESM can import it.

## Link into another project

```sh
# in the project that uses the package
pnpm link <path-to-this-repository>/packages/text-scoring
```

Never commit the link: no `link:` or path reference belongs in a `package.json` or a lockfile. Rebuild after every change here. The optional Sudachi adapter additionally needs `@nikkei/napi-sudachi` installed in the consuming project and `SUDACHI_DICT_PATH` set (see the documentation).

## Use

```ts
import { createJapaneseTextScorer, loadFrequencyPack, loadScoringConfig } from "@rin-language/text-scoring";
import { createSudachiTokenizer } from "@rin-language/text-scoring/sudachi";

const levels = ["N5", "N4", "N3", "N2", "N1"];
const scorer = createJapaneseTextScorer({
  tokenizer: createSudachiTokenizer(),
  levels,
  config: loadScoringConfig("data/scoring/ja.json", levels),
  packs: { written: loadFrequencyPack("data/frequency/ja/written.json") },
});
console.log(scorer.score({ text: "私は昨日、友達と映画を見に行きました。", mode: "written" }));
```
