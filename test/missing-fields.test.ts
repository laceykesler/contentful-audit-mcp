import { describe, expect, it } from "vitest";

import {
  analyzeEntry,
  findMissingFields,
  isSparse,
} from "../src/audits/missing-fields.js";
import { contentType, entry, fakeDelivery, fakeManagement, field } from "./fixtures.js";

const post = contentType(
  "post",
  [
    field("title", { required: true }),
    field("body", { required: true }),
    field("summary"),
    field("tags"),
    field("legacy", { disabled: true }),
  ],
  "Post",
);

describe("analyzeEntry", () => {
  it("separates missing required from empty optional", () => {
    const report = analyzeEntry(
      entry("e1", { title: "Hello", summary: "" }),
      post,
    );

    expect(report.missingRequired).toEqual(["body"]);
    expect(report.emptyOptional).toEqual(["summary", "tags"]);
  });

  it("treats whitespace-only strings as empty", () => {
    expect(analyzeEntry(entry("e", { title: "   " }), post).missingRequired).toContain(
      "title",
    );
  });

  it("treats empty arrays and objects as empty", () => {
    const report = analyzeEntry(entry("e", { title: "x", body: [], tags: {} }), post);
    expect(report.missingRequired).toContain("body");
    expect(report.emptyOptional).toContain("tags");
  });

  it("treats false and 0 as present values", () => {
    const flags = contentType("flags", [
      field("enabled", { required: true }),
      field("count", { required: true }),
    ]);
    expect(
      analyzeEntry(entry("e", { enabled: false, count: 0 }), flags).missingRequired,
    ).toEqual([]);
  });

  it("ignores disabled fields", () => {
    const report = analyzeEntry(entry("e", { title: "x", body: "y" }), post);
    expect(report.missingRequired).toEqual([]);
    expect(report.emptyOptional).not.toContain("legacy");
  });
});

describe("isSparse", () => {
  // Regression: sparseness used to be measured against the number of *required*
  // fields, so a type with no required fields flagged an entry for a single
  // empty optional, and a type with many required fields flagged almost nothing.
  it("measures against the optional field count, not the required count", () => {
    const noRequired = contentType("loose", [field("a"), field("b"), field("c"), field("d")]);
    const oneEmpty = analyzeEntry(entry("e", { a: "x", b: "y", c: "z" }), noRequired);
    expect(isSparse(oneEmpty, noRequired)).toBe(false);

    const mostEmpty = analyzeEntry(entry("e", { a: "x" }), noRequired);
    expect(isSparse(mostEmpty, noRequired)).toBe(true);
  });

  it("is never sparse when a type has no optional fields", () => {
    const strict = contentType("strict", [field("a", { required: true })]);
    expect(isSparse(analyzeEntry(entry("e", {}), strict), strict)).toBe(false);
  });
});

describe("findMissingFields", () => {
  it("reports entries missing required fields as errors", async () => {
    const output = await findMissingFields(
      fakeDelivery([entry("good", { title: "a", body: "b", summary: "c", tags: ["d"] }, "post"),
        entry("bad", { title: "a" }, "post")]),
      fakeManagement([post]),
      { contentTypeId: "post" },
    );

    expect(output).toContain("🔴 1 entries missing required fields");
    expect(output).toContain("`bad`");
    expect(output).toContain("`body`");
  });

  it("passes a fully populated content type", async () => {
    const output = await findMissingFields(
      fakeDelivery([entry("e", { title: "a", body: "b", summary: "c", tags: ["d"] }, "post")]),
      fakeManagement([post]),
      { contentTypeId: "post" },
    );

    expect(output).toContain("All scanned entries pass field completeness checks");
  });

  it("surfaces an unknown content type as an error", async () => {
    await expect(
      findMissingFields(fakeDelivery([]), fakeManagement([post]), {
        contentTypeId: "nope",
      }),
    ).rejects.toThrow("Unknown content type: nope");
  });
});
