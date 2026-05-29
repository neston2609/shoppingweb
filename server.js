const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const OpenAI = require("openai");
const { createPostgresStore } = require("./database");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const JSON_STORE_PATH = path.join(ROOT, "data", "store.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const seedState = {
  categories: [
    { id: "cat-electronics", name: "Electronics", color: "#1aa7ec" },
    { id: "cat-fashion", name: "Fashion", color: "#ff6b6b" },
    { id: "cat-home", name: "Home", color: "#36b37e" },
    { id: "cat-grocery", name: "Grocery", color: "#ffb020" },
  ],
  products: [
    {
      id: "prd-headphones",
      name: "Nova Wireless Headphones",
      categoryId: "cat-electronics",
      price: 1290,
      stock: 24,
      rating: 4.8,
      accent: "#1aa7ec",
      description: "Soft ear pads, long battery life, and bright everyday sound.",
      details: "Includes Bluetooth wireless pairing, cushioned over-ear fit, foldable travel design, and up to 30 hours of battery life.",
    },
    {
      id: "prd-jacket",
      name: "City Pop Wind Jacket",
      categoryId: "cat-fashion",
      price: 890,
      stock: 18,
      rating: 4.6,
      accent: "#ff6b6b",
      description: "Lightweight color-block jacket for travel and weekend errands.",
      details: "Wind-resistant shell with roomy pockets, breathable lining, and easy layering for warm or rainy days.",
    },
    {
      id: "prd-lamp",
      name: "Glow Desk Lamp",
      categoryId: "cat-home",
      price: 740,
      stock: 15,
      rating: 4.7,
      accent: "#36b37e",
      description: "Three brightness levels with a tidy footprint for small desks.",
      details: "Touch controls, adjustable neck, warm white light mode, and a stable base for reading or focused work.",
    },
    {
      id: "prd-snackbox",
      name: "Rainbow Snack Box",
      categoryId: "cat-grocery",
      price: 320,
      stock: 42,
      rating: 4.5,
      accent: "#ffb020",
      description: "A cheerful mix of sweet, salty, and crunchy treats.",
      details: "Curated snack assortment packed for sharing, gifting, office breaks, or movie nights.",
    },
    {
      id: "prd-watch",
      name: "Pulse Mini Smartwatch",
      categoryId: "cat-electronics",
      price: 1590,
      stock: 12,
      rating: 4.9,
      accent: "#7c5cff",
      description: "Compact fitness tracking, sleep insights, and quick notifications.",
      details: "Tracks steps, heart rate, sleep, workout sessions, and phone alerts from a compact everyday display.",
    },
    {
      id: "prd-mug",
      name: "Morning Ceramic Mug",
      categoryId: "cat-home",
      price: 260,
      stock: 30,
      rating: 4.4,
      accent: "#00b8a9",
      description: "A sturdy hand-feel mug with a glossy two-tone finish.",
      details: "Comfortable handle, microwave-safe ceramic body, and a generous size for coffee, tea, or cocoa.",
    },
  ],
  shippingCosts: [
    { id: "ship-bangkok", zone: "Bangkok", cost: 35, freeOver: 900, eta: "1-2 days" },
    { id: "ship-central", zone: "Central Thailand", cost: 55, freeOver: 1200, eta: "2-3 days" },
    { id: "ship-north", zone: "North / Northeast", cost: 75, freeOver: 1500, eta: "3-5 days" },
    { id: "ship-south", zone: "South", cost: 85, freeOver: 1600, eta: "3-5 days" },
  ],
  orderStatuses: ["Pending", "Paid", "Packing", "Shipped", "Completed", "Cancelled"],
  orders: [],
  members: [],
};

loadEnvFile(path.join(ROOT, ".env"));
const PORT = process.env.PORT || 4173;
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const adminSessions = new Set();
const customerSessions = new Map();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadInitialState() {
  if (!fs.existsSync(JSON_STORE_PATH)) {
    return seedState;
  }
  try {
    const state = JSON.parse(fs.readFileSync(JSON_STORE_PATH, "utf8"));
    console.log("Seed source: data/store.json");
    return state;
  } catch (error) {
    console.warn(`Could not read data/store.json, using built-in seed data: ${error.message}`);
    return seedState;
  }
}

const initialState = loadInitialState();
const store = createPostgresStore(initialState);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      }),
  );
}

function isAdmin(req) {
  const token = parseCookies(req).colorcart_admin;
  return Boolean(token && adminSessions.has(token));
}

