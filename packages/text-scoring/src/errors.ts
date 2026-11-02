/** A data file (frequency pack, scoring config) is unreadable or invalid. */
export class PackError extends Error {
  readonly label: string;
  readonly problems: readonly string[];

  constructor(
    label: string,
    problems: readonly string[],
    options?: ErrorOptions,
  ) {
    super(`${label}: ${problems.join("; ")}`, options);
    this.name = "PackError";
    this.label = label;
    this.problems = problems;
  }
}

export type ScoringInputProblem =
  | "text_empty"
  | "text_too_long"
  | "no_words"
  | "speech_rate_missing"
  | "speech_rate_invalid"
  | "mode_unavailable";

/** The message is the code only: the input text never enters an error. */
export class ScoringInputError extends Error {
  readonly problem: ScoringInputProblem;

  constructor(problem: ScoringInputProblem) {
    super(problem);
    this.name = "ScoringInputError";
    this.problem = problem;
  }
}
