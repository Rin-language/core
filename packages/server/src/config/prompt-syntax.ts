/** The grammar shared by the prompt files, the gateway and the sanitizer. */

/** Name of a prompt variable, also the name of its untrusted block. */
export const VARIABLE_NAME = /^[a-z][A-Za-z0-9]*$/;

/** `{{name}}` in a user prompt. Global: use with `replace` or `matchAll` only. */
export const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;

export const PROMPT_ID = /^[a-z][a-z0-9_]*$/;

export const LANGUAGE_CODE = /^[a-z]{2}$/;

/** Tag that delimits untrusted text, and the word a system prompt must use. */
export const UNTRUSTED_TAG = "untrusted";
