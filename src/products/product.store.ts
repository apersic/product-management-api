import { z } from 'zod';
import {
  CATEGORY_SLUGS,
  type Product,
  type ProductDraft,
  type ProductFields,
  type ProductId,
  type ProductPatch,
  type SearchPage,
  type SearchQuery,
  type Sort,
  type Tag,
} from './product.js';
import { Prisma, type PrismaClient } from '../prisma/prisma.js';

const FIELD_KEYS = [
  'title',
  'description',
  'category',
  'priceCents',
  'tags',
] as const satisfies ReadonlyArray<keyof ProductFields>;

export type SeedOutcome = {
  readonly inserted: number;
  readonly present: number;
};

export type ProductStore = {
  seedOnce(products: readonly Product[]): Promise<SeedOutcome>;
  loadAll(): Promise<readonly Product[]>;
  search(query: SearchQuery): Promise<SearchPage>;
  insert(draft: ProductDraft): Promise<Product>;
  update(id: ProductId, patch: ProductPatch): Promise<Product | null>;
  remove(id: ProductId): Promise<boolean>;
};

const rowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  category: z.enum(CATEGORY_SLUGS),
  priceCents: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});

export function parseProductRow(row: unknown): Product {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error(`Corrupt product row: ${parsed.error.message}`);
  }
  const value = parsed.data;
  return {
    id: value.id as ProductId,
    title: value.title as Product['title'],
    description: value.description as Product['description'],
    category: value.category,
    priceCents: value.priceCents as Product['priceCents'],
    tags: value.tags as Tag[],
  };
}

function toUpdateData(patch: ProductPatch): Prisma.ProductUpdateInput {
  const data: Prisma.ProductUpdateInput = {};
  for (const key of FIELD_KEYS) {
    switch (key) {
      case 'title':
        if ('title' in patch) data.title = patch.title;
        break;
      case 'description':
        if ('description' in patch) data.description = patch.description;
        break;
      case 'category':
        if ('category' in patch) data.category = patch.category;
        break;
      case 'priceCents':
        if ('priceCents' in patch) data.priceCents = patch.priceCents;
        break;
      case 'tags':
        if ('tags' in patch && patch.tags !== undefined)
          data.tags = [...patch.tags];
        break;
      default: {
        const _exhaustive: never = key;
        throw _exhaustive;
      }
    }
  }
  return data;
}

function isMissingRow(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

type SearchRow = {
  id: number;
  title: string;
  description: string;
  category: string;
  price_cents: number;
  tags: string[];
};

function ilikeContains(text: string): string {
  return `%${text.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function searchWhere(text: string | null): Prisma.Sql {
  if (text === null) return Prisma.sql`TRUE`;
  const pattern = ilikeContains(text);
  const escape = '\\';
  return Prisma.sql`(title ILIKE ${pattern} ESCAPE ${escape} OR description ILIKE ${pattern} ESCAPE ${escape})`;
}

function searchOrderBy(sort: Sort): Prisma.Sql {
  switch (sort.field) {
    case 'id':
      return sort.order === 'asc' ? Prisma.sql`id ASC` : Prisma.sql`id DESC`;
    case 'title':
      return sort.order === 'asc'
        ? Prisma.sql`title COLLATE product_text ASC, id ASC`
        : Prisma.sql`title COLLATE product_text DESC, id ASC`;
    case 'description':
      return sort.order === 'asc'
        ? Prisma.sql`description ASC, id ASC`
        : Prisma.sql`description DESC, id ASC`;
    case 'category':
      return sort.order === 'asc'
        ? Prisma.sql`category ASC, id ASC`
        : Prisma.sql`category DESC, id ASC`;
    case 'price':
      return sort.order === 'asc'
        ? Prisma.sql`price_cents ASC, id ASC`
        : Prisma.sql`price_cents DESC, id ASC`;
    default: {
      const _exhaustive: never = sort.field;
      throw _exhaustive;
    }
  }
}

function searchLimit(query: SearchQuery): Prisma.Sql {
  switch (query.limit.kind) {
    case 'all':
      return Prisma.sql`OFFSET ${query.skip}`;
    case 'take':
      return Prisma.sql`LIMIT ${query.limit.count} OFFSET ${query.skip}`;
    default: {
      const _exhaustive: never = query.limit;
      throw _exhaustive;
    }
  }
}

function parseSearchRow(row: SearchRow): Product {
  return parseProductRow({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priceCents: row.price_cents,
    tags: row.tags,
  });
}

export function createProductStore(prisma: PrismaClient): ProductStore {
  return {
    async seedOnce(products) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1)`;
        const inserted = await tx.product.createMany({
          data: products.map((product) => ({
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            priceCents: product.priceCents,
            tags: [...product.tags],
          })),
          skipDuplicates: true,
        });
        await tx.$executeRaw`
          SELECT setval(
            pg_get_serial_sequence('products', 'id'),
            COALESCE((SELECT MAX(id) FROM products), 1),
            (SELECT MAX(id) IS NOT NULL FROM products)
          )
        `;
        const present = await tx.product.count();
        return { inserted: inserted.count, present };
      });
    },
    async loadAll() {
      const rows = await prisma.product.findMany();
      return rows.map(parseProductRow);
    },
    async search(query) {
      const where = searchWhere(query.text);
      const [countRows, rows] = await Promise.all([
        prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM products WHERE ${where}
        `,
        prisma.$queryRaw<SearchRow[]>`
          SELECT id, title, description, category, price_cents, tags
          FROM products
          WHERE ${where}
          ORDER BY ${searchOrderBy(query.sort)}
          ${searchLimit(query)}
        `,
      ]);
      return {
        products: rows.map(parseSearchRow),
        total: countRows[0]?.count ?? 0,
        skip: query.skip,
        limit: query.limit,
      };
    },
    async insert(draft) {
      const row = await prisma.product.create({
        data: {
          title: draft.title,
          description: draft.description,
          category: draft.category,
          priceCents: draft.priceCents,
          tags: [...draft.tags],
        },
      });
      return parseProductRow(row);
    },
    async update(id, patch) {
      const data = toUpdateData(patch);
      if (Object.keys(data).length === 0) {
        throw new Error('ProductPatch with no fields');
      }
      try {
        const row = await prisma.product.update({ where: { id }, data });
        return parseProductRow(row);
      } catch (error) {
        if (isMissingRow(error)) return null;
        throw error;
      }
    },
    async remove(id) {
      try {
        await prisma.product.delete({ where: { id } });
        return true;
      } catch (error) {
        if (isMissingRow(error)) return false;
        throw error;
      }
    },
  };
}
