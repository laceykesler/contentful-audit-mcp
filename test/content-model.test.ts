import { describe, expect, it } from "vitest";

import {
  analyzeContentType,
  auditContentModel,
} from "../src/audits/content-model.js";
import { contentType, fakeManagement, field } from "./fixtures.js";

const messages = (ct: Parameters<typeof analyzeContentType>[0]) =>
  analyzeContentType(ct).issues.map((i) => i.message);

describe("analyzeContentType", () => {
  it("counts field stats", () => {
    const report = analyzeContentType(
      contentType("post", [
        field("title", { required: true }),
        field("slug", { required: true }),
        field("body", { localized: true }),
        field("legacy", { disabled: true }),
        field("internal", { omitted: true }),
      ]),
    );

    expect(report.fields).toEqual({
      total: 5,
      required: 2,
      disabled: 1,
      omitted: 1,
      localized: 1,
    });
  });

  it("errors on a content type with no fields", () => {
    const report = analyzeContentType(contentType("empty", []));
    expect(report.issues[0]).toEqual({
      level: "error",
      message: "No fields defined",
    });
  });

  it("does not pile warnings onto an already-empty type", () => {
    // An empty type has no title and no slug, but reporting three findings for
    // one defect is noise — the error already says everything actionable.
    expect(messages(contentType("empty", []))).toHaveLength(1);
  });

  it("warns when nothing is required", () => {
    expect(messages(contentType("loose", [field("body")]))).toContain(
      "No required fields — an entry with every field empty still validates",
    );
  });

  it("warns about disabled and omitted fields left in the schema", () => {
    const found = messages(
      contentType("cruft", [
        field("title", { required: true }),
        field("old", { disabled: true }),
        field("secret", { omitted: true }),
      ]),
    );

    expect(found).toContain(
      "1 disabled field(s) still in the schema (dead weight)",
    );
    expect(found).toContain(
      "1 omitted field(s) hidden from the Delivery API but still stored",
    );
  });

  it("warns when a page-like type has no slug", () => {
    expect(
      messages(contentType("blogPost", [field("title", { required: true })], "Blog Post")),
    ).toContain("Page-like content type has no slug field — routing will break");
  });

  it("does not demand a slug on a non-routable type", () => {
    const found = messages(
      contentType("author", [field("name", { required: true })], "Author"),
    );
    expect(found.join(" ")).not.toContain("slug");
  });

  it("accepts any conventional title field", () => {
    for (const id of ["title", "name", "heading", "label"]) {
      const found = messages(contentType("t", [field(id, { required: true })], "Thing"));
      expect(found.join(" ")).not.toContain("No title/name field");
    }
  });

  it("reports a clean type with no issues", () => {
    const report = analyzeContentType(
      contentType(
        "page",
        [field("title", { required: true }), field("slug", { required: true })],
        "Page",
      ),
    );
    expect(report.issues).toEqual([]);
  });
});

describe("auditContentModel", () => {
  const space = { spaceId: "abc123", environment: "master" };

  it("summarizes every content type", async () => {
    const output = await auditContentModel(
      fakeManagement([
        contentType("page", [field("title", { required: true }), field("slug", { required: true })], "Page"),
        contentType("broken", []),
      ]),
      space,
    );

    expect(output).toContain("Scanned 2 content type(s)");
    expect(output).toContain("🔴 1 errors");
    expect(output).toContain("🟢 1 clean");
  });

  it("scopes to one content type when given an id", async () => {
    const output = await auditContentModel(
      fakeManagement([
        contentType("page", [field("title", { required: true })], "Page"),
        contentType("author", [field("name", { required: true })], "Author"),
      ]),
      space,
      { contentTypeId: "author" },
    );

    expect(output).toContain("Scanned 1 content type(s)");
    expect(output).toContain("Author");
    expect(output).not.toContain("**Page**");
  });
});
