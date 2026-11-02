# Text scoring: estimating how hard a text is

Summary: `@rin-language/text-scoring` (folder `packages/text-scoring`) is a pure, deterministic, offline scorer. Given a text it returns a difficulty between 0 and 1, five sub-scores, an estimated level from the language's scale, and the versions of the data it used. It does no network call, no AI call, no file access while scoring, and never logs or returns the text.

> Status: the scorer is a library. No server route uses it yet. The shipped thresholds are NOT calibrated: the level is an estimate until a calibrated set replaces `data/scoring/ja.json`. No frequency list ships with the repository.

## Interfaces

```ts
type ScoringMode = "spoken" | "written";

interface Token {
  surface: string;
  lemma: string;                    // dictionary form; "" if the tokenizer has none
  partOfSpeech: readonly string[];  // most general first; [] if unknown
}
interface Tokenizer { tokenize(text: string): readonly Token[] }

interface ScoreInput { text: string; mode: ScoringMode; speechRate?: number }
interface TextScorer { readonly language: string; score(input: ScoreInput): ScoreResult }
```

`createJapaneseTextScorer({ tokenizer, levels, config, packs })` returns a `TextScorer`. It throws a `PackError` when `config.language` is not `ja` or when a `thresholds` array does not have `levels.length - 1` values.

| Option | Type | Meaning |
|---|---|---|
| `tokenizer` | `Tokenizer` | Injected. Any implementation; a Sudachi adapter is provided (below). |
| `levels` | `string[]` | The language profile's `levels`, ordered lowest to highest (`["N5","N4","N3","N2","N1"]`). |
| `config` | `ScoringConfig` | From `loadScoringConfig(path, levels)`. |
| `packs` | `{ spoken?: FrequencyPack; written?: FrequencyPack }` | From `loadFrequencyPack(path)`. A mode without a pack is refused with `mode_unavailable`. |

## Output (`ScoreResult`)

| Field | Meaning |
|---|---|
| `score` | Weighted difficulty, 0 (easiest) to 1 (hardest). |
| `subScores.vocabulary` | Mean band difficulty of the distinct lemmas of the text. |
| `subScores.kanji` | Mean band difficulty of the distinct kanji. 0 when there is none. |
| `subScores.sentenceLength` | Mean tokens per sentence, mapped between `sentence.easyLength` and `sentence.hardLength`. |
| `subScores.dialogue` | `1 - share`, where share is the part of the text inside `「」` or `『』`. More direct dialogue means a simpler text. |
| `subScores.speechRate` | The supplied speech rate mapped between `speechRate.easy` and `speechRate.hard`; `null` when its weight is 0. |
| `level` | Estimated level: the number of thresholds that are `<= score` indexes `levels`. |
| `mode` | The mode scored. |
| `versions.frequency` | `version` of the frequency pack used. |
| `versions.scoring` | `version` of the scoring file used. |

All sub-scores are always computed from the text, even when their weight is 0, except `speechRate`.

## Formulas

- Band difficulty of a known entry: `(band - 1) / (bandCount - 1)`. Unknown entry: `unknownDifficulty`.
- Vocabulary counts distinct lemmas (the surface form when the lemma is empty), skipping punctuation and tokens whose first part of speech is in `excludedPartsOfSpeech`.
- A line with no word (a row of symbols such as a scene break) is not a sentence and does not lower the mean sentence length.
- Sentences end at `。！？!?…` outside quotes and at every newline. A newline also closes open quotes, so an unbalanced `「` only affects its own paragraph. Sentence length counts tokens that contain a letter or a digit.
- Direct dialogue is measured from the text, not from grammar.
- `score = sum(weight * subScore) / sum(weight)` over the weights above 0 of the mode.

## Speech rate input

`speechRate` is supplied by the caller, in characters per minute. This package never measures it. It is required (`speech_rate_missing`) when the mode's `speechRate` weight is above 0. When given it must be a finite number `>= 0` in every mode, even a mode that ignores it (`speech_rate_invalid`). With the shipped weights it is used in `spoken` mode and its value is ignored in `written` mode.

## Scoring file: `data/scoring/<language>.json`

