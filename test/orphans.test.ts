import { describe, expect, it } from "vitest";

import {
  collectLinkedIds,
  scanForOrphans,
} from "../src/audits/orphans.js";
import { entry, fakeDelivery, link, richTextWithEmbed } from "./fixtures.js";

describe("collectLinkedIds", () => {
  it("finds unresolved links", () => {
    expect([...collectLinkedIds(link("a"))]).toEqual(["a"]);
  });

  it("finds arrays of links", () => {
    expect([...collectLinkedIds([link("a"), link("b")])].sort()).toEqual(["a", "b"]);
  });

  it("finds entries the SDK already resolved", () => {
    const resolved = { sys: { type: "Entry", id: "a" }, fields: {} };
    expect([...collectLinkedIds(resolved)]).toEqual(["a"]);
  });

  // Regression: rich-text embeds were previously invisible to the sweep, so
  // every entry referenced only from a rich-text field was reported as orphaned.
  it("finds entries embedded in a Rich Text document", () => {
    expect([...collectLinkedIds(richTextWithEmbed("embedded"))]).toEqual([
      "embedded",
    ]);
  });

  it("ignores asset links", () => {
    const asset = { sys: { type: "Link", linkType: "Asset", id: "img" } };
    expect([...collectLinkedIds(asset)]).toEqual([]);
  });

  it("terminates on cyclic resolved references", () => {
    const a: Record<string, unknown> = { sys: { type: "Entry", id: "a" } };
    const b: Record<string, unknown> = { sys: { type: "Entry", id: "b" }, a };
    a.b = b;
    expect([...collectLinkedIds(a)].sort()).toEqual(["a", "b"]);
  });

  it("ignores primitives", () => {
    expect([...collectLinkedIds("hello")]).toEqual([]);
    expect([...collectLinkedIds(null)]).toEqual([]);
    expect([...collectLinkedIds(42)]).toEqual([]);
  });
});

describe("scanForOrphans", () => {
  it("reports entries nothing links to", async () => {
    const scan = await scanForOrphans(
      fakeDelivery([
        entry("linked"),
        entry("orphan"),
        entry("referrer", { related: link("linked") }),
      ]),
    );

    expect(scan.orphans.map((e) => e.sys.id)).toEqual(["orphan", "referrer"]);
    expect(scan.truncated).toBe(false);
  });

  it("does not report an entry referenced from a rich text field", async () => {
    const scan = await scanForOrphans(
      fakeDelivery([
        entry("embedded"),
        entry("article", { body: richTextWithEmbed("embedded") }),
      ]),
    );

    expect(scan.orphans.map((e) => e.sys.id)).toEqual(["article"]);
  });

  // Regression: the sweep used to stop after 1000 entries while still treating
  // every candidate as a potential orphan, so an entry referenced from later in
  // the space was reported as an orphan with no warning.
  it("sweeps past the first page before deciding", async () => {
    const filler = Array.from({ length: 250 }, (_, i) => entry(`filler-${i}`));
    const scan = await scanForOrphans(
      fakeDelivery([entry("target"), ...filler, entry("late", { ref: link("target") })]),
      { limit: 200 },
    );

    expect(scan.entriesScanned).toBe(252);
    expect(scan.orphans.map((e) => e.sys.id)).not.toContain("target");
  });

  it("flags truncation instead of silently sampling", async () => {
    const entries = Array.from({ length: 600 }, (_, i) => entry(`e-${i}`));
    const scan = await scanForOrphans(fakeDelivery(entries), { maxScan: 200 });

    expect(scan.truncated).toBe(true);
    expect(scan.entriesScanned).toBe(200);
    expect(scan.totalEntries).toBe(600);
  });

  it("scopes candidates to a content type but sweeps everything", async () => {
    const scan = await scanForOrphans(
      fakeDelivery([
        entry("post-1", {}, "post"),
        entry("page-1", { ref: link("post-1") }, "page"),
        entry("post-2", {}, "post"),
      ]),
      { contentTypeId: "post" },
    );

    expect(scan.orphans.map((e) => e.sys.id)).toEqual(["post-2"]);
  });
});