function requireAdmin(req, res) {
  if (isAdmin(req)) {
    return true;
  }
  sendJson(res, 401, { error: "Admin login required" });
  return false;
}

function setAdminCookie(res, token) {
  res.setHeader("Set-Cookie", `colorcart_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
}

function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", "colorcart_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function setCustomerCookie(res, token) {
  res.setHeader("Set-Cookie", `colorcart_customer=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function clearCustomerCookie(res) {
  res.setHeader("Set-Cookie", "colorcart_customer=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function currentCustomer(req) {
  const token = parseCookies(req).colorcart_customer;
  const customerId = token ? customerSessions.get(token) : null;
  return customerId ? store.readCustomerById(customerId) : null;
}

async function requireCustomer(req, res) {
  const customer = await currentCustomer(req);
  if (customer) return customer;
  sendJson(res, 401, { error: "Customer login required" });
  return null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(String(password), salt, 64).toString("hex"),
  };
}

function verifyPassword(password, credential) {
  if (!credential) {
    return false;
  }
  const attempted = Buffer.from(hashPassword(password, credential.passwordSalt).passwordHash, "hex");
  const stored = Buffer.from(credential.passwordHash, "hex");
  return attempted.length === stored.length && crypto.timingSafeEqual(attempted, stored);
}

async function ensureAdminCredential() {
  const existing = await store.readAdminCredential();
  if (!existing) {
    await store.createAdminCredential(hashPassword(DEFAULT_ADMIN_PASSWORD));
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function nextOrderId(orders) {
  const highest = orders.reduce((max, order) => {
    const match = /^ORD-(\d+)$/.exec(order.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `ORD-${String(highest + 1).padStart(4, "0")}`;
}

async function createOrder(payload, currentCustomer = null) {
  const state = await store.readState();
  const requestedItems = Array.isArray(payload.items) ? payload.items : [];
  if (requestedItems.length === 0) {
    throw new Error("Cart is empty");
  }

  const orderItems = [];
  let subtotal = 0;
  for (const requested of requestedItems) {
    const qty = Number(requested.qty);
    const product = state.products.find((item) => item.id === requested.productId);
    if (!product || !Number.isInteger(qty) || qty < 1) {
      throw new Error("Invalid cart item");
    }
    if (product.stock < qty) {
      throw new Error(`${product.name} does not have enough stock`);
    }
    product.stock -= qty;
    subtotal += product.price * qty;
    orderItems.push({ productId: product.id, name: product.name, qty, price: product.price });
  }

  const ship = state.shippingCosts.find((item) => item.id === payload.shippingId) || state.shippingCosts[0];
  if (!ship) {
    throw new Error("Shipping option is required");
  }

  const shippingCost = subtotal >= ship.freeOver ? 0 : ship.cost;
  const customer = {
    name: String(payload.customer?.name || currentCustomer?.name || "").trim(),
    email: String(payload.customer?.email || currentCustomer?.email || "").trim(),
    phone: String(payload.customer?.phone || currentCustomer?.phone || "").trim(),
    address: String(payload.customer?.address || "").trim(),
  };
  if (!customer.name || !customer.email || !customer.phone || !customer.address) {
    throw new Error("Customer details are required");
  }

  const member = Boolean(payload.registerMember);
  const order = {
    id: nextOrderId(state.orders),
    createdAt: new Date().toISOString(),
    customerId: currentCustomer?.id || null,
    customer,
    member: member || Boolean(currentCustomer),
    shipping: { zone: ship.zone, cost: shippingCost },
    items: orderItems,
    subtotal,
    total: subtotal + shippingCost,
    status: state.orderStatuses[0] || "Pending",
  };

  state.orders.unshift(order);
  if (member && !state.members.some((existing) => existing.email.toLowerCase() === customer.email.toLowerCase())) {
    state.members.push({ id: uid("mem"), name: customer.name, email: customer.email, phone: customer.phone, joinedAt: new Date().toISOString() });
  }

  await store.writeState(state);
  await sendOrderConfirmation(order).catch((error) => {
    console.warn(`Order ${order.id} email was not sent: ${error.message}`);
  });
  return order;
}

async function sendRegistrationConfirmation(customer, req) {
  const settings = await store.readSmtpSettings({ includePassword: true });
  assertSmtpReady(settings);
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `${protocol}://${host}/api/customer/confirm?token=${encodeURIComponent(customer.confirmToken)}`;
  const transport = createTransport(settings);
  await transport.sendMail({
    from: formatFrom(settings),
    to: customer.email,
    subject: "Confirm your ColorCart registration",
    text: `Please confirm your registration by opening this link:\n\n${url}\n\nIf you did not register, you can ignore this email.`,
  });
}

function formatFrom(settings) {
  const email = settings.fromEmail || settings.username;
  return settings.fromName ? `"${settings.fromName.replaceAll('"', "'")}" <${email}>` : email;
}

function orderEmailText(order) {
  const lines = [
    `Thank you for your order, ${order.customer.name}.`,
    "",
    `Order: ${order.id}`,
    `Status: ${order.status}`,
    `Subtotal: THB ${order.subtotal}`,
    `Shipping: THB ${order.shipping.cost}`,
    `Total: THB ${order.total}`,
    "",
    "Items:",
    ...order.items.map((item) => `- ${item.name} x${item.qty} - THB ${item.price * item.qty}`),
    "",
    `Delivery area: ${order.shipping.zone}`,
    "",
    "ColorCart",
  ];
  return lines.join("\n");
}

function createTransport(settings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: Number(settings.port),
    secure: Boolean(settings.secure),
    auth: {
      user: settings.username,
      pass: settings.password,
    },
  });
}

function assertSmtpReady(settings) {
  if (!settings.enabled) {
    throw new Error("SMTP is disabled");
  }
  if (!settings.host || !settings.port || !settings.username || !settings.password || !settings.fromEmail) {
    throw new Error("SMTP host, port, username, password, and from email are required");
  }
}

async function sendOrderConfirmation(order) {
  const settings = await store.readSmtpSettings({ includePassword: true });
  if (!settings.enabled) {
    return;
  }
  assertSmtpReady(settings);
  const transport = createTransport(settings);
  await transport.sendMail({
    from: formatFrom(settings),
    to: order.customer.email,
    subject: `Order confirmation ${order.id}`,
    text: orderEmailText(order),
  });
}

async function sendSmtpTest(to) {
  const settings = await store.readSmtpSettings({ includePassword: true });
  assertSmtpReady(settings);
  if (!to) {
    throw new Error("Test recipient is required");
  }
  const transport = createTransport(settings);
  await transport.sendMail({
    from: formatFrom(settings),
    to,
    subject: "ColorCart SMTP test",
    text: "Your ColorCart Gmail SMTP settings are working.",
  });
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI response did not include JSON");
  }
  return JSON.parse(match[0]);
}

function dataUrlParts(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return { mimeType: match[1], base64: match[2] };
}

function productAutofillPrompt(payload) {
  const categoryNames = Array.isArray(payload.categoryNames) ? payload.categoryNames : [];
  return `
You are helping an admin create an ecommerce product listing in Thai.
Analyze the product image, then use web search to identify likely product information.
Return only valid JSON. Do not wrap it in markdown.

Required JSON shape:
{
  "name": "Thai product name",
  "description": "1 short Thai sentence for product card",
  "details": "Thai full product details for product detail page, 4-7 sentences",
  "estimatedPrice": 0,
  "categoryName": "one of the provided category names if possible",
  "youtubeLinks": ["https://..."],
  "reviewLinks": ["https://..."],
  "confidence": "high|medium|low",
  "notes": "short Thai note if uncertain"
}

Provided category names: ${categoryNames.join(", ") || "none"}.
Current product name hint: ${payload.productNameHint || "none"}.
If exact product identity is uncertain, write useful generic Thai listing copy and set confidence to low or medium.
Prefer public product pages, official sources, YouTube reviews, and shopping/review pages when available.
`.trim();
}

async function runOpenAiAutofill(settings, prompt, imageDataUrl) {
  const apiKey = settings.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key is not configured");
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: settings.model || process.env.OPENAI_MODEL || "gpt-5-mini",
    tools: [{ type: "web_search" }],
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageDataUrl, detail: "low" },
        ],
      },
    ],
  });
  return response.output_text;
}