Loaded with `loadScoringConfig(path, levels)`. A file larger than 1 MiB, invalid JSON or an invalid field throws a `PackError` whose `problems` list field paths, never values.

| Key | Default (shipped `ja`) | Allowed | Effect |
|---|---|---|---|
| `format` | `1` | `1` | File format version. |
| `version` | `"0-uncalibrated"` | non-blank string | Returned in `versions.scoring`. Change it whenever weights or thresholds change. |
| `language` | `"ja"` | non-blank string | Language this file is for. |
| `maxChars` | `200000` | integer 1..10000000 | Texts longer than this are refused with `text_too_long`. It counts UTF-16 code units of the text as given: a rare kanji such as 𠮷 counts 2 and a CRLF line break counts 2. The size is checked before anything else, even for a blank text. |
| `tokenizerChunkChars` | `10000` | integer 100..16000 | A sentence longer than this many UTF-16 units is cut into chunks before tokenizing. Sudachi refuses input above 49149 bytes of UTF-8 (checked with a real dictionary: 16383 kana pass, 16400 fail); 16000 characters of 3-byte kanji stay below that. |
| `unknownDifficulty` | `1` | number 0..1 | Difficulty of a lemma or kanji absent from the pack. |
| `excludedPartsOfSpeech` | `["助詞","助動詞","補助記号","空白","記号"]` | array of non-blank strings | Tokens whose first part of speech is listed are not counted as vocabulary. |
| `sentence.easyLength` | `6` | number > 0, below `hardLength` | Tokens per sentence mapped to difficulty 0. |
| `sentence.hardLength` | `40` | number > 0 | Tokens per sentence mapped to difficulty 1. |
| `speechRate.easy` | `250` | number > 0, below `hard` | Characters per minute mapped to 0. |
| `speechRate.hard` | `500` | number > 0 | Characters per minute mapped to 1. |
| `weights.written.vocabulary` | `4` | number 0..1000 | Weight in written mode (every weight is capped at 1000 so sums cannot overflow). |
| `weights.written.kanji` | `3` | number >= 0 | Same. |
| `weights.written.sentenceLength` | `2` | number >= 0 | Same. |
| `weights.written.dialogue` | `1` | number >= 0 | Same. |
| `weights.written.speechRate` | `0` | number >= 0 | Same. At least one weight of a mode must be above 0. |
| `weights.spoken.vocabulary` | `4` | number >= 0 | Weight in spoken mode. |
| `weights.spoken.kanji` | `0` | number >= 0 | Same. |
| `weights.spoken.sentenceLength` | `2` | number >= 0 | Same. |
| `weights.spoken.dialogue` | `0` | number >= 0 | Same. |
| `weights.spoken.speechRate` | `2` | number >= 0 | Same. |
| `thresholds.written` | `[0.2,0.4,0.6,0.8]` | ascending numbers strictly inside (0,1), exactly `levels.length - 1` | Level boundaries for written text. |
| `thresholds.spoken` | `[0.2,0.4,0.6,0.8]` | same | Level boundaries for spoken text. |

Complete example (also the shipped file):

```json
{
  "format": 1,
  "version": "0-uncalibrated",
  "language": "ja",
  "maxChars": 200000,
  "tokenizerChunkChars": 10000,
  "unknownDifficulty": 1,
  "excludedPartsOfSpeech": ["助詞", "助動詞", "補助記号", "空白", "記号"],
  "sentence": { "easyLength": 6, "hardLength": 40 },
  "speechRate": { "easy": 250, "hard": 500 },
  "weights": {
    "written": { "vocabulary": 4, "kanji": 3, "sentenceLength": 2, "dialogue": 1, "speechRate": 0 },
    "spoken": { "vocabulary": 4, "kanji": 0, "sentenceLength": 2, "dialogue": 0, "speechRate": 2 }
  },
  "thresholds": {
    "written": [0.2, 0.4, 0.6, 0.8],
    "spoken": [0.2, 0.4, 0.6, 0.8]
  }
}
```

The frequency pack format is in [language-data.md](language-data.md).

## Errors

`ScoringInputError` has a `problem` code and its message is that code only. The text is never in an error.

