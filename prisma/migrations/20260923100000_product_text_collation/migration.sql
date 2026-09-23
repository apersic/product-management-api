CREATE COLLATION IF NOT EXISTS product_text (
  provider = icu,
  locale = 'en-US-u-ks-level1',
  deterministic = false
);
