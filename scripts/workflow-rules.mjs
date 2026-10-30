// Security rules every GitHub Actions workflow of the repository follows. Plain
// line reading: no YAML parser to depend on, and the workflows stay simple
// enough for it. Used by the test suite, so CI itself is covered by tests.

const FULL_SHA = /@[0-9a-f]{40}$/;

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === "";

function permissionsProblems(lines) {
  const start = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (start === -1) {
    return [
      "permissions: a top-level block `permissions: contents: read` is required",
    ];
  }
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (isBlank(line) || line.trimStart().startsWith("#")) continue;
    if (indentOf(line) === 0) break;
    entries.push(line.trim());
  }
  const isReadOnly = entries.length === 1 && entries[0] === "contents: read";
  return isReadOnly
    ? []
    : [
        "permissions: the top-level block must be exactly `contents: read`; widen it per job",
      ];
}

/** Lines of the step that holds line `index`, from its dash to the next step. */
function stepLines(lines, index) {
  let start = index;
  while (start > 0 && !/^\s*- /.test(lines[start])) start -= 1;
  const dashIndent = indentOf(lines[start]);
  let end = index + 1;
  while (
    end < lines.length &&
    (isBlank(lines[end]) || indentOf(lines[end]) > dashIndent)
  ) {
    end += 1;
  }
  return lines.slice(start, end);
}

function runProblems(lines) {
  const problems = [];
  lines.forEach((line, index) => {
    const match = /^(\s*)(- )?(run|script):\s*(.*)$/.exec(line);
    if (match === null) return;
    const keyIndent =
      (match[1]?.length ?? 0) + (match[2] === undefined ? 0 : 2);
    const body = [match[4] ?? ""];
    for (const next of lines.slice(index + 1)) {
      if (!isBlank(next) && indentOf(next) <= keyIndent) break;
      body.push(next);
    }
    if (body.some((text) => text.includes("${{"))) {
      problems.push(
        `line ${index + 1}: an expression \${{ }} inside ${match[3]} is a script injection; pass it through env`,
      );
    }
  });
  return problems;
}

// A comment must never satisfy or hide a rule.
const withoutComment = (line) => line.replace(/(^|\s)#.*$/, "$1");

function timeoutProblems(lines) {
  const problems = [];
  const jobsAt = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsAt === -1) return problems;
  const starts = [];
  lines.forEach((line, index) => {
    if (index > jobsAt && /^ {2}[\w-]+:\s*$/.test(line)) starts.push(index);
  });
  starts.forEach((start, position) => {
    const block = lines.slice(start, starts[position + 1] ?? lines.length);
    if (!block.some((line) => /^ {4}timeout-minutes:/.test(line))) {
      problems.push(
        `line ${start + 1}: job ${lines[start].trim().slice(0, -1)} needs timeout-minutes, or a hung step holds a runner for hours`,
      );
    }
  });
  return problems;
}

/** Returns the problems found in the text of one workflow, none when sound. */
export function findWorkflowProblems(text) {
  const lines = text.split("\n").map(withoutComment);
  const problems = [];

  if (
    lines.some(
      (line) =>
        !line.trimStart().startsWith("#") &&
        line.includes("pull_request_target"),
    )
  ) {
    problems.push(
      "pull_request_target runs code from a fork with the repository's secrets: do not use it",
    );
  }
  if (lines.some((line) => /^\s*workflow_run\s*:/.test(line))) {
    problems.push(
      "workflow_run can run with secrets after an untrusted workflow: do not use it",
    );
  }
  if (lines.some((line) => /permissions:\s*write-all/.test(line))) {
    problems.push("permissions: write-all gives every scope; list the scopes");
  }
  problems.push(...permissionsProblems(lines));
  problems.push(...timeoutProblems(lines));

  lines.forEach((line, index) => {
    const match = /^\s*(?:- )?uses:\s*(\S+)/.exec(line);
    if (match === null) return;
    const reference = match[1] ?? "";
    if (reference.startsWith("./")) return;
    if (!FULL_SHA.test(reference)) {
      problems.push(
        `line ${index + 1}: ${reference} must be pinned to a full commit SHA`,
      );
    }
    if (reference.startsWith("actions/checkout@")) {
      const step = stepLines(lines, index).join("\n");
      if (!/persist-credentials:\s*false/.test(step)) {
        problems.push(
          `line ${index + 1}: actions/checkout needs persist-credentials: false`,
        );
      }
    }
  });

  problems.push(...runProblems(lines));
  return problems;
}