async function runGeminiAutofill(settings, prompt, imageDataUrl) {
  const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not configured");
  const { mimeType, base64 } = dataUrlParts(imageDataUrl);
  const model = settings.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      tools: [{ google_search: {} }],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Gemini request failed");
  return (body.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
}

async function runClaudeAutofill(settings, prompt, imageDataUrl) {
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Claude API key is not configured");
  const { mimeType, base64 } = dataUrlParts(imageDataUrl);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1400,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          ],
        },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Claude request failed");
  return (body.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

async function runCustomAutofill(settings, prompt, imageDataUrl) {
  if (!settings.endpoint) throw new Error("Custom endpoint is not configured");
  if (!settings.apiKey) throw new Error("Custom API key is not configured");
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || "Custom AI request failed");
  return body.output_text || body.text || body.choices?.[0]?.message?.content || JSON.stringify(body);
}

async function generateProductAutofill(payload) {
  if (!payload.imageDataUrl) {
    throw new Error("Product image is required");
  }

  const aiSettings = await store.readAiSettings({ includeSecrets: true });
  const provider = aiSettings.defaultProvider || "openai";
  const settings = aiSettings.providers?.[provider] || {};
  const prompt = productAutofillPrompt(payload);
  const text =
    provider === "gemini"
      ? await runGeminiAutofill(settings, prompt, payload.imageDataUrl)
      : provider === "claude"
        ? await runClaudeAutofill(settings, prompt, payload.imageDataUrl)
        : provider === "custom"
          ? await runCustomAutofill(settings, prompt, payload.imageDataUrl)
          : await runOpenAiAutofill(settings, prompt, payload.imageDataUrl);

  const result = extractJsonObject(text);
  return {
    name: String(result.name || ""),
    description: String(result.description || ""),
    details: String(result.details || ""),
    estimatedPrice: Number(result.estimatedPrice || 0),
    categoryName: String(result.categoryName || ""),
    youtubeLinks: Array.isArray(result.youtubeLinks) ? result.youtubeLinks.filter(Boolean).map(String) : [],
    reviewLinks: Array.isArray(result.reviewLinks) ? result.reviewLinks.filter(Boolean).map(String) : [],
    confidence: String(result.confidence || "low"),
    notes: String(result.notes || ""),
    provider,
    model: String(settings.model || ""),
  };
}

