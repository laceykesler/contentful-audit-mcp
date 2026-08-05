import type {
  ContentType,
  ContentTypeField,
  DeliverySource,
  Entry,
  ManagementSource,
} from "../src/types.js";

export function field(
  id: string,
  overrides: Partial<ContentTypeField> = {},
): ContentTypeField {
  return { id, name: id, type: "Symbol", required: false, ...overrides };
}

export function contentType(
  id: string,
  fields: ContentTypeField[],
  name = id,
): ContentType {
  return { sys: { id }, name, fields };
}

export function entry(
  id: string,
  fields: Record<string, unknown> = {},
  contentTypeId = "page",
): Entry {
  return {
    sys: {
      id,
      updatedAt: "2026-01-15T12:00:00.000Z",
      contentType: { sys: { id: contentTypeId } },
    },
    fields,
  };
}

/** An unresolved reference, as the Delivery API returns it with include=0. */
export function link(id: string) {
  return { sys: { type: "Link", linkType: "Entry", id } };
}

/** A Rich Text document with a single embedded-entry block. */
export function richTextWithEmbed(id: string) {
  return {
    nodeType: "document",
    data: {},
    content: [
      {
        nodeType: "embedded-entry-block",
        data: { target: link(id) },
        content: [],
      },
    ],
  };
}

/** In-memory Delivery API that pages exactly like the real one. */
export function fakeDelivery(entries: Entry[]): DeliverySource {
  return {
    async getEntries({ content_type, limit = 100, skip = 0 }) {
      const matching = content_type
        ? entries.filter((e) => e.sys.contentType?.sys.id === content_type)
        : entries;
      return {
        total: matching.length,
        items: matching.slice(skip, skip + limit),
      };
    },
  };
}

export function fakeManagement(types: ContentType[]): ManagementSource {
  return {
    async getContentTypes() {
      return types;
    },
    async getContentType(id) {
      const found = types.find((t) => t.sys.id === id);
      if (!found) throw new Error(`Unknown content type: ${id}`);
      return found;
    },
  };
}
