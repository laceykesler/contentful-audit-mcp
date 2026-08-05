import type {
  ContentType,
  DeliverySource,
  Entry,
  ManagementSource,
} from "../types.js";

export interface EntryFieldReport {
  id: string;
  updatedAt: string;
  /** Required fields with no value — always an error. */
  missingRequired: string[];
  /** Optional fields with no value — a warning only when coverage is sparse. */
  emptyOptional: string[];
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function analyzeEntry(
  entry: Entry,
  contentType: ContentType,
): EntryFieldReport {
  const missingRequired: string[] = [];
  const emptyOptional: string[] = [];

  for (const field of contentType.fields) {
    // Disabled and omitted fields aren't editable or delivered — not a defect.
    if (field.disabled || field.omitted) continue;

    if (!isEmpty(entry.fields?.[field.id])) continue;
    if (field.required) missingRequired.push(field.id);
    else emptyOptional.push(field.id);
  }

  return {
    id: entry.sys.id,
    updatedAt: entry.sys.updatedAt,
    missingRequired,
    emptyOptional,
  };
}

/**
 * An entry is "sparse" when more than half its optional fields are empty.
 *
 * The previous heuristic compared the empty-optional count against the number
 * of *required* fields, which made the threshold depend on an unrelated number:
 * a type with zero required fields flagged every entry with a single empty
 * optional field, and a type with many required fields flagged almost nothing.
 */
export function isSparse(
  report: EntryFieldReport,
  contentType: ContentType,
): boolean {
  const optionalCount = contentType.fields.filter(
    (f) => !f.required && !f.disabled && !f.omitted,
  ).length;
  if (optionalCount === 0) return false;
  return report.emptyOptional.length > optionalCount / 2;
}

export async function findMissingFields(
  delivery: DeliverySource,
  management: ManagementSource,
  options: { contentTypeId: string; limit?: number },
): Promise<string> {
  const contentType = await management.getContentType(options.contentTypeId);
  const collection = await delivery.getEntries({
    content_type: options.contentTypeId,
    limit: options.limit ?? 100,
  });

  const reports = collection.items.map((entry) => analyzeEntry(entry, contentType));
  const errors = reports.filter((r) => r.missingRequired.length > 0);
  const warnings = reports.filter(
    (r) => r.missingRequired.length === 0 && isSparse(r, contentType),
  );

  const lines: string[] = [
    "# Missing Fields Report",
    `Content type: **${contentType.name}** (\`${contentType.sys.id}\`)`,
    `Scanned ${collection.items.length} of ${collection.total} entries`,
    "",
  ];

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("🟢 All scanned entries pass field completeness checks.");
    return lines.join("\n");
  }

  if (errors.length > 0) {
    lines.push(`### 🔴 ${errors.length} entries missing required fields`);
    for (const report of errors) {
      const day = new Date(report.updatedAt).toISOString().slice(0, 10);
      lines.push(`- \`${report.id}\` (updated ${day})`);
      lines.push(
        `  Missing: ${report.missingRequired.map((f) => `\`${f}\``).join(", ")}`,
      );
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(`### 🟡 ${warnings.length} entries with sparse optional coverage`);
    for (const report of warnings) {
      lines.push(
        `- \`${report.id}\` — empty: ${report.emptyOptional.map((f) => `\`${f}\``).join(", ")}`,
      );
    }
  }

  return lines.join("\n");
}
