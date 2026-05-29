CREATE DATABASE shopping_web;

\connect shopping_web

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL,
  image text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  rating numeric(3, 1) NOT NULL DEFAULT 4.5,
  accent text NOT NULL,
  description text NOT NULL,
  details text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  youtube_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_links jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS shipping_costs (
  id text PRIMARY KEY,
  zone text NOT NULL,
  cost numeric(12, 2) NOT NULL DEFAULT 0,
  free_over numeric(12, 2) NOT NULL DEFAULT 0,
  eta text NOT NULL
);

CREATE TABLE IF NOT EXISTS order_statuses (
  name text PRIMARY KEY,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  joined_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  customer_id text,
  customer jsonb NOT NULL,
  member boolean NOT NULL DEFAULT false,
  shipping jsonb NOT NULL,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  email_confirmed boolean NOT NULL DEFAULT false,
  confirm_token text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position integer NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, position)
);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  host text NOT NULL DEFAULT 'smtp.gmail.com',
  port integer NOT NULL DEFAULT 587,
  secure boolean NOT NULL DEFAULT false,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT 'Japan Toy Shop',
  from_email text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO smtp_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_credentials (
  id integer PRIMARY KEY CHECK (id = 1),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_provider text NOT NULL DEFAULT 'openai',
  providers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  store_name text NOT NULL DEFAULT 'Japan Toy Shop',
  logo text NOT NULL DEFAULT '',
  storefront_headline text NOT NULL DEFAULT 'Japan finds, toys, and collectibles.',
  storefront_message text NOT NULL DEFAULT 'Browse Japanese products, choose delivery, and check out as a guest or member.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
