import { readFileSync } from 'node:fs';
import { CATEGORY_SLUGS, type Category, type Product } from '../product.js';
import { parseSeedProducts } from '../product.parse.js';
import { buildIndex, searchIndex } from '../product.search.js';

const seedResult = parseSeedProducts(JSON.parse(readFileSync('seed/products.json', 'utf8')) as unknown);
if (!seedResult.ok) {
  throw new Error(`seed/products.json failed to parse: ${seedResult.issues[0].message}`);
}
const seedProducts = seedResult.value;
const seedIndex = buildIndex(seedProducts);

function product(
  id: number,
  title: string,
  description: string,
  category: Category,
  priceCents: number,
): Product {
  return {
    id: id as Product['id'],
    title: title as Product['title'],
    description: description as Product['description'],
    category,
    priceCents: priceCents as Product['priceCents'],
    tags: [],
  };
}

describe('searchIndex', () => {
  it('filters q over title and description, case-insensitive', () => {
    const index = buildIndex([
      product(1, 'Essence Mascara Lash Princess', 'volumizing formula', 'beauty', 999),
      product(2, 'Red Lipstick', 'A bold lipstick', 'beauty', 1299),
      product(3, 'Lash primer', 'Use before MASCARA', 'beauty', 499),
    ]);
    const page = searchIndex(index, {
      text: 'mascara',
      sort: { field: 'id', order: 'asc' },
      skip: 0,
      limit: { kind: 'take', count: 30 },
    });
    expect(page.total).toBe(2);
    expect(page.products.map((item) => item.id)).toEqual([1, 3]);
  });

  it('sorts titles with locale-aware compare and breaks ties by id asc', () => {
    const index = buildIndex([
      product(2, 'Beta', 'b', 'beauty', 200),
      product(3, 'Alpha', 'c', 'laptops', 300),
      product(1, 'Alpha', 'a', 'beauty', 100),
    ]);
    const page = searchIndex(index, {
      text: null,
      sort: { field: 'title', order: 'asc' },
      skip: 0,
      limit: { kind: 'all' },
    });
    expect(page.products.map((item) => item.id)).toEqual([1, 3, 2]);
    expect(page.limit).toEqual({ kind: 'all' });
  });

  it('sorts iPhone before Zebra for sortBy=title', () => {
    const index = buildIndex([
      product(1, 'Zebra stripes', 'pattern', 'tops', 100),
      product(2, 'iPhone 13 Pro', 'phone', 'smartphones', 200),
    ]);
    const page = searchIndex(index, {
      text: null,
      sort: { field: 'title', order: 'asc' },
      skip: 0,
      limit: { kind: 'all' },
    });
    expect(page.products.map((item) => item.title)).toEqual(['iPhone 13 Pro', 'Zebra stripes']);
  });

  it('paginates after skip with limit=10', () => {
    const page = searchIndex(seedIndex, {
      text: null,
      sort: { field: 'id', order: 'asc' },
      skip: 10,
      limit: { kind: 'take', count: 10 },
    });
    expect(page.products.map((item) => item.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(page.total).toBe(194);
    expect(page.skip).toBe(10);
  });

  it('filters seeded mascara products without a database', () => {
    const page = searchIndex(seedIndex, {
      text: 'mascara',
      sort: { field: 'id', order: 'asc' },
      skip: 0,
      limit: { kind: 'take', count: 30 },
    });
    expect(page.products[0]).toMatchObject({
      id: 1,
      title: 'Essence Mascara Lash Princess',
    });
    for (const item of page.products) {
      expect(`${item.title}\n${item.description}`.toLowerCase()).toContain('mascara');
    }
  });

  it('accepts every seed category as a closed slug', () => {
    const slugs = new Set<string>(CATEGORY_SLUGS);
    for (const item of seedProducts) {
      expect(slugs.has(item.category)).toBe(true);
    }
  });
});
