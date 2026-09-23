# Product management API

REST API for viewing, creating, and updating products. There is no UI in this repo. A separate Angular app can call the same HTTP contract later.

## Setup instructions

Postgres is required. Prisma talks to it. There is no in-process database.

### Run locally

Start Postgres, then run the API on your machine.

```bash
docker compose up -d db
cp .env.example .env
npm install
npx prisma migrate deploy
npm test
npm run start:dev
```

The API listens on `http://127.0.0.1:3000` unless you set `PORT`. First boot against an empty table loads `seed/products.json` (194 DummyJSON products). Product `1` is Essence Mascara Lash Princess.

`npm test` typechecks, then runs Vitest. Search tests do not need Postgres. HTTP tests skip when `DATABASE_URL` is unreachable. They run against the same Postgres instance after `prisma migrate deploy`.

### Run with Docker Compose

Compose starts Postgres 17 and the API.

```bash
docker compose up --build
```

The API is on port 3000. Postgres is on port 5432 (`products` / `products` / database `products`). Data lives in the `product-pg` volume. The container runs `prisma migrate deploy` before `node dist/main.js`. Seeding runs once per empty id via `createMany` with `skipDuplicates`.

### Call the API

Import these files in Postman:

- `postman/product-management-api.postman_collection.json`
- `postman/local.postman_environment.json` for `npm start`
- `postman/docker.postman_environment.json` for Compose

Select the environment, then run the collection. Requests cover search, get, create, merge update, and the 400 cases.

You can also hit the same routes with curl. Local and Compose both use port 3000.

```bash
curl "http://127.0.0.1:3000/products/search"
curl "http://127.0.0.1:3000/products/1"
curl -X POST http://127.0.0.1:3000/products/add \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Sunset Balm\",\"description\":\"Tinted lip balm.\",\"category\":\"beauty\",\"price\":12.5,\"tags\":[\"beauty\",\"lip\"]}"
curl -X PUT http://127.0.0.1:3000/products/1 \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Renamed mascara\"}"
```

### Routes

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/health` | `{ "ok": true }` |
| GET | `/products/search` | `q`, `limit` (default 30, `0` means all), `skip`, `sortBy`, `order` |
| GET | `/products/{id}` | 404 if missing |
| POST | `/products/add` | 201. All writable fields required |
| PUT | `/products/{id}` | Merge. Send only the fields that change. `{}` is 400 |

Product JSON is `{ id, title, description, category, price, tags }`. `category` is one of the 24 DummyJSON slugs. `tags` may be empty. There is no auth and no delete.

## Key architectural decisions

The public type is a **product with an id**. A draft has no id. A PUT body is at least one writable field, so an empty update cannot be constructed and is a 400.

**Category** is a closed list of DummyJSON slugs. An unknown slug is 400. That matches the spec's "predefined category" and lets a future UI use a select, not a free text box.

**Search, sort, and pagination** run in Postgres. `q` is `ILIKE` on title and description. `ORDER BY` uses the `product_text` ICU collation for titles, so `"iPhone"` sorts before `"Zebra"`. `searchIndex` is the same `SearchQuery` → `SearchPage` contract, implemented in memory so unit tests do not need a database.

**Prisma Client against Postgres.** Schema and migrations live in `prisma/`. Writes go through the generated client. Search uses parameterized `$queryRaw` for `ILIKE`, ICU `ORDER BY`, and `LIMIT`/`OFFSET`. Tests that hit HTTP need a running Postgres.

**Zod at the HTTP boundary.** Controllers take `unknown`, parse, and map failures to `400 { statusCode, message, issues }`. A thrown `ZodError` would have become a 500. Seed JSON is parsed the same way before insert. Category checks stay in Zod, not a Prisma enum, so adding a slug is a code change without a migration.

**PUT merges.** DummyJSON updates only the fields you send. `PUT /products/1` with `{ "title": "Renamed mascara" }` keeps price `9.99`. A missing id is Prisma `P2025` and becomes 404.

**Seed is idempotent.** `createMany({ skipDuplicates: true })` inside a transaction with an advisory lock, then `setval` on the id sequence. Booting twice does not duplicate ids or overwrite later edits.

CORS is enabled so a UI on another origin can call this API later. This repo does not ship that UI.

## Trade-offs or assumptions

- `GET /products/{id}` still reads an in-memory map loaded at boot and updated on write. Search reads Postgres, so a second API replica sees committed rows on `/products/search`. Compose runs one API replica.
- Money is stored as integer cents and returned as a JSON number (`9.99`). That avoids float columns. It still uses IEEE floats on the wire.
- `limit=0` means "all remaining rows", matching DummyJSON. A missing `limit` is 30.
- Unknown query keys are ignored by Nest's query parser. Unknown JSON keys on POST/PUT are 400.
- The 24 category slugs are code, not a table. Adding a category is a code change.
- `DATABASE_URL` is required. There is no fallback store.

## What you would improve with more time

- Shared OpenAPI generated from the Zod schemas, and generate the Postman collection from that instead of a hand-written JSON file.
- A second API replica would need either sticky routing or dropping the in-memory map so `GET /products/{id}` always hits Postgres.
- Rate limits and auth if this ever leaves a local or homework setting.
