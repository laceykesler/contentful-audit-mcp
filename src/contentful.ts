// Both packages ship CommonJS. Under real ESM, `contentful-management` has no
// default export — a default import type-checks under esModuleInterop but
// throws at runtime, which is how the previous release failed on startup.
import { createClient as createDeliveryClient } from "contentful";
import { createClient as createManagementClient } from "contentful-management";

import type {
  ContentType,
  DeliverySource,
  EntryCollection,
  ManagementSource,
  SpaceContext,
} from "./types.js";

/** Management API returns at most 1000 content types; 200 is well past typical. */
const CONTENT_TYPE_LIMIT = 200;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export function getSpaceContext(): SpaceContext {
  return {
    spaceId: requireEnv("CONTENTFUL_SPACE_ID"),
    environment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
  };
}

/** Adapter from the Delivery SDK to the narrow `DeliverySource` interface. */
export function createDeliverySource(space: SpaceContext): DeliverySource {
  const client = createDeliveryClient({
    space: space.spaceId,
    accessToken: requireEnv("CONTENTFUL_DELIVERY_TOKEN"),
    environment: space.environment,
  });

  return {
    async getEntries(params): Promise<EntryCollection> {
      const response = await client.getEntries({
        ...(params.content_type ? { content_type: params.content_type } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.skip !== undefined ? { skip: params.skip } : {}),
        // Links stay unresolved: the reference sweep reads link IDs directly,
        // and resolving them would balloon the payload for no benefit.
        include: 0,
      });

      return {
        total: response.total,
        items: response.items as unknown as EntryCollection["items"],
      };
    },
  };
}

/**
 * Adapter from the Management SDK to the narrow `ManagementSource` interface.
 *
 * Uses the plain client rather than the nested/legacy one — the latter is
 * deprecated and slated for removal in the SDK's next major version.
 */
export function createManagementSource(space: SpaceContext): ManagementSource {
  const client = createManagementClient(
    { accessToken: requireEnv("CONTENTFUL_MANAGEMENT_TOKEN") },
    {
      type: "plain",
      defaults: { spaceId: space.spaceId, environmentId: space.environment },
    },
  );

  return {
    async getContentTypes(): Promise<ContentType[]> {
      const response = await client.contentType.getMany({
        query: { limit: CONTENT_TYPE_LIMIT },
      });
      return response.items as unknown as ContentType[];
    },

    async getContentType(id: string): Promise<ContentType> {
      const contentType = await client.contentType.get({ contentTypeId: id });
      return contentType as unknown as ContentType;
    },
  };
}
