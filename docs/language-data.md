# Language data: grammar rules and error types

Everything that depends on the learned language lives in data files, not in code. This page explains where they are, what they look like and how to change them.

> Status: these files and formats are defined, but the loader that reads and validates them is built in slices 0 and 1. Until then, nothing in the code reads them.

## Layout

```
data/
  grammar/
    ja.json         grammar rules for Japanese
  error-types/
    ja.json         error types for Japanese
```

One file per language, named with the language code (`ja` for Japanese). A new language is a new pair of files with the same names, for example `zh.json`.

## Language codes

Languages are identified by their two-letter code from the ISO 639-1 standard, in lowercase: `ja` (Japanese), `zh` (Chinese), `ko` (Korean), `en` (English), `fr` (French).

The server loads the files whose name matches the learner's target language (the `targetLanguage` field of the user profile, `ja` by default). So the file name, the language code stored with the user's data and the code in the configuration must be exactly the same string. A language without a matching file has no grammar rules: the correction pipeline still works, without grammar point matching.

Rules:

- Only the bare two-letter code. No region or script suffix (`zh`, not `zh-CN` or `zh-Hans`).
- If a language ever needs a variant, such as simplified versus traditional Chinese, the format will be extended with BCP 47 tags (`zh-Hans`), of which ISO 639-1 codes are a subset. Existing files keep working.
- The interface language (`uiLanguage`) uses the same codes.

## Error types

File: `data/error-types/<language>.json`.

```json
{
  "default": "other",
  "types": [
    { "id": "particles", "description": "Wrong, missing or extra particle." },
    { "id": "other", "description": "Any error that fits no other type." }
  ]
}
```

| Field | Meaning |
|---|---|
| `default` | The type used when the model returns a type that is not in the list. It must be one of the `types` ids. |
| `types[].id` | The stable identifier, lowercase with underscores. It is what is stored and sent to the client, so changing it breaks old data. |
| `types[].description` | One line in English, shown to the AI so it picks the right type. The client's display labels are translated separately, by id. |

Rules:

- Ids are unique inside a file.
- The model never invents a type: anything outside the list is replaced by `default`.
- The client must handle an id it does not know, since a self-hoster can add types.

### Add an error type

1. Add `{ "id": "...", "description": "..." }` to `types`.
2. Use the new id as `error_type` in the grammar rules that belong to it.
3. Add its display label to the client translations.

### Rename or remove an error type

Do not rename an id that users already have data for: their stored corrections keep the old id and it would show as unknown. To retire a type, stop using it in the grammar rules and leave it in the list. Never remove the type named in `default`.

## Grammar rules

File: `data/grammar/<language>.json`. A list of rules.

```json
[
  {
    "grammar_point_id": "n5-wa-ga",
    "pattern": "は / が",
    "level": "N5",
    "error_type": "particles"
  }
]
```

| Field | Meaning |
|---|---|
| `grammar_point_id` | Unique id of the rule inside the file. It is stored with the user's corrections and sent to the AI, so never reuse or renumber it. |
| `pattern` | The grammar point as written in the learned language. Sent to the AI together with the id so it can confirm the error. |
| `level` | The level in the language's own scale (`N5` to `N1` for Japanese; a CEFR level such as `A2` for another language). |
| `error_type` | One of the ids in the same language's error types file. |

Only `grammar_point_id` and `pattern` are sent to the AI. The other fields are used by the server to filter candidates and by the statistics.

Rules:

- `grammar_point_id` is unique across the whole file.
- `error_type` must exist in the error types file of the same language.
- A pack is a plain list: there is no per-rule status, no deprecation flag and no explanation text.

### Add a rule

Append an object to the list. Pick a `grammar_point_id` that is not used yet (when two rules share a name at different levels, suffix the level: `dake`, `dake_n3`). Use an existing `error_type`.

### Modify a rule

Edit the fields in place. Keep `grammar_point_id` unchanged if users may already have corrections linked to it.

### Remove a rule

Delete the object. Corrections that were linked to it keep their stored id but will no longer match a rule.

### Use your own pack

The app only loads the file for each configured language. To use a different set of rules, replace the content of `data/grammar/<language>.json` (or point the configuration at another directory) and keep the same format. There is no upload or in-app editor.

## Add a language

1. Create `data/grammar/<code>.json` and `data/error-types/<code>.json`.
2. Declare the language in the server configuration with its levels and prompts (documented when the configuration slice is done).
3. Nothing changes in the code.
