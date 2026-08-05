import type { Severity } from "./types.js";

const SEVERITY_ICONS: Record<Severity, string> = {
  error: "🔴",
  warn: "🟡",
  ok: "🟢",
};

export function severityIcon(level: Severity): string {
  return SEVERITY_ICONS[level] ?? "⚪";
}

/** The worst severity present in a list of issues; "ok" when there are none. */
export function worstSeverity(issues: { level: Severity }[]): Severity {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return "ok";
}

/**
 * Render a fixed-width table. Column widths are sized to the widest cell so the
 * output stays aligned in a terminal or a monospace chat window.
 */
export function formatTable(rows: string[][], headers: string[]): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  const separator = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const line = (cells: string[]) =>
    widths.map((w, i) => (cells[i] ?? "").padEnd(w)).join(" │ ");

  return [line(headers), separator, ...rows.map(line)].join("\n");
}

/**
 * Best-effort human label for an entry. Prefers conventional title fields, then
 * falls back to the first string field, then to a placeholder.
 */
export function entryTitle(fields: Record<string, unknown> | undefined): string {
  if (!fields) return "(untitled)";

  for (const key of ["title", "name", "heading", "label"]) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  for (const value of Object.values(fields)) {
    if (typeof value === "string" && value.trim()) return value;
  }

  return "(untitled)";
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
