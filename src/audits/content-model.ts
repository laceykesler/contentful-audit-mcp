import { severityIcon, worstSeverity } from "../format.js";
import type {
  ContentType,
  Issue,
  ManagementSource,
  SpaceContext,
} from "../types.js";

/** Field IDs that conventionally identify an entry in the Contentful UI. */
const TITLE_FIELD_IDS = ["title", "name", "heading", "label"];

/** Content types whose names match this are expected to be routable. */
const PAGE_LIKE = /page|post|article|blog|entry/i;

export interface FieldStats {
  total: number;
  required: number;
  disabled: number;
  omitted: number;
  localized: number;
}

export interface ContentTypeReport {
  id: string;
  name: string;
  fields: FieldStats;
  issues: Issue[];
}

export function analyzeContentType(contentType: ContentType): ContentTypeReport {
  const fields = contentType.fields ?? [];
  const stats: FieldStats = {
    total: fields.length,
    required: fields.filter((f) => f.required).length,
    disabled: fields.filter((f) => f.disabled).length,
    omitted: fields.filter((f) => f.omitted).length,
    localized: fields.filter((f) => f.localized).length,
  };

  const issues: Issue[] = [];

  if (stats.total === 0) {
    issues.push({ level: "error", message: "No fields defined" });
  }

  if (stats.total > 0 && stats.required === 0) {
    issues.push({
      level: "warn",
      message:
        "No required fields — an entry with every field empty still validates",
    });
  }

  if (stats.disabled > 0) {
    issues.push({
      level: "warn",
      message: `${stats.disabled} disabled field(s) still in the schema (dead weight)`,
    });
  }

  if (stats.omitted > 0) {
    issues.push({
      level: "warn",
      message: `${stats.omitted} omitted field(s) hidden from the Delivery API but still stored`,
    });
  }

  const hasTitle = fields.some((f) =>
    TITLE_FIELD_IDS.includes(f.id.toLowerCase()),
  );
  if (stats.total > 0 && !hasTitle) {
    issues.push({
      level: "warn",
      message:
        "No title/name field — entries will be hard to identify in reference pickers",
    });
  }

  const hasSlug = fields.some((f) => f.id.toLowerCase() === "slug");
  if (PAGE_LIKE.test(contentType.name) && !hasSlug) {
    issues.push({
      level: "warn",
      message: "Page-like content type has no slug field — routing will break",
    });
  }

  return { id: contentType.sys.id, name: contentType.name, fields: stats, issues };
}

export async function auditContentModel(
  management: ManagementSource,
  space: SpaceContext,
  options: { contentTypeId?: string } = {},
): Promise<string> {
  const contentTypes = options.contentTypeId
    ? [await management.getContentType(options.contentTypeId)]
    : await management.getContentTypes();

  const reports = contentTypes.map(analyzeContentType);
  return renderContentModelReport(reports, space);
}

export function renderContentModelReport(
  reports: ContentTypeReport[],
  space: SpaceContext,
): string {
  const lines: string[] = [
    "# Content Model Audit",
    `Space: ${space.spaceId} · Environment: ${space.environment}`,
    `Scanned ${reports.length} content type(s)`,
    "",
  ];

  for (const report of reports) {
    const { fields } = report;
    lines.push(
      `${severityIcon(worstSeverity(report.issues))} **${report.name}** (\`${report.id}\`)`,
    );
    lines.push(
      `   Fields: ${fields.total} total · ${fields.required} required · ` +
        `${fields.localized} localized · ${fields.disabled} disabled · ${fields.omitted} omitted`,
    );
    if (report.issues.length === 0) {
      lines.push("   ✓ No issues detected");
    } else {
      for (const issue of report.issues) {
        lines.push(`   ${severityIcon(issue.level)} ${issue.message}`);
      }
    }
    lines.push("");
  }

  const errors = reports.filter((r) => worstSeverity(r.issues) === "error").length;
  const warnings = reports.filter((r) => worstSeverity(r.issues) === "warn").length;
  const clean = reports.length - errors - warnings;

  lines.push("---");
  lines.push(
    `**Summary:** 🔴 ${errors} errors · 🟡 ${warnings} warnings · 🟢 ${clean} clean`,
  );

  return lines.join("\n");
}
