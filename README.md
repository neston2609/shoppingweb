# Japan Toy Shop Shopping Application

A shopping application with a storefront, backend management area, and PostgreSQL persistence.

## Run

Create a PostgreSQL database first:

```sql
CREATE DATABASE shopping_web;
```

Set your connection string in `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Then start the app:

```powershell
npm start
```

Open `http://localhost:4173`.

You can also use `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` instead of `DATABASE_URL`.

If `data/store.json` exists, the app uses it as seed data the first time it creates the PostgreSQL row.

## Admin Login

The default admin password is:

```text
admin123
```

Change it in `.env`:

```powershell
ADMIN_PASSWORD=your_new_password
```

After the first successful start, the admin password is stored as a salted hash in PostgreSQL. You can change it later from **Backend → Password**.

## Gmail SMTP

Log in to the Backend area and open **SMTP Mail**. Use:

```text
Host: smtp.gmail.com
Port: 587
Security: STARTTLS / TLS on port 587
Username: your Gmail address
Password: a Gmail App Password
From email: your Gmail address
```

After saving, use **Send Test Email**. When SMTP is enabled, the site sends an order confirmation email after checkout.

## AI Product Autofill

Set provider API keys in **Backend → AI Settings**, or use `.env` fallbacks:

```text
OPENAI_API_KEY=sk-your_openai_api_key
OPENAI_MODEL=gpt-5-mini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

In **Backend → AI Settings**, choose the default AI provider for product autofill: OpenAI, Gemini, Claude, or a custom OpenAI-compatible endpoint. Then in **Backend → Products**, choose a product image and click **AI เติมข้อมูลจากรูป**. The server sends the image to the selected provider, uses that provider's search capability where supported, and fills Thai product name, descriptions, estimated price, YouTube links, and review links into the form. Review the result before saving.

## Included workflows

- Product, category, shipping cost, order status, and order management
- Store settings management for store name, logo, storefront headline, and storefront message
- Buyer checkout as guest or optional member registration
- Customer registration with email confirmation, customer login, profile, address book, and order history
- Category image upload, multiple product images, product detail text, YouTube videos, and review links
- AI product autofill from product image with Thai copy and web search
- Admin SMTP setup for Gmail and order confirmation emails
- PostgreSQL-backed persistence in normalized product, category, shipping, status, member, order, and order item tables
- Colorful responsive storefront and admin interface
