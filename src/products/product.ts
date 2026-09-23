declare const tag: unique symbol;

type Brand<T, B extends string> = T & { readonly [tag]: B };

export const CATEGORY_SLUGS = [
  'beauty',
  'fragrances',
  'furniture',
  'groceries',
  'home-decoration',
  'kitchen-accessories',
  'laptops',
  'mens-shirts',
  'mens-shoes',
  'mens-watches',
  'mobile-accessories',
  'motorcycle',
  'skin-care',
  'smartphones',
  'sports-accessories',
  'sunglasses',
  'tablets',
  'tops',
  'vehicle',
  'womens-bags',
  'womens-dresses',
  'womens-jewellery',
  'womens-shoes',
  'womens-watches',
] as const;

export type Category = (typeof CATEGORY_SLUGS)[number];

export type ProductId = Brand<number, 'ProductId'>;
export type Title = Brand<string, 'Title'>;
export type Description = Brand<string, 'Description'>;
export type Tag = Brand<string, 'Tag'>;
export type PriceCents = Brand<number, 'PriceCents'>;

export type ProductFields = {
  readonly title: Title;
  readonly description: Description;
  readonly category: Category;
  readonly priceCents: PriceCents;
  readonly tags: readonly Tag[];
};

export type Product = ProductFields & { readonly id: ProductId };

export type ProductDraft = ProductFields;

type AtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

export type ProductPatch = AtLeastOne<ProductFields>;

export const SORT_FIELDS = ['id', 'title', 'description', 'category', 'price'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export type Sort = { readonly field: SortField; readonly order: SortOrder };

export type Limit = { readonly kind: 'all' } | { readonly kind: 'take'; readonly count: number };

export type SearchQuery = {
  readonly text: string | null;
  readonly sort: Sort;
  readonly skip: number;
  readonly limit: Limit;
};

export type SearchPage = {
  readonly products: readonly Product[];
  readonly total: number;
  readonly skip: number;
  readonly limit: Limit;
};

export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 200;
export const DEFAULT_SORT: Sort = { field: 'id', order: 'asc' };

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const TAG_MAX = 40;
export const TAG_MAX_COUNT = 20;
