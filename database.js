const { Pool } = require("pg");

const REQUIRED_ARRAYS = ["categories", "products", "shippingCosts", "orderStatuses", "orders", "members"];

function validateState(state) {
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(state[key])) {
      throw new Error(`Invalid state: ${key} must be an array`);
    }
  }
}

function connectionConfig(databaseOverride) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (databaseOverride) {
      url.pathname = `/${databaseOverride}`;
    }
    return {
      connectionString: url.toString(),
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: databaseOverride || process.env.PGDATABASE || "shopping_web",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  };
}

function createPool(databaseOverride) {
  return new Pool(connectionConfig(databaseOverride));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function ensureDatabaseExists(error) {
  const databaseName = process.env.PGDATABASE || "shopping_web";
  if (error.code !== "3D000" || databaseName === "postgres") {
    throw error;
  }

  const maintenancePool = createPool("postgres");
  try {
    await maintenancePool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await maintenancePool.end();
  }
}

function createPostgresStore(seedState) {
  const pool = createPool();

  async function init() {
    validateState(seedState);
    try {
      await createSchema();
    } catch (error) {
      await ensureDatabaseExists(error);
      await createSchema();
    }

    const result = await pool.query("SELECT COUNT(*)::int AS count FROM categories");
    if (result.rows[0].count === 0) {
      await writeState(seedState);
    }
  }

  async function createSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id text PRIMARY KEY,
        name text NOT NULL,
        color text NOT NULL,
        image text NOT NULL DEFAULT ''
      );

      ALTER TABLE categories
      ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '';

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

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '';

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS youtube_links jsonb NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS review_links jsonb NOT NULL DEFAULT '[]'::jsonb;

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

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_id text;

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
        from_name text NOT NULL DEFAULT 'ColorCart',
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

      INSERT INTO ai_settings (id, providers)
      VALUES (
        1,
        '{
          "openai": {"model": "gpt-5-mini", "apiKey": ""},
          "gemini": {"model": "gemini-2.5-flash", "apiKey": ""},
          "claude": {"model": "claude-sonnet-4-20250514", "apiKey": ""},
          "custom": {"model": "", "apiKey": "", "endpoint": ""}
        }'::jsonb
      )
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS store_settings (
        id integer PRIMARY KEY CHECK (id = 1),
        store_name text NOT NULL DEFAULT 'ColorCart',
        logo text NOT NULL DEFAULT '',
        storefront_headline text NOT NULL DEFAULT 'Browse bright finds and check out in a snap.',
        storefront_message text NOT NULL DEFAULT 'Shop as a guest or create a member account at checkout. The backend keeps products, categories, shipping, and order status ready for the team.',
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO store_settings (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  async function readState() {
    const [categories, products, shippingCosts, orderStatuses, members, orders, orderItems, storeSettings] = await Promise.all([
      pool.query("SELECT id, name, color, image FROM categories ORDER BY name"),
      pool.query(`
        SELECT id, name, category_id AS "categoryId", price, stock, rating, accent, description, details,
               images, youtube_links AS "youtubeLinks", review_links AS "reviewLinks"
        FROM products
        ORDER BY name
      `),
      pool.query(`
        SELECT id, zone, cost, free_over AS "freeOver", eta
        FROM shipping_costs
        ORDER BY zone
      `),
      pool.query("SELECT name FROM order_statuses ORDER BY sort_order, name"),
      pool.query(`
        SELECT id, name, email, phone, joined_at AS "joinedAt"
        FROM members
        ORDER BY joined_at DESC
      `),
      pool.query(`
        SELECT id, customer_id AS "customerId", created_at AS "createdAt", customer, member, shipping, subtotal, total, status
        FROM orders
        ORDER BY created_at DESC
      `),
      pool.query(`
        SELECT order_id AS "orderId", product_id AS "productId", name, qty, price, position
        FROM order_items
        ORDER BY order_id, position
      `),
      pool.query(`
        SELECT store_name AS "storeName", logo, storefront_headline AS "storefrontHeadline", storefront_message AS "storefrontMessage"
        FROM store_settings
        WHERE id = 1
      `),
    ]);

    const itemsByOrder = new Map();
    for (const item of orderItems.rows) {
      if (!itemsByOrder.has(item.orderId)) {
        itemsByOrder.set(item.orderId, []);
      }
      itemsByOrder.get(item.orderId).push({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        price: Number(item.price),
      });
    }

    return {
      categories: categories.rows,
      products: products.rows.map((product) => ({
        ...product,
        price: Number(product.price),
        rating: Number(product.rating),
        images: Array.isArray(product.images) ? product.images : [],
        youtubeLinks: Array.isArray(product.youtubeLinks) ? product.youtubeLinks : [],
        reviewLinks: Array.isArray(product.reviewLinks) ? product.reviewLinks : [],
      })),
      shippingCosts: shippingCosts.rows.map((shipping) => ({
        ...shipping,
        cost: Number(shipping.cost),
        freeOver: Number(shipping.freeOver),
      })),
      orderStatuses: orderStatuses.rows.map((status) => status.name),
      orders: orders.rows.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        subtotal: Number(order.subtotal),
        total: Number(order.total),
        items: itemsByOrder.get(order.id) || [],
      })),
      members: members.rows.map((member) => ({
        ...member,
        joinedAt: member.joinedAt.toISOString(),
      })),
      storeSettings: storeSettings.rows[0] || {
        storeName: "ColorCart",
        logo: "",
        storefrontHeadline: "Browse bright finds and check out in a snap.",
        storefrontMessage: "Shop as a guest or create a member account at checkout. The backend keeps products, categories, shipping, and order status ready for the team.",
      },
    };
  }

  async function writeState(state) {
    validateState(state);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await replaceState(client, state);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function replaceState(client, state) {
    await client.query("TRUNCATE order_items, orders, members, products, shipping_costs, order_statuses, categories");

    for (const category of state.categories) {
      await client.query("INSERT INTO categories (id, name, color, image) VALUES ($1, $2, $3, $4)", [
        category.id,
        category.name,
        category.color,
        category.image || "",
      ]);
    }

    for (const product of state.products) {
      await client.query(
        `
          INSERT INTO products (id, name, category_id, price, stock, rating, accent, description, details, images, youtube_links, review_links)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
        `,
        [
          product.id,
          product.name,
          product.categoryId,
          product.price,
          product.stock,
          product.rating,
          product.accent,
          product.description,
          product.details || "",
          JSON.stringify(Array.isArray(product.images) ? product.images : []),
          JSON.stringify(Array.isArray(product.youtubeLinks) ? product.youtubeLinks : []),
          JSON.stringify(Array.isArray(product.reviewLinks) ? product.reviewLinks : []),
        ],
      );
    }

    for (const shipping of state.shippingCosts) {
      await client.query(
        `
          INSERT INTO shipping_costs (id, zone, cost, free_over, eta)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [shipping.id, shipping.zone, shipping.cost, shipping.freeOver, shipping.eta],
      );
    }

    for (const [index, status] of state.orderStatuses.entries()) {
      await client.query("INSERT INTO order_statuses (name, sort_order) VALUES ($1, $2)", [status, index]);
    }

    for (const member of state.members) {
      await client.query(
        `
          INSERT INTO members (id, name, email, phone, joined_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [member.id, member.name, member.email, member.phone, member.joinedAt],
      );
    }

    for (const order of state.orders) {
      await client.query(
        `
          INSERT INTO orders (id, created_at, customer_id, customer, member, shipping, subtotal, total, status)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9)
        `,
        [
          order.id,
          order.createdAt,
          order.customerId || null,
          JSON.stringify(order.customer),
          order.member,
          JSON.stringify(order.shipping),
          order.subtotal,
          order.total,
          order.status,
        ],
      );

      for (const [index, item] of order.items.entries()) {
        await client.query(
          `
            INSERT INTO order_items (order_id, position, product_id, name, qty, price)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [order.id, index, item.productId, item.name, item.qty, item.price],
        );
      }
    }
  }

  async function resetState() {
    await writeState(seedState);
    return seedState;
  }

  async function readSmtpSettings({ includePassword = false } = {}) {
    const result = await pool.query(`
      SELECT enabled, host, port, secure, username, password, from_name AS "fromName", from_email AS "fromEmail"
      FROM smtp_settings
      WHERE id = 1
    `);
    const row = result.rows[0] || {};
    const settings = {
      enabled: Boolean(row.enabled),
      host: row.host || "smtp.gmail.com",
      port: Number(row.port || 587),
      secure: Boolean(row.secure),
      username: row.username || "",
      fromName: row.fromName || "ColorCart",
      fromEmail: row.fromEmail || "",
      passwordSet: Boolean(row.password),
    };
    if (includePassword) {
      settings.password = row.password || "";
    }
    return settings;
  }

  async function writeSmtpSettings(settings) {
    const existing = await readSmtpSettings({ includePassword: true });
    const password = settings.password ? String(settings.password) : existing.password;
    await pool.query(
      `
        UPDATE smtp_settings
        SET enabled = $1,
            host = $2,
            port = $3,
            secure = $4,
            username = $5,
            password = $6,
            from_name = $7,
            from_email = $8,
            updated_at = now()
        WHERE id = 1
      `,
      [
        Boolean(settings.enabled),
        String(settings.host || "smtp.gmail.com").trim(),
        Number(settings.port || 587),
        Boolean(settings.secure),
        String(settings.username || "").trim(),
        password,
        String(settings.fromName || "ColorCart").trim(),
        String(settings.fromEmail || settings.username || "").trim(),
      ],
    );
    return readSmtpSettings();
  }

  async function writeStoreSettings(settings) {
    await pool.query(
      `
        UPDATE store_settings
        SET store_name = $1,
            logo = $2,
            storefront_headline = $3,
            storefront_message = $4,
            updated_at = now()
        WHERE id = 1
      `,
      [
        String(settings.storeName || "ColorCart").trim(),
        String(settings.logo || ""),
        String(settings.storefrontHeadline || "").trim(),
        String(settings.storefrontMessage || "").trim(),
      ],
    );
    return (await readState()).storeSettings;
  }

  async function createCustomer(customer) {
    await pool.query(
      `
        INSERT INTO customers (id, name, email, phone, password_salt, password_hash, confirm_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [customer.id, customer.name, customer.email.toLowerCase(), customer.phone || "", customer.passwordSalt, customer.passwordHash, customer.confirmToken],
    );
    return readCustomerById(customer.id);
  }

  async function readCustomerByEmail(email) {
    const result = await pool.query(
      `
        SELECT id, name, email, phone, password_salt AS "passwordSalt", password_hash AS "passwordHash",
               email_confirmed AS "emailConfirmed", confirm_token AS "confirmToken", created_at AS "createdAt"
        FROM customers
        WHERE lower(email) = lower($1)
      `,
      [email],
    );
    return result.rows[0] || null;
  }

  async function readCustomerById(id) {
    const result = await pool.query(
      `
        SELECT id, name, email, phone, email_confirmed AS "emailConfirmed", created_at AS "createdAt"
        FROM customers
        WHERE id = $1
      `,
      [id],
    );
    return result.rows[0] || null;
  }

  async function confirmCustomerEmail(token) {
    const result = await pool.query(
      `
        UPDATE customers
        SET email_confirmed = true,
            confirm_token = ''
        WHERE confirm_token = $1
        RETURNING id, name, email, phone, email_confirmed AS "emailConfirmed"
      `,
      [token],
    );
    return result.rows[0] || null;
  }

  async function updateCustomerProfile(id, profile) {
    const result = await pool.query(
      `
        UPDATE customers
        SET name = $2,
            phone = $3
        WHERE id = $1
        RETURNING id, name, email, phone, email_confirmed AS "emailConfirmed"
      `,
      [id, profile.name, profile.phone || ""],
    );
    return result.rows[0] || null;
  }

  async function readCustomerAddresses(customerId) {
    const result = await pool.query(
      `
        SELECT id, label, recipient_name AS "recipientName", phone, address, is_default AS "isDefault"
        FROM customer_addresses
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC
      `,
      [customerId],
    );
    return result.rows;
  }

  async function saveCustomerAddress(customerId, address) {
    const id = address.id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (address.isDefault) {
        await client.query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1", [customerId]);
      }
      await client.query(
        `
          INSERT INTO customer_addresses (id, customer_id, label, recipient_name, phone, address, is_default)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id)
          DO UPDATE SET label = excluded.label,
                        recipient_name = excluded.recipient_name,
                        phone = excluded.phone,
                        address = excluded.address,
                        is_default = excluded.is_default
        `,
        [id, customerId, address.label, address.recipientName, address.phone, address.address, Boolean(address.isDefault)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return readCustomerAddresses(customerId);
  }

  async function deleteCustomerAddress(customerId, id) {
    await pool.query("DELETE FROM customer_addresses WHERE customer_id = $1 AND id = $2", [customerId, id]);
    return readCustomerAddresses(customerId);
  }

  async function readCustomerOrders(customerId) {
    const state = await readState();
    return state.orders.filter((order) => order.customerId === customerId);
  }

  async function readAdminCredential() {
    const result = await pool.query(`
      SELECT password_salt AS "passwordSalt", password_hash AS "passwordHash"
      FROM admin_credentials
      WHERE id = 1
    `);
    return result.rows[0] || null;
  }

  async function createAdminCredential({ passwordSalt, passwordHash }) {
    await pool.query(
      `
        INSERT INTO admin_credentials (id, password_salt, password_hash)
        VALUES (1, $1, $2)
        ON CONFLICT (id) DO NOTHING
      `,
      [passwordSalt, passwordHash],
    );
  }

  async function writeAdminCredential({ passwordSalt, passwordHash }) {
    await pool.query(
      `
        INSERT INTO admin_credentials (id, password_salt, password_hash, updated_at)
        VALUES (1, $1, $2, now())
        ON CONFLICT (id)
        DO UPDATE SET password_salt = excluded.password_salt,
                      password_hash = excluded.password_hash,
                      updated_at = now()
      `,
      [passwordSalt, passwordHash],
    );
  }

  function publicAiSettings(row) {
    const providers = row?.providers || {};
    return {
      defaultProvider: row?.default_provider || "openai",
      providers: Object.fromEntries(
        ["openai", "gemini", "claude", "custom"].map((provider) => {
          const settings = providers[provider] || {};
          return [
            provider,
            {
              model: settings.model || "",
              endpoint: settings.endpoint || "",
              apiKeySet: Boolean(settings.apiKey),
            },
          ];
        }),
      ),
    };
  }

  async function readAiSettings({ includeSecrets = false } = {}) {
    const result = await pool.query("SELECT default_provider, providers FROM ai_settings WHERE id = 1");
    const row = result.rows[0] || { default_provider: "openai", providers: {} };
    if (includeSecrets) {
      return {
        defaultProvider: row.default_provider || "openai",
        providers: row.providers || {},
      };
    }
    return publicAiSettings(row);
  }

  async function writeAiSettings(settings) {
    const existing = await readAiSettings({ includeSecrets: true });
    const providers = { ...(existing.providers || {}) };
    for (const provider of ["openai", "gemini", "claude", "custom"]) {
      const incoming = settings.providers?.[provider] || {};
      const previous = providers[provider] || {};
      providers[provider] = {
        ...previous,
        model: String(incoming.model || previous.model || "").trim(),
        endpoint: String(incoming.endpoint || previous.endpoint || "").trim(),
        apiKey: incoming.apiKey ? String(incoming.apiKey).trim() : previous.apiKey || "",
      };
    }
    const defaultProvider = ["openai", "gemini", "claude", "custom"].includes(settings.defaultProvider)
      ? settings.defaultProvider
      : existing.defaultProvider || "openai";
    await pool.query(
      `
        UPDATE ai_settings
        SET default_provider = $1,
            providers = $2::jsonb,
            updated_at = now()
        WHERE id = 1
      `,
      [defaultProvider, JSON.stringify(providers)],
    );
    return readAiSettings();
  }

  async function close() {
    await pool.end();
  }

  return {
    close,
    createAdminCredential,
    createCustomer,
    confirmCustomerEmail,
    deleteCustomerAddress,
    init,
    readAiSettings,
    readAdminCredential,
    readCustomerAddresses,
    readCustomerByEmail,
    readCustomerById,
    readCustomerOrders,
    readState,
    readSmtpSettings,
    resetState,
    writeAdminCredential,
    writeAiSettings,
    saveCustomerAddress,
    writeStoreSettings,
    writeSmtpSettings,
    writeState,
  };
}

module.exports = {
  createPostgresStore,
};
