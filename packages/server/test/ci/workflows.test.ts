import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findWorkflowProblems } from "../../../../scripts/workflow-rules.mjs";

const workflowsDirectory = new URL(
  "../../../../.github/workflows/",
  import.meta.url,
);
const sha = "11d5960a326750d5838078e36cf38b85af677262";

const workflow = (body: string, header = "permissions:\n  contents: read\n") =>
  `name: T\non:\n  pull_request:\n${header}jobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    steps:\n${body}`;

const checkout = (
  withBlock = "        with:\n          persist-credentials: false\n",
) => `      - uses: actions/checkout@${sha}\n${withBlock}`;

const problemsOf = (text: string): string[] => findWorkflowProblems(text);

describe("the repository workflows", () => {
  const files = readdirSync(workflowsDirectory).filter((name) =>
    /\.ya?ml$/.test(name),
  );

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s follows the security rules", (name) => {
    const text = readFileSync(new URL(name, workflowsDirectory), "utf8");

    expect(problemsOf(text)).toEqual([]);
  });
});

describe("findWorkflowProblems", () => {
  it("accepts a pinned, read-only workflow", () => {
    expect(problemsOf(workflow(checkout()))).toEqual([]);
  });

  it("flags an action pinned to a tag", () => {
    const text = workflow(
      "      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false\n",
    );

    expect(problemsOf(text)).toEqual([
      expect.stringContaining("pinned to a full commit SHA"),
    ]);
  });

  it("accepts a local action", () => {
    expect(problemsOf(workflow("      - uses: ./.github/actions/x\n"))).toEqual(
      [],
    );
  });

  it("flags a missing permissions block", () => {
    expect(problemsOf(workflow(checkout(), ""))).toEqual([
      expect.stringContaining("permissions"),
    ]);
  });

  it("flags write permissions", () => {
    const text = workflow(checkout(), "permissions:\n  contents: write\n");

    expect(problemsOf(text)).toEqual([expect.stringContaining("permissions")]);
  });

  it("flags extra permissions at the top", () => {
    const text = workflow(
      checkout(),
      "permissions:\n  contents: read\n  id-token: write\n",
    );

    expect(problemsOf(text)).toEqual([expect.stringContaining("permissions")]);
  });

  it("flags the pull_request_target trigger", () => {
    const text = workflow(checkout()).replace(
      "pull_request:",
      "pull_request_target:",
    );

    expect(problemsOf(text)).toEqual([
      expect.stringContaining("pull_request_target"),
    ]);
  });

  it("lets a comment talk about pull_request_target", () => {
    const text = workflow(
      checkout(),
      "# never pull_request_target\npermissions:\n  contents: read\n",
    );

    expect(problemsOf(text)).toEqual([]);
  });

  it("flags a checkout that keeps the credentials", () => {
    expect(problemsOf(workflow(checkout("")))).toEqual([
      expect.stringContaining("persist-credentials"),
    ]);
  });

  it("flags a checkout whose credentials are kept explicitly", () => {
    const text = workflow(
      checkout("        with:\n          persist-credentials: true\n"),
    );

    expect(problemsOf(text)).toEqual([
      expect.stringContaining("persist-credentials"),
    ]);
  });

  it("flags an expression inside a one-line run", () => {
    const text = workflow(
      `${checkout()}      - run: echo "\${{ github.head_ref }}"\n`,
    );

    expect(problemsOf(text)).toEqual([expect.stringContaining("run")]);
  });

  it("flags an expression inside a multi-line run", () => {
    const text = workflow(
      `${checkout()}      - run: |\n          echo start\n          echo \${{ github.event.pull_request.title }}\n`,
    );

    expect(problemsOf(text)).toEqual([expect.stringContaining("run")]);
  });

  it("accepts an expression passed through env", () => {
    const text = workflow(
      `${checkout()}      - env:\n          BASE_REF: \${{ github.base_ref }}\n        run: echo "$BASE_REF"\n`,
    );

    expect(problemsOf(text)).toEqual([]);
  });

  it("does not accept a comment as the persist-credentials setting", () => {
    const text = workflow(checkout("        # persist-credentials: false\n"));

    expect(problemsOf(text)).toEqual([
      expect.stringContaining("persist-credentials"),
    ]);
  });

  it("flags write-all permissions on a job", () => {
    const text = workflow(`${checkout()}`).replace(
      "    runs-on: ubuntu-latest\n",
      "    runs-on: ubuntu-latest\n    permissions: write-all\n",
    );

    expect(problemsOf(text)).toEqual([expect.stringContaining("write-all")]);
  });

  it("flags the workflow_run trigger", () => {
    const text = workflow(checkout()).replace("pull_request:", "workflow_run:");

    expect(problemsOf(text)).toEqual([expect.stringContaining("workflow_run")]);
  });

  it("flags an expression inside a github-script", () => {
    const text = workflow(
      `${checkout()}      - uses: actions/github-script@${sha}\n        with:\n          script: |\n            console.log("\${{ github.head_ref }}")\n`,
    );

    expect(problemsOf(text)).toEqual([expect.stringContaining("script")]);
  });

  it("flags a job without a timeout", () => {
    const text = workflow(checkout()).replace("    timeout-minutes: 15\n", "");

    expect(problemsOf(text)).toEqual([
      expect.stringContaining("timeout-minutes"),
    ]);
  });
});
