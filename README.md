# contentful-audit-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant audit the health of a Contentful space and hand back a severity-ranked report in plain language.

Ask Claude *"audit my content model"* and get back structural defects, orphaned entries, and incomplete entries — no dashboard, no manual API calls, no context switching.

```
🔴 Landing Page (`landingPage`)
   Fields: 4 total · 0 required · 0 localized · 1 disabled · 0 omitted
   🟡 No required fields — an entry with every field empty still validates
   🟡 1 disabled field(s) still in the schema (dead weight)
   🟡 Page-like content type has no slug field — routing will break

🟢 Author (`author`)
   Fields: 3 total · 1 required · 0 localized · 0 disabled · 0 omitted
   ✓ No issues detected

---
**Summary:** 🔴 0 errors · 🟡 1 warnings · 🟢 1 clean
```

---

## Why

Headless CMS health degrades silently. A content model that looks fine in the editor can have:

- entries nothing links to, quietly consuming space and confusing editors
- required fields that were added after the content was, so nothing actually enforces them
- page-like types with no `slug`, which breaks routing the moment someone publishes
- disabled and omitted fields left in the schema as dead weight

None of this is visible without querying the Management API directly. This server exposes those checks as three natural-language tools.

---

## Tools

### `audit_content_model`

Scans content type definitions for structural problems.

| Check | Severity |
|---|---|
| No fields defined | 🔴 error |
| No required fields — every entry validates even when empty | 🟡 warn |
| Disabled fields still in the schema | 🟡 warn |
| Omitted fields hidden from delivery but still stored | 🟡 warn |
| No `title`/`name`/`heading`/`label` field | 🟡 warn |
| Page-like type (`page`, `post`, `article`, `blog`) with no `slug` | 🟡 warn |

**Parameters:** `content_type_id` *(optional)* — audit one type instead of all.

### `find_orphaned_entries`

Sweeps the whole space for references, then reports entries nothing points at.

Reference detection covers all four shapes a link can take in a Delivery API response: unresolved `Link` objects, entries the SDK already resolved, arrays of either, and entries embedded inside a **Rich Text** document.

**Parameters:**
- `content_type_id` *(optional)* — restrict orphan candidates to one type
- `limit` *(default 50)* — max candidates returned
- `max_scan` *(default 5000)* — ceiling on entries swept for references

> The sweep must cover the whole space to be correct: an entry referenced only from page 6 is not an orphan. If a space exceeds `max_scan`, the report says so explicitly rather than silently returning a sample.

### `find_missing_fields`

Scans entries of one content type for the difference between *valid* and *complete*.

- 🔴 **error** — a required field is empty
- 🟡 **warn** — more than half the optional fields are empty

`false` and `0` count as present values; whitespace-only strings, empty arrays, and empty objects count as empty. Disabled and omitted fields are skipped.

**Parameters:** `content_type_id` *(required)*, `limit` *(default 100)*.

---

## Install

Requires Node 20+.

```bash
git clone https://github.com/laceykesler/contentful-audit-mcp.git
cd contentful-audit-mcp
npm install
npm run build
```

### Credentials

Copy `.env.example` to `.env` and fill in:

| Variable | Where to get it | Scope needed |
|---|---|---|
| `CONTENTFUL_SPACE_ID` | Settings → General settings | — |
| `CONTENTFUL_DELIVERY_TOKEN` | Settings → API keys | read |
| `CONTENTFUL_MANAGEMENT_TOKEN` | Settings → API keys → Content management tokens | read |
| `CONTENTFUL_ENVIRONMENT` | optional, defaults to `master` | — |

Both tokens are read-only in practice — this server never writes to your space.

### Connect it to Claude

Add to your MCP client config (for Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "contentful-audit": {
      "command": "node",
      "args": ["/absolute/path/to/contentful-audit-mcp/dist/index.js"],
      "env": {
        "CONTENTFUL_SPACE_ID": "your_space_id",
        "CONTENTFUL_DELIVERY_TOKEN": "your_delivery_token",
        "CONTENTFUL_MANAGEMENT_TOKEN": "your_management_token"
      }
    }
  }
}
```

Restart the client, then ask: *"Audit my Contentful content model."*

---

## Architecture

```
Claude  ──tool call──▶  MCP server  ──▶  Management API   (content types, fields)
                        │              └▶  Delivery API     (entries, references)
                        │
                        └──report──▶  🔴 errors · 🟡 warnings · 🟢 clean
```

Built on the **DOC Model** — [Data · Operations · Components](https://thedocmodel.com):

| Layer | Here |
|---|---|
| **Data** | `src/contentful.ts` — thin adapters over the Delivery and Management APIs |
| **Operations** | `src/audits/*.ts` — pure analysis functions that take data, not clients |
| **Components** | Structured markdown consumable by any MCP client |

Every layer is discrete and replaceable. The audits depend on the narrow `DeliverySource` / `ManagementSource` interfaces in `src/types.ts`, not on the Contentful SDK — which is what makes them unit-testable without a live space, and what would make a Sanity or Storyblok backend a Data-layer change only.

---

## Development

```bash
npm test          # 46 unit tests, no network or credentials required
npm run test:watch
npm run typecheck
npm run dev       # run from source via tsx
```

The audit logic is covered by fixtures, so the whole suite runs offline in under a second.

---

## Changelog

### 1.1.0

- **Fixed: the server did not start.** `contentful-management` ships CommonJS and has no default export under ESM; the default import type-checked but threw `SyntaxError` at runtime on every launch.
- **Fixed: false orphan reports.** The reference sweep stopped after 1000 entries while still treating every candidate as an orphan, so entries referenced later in the space were reported as orphaned. It now sweeps to a configurable ceiling and reports truncation instead of failing silently.
- **Fixed: Rich Text references were invisible.** Only resolved entries were matched, so unresolved links and every embedded-entry node in a Rich Text field were missed — and their targets reported as orphans.
- **Fixed: sparse-coverage threshold.** Emptiness was measured against the number of *required* fields, an unrelated number: types with no required fields flagged everything, types with many flagged nothing. It's now measured against optional fields.
- Ported to TypeScript with strict mode; added 46 tests.
- Migrated off the deprecated nested Management client to the plain client.
- Tool failures now return an error result the assistant can read and act on, instead of dying at the transport layer.

### 1.0.0

Initial release.

---

## License

MIT © [Lacey Kesler](https://thedocmodel.com)
