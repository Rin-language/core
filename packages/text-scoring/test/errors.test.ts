import { describe, expect, it } from "vitest";
import { PackError, ScoringInputError } from "../src/errors.js";

describe("PackError", () => {
  it("joins the problems after the label in its message", () => {
    expect(new PackError("written.json", ["a", "b"]).message).toBe(
      "written.json: a; b",
    );
  });

  it("exposes the problems", () => {
    expect(new PackError("x", ["a"]).problems).toEqual(["a"]);
  });
});

describe("ScoringInputError", () => {
  it("uses the problem code as its message", () => {
    expect(new ScoringInputError("text_empty").message).toBe("text_empty");
  });

  it("exposes the problem code", () => {
    expect(new ScoringInputError("no_words").problem).toBe("no_words");
  });
});
