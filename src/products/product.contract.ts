import { z } from 'zod';
import { DEFAULT_LIMIT, type SortField, type SortOrder } from './product.js';

export type ProductJson = {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly price: number;
  readonly tags: readonly string[];
};

export type ProductInputJson = Omit<ProductJson, 'id'>;

export type SearchPageJson = {
  readonly products: readonly ProductJson[];
  readonly total: number;
  readonly skip: number;
  readonly limit: number;
};

export type ProductQueryParams = {
  readonly q?: string;
  readonly limit?: string;
  readonly skip?: string;
  readonly sortBy?: SortField;
  readonly order?: SortOrder;
};

export type ApiIssueJson = { readonly path: string; readonly message: string };
export type ApiErrorJson = {
  readonly statusCode: 400 | 404;
  readonly message: string;
  readonly issues?: readonly ApiIssueJson[];
};

const productJsonSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number(),
  tags: z.array(z.string()),
});

const searchPageJsonSchema = z.object({
  products: z.array(productJsonSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});

export function parseProductJson(raw: unknown): ProductJson {
  return productJsonSchema.parse(raw);
}

export function parseSearchPageJson(raw: unknown): SearchPageJson {
  return searchPageJsonSchema.parse(raw);
}

export function toSearchParams(query: {
  q: string;
  skip: number;
  limit: number;
  sortBy: SortField;
  order: SortOrder;
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.q !== '') params.q = query.q;
  if (query.skip !== 0) params.skip = String(query.skip);
  if (query.limit !== DEFAULT_LIMIT) params.limit = String(query.limit);
  if (query.sortBy !== 'id') params.sortBy = query.sortBy;
  if (query.order !== 'asc') params.order = query.order;
  return params;
}