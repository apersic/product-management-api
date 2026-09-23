import type { Product, ProductDraft, ProductId, ProductPatch, SearchPage, SearchQuery } from './product.js';
import { buildIndex, indexWith, type CatalogIndex } from './product.search.js';
import { createProductStore, type ProductStore } from './product.store.js';
import type { PrismaClient } from '../prisma/prisma.js';

export type CatalogConfig = {
  readonly prisma: PrismaClient;
  readonly seed: readonly Product[];
};

export class ProductCatalog {
  private closed = false;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly store: ProductStore,
    private index: CatalogIndex,
  ) {}

  static async open(config: CatalogConfig): Promise<ProductCatalog> {
    const store = createProductStore(config.prisma);
    await store.seedOnce(config.seed);
    const products = await store.loadAll();
    return new ProductCatalog(config.prisma, store, buildIndex(products));
  }

  search(query: SearchQuery): Promise<SearchPage> {
    return this.store.search(query);
  }

  get(id: ProductId): Product | null {
    return this.index.byId.get(id) ?? null;
  }

  async add(draft: ProductDraft): Promise<Product> {
    const product = await this.store.insert(draft);
    this.index = indexWith(this.index, product);
    return product;
  }

  async update(id: ProductId, patch: ProductPatch): Promise<Product | null> {
    const product = await this.store.update(id, patch);
    if (product) this.index = indexWith(this.index, product);
    return product;
  }

  async reload(): Promise<void> {
    this.index = buildIndex(await this.store.loadAll());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.prisma.$disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
