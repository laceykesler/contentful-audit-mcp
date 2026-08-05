#!/usr/bin/env node
/**
 * contentful-audit-mcp
 *
 * A Model Context Protocol server that lets an AI assistant audit the health of
 * a Contentful space — content-model defects, orphaned entries, and incomplete
 * entries — and get back a severity-ranked report in plain language.
 *
 * Tools exposed:
 *   audit_content_model   — structural defects in content type definitions
 *   find_orphaned_entries — entries with no incoming references
 *   find_missing_fields   — entries missing required or commonly-expected fields
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { auditContentModel } from "./audits/content-model.js";
import { findMissingFields } from "./audits/missing-fields.js";
import { findOrphanedEntries } from "./audits/orphans.js";
import {
  createDeliverySource,
  createManagementSource,
  getSpaceContext,
} from "./contentful.js";

const VERSION = "1.1.0";

/**
 * Surface failures as tool results rather than transport errors, so the
 * assistant can read the message and correct course (a bad content type ID, a
 * token missing a scope) instead of the call dying at the protocol layer.
 */
async function toolResult(run: () => Promise<string>) {
  try {
    return { content: [{ type: "text" as const, text: await run() }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `❌ ${message}` }],
      isError: true,
    };
  }
}

const server = new McpServer({ name: "contentful-audit", version: VERSION });

server.tool(
  "audit_content_model",
  "Audit the structural health of a Contentful content model: field coverage, " +
    "required vs optional ratios, disabled/omitted fields left in the schema, " +
    "and missing title or slug fields.",
  {
    content_type_id: z
      .string()
      .optional()
      .describe("Content type ID to audit. Omit to audit every content type."),
  },
  ({ content_type_id }) =>
    toolResult(() => {
      const space = getSpaceContext();
      return auditContentModel(createManagementSource(space), space, {
        contentTypeId: content_type_id,
      });
    }),
);

server.tool(
  "find_orphaned_entries",
  "Find entries that exist in the space but are not referenced by any other " +
    "entry. Sweeps the whole space for references, including Rich Text embeds.",
  {
    content_type_id: z
      .string()
      .optional()
      .describe("Only consider entries of this content type as orphan candidates."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe("Max orphan candidates to return."),
    max_scan: z
      .number()
      .int()
      .min(200)
      .max(50000)
      .optional()
      .describe(
        "Ceiling on entries swept for references (default 5000). Raise this for " +
          "large spaces — truncation is reported in the output.",
      ),
  },
  ({ content_type_id, limit, max_scan }) =>
    toolResult(() =>
      findOrphanedEntries(createDeliverySource(getSpaceContext()), {
        contentTypeId: content_type_id,
        limit,
        maxScan: max_scan,
      }),
    ),
);

server.tool(
  "find_missing_fields",
  "Scan entries of a content type and report ones missing required fields, or " +
    "with sparse optional-field coverage — the difference between 'valid' and " +
    "'complete'.",
  {
    content_type_id: z.string().describe("The content type ID to scan."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(100)
      .describe("Max entries to scan."),
  },
  ({ content_type_id, limit }) =>
    toolResult(() => {
      const space = getSpaceContext();
      return findMissingFields(
        createDeliverySource(space),
        createManagementSource(space),
        { contentTypeId: content_type_id, limit },
      );
    }),
);

await server.connect(new StdioServerTransport());
