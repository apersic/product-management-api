import type { Product, ProductId, SearchPage, SearchQuery, Sort } from './product.js';

type IndexEntry = {
  readonly product: Product;
  readonly haystack: string;
};

export type CatalogIndex = {
  readonly byId: ReadonlyMap<ProductId, Product>;
  readonly entries: readonly IndexEntry[];
};

export function buildIndex(products: Iterable<Product>): CatalogIndex {
  const byId = new Map<ProductId, Product>();
  const entries: IndexEntry[] = [];
  for (const product of products) {
    byId.set(product.id, product);
    entries.push({
      product,
      haystack: `${product.title}\n${product.description}`.toLowerCase(),
    });
  }
  return { byId, entries };
}

export function indexWith(index: CatalogIndex, product: Product): CatalogIndex {
  const byId = new Map(index.byId);
  byId.set(product.id, product);
  return buildIndex(byId.values());
}

export function searchIndex(index: CatalogIndex, query: SearchQuery): SearchPage {
  const text = query.text;
  const filtered =
    text === null
      ? index.entries.map((entry) => entry.product)
      : index.entries
          .filter((entry) => entry.haystack.includes(text))
          .map((entry) => entry.product);
  const sorted = filtered.slice().sort(compareBy(query.sort));
  let products: readonly Product[];
  switch (query.limit.kind) {
    case 'all':
      products = sorted.slice(query.skip);
      break;
    case 'take':
      products = sorted.slice(query.skip, query.skip + query.limit.count);
      break;
    default: {
      const _exhaustive: never = query.limit;
      return _exhaustive;
    }
  }
  return {
    products,
    total: filtered.length,
    skip: query.skip,
    limit: query.limit,
  };
}

export function compareBy(sort: Sort): (a: Product, b: Product) => number {
  const direction = sort.order === 'asc' ? 1 : -1;
  return (a, b) => {
    let primary = 0;
    switch (sort.field) {
      case 'id':
        primary = a.id - b.id;
        break;
      case 'price':
        primary = a.priceCents - b.priceCents;
        break;
      case 'title':
        primary = compareLocale(a.title, b.title);
        break;
      case 'description':
        primary = compareOrdinal(a.description, b.description);
        break;
      case 'category':
        primary = compareOrdinal(a.category, b.category);
        break;
      default: {
        const _exhaustive: never = sort.field;
        return _exhaustive;
      }
    }
    if (primary !== 0) return primary * direction;
    return a.id - b.id;
  };
}

export function compareLocale(left: string, right: string): number {
  return left.localeCompare(right, 'en', { sensitivity: 'base' });
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
