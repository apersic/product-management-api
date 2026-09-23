import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { ProductCatalog } from './product.catalog.js';
import { parseSeedProducts } from './product.parse.js';
import type { Product } from './product.js';
import { ProductsController } from './products.controller.js';
import { createPrismaClient, requireDatabaseUrl } from '../prisma/prisma.js';

export async function loadSeedProducts(): Promise<readonly Product[]> {
  const file = await readFile(path.resolve(process.cwd(), 'seed/products.json'), 'utf8');
  const result = parseSeedProducts(JSON.parse(file) as unknown);
  if (!result.ok) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`Invalid seed/products.json: ${details}`);
  }
  return result.value;
}

@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: ProductCatalog,
      useFactory: async () =>
        ProductCatalog.open({
          prisma: createPrismaClient(requireDatabaseUrl(process.env)),
          seed: await loadSeedProducts(),
        }),
    },
  ],
})
export class ProductsModule {}
