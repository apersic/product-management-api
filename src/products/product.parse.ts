import { z } from 'zod';
import type { ZodError } from 'zod';
import {
  CATEGORY_SLUGS,
  DEFAULT_LIMIT,
  DEFAULT_SORT,
  DESCRIPTION_MAX,
  MAX_LIMIT,
  SORT_FIELDS,
  SORT_ORDERS,
  TAG_MAX,
  TAG_MAX_COUNT,
  TITLE_MAX,
  type Category,
  type Description,
  type Limit,
  type PriceCents,
  type Product,
  type ProductDraft,
  type ProductId,
  type ProductPatch,
  type SearchQuery,
  type SearchPage,
  type Tag,
  type Title,
} from './product.js';
import type { ProductJson, SearchPageJson } from './product.contract.js';

export type ParseIssue = { readonly path: string; readonly message: string };

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly [ParseIssue, ...ParseIssue[]] };

const required = (issue: { input: unknown }) =>
  issue.input === undefined ? 'Required' : undefined;

const titleSchema = z
  .string({ error: required })
  .trim()
  .min(1, 'Title must be at least 1 character')
  .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`)
  .transform((value) => value as Title);

const descriptionSchema = z
  .string({ error: required })
  .trim()
  .min(1, 'Description must be at least 1 character')
  .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`)
  .transform((value) => value as Description);

const categorySchema = z.enum(CATEGORY_SLUGS, {
  error: (issue) => (issue.input === undefined ? 'Required' : 'Unknown category'),
});

const priceSchema = z
  .number({ error: required })
  .finite()
  .nonnegative('Price must be >= 0')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
    message: 'Price must have at most 2 decimal places',
  });

const tagSchema = z
  .string()
  .trim()
  .min(1, 'Tag must be at least 1 character')
  .max(TAG_MAX, `Tag must be at most ${TAG_MAX} characters`)
  .transform((value) => value as Tag);

const tagsSchema = z
  .array(tagSchema, { error: required })
  .max(TAG_MAX_COUNT, `At most ${TAG_MAX_COUNT} tags`);

const productInputSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  category: categorySchema,
  price: priceSchema,
  tags: tagsSchema,
});

function issuesFromZod(error: ZodError): readonly [ParseIssue, ...ParseIssue[]] {
  const issues = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const [first, ...rest] = issues;
  if (first === undefined) {
    return [{ path: '', message: 'Invalid input' }];
  }
  return [first, ...rest];
}

function fromZod<T>(result: { success: true; data: T } | { success: false; error: ZodError }): ParseResult<T> {
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: issuesFromZod(result.error) };
}

function toPriceCents(price: number): PriceCents {
  return Math.round(price * 100) as PriceCents;
}

function toDraft(input: {
  title: Title;
  description: Description;
  category: Category;
  price: number;
  tags: Tag[];
}): ProductDraft {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    priceCents: toPriceCents(input.price),
    tags: input.tags,
  };
}

const integerString = (message: string) =>
  z.string().regex(/^\d+$/, message).transform((value) => Number(value));

const searchQuerySchema = z
  .object({
    q: z.string().optional(),
    limit: integerString(`limit must be an integer 0..${MAX_LIMIT}`).optional(),
    skip: integerString('skip must be an integer >= 0').optional(),
    sortBy: z.enum(SORT_FIELDS, { error: 'Invalid sortBy' }).optional(),
    order: z.enum(SORT_ORDERS, { error: 'Invalid order' }).optional(),
  })
  .refine((raw) => (raw.limit ?? DEFAULT_LIMIT) <= MAX_LIMIT, {
    path: ['limit'],
    message: `limit must be an integer 0..${MAX_LIMIT}`,
  })
  .transform((raw): SearchQuery => {
    const limitValue = raw.limit ?? DEFAULT_LIMIT;
    const limit: Limit =
      limitValue === 0 ? { kind: 'all' } : { kind: 'take', count: limitValue };
    const text = raw.q === undefined ? null : raw.q.trim().toLowerCase();
    return {
      text: text === null || text === '' ? null : text,
      sort: {
        field: raw.sortBy ?? DEFAULT_SORT.field,
        order: raw.order ?? DEFAULT_SORT.order,
      },
      skip: raw.skip ?? 0,
      limit,
    };
  });

export function parseSearchQuery(raw: unknown): ParseResult<SearchQuery> {
  return fromZod(searchQuerySchema.safeParse(raw));
}

const productIdSchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/, 'Invalid product id').transform(Number),
]);

export function parseProductId(raw: unknown): ParseResult<ProductId> {
  const parsed = fromZod(productIdSchema.safeParse(raw));
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value as ProductId };
}

const productDraftSchema = productInputSchema.strict().transform(toDraft);

export function parseProductDraft(raw: unknown): ParseResult<ProductDraft> {
  return fromZod(productDraftSchema.safeParse(raw));
}

const productPatchSchema = productInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
  .transform((input): ProductPatch => {
    const patch: {
      title?: Title;
      description?: Description;
      category?: Category;
      priceCents?: PriceCents;
      tags?: readonly Tag[];
    } = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category !== undefined) patch.category = input.category;
    if (input.price !== undefined) patch.priceCents = toPriceCents(input.price);
    if (input.tags !== undefined) patch.tags = input.tags;
    return patch as ProductPatch;
  });

export function parseProductPatch(raw: unknown): ParseResult<ProductPatch> {
  return fromZod(productPatchSchema.safeParse(raw));
}

const seedProductSchema = productInputSchema.extend({
  id: z.number().int().positive(),
});

const seedFileSchema = z.object({
  products: z.array(seedProductSchema),
});

export function parseSeedProducts(raw: unknown): ParseResult<readonly Product[]> {
  const parsed = fromZod(seedFileSchema.safeParse(raw));
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: parsed.value.products.map((item) => ({
      id: item.id as ProductId,
      ...toDraft(item),
    })),
  };
}

export function toProductJson(product: Product): ProductJson {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.priceCents / 100,
    tags: product.tags,
  };
}

export function toSearchPageJson(page: SearchPage): SearchPageJson {
  switch (page.limit.kind) {
    case 'all':
      return {
        products: page.products.map(toProductJson),
        total: page.total,
        skip: page.skip,
        limit: 0,
      };
    case 'take':
      return {
        products: page.products.map(toProductJson),
        total: page.total,
        skip: page.skip,
        limit: page.limit.count,
      };
    default: {
      const _exhaustive: never = page.limit;
      return _exhaustive;
    }
  }
}