| `problem` | Cause |
|---|---|
| `text_empty` | Empty or blank text. |
| `text_too_long` | More than `maxChars` characters. |
| `mode_unavailable` | No pack for the mode, the pack's `language` is not `ja`, or the pack's own `mode` is not the requested one. |
| `speech_rate_invalid` | `speechRate` is not a finite number `>= 0`. |
| `speech_rate_missing` | The mode needs a speech rate and none was given. |
| `no_words` | After exclusions the text has no countable word. |

`PackError` (`label`, `problems`) is thrown by the loaders for a missing, unreadable, oversize, malformed or invalid data file.

## Sudachi tokenizer adapter

```ts
import { createSudachiTokenizer } from "@rin-language/text-scoring/sudachi";
const tokenizer = createSudachiTokenizer({ splitMode: "A" }); // "A" (default), "B" or "C"
```

| Item | Value |
|---|---|
| Package | `@nikkei/napi-sudachi` 0.12.0, an optional peer dependency: install it yourself. It is a native module with no install script. |
| Dictionary | Not shipped and never downloaded by this repository or its CI. Get a SudachiDict file from its official project, verify its checksum and read its licence, then set `SUDACHI_DICT_PATH` to the file. |
| Missing dictionary | `createSudachiTokenizer` throws an `Error` naming `SUDACHI_DICT_PATH` when it is unset, missing or not a regular file. This check exists because the native module aborts the whole Node process, without a catchable error, in those cases. |
| Newer dictionary format | A SudachiDict built in the newer format (its file starts with the text `SudachiBinaryDic`, seen on the release dated 2026-10-15) is refused with an `Error` before loading, because the engine inside `@nikkei/napi-sudachi` 0.12.0 aborts the process on it (`Invalid header version`). Use an older SudachiDict release. |
| Corrupt dictionary | A file that exists but is not a valid SudachiDict still aborts the whole process (exit code 134) and the native module may print the path to stderr. Verify the checksum, create the tokenizer once at startup rather than on a request, and, if a server must survive it, run tokenization in a child process (a worker thread does not help). |
| `splitMode` | `A`, `B` or `C`; anything else throws. |
| Too long input | The native `tokenize` returns an error value instead of throwing when the input is above 49149 bytes. The adapter turns it into an `Error("Sudachi could not tokenize the text")` that carries neither the text nor the native message. The scorer never hits it with a valid `tokenizerChunkChars`. |
| Tested with | `sudachi-dictionary-20250515-small` (old format): the real-dictionary tests pass. The releases dated 2026-07-23 and 2026-10-15 are in the newer format and are refused. Run the tests with `SUDACHI_DICT_PATH=<file> pnpm vitest run packages/text-scoring/test/sudachi`. |

Tests that need the real dictionary skip when `SUDACHI_DICT_PATH` is unset.

## Add a language

1. Write a `TextScorer` for the language (its sentence rules, script rules and quote marks) that uses the shared helpers (`bandDifficulty`, `linearDifficulty`, `meanOrZero`, `combineScores`, `selectLevel`). The `TextScorer` and `Tokenizer` interfaces do not change.
2. Provide a tokenizer for the language behind `Tokenizer`.
3. Add `data/scoring/<code>.json` and the frequency packs (`data/frequency/<code>/spoken.json`, `written.json`).

## Security notes

- Input size is bounded by `maxChars` before any work; text is processed in one linear pass; no regular expression has nested quantifiers.
- Data files are validated at the boundary and rejected with field names only. Pack keys are stored in `Map` objects, so a `__proto__` key is data.
- Packs are untrusted input: a file above 64 MiB or with more than 2000000 entries is refused by default. The loader opens the file once and checks the opened file: a device, a named pipe or a folder is refused (`not a regular file`) and a file that grows while being read is cut at the cap. `maxBytes` and `maxEntries` must be non-negative integers; `NaN` or a negative value is refused instead of turning the limit off.
- Errors from the loaders carry no `cause`: a parse error or a system error would quote the file or its path. An unknown key of a file is counted, not quoted, so a key cannot inject text into logs.
- The text is never logged and never appears in a result field other than as the caller's own variable.