function serveStatic(req, res) {
  const safePath = decodeURIComponent(req.url.split("?")[0]);
  const relativePath = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/customer/session" && req.method === "GET") {
      const customer = await currentCustomer(req);
      sendJson(res, 200, { authenticated: Boolean(customer), customer });
      return;
    }

    if (url.pathname === "/api/customer/register" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req));
      const password = String(payload.password || "");
      if (password.length < 6) {
        sendJson(res, 400, { error: "Password must be at least 6 characters" });
        return;
      }
      assertSmtpReady(await store.readSmtpSettings({ includePassword: true }));
      if (await store.readCustomerByEmail(payload.email)) {
        sendJson(res, 400, { error: "Email is already registered" });
        return;
      }
      const credential = hashPassword(password);
      const customer = await store.createCustomer({
        id: uid("cus"),
        name: String(payload.name || "").trim(),
        email: String(payload.email || "").trim(),
        phone: String(payload.phone || "").trim(),
        passwordSalt: credential.passwordSalt,
        passwordHash: credential.passwordHash,
        confirmToken: crypto.randomBytes(32).toString("hex"),
      });
      const customerWithToken = await store.readCustomerByEmail(customer.email);
      await sendRegistrationConfirmation(customerWithToken, req);
      sendJson(res, 201, { ok: true, message: "Confirmation email sent" });
      return;
    }

    if (url.pathname === "/api/customer/confirm" && req.method === "GET") {
      const customer = await store.confirmCustomerEmail(url.searchParams.get("token"));
      res.writeHead(customer ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<main style="font-family:Tahoma,sans-serif;padding:32px"><h1>${customer ? "Email confirmed" : "Invalid confirmation link"}</h1><p>${customer ? "You can now log in to your account." : "Please request a new confirmation email."}</p><a href="/">Back to store</a></main>`);
      return;
    }

    if (url.pathname === "/api/customer/login" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req));
      const customer = await store.readCustomerByEmail(payload.email);
      if (!verifyPassword(payload.password, customer)) {
        sendJson(res, 401, { error: "Invalid email or password" });
        return;
      }
      if (!customer.emailConfirmed) {
        sendJson(res, 403, { error: "Please confirm your email before logging in" });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      customerSessions.set(token, customer.id);
      setCustomerCookie(res, token);
      sendJson(res, 200, { ok: true, customer: await store.readCustomerById(customer.id) });
      return;
    }

    if (url.pathname === "/api/customer/logout" && req.method === "POST") {
      const token = parseCookies(req).colorcart_customer;
      if (token) customerSessions.delete(token);
      clearCustomerCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/customer/profile" && req.method === "PUT") {
      const customer = await requireCustomer(req, res);
      if (!customer) return;
      const payload = JSON.parse(await readBody(req));
      sendJson(res, 200, await store.updateCustomerProfile(customer.id, payload));
      return;
    }

    if (url.pathname === "/api/customer/addresses" && req.method === "GET") {
      const customer = await requireCustomer(req, res);
      if (!customer) return;
      sendJson(res, 200, await store.readCustomerAddresses(customer.id));
      return;
    }

    if (url.pathname === "/api/customer/addresses" && req.method === "POST") {
      const customer = await requireCustomer(req, res);
      if (!customer) return;
      const payload = JSON.parse(await readBody(req));
      sendJson(res, 200, await store.saveCustomerAddress(customer.id, { ...payload, id: payload.id || uid("addr") }));
      return;
    }

    if (url.pathname.startsWith("/api/customer/addresses/") && req.method === "DELETE") {
      const customer = await requireCustomer(req, res);
      if (!customer) return;
      sendJson(res, 200, await store.deleteCustomerAddress(customer.id, decodeURIComponent(url.pathname.split("/").pop())));
      return;
    }

    if (url.pathname === "/api/customer/orders" && req.method === "GET") {
      const customer = await requireCustomer(req, res);
      if (!customer) return;
      sendJson(res, 200, await store.readCustomerOrders(customer.id));
      return;
    }

    if (req.url === "/api/admin/session" && req.method === "GET") {
      sendJson(res, 200, { authenticated: isAdmin(req) });
      return;
    }

    if (req.url === "/api/admin/login" && req.method === "POST") {
      const credentials = JSON.parse(await readBody(req));
      if (!verifyPassword(credentials.password, await store.readAdminCredential())) {
        sendJson(res, 401, { error: "Invalid password" });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      adminSessions.add(token);
      setAdminCookie(res, token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === "/api/admin/password" && req.method === "PUT") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const payload = JSON.parse(await readBody(req));
      const newPassword = String(payload.newPassword || "");
      if (!verifyPassword(payload.currentPassword, await store.readAdminCredential())) {
        sendJson(res, 400, { error: "Current password is incorrect" });
        return;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { error: "New password must be at least 6 characters" });
        return;
      }
      await store.writeAdminCredential(hashPassword(newPassword));
      adminSessions.clear();
      clearAdminCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === "/api/admin/logout" && req.method === "POST") {
      const token = parseCookies(req).colorcart_admin;
      if (token) {
        adminSessions.delete(token);
      }
      clearAdminCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === "/api/admin/smtp" && req.method === "GET") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, await store.readSmtpSettings());
      return;
    }

    if (req.url === "/api/admin/smtp" && req.method === "PUT") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const settings = JSON.parse(await readBody(req));
      sendJson(res, 200, await store.writeSmtpSettings(settings));
      return;
    }

    if (req.url === "/api/admin/smtp/test" && req.method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const payload = JSON.parse(await readBody(req));
      await sendSmtpTest(String(payload.to || "").trim());
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === "/api/admin/ai/settings" && req.method === "GET") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, await store.readAiSettings());
      return;
    }

    if (req.url === "/api/admin/ai/settings" && req.method === "PUT") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, await store.writeAiSettings(JSON.parse(await readBody(req))));
      return;
    }

    if (req.url === "/api/admin/store-settings" && req.method === "PUT") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, await store.writeStoreSettings(JSON.parse(await readBody(req))));
      return;
    }

    if (req.url === "/api/admin/ai/product-autofill" && req.method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const payload = JSON.parse(await readBody(req));
      sendJson(res, 200, await generateProductAutofill(payload));
      return;
    }

    if (req.url === "/api/state" && req.method === "GET") {
      sendJson(res, 200, await store.readState());
      return;
    }

    if (req.url === "/api/state" && req.method === "PUT") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const body = await readBody(req);
      const state = JSON.parse(body);
      await store.writeState(state);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url === "/api/order" && req.method === "POST") {
      const order = await createOrder(JSON.parse(await readBody(req)), await currentCustomer(req));
      sendJson(res, 201, { ok: true, order });
      return;
    }

    if (req.url === "/api/reset" && req.method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, await store.resetState());
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

store
  .init()
  .then(() => ensureAdminCredential())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Shopping application running at http://localhost:${PORT}`);
      console.log("Storage: PostgreSQL");
    });
  })
  .catch((error) => {
    console.error("Could not start PostgreSQL storage.");
    console.error(error.message);
    console.error("Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD, then restart the app.");
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await store.close();
  process.exit(0);
});
