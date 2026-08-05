import { entryTitle, formatTable, truncate } from "../format.js";
import type { DeliverySource, Entry, EntryCollection } from "../types.js";

/** Delivery API caps a single page at 1000; 200 keeps payloads reasonable. */
const PAGE_SIZE = 200;

/** Safety ceiling on the reference sweep. Truncation is always reported. */
const DEFAULT_MAX_SCAN = 5000;

interface MaybeLink {
  sys?: { type?: string; linkType?: string; id?: string };
}

/**
 * Walk an arbitrary field value and collect every entry ID it points at.
 *
 * Handles the four shapes a reference can take in a Delivery API response:
 * an unresolved `Link`, an already-resolved `Entry`, an array of either, and
 * embedded/inline entry nodes inside a Rich Text document. The original
 * implementation only matched resolved entries, so links to unpublished
 * targets and every rich-text embed were missed — and their targets were then
 * reported as orphans.
 */
export function collectLinkedIds(
  value: unknown,
  found: Set<string> = new Set(),
  seen: Set<object> = new Set(),
): Set<string> {
  if (value === null || typeof value !== "object") return found;

  // Resolved entries are cyclic once Contentful hydrates them.
  if (seen.has(value)) return found;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectLinkedIds(item, found, seen);
    return found;
  }

  const node = value as MaybeLink & Record<string, unknown>;
  const type = node.sys?.type;
  const id = node.sys?.id;

  if (typeof id === "string") {
    // Unresolved link to an entry, or an entry the SDK already hydrated.
    if (type === "Link" && node.sys?.linkType === "Entry") found.add(id);
    else if (type === "Entry") found.add(id);
  }

  // Descend into everything else — this is what picks up Rich Text `content`
  // arrays and the `data.target` of embedded-entry nodes.
  for (const [key, child] of Object.entries(node)) {
    if (key === "sys") continue;
    collectLinkedIds(child, found, seen);
  }

  return found;
}

export interface OrphanScan {
  orphans: Entry[];
  entriesScanned: number;
  totalEntries: number;
  /** True when the space is larger than the scan ceiling, so results are partial. */
  truncated: boolean;
}

/**
 * Build the set of referenced entry IDs by sweeping the whole space, then
 * report candidates that nothing points at.
 *
 * The sweep must cover every entry, not a sample: an entry referenced only by
 * page 6 is not an orphan, and stopping early would report it as one.
 */
export async function scanForOrphans(
  delivery: DeliverySource,
  options: { contentTypeId?: string; limit?: number; maxScan?: number } = {},
): Promise<OrphanScan> {
  const maxScan = options.maxScan ?? DEFAULT_MAX_SCAN;

  const candidates = await delivery.getEntries({
    content_type: options.contentTypeId,
    limit: options.limit ?? 50,
  });

  const referenced = new Set<string>();
  let scanned = 0;
  let total = Number.POSITIVE_INFINITY;

  while (scanned < Math.min(total, maxScan)) {
    const page: EntryCollection = await delivery.getEntries({
      limit: PAGE_SIZE,
      skip: scanned,
    });
    total = page.total;
    if (page.items.length === 0) break;

    for (const entry of page.items) {
      for (const value of Object.values(entry.fields ?? {})) {
        collectLinkedIds(value, referenced);
      }
    }
    scanned += page.items.length;
  }

  return {
    orphans: candidates.items.filter((e) => !referenced.has(e.sys.id)),
    entriesScanned: scanned,
    totalEntries: Number.isFinite(total) ? total : scanned,
    truncated: scanned < total,
  };
}

export function renderOrphanReport(
  scan: OrphanScan,
  options: { contentTypeId?: string } = {},
): string {
  const lines: string[] = [
    "# Orphaned Entry Report",
    `Content type filter: ${options.contentTypeId ?? "all"}`,
    `Swept ${scan.entriesScanned} of ${scan.totalEntries} entries for references · ` +
      `found **${scan.orphans.length} orphan(s)**`,
    "",
  ];

  if (scan.truncated) {
    lines.push(
      `> ⚠️ The space has more entries than the scan ceiling, so only the first ` +
        `${scan.entriesScanned} were swept for references. Entries referenced ` +
        `beyond that point may be listed below incorrectly. Raise \`max_scan\` ` +
        `for a complete result.`,
      "",
    );
  }

  if (scan.orphans.length === 0) {
    lines.push("🟢 No orphaned entries found.");
    return lines.join("\n");
  }

  const rows = scan.orphans.map((entry) => [
    entry.sys.id,
    entry.sys.contentType?.sys.id ?? "unknown",
    truncate(entryTitle(entry.fields), 48),
    new Date(entry.sys.updatedAt).toISOString().slice(0, 10),
  ]);

  lines.push(formatTable(rows, ["Entry ID", "Content Type", "Title", "Updated"]));
  lines.push("");
  lines.push(
    "> These entries exist in the space but nothing links to them. Check before " +
      "deleting — entries fetched directly by ID from application code have no " +
      "incoming reference and will appear here.",
  );

  return lines.join("\n");
}

export async function findOrphanedEntries(
  delivery: DeliverySource,
  options: { contentTypeId?: string; limit?: number; maxScan?: number } = {},
): Promise<string> {
  const scan = await scanForOrphans(delivery, options);
  return renderOrphanReport(scan, options);
}
