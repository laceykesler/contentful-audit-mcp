/**
 * Narrow structural types for the parts of the Contentful API this server reads.
 *
 * Deliberately not re-exporting the SDK's own types: the audit functions take
 * these interfaces instead of concrete clients, which keeps them pure and
 * unit-testable without a live space or network access.
 */

export type Severity = "error" | "warn" | "ok";

export interface Issue {
  level: Severity;
  message: string;
}

/** A field definition on a content type, as returned by the Management API. */
export interface ContentTypeField {
  id: string;
  name?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  omitted?: boolean;
  localized?: boolean;
}

/** A content type definition, as returned by the Management API. */
export interface ContentType {
  sys: { id: string };
  name: string;
  fields: ContentTypeField[];
}

/** An entry, as returned by the Delivery API (fields already locale-resolved). */
export interface Entry {
  sys: {
    id: string;
    updatedAt: string;
    contentType?: { sys: { id: string } };
  };
  fields?: Record<string, unknown>;
}

export interface EntryCollection {
  items: Entry[];
  total: number;
}

/**
 * The subset of the Management API the audits need. Implemented by the real
 * client in `contentful.ts` and by fixtures in the test suite.
 */
export interface ManagementSource {
  getContentTypes(): Promise<ContentType[]>;
  getContentType(id: string): Promise<ContentType>;
}

/**
 * The subset of the Delivery API the audits need.
 *
 * `skip`/`limit` are threaded through so the orphan scan can page the whole
 * space rather than sampling the first N entries.
 */
export interface DeliverySource {
  getEntries(params: {
    content_type?: string;
    limit?: number;
    skip?: number;
  }): Promise<EntryCollection>;
}

export interface SpaceContext {
  spaceId: string;
  environment: string;
}
