import { describe, expect, it } from "vitest";

import {
  entryTitle,
  formatTable,
  severityIcon,
  truncate,
  worstSeverity,
} from "../src/format.js";

describe("worstSeverity", () => {
  it("is ok for no issues", () => {
    expect(worstSeverity([])).toBe("ok");
  });

  it("prefers error over warn", () => {
    expect(worstSeverity([{ level: "warn" }, { level: "error" }])).toBe("error");
  });

  it("reports warn when there is no error", () => {
    expect(worstSeverity([{ level: "warn" }])).toBe("warn");
  });
});

describe("severityIcon", () => {
  it("maps each level", () => {
    expect(severityIcon("error")).toBe("🔴");
    expect(severityIcon("warn")).toBe("🟡");
    expect(severityIcon("ok")).toBe("🟢");
  });
});

describe("formatTable", () => {
  it("pads columns to the widest cell", () => {
    const table = formatTable(
      [
        ["a", "short"],
        ["bbbb", "a much longer value"],
      ],
      ["ID", "Value"],
    );
    const [header, , firstRow] = table.split("\n");

    expect(header.indexOf("Value")).toBe(firstRow.indexOf("short"));
  });

  it("renders headers with no rows", () => {
    expect(formatTable([], ["ID"])).toContain("ID");
  });

  it("tolerates ragged rows", () => {
    expect(() => formatTable([["only-one"]], ["A", "B"])).not.toThrow();
  });
});

describe("entryTitle", () => {
  it("prefers conventional title fields in order", () => {
    expect(entryTitle({ name: "second", title: "first" })).toBe("first");
    expect(entryTitle({ body: "x", name: "second" })).toBe("second");
  });

  it("falls back to the first non-empty string field", () => {
    expect(entryTitle({ body: "some copy" })).toBe("some copy");
  });

  it("skips blank values", () => {
    expect(entryTitle({ title: "   ", body: "real" })).toBe("real");
  });

  it("handles entries with no usable field", () => {
    expect(entryTitle({ count: 3 })).toBe("(untitled)");
    expect(entryTitle(undefined)).toBe("(untitled)");
  });
});

describe("truncate", () => {
  it("leaves short values alone", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("adds an ellipsis when cutting", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
  });
});
