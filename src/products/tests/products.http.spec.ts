import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { createPrismaClient } from '../../prisma/prisma.js';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://products:products@127.0.0.1:5432/products';

const MASCARA = {
  id: 1,
  title: 'Essence Mascara Lash Princess',
  description:
    'The Essence Mascara Lash Princess is a popular mascara known for its volumizing and lengthening effects. Achieve dramatic lashes with this long-lasting and cruelty-free formula.',
  category: 'beauty',
  price: 9.99,
  tags: ['beauty', 'mascara'],
} as const;

const SUNSET_BALM = {
  title: 'Sunset Balm',
  description: 'Tinted lip balm.',
  category: 'beauty',
  price: 12.5,
  tags: ['beauty', 'lip'],
} as const;

function migrate(): boolean {
  try {
    execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        cwd: path.resolve(),
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        stdio: 'pipe',
      },
    );
    return true;
  } catch {
    return false;
  }
}

const postgresReady = migrate();
if (!postgresReady) {
  console.warn(
    'Skipping HTTP tests: Postgres is not reachable. Start it with docker compose up -d db, then npx prisma migrate deploy.',
  );
}

async function resetProducts(): Promise<void> {
  const prisma = createPrismaClient(TEST_DATABASE_URL);
  await prisma.product.deleteMany();
  await prisma.$disconnect();
}

async function bootApp(): Promise<INestApplication> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe.skipIf(!postgresReady)('products HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetProducts();
    app = await bootApp();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('returns ok on GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('defaults search to 30 products, limit 30, skip 0', async () => {
    const res = await request(app.getHttpServer()).get('/products/search');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(30);
    expect(res.body).toMatchObject({ skip: 0, limit: 30, total: 194 });
    expect(res.body.products[0]).toEqual(MASCARA);
  });

  it('paginates with limit=10 skip=10', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/search?limit=10&skip=10',
    );
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(10);
    expect(res.body.skip).toBe(10);
    expect(res.body.limit).toBe(10);
    expect(res.body.products[0].id).toBe(11);
  });

  it('filters q=mascara over title or description', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/search?q=mascara',
    );
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(
      res.body.products.some((item: { id: number }) => item.id === 1),
    ).toBe(true);
    for (const item of res.body.products as Array<{
      title: string;
      description: string;
    }>) {
      expect(`${item.title} ${item.description}`.toLowerCase()).toContain(
        'mascara',
      );
    }
  });

  it('sorts titles non-decreasing for sortBy=title order=asc', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/search?sortBy=title&order=asc',
    );
    expect(res.status).toBe(200);
    const titles = (res.body.products as Array<{ title: string }>).map(
      (item) => item.title,
    );
    expect(titles.length).toBe(30);
    for (let i = 1; i < titles.length; i += 1) {
      expect(
        titles[i - 1].localeCompare(titles[i], 'en', { sensitivity: 'base' }) <=
          0,
      ).toBe(true);
    }
  });

  it('returns Essence Mascara Lash Princess for GET /products/1', async () => {
    const res = await request(app.getHttpServer()).get('/products/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MASCARA);
  });

  it('returns 404 for GET /products/999999', async () => {
    const res = await request(app.getHttpServer()).get('/products/999999');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });

  it('creates a product and GETs it by the new id', async () => {
    const created = await request(app.getHttpServer())
      .post('/products/add')
      .send(SUNSET_BALM);
    expect(created.status).toBe(201);
    expect(typeof created.body.id).toBe('number');
    expect(created.body).toMatchObject(SUNSET_BALM);
    const fetched = await request(app.getHttpServer()).get(
      `/products/${created.body.id}`,
    );
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual({ ...SUNSET_BALM, id: created.body.id });
  });

  it('merges PUT /products/1 and keeps price 9.99', async () => {
    const updated = await request(app.getHttpServer())
      .put('/products/1')
      .send({ title: 'Renamed mascara' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: 1,
      title: 'Renamed mascara',
      price: 9.99,
      category: 'beauty',
      tags: ['beauty', 'mascara'],
    });
    const fetched = await request(app.getHttpServer()).get('/products/1');
    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Renamed mascara');
    expect(fetched.body.price).toBe(9.99);
  });

  it('rejects POST {} with 400 field issues', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/add')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid product');
    expect(
      res.body.issues.map((issue: { path: string }) => issue.path).sort(),
    ).toEqual(['category', 'description', 'price', 'tags', 'title']);
  });

  it('deletes a created product from get and search', async () => {
    const created = await request(app.getHttpServer())
      .post('/products/add')
      .send(SUNSET_BALM);
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    const removed = await request(app.getHttpServer()).delete(
      `/products/${id}`,
    );
    expect(removed.status).toBe(204);
    const fetched = await request(app.getHttpServer()).get(`/products/${id}`);
    expect(fetched.status).toBe(404);
    const search = await request(app.getHttpServer()).get(
      '/products/search?q=Sunset%20Balm',
    );
    expect(search.status).toBe(200);
    expect(
      search.body.products.some((item: { id: number }) => item.id === id),
    ).toBe(false);
  });

  it('rejects an unknown category with 400', async () => {
    const res = await request(app.getHttpServer()).post('/products/add').send({
      title: 'Nope',
      description: 'Not a real category.',
      category: 'not-a-real-category',
      price: 1,
      tags: [],
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'Invalid product',
      issues: [{ path: 'category', message: 'Unknown category' }],
    });
  });
});

describe.skipIf(!postgresReady)('products persistence', () => {
  it('finds a created row after closing and booting against the same database', async () => {
    await resetProducts();
    let first: INestApplication | undefined;
    let second: INestApplication | undefined;
    try {
      first = await bootApp();
      const created = await request(first.getHttpServer())
        .post('/products/add')
        .send(SUNSET_BALM);
      expect(created.status).toBe(201);
      const id = created.body.id as number;
      await first.close();
      first = undefined;
      second = await bootApp();
      const fetched = await request(second.getHttpServer()).get(
        `/products/${id}`,
      );
      expect(fetched.status).toBe(200);
      expect(fetched.body).toEqual({ ...SUNSET_BALM, id });
    } finally {
      if (first) await first.close();
      if (second) await second.close();
    }
  }, 60_000);
});
