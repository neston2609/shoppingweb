const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const icons = {
  shop: '<svg viewBox="0 0 24 24"><path d="M4 10h16l-1.5-5h-13L4 10Z"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4.5-2.8 7.5-7 9-4.2-1.5-7-4.5-7-9V7l7-4Z"/><path d="M9 12l2 2 4-4"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M6 6h15l-2 8H8L6 3H3"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
};

const app = document.querySelector("#app");

const ui = {
  page: "store",
  adminTab: "products",
  search: "",
  category: "all",
  sort: "featured",
  selectedShippingId: null,
  cart: JSON.parse(localStorage.getItem("colorcart-cart") || "[]"),
  editingProductId: null,
  editingCategoryId: null,
  selectedProductId: null,
  selectedProductImageIndex: 0,
  toast: "",
  adminAuthenticated: false,
  customerAuthenticated: false,
  customer: null,
  customerAddresses: [],
  customerOrders: [],
  smtpSettings: null,
  aiSettings: null,
};

let state = null;

function icon(name) {
  return `<span class="icon" aria-hidden="true">${icons[name] || icons.box}</span>`;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImageFiles(input) {
  if (!input?.files?.length) {
    return [];
  }
  const files = Array.from(input.files).filter((file) => file.type.startsWith("image/"));
  return Promise.all(files.map(fileToDataUrl));
}

function parseLinks(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((link) => link.trim())
    .filter(Boolean);
}

function linksToText(links) {
  return (Array.isArray(links) ? links : []).join("\n");
}

function youtubeEmbedUrl(url) {
  const value = String(url || "").trim();
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/shorts\/([^?&/]+)/,
    /youtu\.be\/([^?&/]+)/,
    /youtube\.com\/embed\/([^?&/]+)/,
  ];
  const match = patterns.map((pattern) => value.match(pattern)).find(Boolean);
  return match ? `https://www.youtube.com/embed/${encodeURIComponent(match[1])}` : "";
}

function productImages(product) {
  return Array.isArray(product?.images) ? product.images : [];
}

function categoryImage(category) {
  return category?.image || "";
}

function categoryIdByName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return state.categories.find((category) => category.name.toLowerCase() === normalized)?.id || "";
}

function storeSettings() {
  return state.storeSettings || {
    storeName: "Japan Toy Shop",
    logo: "",
    storefrontHeadline: "Japan finds, toys, and collectibles.",
    storefrontMessage: "Browse Japanese products, choose delivery, and check out as a guest or member.",
  };
}

function categoryById(id) {
  return state.categories.find((category) => category.id === id) || state.categories[0];
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function cartCount() {
  return ui.cart.reduce((sum, item) => sum + item.qty, 0);
}

function cartSubtotal() {
  return ui.cart.reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function selectedShipping() {
  return state.shippingCosts.find((ship) => ship.id === ui.selectedShippingId) || state.shippingCosts[0] || { id: "pickup", zone: "Pickup", cost: 0, freeOver: 0, eta: "Today" };
}

async function apiSave() {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Save failed" }));
    if (response.status === 401) ui.adminAuthenticated = false;
    throw new Error(error.error || "Save failed");
  }
}

async function loadState() {
  const response = await fetch("/api/state");
  state = await response.json();
  ui.selectedShippingId = ui.selectedShippingId || state.shippingCosts[0]?.id || null;
}

async function loadSmtpSettings() {
  const response = await fetch("/api/admin/smtp");
  if (!response.ok) {
    if (response.status === 401) ui.adminAuthenticated = false;
    throw new Error("Could not load SMTP settings");
  }
  ui.smtpSettings = await response.json();
}

async function loadAiSettings() {
  const response = await fetch("/api/admin/ai/settings");
  if (!response.ok) {
    if (response.status === 401) ui.adminAuthenticated = false;
    throw new Error("Could not load AI settings");
  }
  ui.aiSettings = await response.json();
}

async function loadCustomerSession() {
  const session = await fetch("/api/customer/session").then((response) => response.json()).catch(() => ({ authenticated: false }));
  ui.customerAuthenticated = Boolean(session.authenticated);
  ui.customer = session.customer || null;
  if (ui.customerAuthenticated) {
    ui.customerAddresses = await fetch("/api/customer/addresses").then((response) => response.json()).catch(() => []);
    ui.customerOrders = await fetch("/api/customer/orders").then((response) => response.json()).catch(() => []);
  }
}

function persistCart() {
  localStorage.setItem("colorcart-cart", JSON.stringify(ui.cart));
}

function toast(message) {
  ui.toast = message;
  render();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    ui.toast = "";
    render();
  }, 2600);
}

function passiveToast(message) {
  document.querySelector(".toast")?.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.setAttribute("role", "status");
  element.textContent = message;
  document.body.appendChild(element);
  window.clearTimeout(passiveToast.timer);
  passiveToast.timer = window.setTimeout(() => element.remove(), 2600);
}

function filteredProducts() {
  const query = ui.search.trim().toLowerCase();
  let products = state.products.filter((product) => {
    const matchesCategory = ui.category === "all" || product.categoryId === ui.category;
    const matchesSearch = !query || `${product.name} ${product.description} ${product.details || ""} ${(product.reviewLinks || []).join(" ")}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  if (ui.sort === "price-low") products = products.sort((a, b) => a.price - b.price);
  if (ui.sort === "price-high") products = products.sort((a, b) => b.price - a.price);
  if (ui.sort === "rating") products = products.sort((a, b) => b.rating - a.rating);
  return products;
}

function productCountForCategory(categoryId) {
  return state.products.filter((product) => product.categoryId === categoryId).length;
}

function renderStoreSidebar(subtotal) {
  const ship = selectedShipping();
  const currentShipping = subtotal >= ship.freeOver ? 0 : ship.cost;
  const selectedCategory = ui.category === "all" ? null : categoryById(ui.category);
  return `
    <aside class="store-sidebar" aria-label="Store filters and details">
      <section class="sidebar-card">
        <div class="sidebar-heading">
          <span>Browse</span>
          <strong>Categories</strong>
        </div>
        <div class="category-menu">
          <button class="category-filter-btn ${ui.category === "all" ? "active" : ""}" data-category-filter="all">
            <span class="category-chip-dot all-dot"></span>
            <span>All products</span>
            <strong>${state.products.length}</strong>
          </button>
          ${state.categories.map((category) => `
            <button class="category-filter-btn ${ui.category === category.id ? "active" : ""}" data-category-filter="${category.id}" style="--dot-color: ${category.color};">
              ${categoryImage(category) ? `<img src="${categoryImage(category)}" alt="" />` : `<span class="category-chip-dot"></span>`}
              <span>${escapeHtml(category.name)}</span>
              <strong>${productCountForCategory(category.id)}</strong>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="sidebar-card shipping-card">
        <div class="sidebar-heading">
          <span>Delivery</span>
          <strong>Shipping cost</strong>
        </div>
        <div class="shipping-current">
          <span>${escapeHtml(ship.zone)}</span>
          <strong>${currentShipping === 0 ? "Free" : currency.format(currentShipping)}</strong>
          <small>${escapeHtml(ship.eta)}${ship.freeOver > 0 ? ` | Free over ${currency.format(ship.freeOver)}` : ""}</small>
        </div>
        <div class="shipping-list">
          ${state.shippingCosts.map((option) => `
            <button class="shipping-option ${option.id === ship.id ? "active" : ""}" data-shipping-option="${option.id}">
              <span>
                <strong>${escapeHtml(option.zone)}</strong>
                <small>${escapeHtml(option.eta)}</small>
              </span>
              <b>${option.cost === 0 ? "Free" : currency.format(option.cost)}</b>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="sidebar-card store-note">
        <div class="sidebar-heading">
          <span>Now viewing</span>
          <strong>${escapeHtml(selectedCategory?.name || "All Japanese finds")}</strong>
        </div>
        <p>${filteredProducts().length} products available. Add items to cart and choose delivery area anytime.</p>
      </section>
    </aside>
  `;
}

function renderTopbar() {
  const settings = storeSettings();
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${settings.logo ? `<img src="${settings.logo}" alt="${escapeHtml(settings.storeName)} logo" />` : icon("cart")}</div>
        <div>
          <h1>${escapeHtml(settings.storeName)}</h1>
          <p>Japanese product shop</p>
        </div>
      </div>
      <nav class="nav-tabs" aria-label="Main navigation">
        <button class="${ui.page === "store" || ui.page === "product" ? "active" : ""}" data-page="store">${icon("shop")} Store</button>
        <button class="${ui.page === "account" ? "active" : ""}" data-page="account">${icon("admin")} Account</button>
        <button class="${ui.page === "admin" ? "active" : ""}" data-page="admin">${icon("admin")} Backend</button>
      </nav>
    </header>
  `;
}

function renderStore() {
  const settings = storeSettings();
  const subtotal = cartSubtotal();
  return `
    <main class="page">
      <section class="store-layout">
        ${renderStoreSidebar(subtotal)}
        <div>
          <section class="store-hero">
            <div>
              <h2>${escapeHtml(settings.storefrontHeadline)}</h2>
              <p>${escapeHtml(settings.storefrontMessage)}</p>
            </div>
          </section>

          <section id="products">
            <div class="toolbar">
              <input class="field" data-search value="${escapeHtml(ui.search)}" placeholder="Search products" aria-label="Search products" />
              <select class="select-field" data-sort aria-label="Sort products">
                <option value="featured" ${ui.sort === "featured" ? "selected" : ""}>Featured</option>
                <option value="price-low" ${ui.sort === "price-low" ? "selected" : ""}>Price: Low to High</option>
                <option value="price-high" ${ui.sort === "price-high" ? "selected" : ""}>Price: High to Low</option>
                <option value="rating" ${ui.sort === "rating" ? "selected" : ""}>Top Rated</option>
              </select>
              <span class="toolbar-count">${filteredProducts().length} items</span>
            </div>
            <div class="product-grid">
              ${filteredProducts().map(renderProductCard).join("") || `<div class="empty-state">No products match this search.</div>`}
            </div>
          </section>
        </div>
        ${renderCart(subtotal)}
      </section>
    </main>
  `;
}

function renderAccount() {
  if (!ui.customerAuthenticated) {
    return `
      <main class="page">
        <section class="admin-grid">
          <form class="admin-panel admin-form" data-customer-login>
            <h2>Customer Login</h2>
            <label>Email <input class="field" name="email" type="email" required /></label>
            <label>Password <input class="field" name="password" type="password" required /></label>
            <button class="primary-btn" type="submit">${icon("save")} Login</button>
          </form>
          <form class="admin-panel admin-form" data-customer-register>
            <h2>Register</h2>
            <label>Name <input class="field" name="name" required /></label>
            <label>Email <input class="field" name="email" type="email" required /></label>
            <label>Phone <input class="field" name="phone" required /></label>
            <label>Password <input class="field" name="password" type="password" minlength="6" required /></label>
            <button class="primary-btn" type="submit">${icon("mail")} Register & Send Confirmation</button>
          </form>
        </section>
      </main>
    `;
  }
  return `
    <main class="page">
      <section class="account-layout">
        <div class="admin-panel">
          <div class="panel-title"><h2>My Profile</h2><button class="secondary-btn" data-customer-logout>Logout</button></div>
          <form class="admin-form" data-customer-profile>
            <label>Name <input class="field" name="name" value="${escapeHtml(ui.customer.name)}" required /></label>
            <label>Email <input class="field" value="${escapeHtml(ui.customer.email)}" disabled /></label>
            <label>Phone <input class="field" name="phone" value="${escapeHtml(ui.customer.phone || "")}" /></label>
            <button class="primary-btn" type="submit">${icon("save")} Save Profile</button>
          </form>
        </div>
        <div class="admin-panel">
          <div class="panel-title"><h2>Address Book</h2><span class="count-badge">${ui.customerAddresses.length}</span></div>
          <form class="admin-form" data-customer-address>
            <input type="hidden" name="id" />
            <label>Label <input class="field" name="label" placeholder="Home / Office" required /></label>
            <label>Recipient name <input class="field" name="recipientName" value="${escapeHtml(ui.customer.name)}" required /></label>
            <label>Phone <input class="field" name="phone" value="${escapeHtml(ui.customer.phone || "")}" required /></label>
            <label>Address <textarea class="textarea-field" name="address" required></textarea></label>
            <label class="checkbox-line"><input type="checkbox" name="isDefault" /> Default address</label>
            <button class="primary-btn" type="submit">${icon("plus")} Save Address</button>
          </form>
          <div class="address-list">
            ${ui.customerAddresses.map((address) => `
              <div class="address-card">
                <strong>${escapeHtml(address.label)} ${address.isDefault ? "(Default)" : ""}</strong>
                <p>${escapeHtml(address.recipientName)} - ${escapeHtml(address.phone)}<br>${escapeHtml(address.address)}</p>
                <button class="danger-btn" data-delete-address="${address.id}">${icon("trash")} Delete</button>
              </div>
            `).join("") || `<div class="empty-state">No addresses yet.</div>`}
          </div>
        </div>
        <div class="admin-panel account-orders">
          <div class="panel-title"><h2>Order History</h2><span class="count-badge">${ui.customerOrders.length} orders</span></div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Items</th></tr></thead>
              <tbody>
                ${ui.customerOrders.map((order) => `
                  <tr>
                    <td><strong>${order.id}</strong><br><span class="muted">${new Date(order.createdAt).toLocaleString()}</span></td>
                    <td>${currency.format(order.total)}</td>
                    <td><span class="status-chip">${escapeHtml(order.status)}</span></td>
                    <td>${order.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join("<br>")}</td>
                  </tr>
                `).join("") || `<tr><td colspan="4" class="muted">No orders yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderProductCard(product) {
  const category = categoryById(product.categoryId);
  const image = productImages(product)[0];
  return `
    <article class="product-card" style="--accent: ${product.accent}; --dot-color: ${category.color};">
      <button class="product-art product-detail-trigger" data-view-product="${product.id}" aria-label="View details for ${escapeHtml(product.name)}">
        ${
          image
            ? `<img class="product-card-image" src="${image}" alt="${escapeHtml(product.name)}" />`
            : `<div class="product-shape">${icons.box}</div>`
        }
      </button>
      <div class="product-body">
        <div class="product-meta">
          <span class="inline-row"><span class="category-dot"></span>${escapeHtml(category.name)}</span>
          <span>${product.rating.toFixed(1)} rating</span>
        </div>
        <h3><button class="product-title-btn" data-view-product="${product.id}">${escapeHtml(product.name)}</button></h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="price-row">
          <span class="price">${currency.format(product.price)}</span>
          <div class="product-actions">
            <button class="secondary-btn compact-btn" data-view-product="${product.id}">View Details</button>
            <button class="primary-btn compact-btn" data-add-cart="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${icon("plus")} Add</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderProductDetailPage() {
  const product = ui.selectedProductId ? productById(ui.selectedProductId) : null;
  if (!product) {
    ui.page = "store";
    return renderStore();
  }
  const category = categoryById(product.categoryId);
  const images = productImages(product);
  const selectedImage = images[ui.selectedProductImageIndex] || images[0] || "";
  const youtubeLinks = Array.isArray(product.youtubeLinks) ? product.youtubeLinks : [];
  const reviewLinks = Array.isArray(product.reviewLinks) ? product.reviewLinks : [];
  const stockLabel = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";
  return `
    <main class="page">
      <section class="product-detail-page" style="--accent: ${product.accent}; --dot-color: ${category.color};">
        <button class="secondary-btn" data-back-store>${icon("shop")} Back to products</button>
        <div class="product-detail-layout">
          <section class="detail-gallery">
            <div class="detail-main-media">
              ${
                selectedImage
                  ? `<img src="${selectedImage}" alt="${escapeHtml(product.name)}" />`
                  : `<div class="product-shape">${icons.box}</div>`
              }
            </div>
            ${
              images.length > 1
                ? `<div class="detail-thumbs">
                    ${images.map((image, index) => `
                      <button class="${index === ui.selectedProductImageIndex ? "active" : ""}" data-product-image-index="${index}" aria-label="Show product image ${index + 1}">
                        <img src="${image}" alt="${escapeHtml(product.name)} ${index + 1}" />
                      </button>
                    `).join("")}
                  </div>`
                : ""
            }
          </section>
          <section class="detail-content">
            <div class="product-meta">
              <span class="inline-row"><span class="category-dot"></span>${escapeHtml(category.name)}</span>
              <span>${product.rating.toFixed(1)} rating</span>
            </div>
            <h2>${escapeHtml(product.name)}</h2>
            <p class="detail-lead">${escapeHtml(product.description)}</p>
            ${product.details ? `<div class="detail-copy"><h3>Product details</h3><p>${escapeHtml(product.details)}</p></div>` : ""}
            <div class="detail-list">
              <div><span>Price</span><strong>${currency.format(product.price)}</strong></div>
              <div><span>Availability</span><strong>${stockLabel}</strong></div>
              <div><span>Category</span><strong>${escapeHtml(category.name)}</strong></div>
            </div>
            <div class="detail-actions">
              <button class="primary-btn" data-add-cart="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${icon("plus")} Add to Cart</button>
            </div>
          </section>
        </div>
        ${
          youtubeLinks.length
            ? `<section class="detail-section">
                <h3>Videos</h3>
                <div class="video-grid">
                  ${youtubeLinks.map((link) => {
                    const embed = youtubeEmbedUrl(link);
                    return embed
                      ? `<iframe src="${embed}" title="Product video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
                      : `<a class="review-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`;
                  }).join("")}
                </div>
              </section>`
            : ""
        }
        ${
          reviewLinks.length
            ? `<section class="detail-section">
                <h3>Reviews</h3>
                <div class="review-links">
                  ${reviewLinks.map((link) => `<a class="review-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`).join("")}
                </div>
              </section>`
            : ""
        }
      </section>
    </main>
  `;
}

function renderProductDetailModal() {
  const product = ui.selectedProductId ? productById(ui.selectedProductId) : null;
  if (!product) {
    return "";
  }
  const category = categoryById(product.categoryId);
  const stockLabel = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";
  return `
    <section class="modal-backdrop" data-close-product-detail>
      <article class="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title" style="--accent: ${product.accent}; --dot-color: ${category.color};">
        <button class="modal-close" data-close-product-detail aria-label="Close product details">x</button>
        <div class="product-modal-art">
          <div class="product-shape">${icons.box}</div>
        </div>
        <div class="product-modal-body">
          <div class="product-meta">
            <span class="inline-row"><span class="category-dot"></span>${escapeHtml(category.name)}</span>
            <span>${product.rating.toFixed(1)} rating</span>
          </div>
          <h2 id="product-detail-title">${escapeHtml(product.name)}</h2>
          <p>${escapeHtml(product.description)}</p>
          ${
            product.details
              ? `<div class="detail-copy">
                  <h3>Product details</h3>
                  <p>${escapeHtml(product.details)}</p>
                </div>`
              : ""
          }
          <div class="detail-list">
            <div><span>Price</span><strong>${currency.format(product.price)}</strong></div>
            <div><span>Availability</span><strong>${stockLabel}</strong></div>
            <div><span>Category</span><strong>${escapeHtml(category.name)}</strong></div>
          </div>
          <div class="detail-actions">
            <button class="primary-btn" data-add-cart="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${icon("plus")} Add to Cart</button>
            <button class="secondary-btn" data-close-product-detail>Continue Browsing</button>
          </div>
        </div>
      </article>
    </section>
  `;
}

function renderCart(subtotal) {
  const ship = selectedShipping();
  const shipping = subtotal >= ship.freeOver ? 0 : ship.cost;
  const total = subtotal + shipping;
  return `
    <aside class="cart-panel">
      <div class="panel-title">
        <h2>Your Cart</h2>
        <span class="count-badge">${cartCount()} items</span>
      </div>
      ${
        ui.cart.length
          ? `
        <div class="cart-items">
          ${ui.cart.map(renderCartRow).join("")}
        </div>
        <div class="totals">
          <div><span>Subtotal</span><strong>${currency.format(subtotal)}</strong></div>
          <div><span>Shipping</span><strong>${shipping === 0 ? "Free" : currency.format(shipping)}</strong></div>
          <div class="grand-total"><span>Total</span><strong>${currency.format(total)}</strong></div>
        </div>
        ${renderCheckoutForm(ship.id)}
      `
          : `<div class="empty-state">Cart is empty.</div>`
      }
    </aside>
  `;
}

function renderCartRow(item) {
  const product = productById(item.productId);
  if (!product) return "";
  return `
    <div class="cart-row">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <span>${currency.format(product.price)} each</span>
      </div>
      <div class="qty-controls">
        <button data-cart-dec="${product.id}" aria-label="Decrease ${escapeHtml(product.name)}">-</button>
        <strong>${item.qty}</strong>
        <button data-cart-inc="${product.id}" aria-label="Increase ${escapeHtml(product.name)}">+</button>
      </div>
    </div>
  `;
}

function renderCheckoutForm(selectedShippingId) {
  const defaultAddress = ui.customerAddresses.find((address) => address.isDefault) || ui.customerAddresses[0];
  const nameValue = defaultAddress?.recipientName || ui.customer?.name || "";
  const emailValue = ui.customer?.email || "";
  const phoneValue = defaultAddress?.phone || ui.customer?.phone || "";
  const addressValue = defaultAddress?.address || "";
  return `
    <form class="checkout-form" data-checkout>
      ${ui.customerAuthenticated && ui.customerAddresses.length ? `
        <select class="select-field" data-address-select aria-label="Use saved address">
          <option value="">Use saved address</option>
          ${ui.customerAddresses.map((address) => `<option value="${address.id}">${escapeHtml(address.label)} - ${escapeHtml(address.recipientName)}</option>`).join("")}
        </select>
      ` : ""}
      <input class="field" name="name" required placeholder="Full name" value="${escapeHtml(nameValue)}" />
      <input class="field" name="email" type="email" required placeholder="Email" value="${escapeHtml(emailValue)}" />
      <input class="field" name="phone" required placeholder="Phone" value="${escapeHtml(phoneValue)}" />
      <textarea class="textarea-field" name="address" required placeholder="Delivery address">${escapeHtml(addressValue)}</textarea>
      <select class="select-field" name="shippingId" aria-label="Shipping area">
        ${state.shippingCosts.map((ship) => `<option value="${ship.id}" ${ship.id === selectedShippingId ? "selected" : ""}>${escapeHtml(ship.zone)} - ${currency.format(ship.cost)} - ${escapeHtml(ship.eta)}</option>`).join("")}
      </select>
      ${ui.customerAuthenticated ? `<span class="muted">Ordering as ${escapeHtml(ui.customer.email)}</span>` : `<label class="checkbox-line"><input type="checkbox" name="registerMember" /> Create member account</label>`}
      <button class="primary-btn" type="submit">${icon("save")} Place Order</button>
    </form>
  `;
}

function renderAdmin() {
  if (!ui.adminAuthenticated) {
    return renderAdminLogin();
  }
  return `
    <main class="page">
      <section class="admin-layout">
        <aside class="admin-sidebar">
          <div class="admin-summary">
            <div class="summary-tile" style="--tile-bg: #1aa7ec"><span>Products</span><strong>${state.products.length}</strong></div>
            <div class="summary-tile" style="--tile-bg: #36b37e"><span>Orders</span><strong>${state.orders.length}</strong></div>
            <div class="summary-tile" style="--tile-bg: #ff6b6b"><span>Members</span><strong>${state.members.length}</strong></div>
          </div>
          <nav class="segmented" aria-label="Backend sections">
            ${["store", "products", "categories", "shipping", "orders", "statuses", "smtp", "ai", "password"].map((tab) => `
              <button class="${ui.adminTab === tab ? "active" : ""}" data-admin-tab="${tab}">${adminTabLabel(tab)}</button>
            `).join("")}
          </nav>
          <button class="secondary-btn" data-admin-logout>${icon("admin")} Logout</button>
        </aside>
        <section class="admin-panel">
          ${renderAdminTab()}
        </section>
      </section>
    </main>
  `;
}

function renderAdminLogin() {
  return `
    <main class="page">
      <section class="login-shell">
        <form class="admin-panel login-panel" data-admin-login>
          <div class="brand-mark">${icon("admin")}</div>
          <h2>Admin Login</h2>
          <p class="muted">Enter the admin password to manage products, categories, shipping, and order statuses.</p>
          <input class="field" name="password" type="password" autocomplete="current-password" required placeholder="Admin password" />
          <button class="primary-btn" type="submit">${icon("save")} Login</button>
        </form>
      </section>
    </main>
  `;
}

function adminTabLabel(tab) {
  const labels = {
    store: `${icon("shop")} Store Settings`,
    products: `${icon("box")} Products`,
    categories: `${icon("shop")} Categories`,
    shipping: `${icon("cart")} Shipping Cost`,
    orders: `${icon("save")} Orders`,
    statuses: `${icon("edit")} Order Status`,
    smtp: `${icon("mail")} SMTP Mail`,
    ai: `${icon("search")} AI Settings`,
    password: `${icon("admin")} Password`,
  };
  return labels[tab];
}

function renderAdminTab() {
  if (ui.adminTab === "store") return renderStoreAdmin();
  if (ui.adminTab === "categories") return renderCategoryAdmin();
  if (ui.adminTab === "shipping") return renderShippingAdmin();
  if (ui.adminTab === "orders") return renderOrdersAdmin();
  if (ui.adminTab === "statuses") return renderStatusAdmin();
  if (ui.adminTab === "smtp") return renderSmtpAdmin();
  if (ui.adminTab === "ai") return renderAiAdmin();
  if (ui.adminTab === "password") return renderPasswordAdmin();
  return renderProductAdmin();
}

function renderStoreAdmin() {
  const settings = storeSettings();
  return `
    <div class="panel-title">
      <h2>Store Settings</h2>
      <span class="status-chip">Storefront</span>
    </div>
    <div class="admin-grid">
      <form class="admin-form" data-store-settings-form>
        <label>Store name <input class="field" name="storeName" required value="${escapeHtml(settings.storeName)}" /></label>
        <label>Store logo <input class="field file-field" name="logo" type="file" accept="image/*" /></label>
        ${settings.logo ? `<div class="media-preview single"><img src="${settings.logo}" alt="${escapeHtml(settings.storeName)} logo" /></div>` : ""}
        <label>Storefront headline <textarea class="textarea-field" name="storefrontHeadline" required>${escapeHtml(settings.storefrontHeadline)}</textarea></label>
        <label>Storefront message <textarea class="textarea-field detail-textarea" name="storefrontMessage" required>${escapeHtml(settings.storefrontMessage)}</textarea></label>
        <button class="primary-btn" type="submit">${icon("save")} Save Store Settings</button>
      </form>
      <div class="panel smtp-help">
        <h3>Shown on storefront</h3>
        <p>These settings update the top navigation logo/name and the main storefront headline and message that buyers see.</p>
      </div>
    </div>
  `;
}

function renderProductAdmin() {
  const editing = ui.editingProductId ? productById(ui.editingProductId) : null;
  const existingImages = productImages(editing);
  return `
    <div class="panel-title">
      <h2>Product Management</h2>
      ${editing ? `<button class="ghost-btn" data-cancel-edit>Cancel Edit</button>` : ""}
    </div>
    <div class="admin-grid">
      <form class="admin-form" data-product-form>
        <input type="hidden" name="id" value="${editing ? editing.id : ""}" />
        <label>Product name <input class="field" name="name" required value="${escapeHtml(editing?.name || "")}" /></label>
        <label>Category
          <select class="select-field" name="categoryId" required>
            ${state.categories.map((category) => `<option value="${category.id}" ${editing?.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
          </select>
        </label>
        <div class="form-row">
          <label>Price <input class="field" name="price" type="number" min="0" required value="${editing?.price ?? ""}" /></label>
          <label>Stock <input class="field" name="stock" type="number" min="0" required value="${editing?.stock ?? ""}" /></label>
        </div>
        <div class="form-row">
          <label>Rating <input class="field" name="rating" type="number" min="1" max="5" step="0.1" required value="${editing?.rating ?? "4.5"}" /></label>
          <label>Color <input class="field" name="accent" type="color" required value="${editing?.accent || "#1aa7ec"}" /></label>
        </div>
        <label>Short description <textarea class="textarea-field" name="description" required>${escapeHtml(editing?.description || "")}</textarea></label>
        <label>Product details <textarea class="textarea-field detail-textarea" name="details" placeholder="Add full product details, benefits, materials, package contents, warranty, or care instructions.">${escapeHtml(editing?.details || "")}</textarea></label>
        <label>Product images <input class="field file-field" name="images" type="file" accept="image/*" multiple /></label>
        ${
          existingImages.length
            ? `<div class="media-preview">
                ${existingImages.map((image) => `<img src="${image}" alt="Existing product image" />`).join("")}
              </div>
              <label class="checkbox-line"><input type="checkbox" name="replaceImages" /> Replace existing images</label>`
            : ""
        }
        <label>YouTube links <textarea class="textarea-field" name="youtubeLinks" placeholder="One YouTube link per line">${escapeHtml(linksToText(editing?.youtubeLinks))}</textarea></label>
        <label>Review links <textarea class="textarea-field" name="reviewLinks" placeholder="One review link per line">${escapeHtml(linksToText(editing?.reviewLinks))}</textarea></label>
        <button class="secondary-btn" type="button" data-ai-product-fill>${icon("search")} AI เติมข้อมูลจากรูป</button>
        <button class="primary-btn" type="submit">${icon("save")} ${editing ? "Save Product" : "Add Product"}</button>
      </form>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.products.map((product) => `
              <tr>
                <td>
                  <span class="table-product-cell">
                    ${productImages(product)[0] ? `<img class="table-thumb" src="${productImages(product)[0]}" alt="${escapeHtml(product.name)}" />` : `<span class="swatch" style="--swatch: ${product.accent}"></span>`}
                    ${escapeHtml(product.name)}
                  </span>
                </td>
                <td>${escapeHtml(categoryById(product.categoryId).name)}</td>
                <td>${currency.format(product.price)}</td>
                <td>${product.stock}</td>
                <td class="table-actions">
                  <button class="secondary-btn" data-edit-product="${product.id}">${icon("edit")} Edit</button>
                  <button class="danger-btn" data-delete-product="${product.id}">${icon("trash")} Delete</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCategoryAdmin() {
  const editing = ui.editingCategoryId ? state.categories.find((category) => category.id === ui.editingCategoryId) : null;
  return `
    <div class="panel-title">
      <h2>Category Management</h2>
      ${editing ? `<button class="ghost-btn" data-cancel-category-edit>Cancel Edit</button>` : ""}
    </div>
    <div class="admin-grid">
      <form class="admin-form" data-category-form>
        <input type="hidden" name="id" value="${editing?.id || ""}" />
        <label>Category name <input class="field" name="name" required value="${escapeHtml(editing?.name || "")}" /></label>
        <label>Color <input class="field" name="color" type="color" value="${editing?.color || "#ff6b6b"}" required /></label>
        <label>Category image <input class="field file-field" name="image" type="file" accept="image/*" /></label>
        ${categoryImage(editing) ? `<div class="media-preview single"><img src="${categoryImage(editing)}" alt="${escapeHtml(editing.name)}" /></div>` : ""}
        <button class="primary-btn" type="submit">${icon("plus")} ${editing ? "Save Category" : "Add Category"}</button>
      </form>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Products</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.categories.map((category) => {
              const count = state.products.filter((product) => product.categoryId === category.id).length;
              return `
                <tr>
                  <td>
                    <span class="table-product-cell">
                      ${categoryImage(category) ? `<img class="table-thumb" src="${categoryImage(category)}" alt="${escapeHtml(category.name)}" />` : `<span class="swatch" style="--swatch: ${category.color}"></span>`}
                      ${escapeHtml(category.name)}
                    </span>
                  </td>
                  <td>${count}</td>
                  <td class="table-actions">
                    <button class="secondary-btn" data-edit-category="${category.id}">${icon("edit")} Edit</button>
                    <button class="danger-btn" data-delete-category="${category.id}" ${count ? "disabled" : ""}>${icon("trash")} Delete</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderShippingAdmin() {
  return `
    <div class="panel-title"><h2>Shipping Cost Management</h2></div>
    <div class="admin-grid">
      <form class="admin-form" data-shipping-form>
        <label>Shipping area <input class="field" name="zone" required /></label>
        <div class="form-row">
          <label>Cost <input class="field" name="cost" type="number" min="0" required /></label>
          <label>Free over <input class="field" name="freeOver" type="number" min="0" required /></label>
        </div>
        <label>Delivery time <input class="field" name="eta" required /></label>
        <button class="primary-btn" type="submit">${icon("plus")} Add Shipping</button>
      </form>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Area</th><th>Cost</th><th>Free Over</th><th>ETA</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.shippingCosts.map((ship) => `
              <tr>
                <td>${escapeHtml(ship.zone)}</td>
                <td>${currency.format(ship.cost)}</td>
                <td>${currency.format(ship.freeOver)}</td>
                <td>${escapeHtml(ship.eta)}</td>
                <td><button class="danger-btn" data-delete-shipping="${ship.id}" ${state.shippingCosts.length === 1 ? "disabled" : ""}>${icon("trash")} Delete</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrdersAdmin() {
  return `
    <div class="panel-title"><h2>Order Management</h2><span class="count-badge">${state.orders.length} orders</span></div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Order</th><th>Buyer</th><th>Total</th><th>Status</th><th>Items</th></tr></thead>
        <tbody>
          ${
            state.orders.map((order) => `
              <tr>
                <td><strong>${order.id}</strong><br><span class="muted">${new Date(order.createdAt).toLocaleString()}</span></td>
                <td>${escapeHtml(order.customer.name)}<br><span class="muted">${order.member ? "Member" : "Guest"} - ${escapeHtml(order.customer.email)}</span></td>
                <td>${currency.format(order.total)}</td>
                <td>
                  <select class="select-field" data-order-status="${order.id}">
                    ${state.orderStatuses.map((status) => `<option value="${escapeHtml(status)}" ${order.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
                  </select>
                </td>
                <td>${order.items.map((item) => `${escapeHtml(item.name)} x${item.qty}`).join("<br>")}</td>
              </tr>
            `).join("") || `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderStatusAdmin() {
  return `
    <div class="panel-title"><h2>Order Status Management</h2></div>
    <div class="admin-grid">
      <form class="admin-form" data-status-form>
        <label>Status name <input class="field" name="name" required /></label>
        <button class="primary-btn" type="submit">${icon("plus")} Add Status</button>
      </form>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Status</th><th>Orders</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.orderStatuses.map((status) => {
              const count = state.orders.filter((order) => order.status === status).length;
              return `
                <tr>
                  <td><span class="status-chip">${escapeHtml(status)}</span></td>
                  <td>${count}</td>
                  <td><button class="danger-btn" data-delete-status="${escapeHtml(status)}" ${count || state.orderStatuses.length === 1 ? "disabled" : ""}>${icon("trash")} Delete</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSmtpAdmin() {
  if (!ui.smtpSettings) {
    return `<div class="empty-state">Loading SMTP settings...</div>`;
  }
  const settings = ui.smtpSettings;
  return `
    <div class="panel-title">
      <h2>SMTP Mail Settings</h2>
      <span class="status-chip">${settings.enabled ? "Enabled" : "Disabled"}</span>
    </div>
    <div class="admin-grid">
      <form class="admin-form" data-smtp-form>
        <label class="checkbox-line smtp-check"><input type="checkbox" name="enabled" ${settings.enabled ? "checked" : ""} /> Enable website email sending</label>
        <div class="form-row">
          <label>SMTP host <input class="field" name="host" required value="${escapeHtml(settings.host || "smtp.gmail.com")}" /></label>
          <label>SMTP port <input class="field" name="port" type="number" required value="${settings.port || 587}" /></label>
        </div>
        <label>Security
          <select class="select-field" name="secure">
            <option value="false" ${!settings.secure ? "selected" : ""}>STARTTLS / TLS on port 587</option>
            <option value="true" ${settings.secure ? "selected" : ""}>SSL on port 465</option>
          </select>
        </label>
        <label>Gmail address <input class="field" name="username" type="email" autocomplete="username" required value="${escapeHtml(settings.username || "")}" /></label>
        <label>Gmail app password <input class="field" name="password" type="password" autocomplete="new-password" placeholder="${settings.passwordSet ? "Saved - leave blank to keep existing" : "16-character Gmail app password"}" ${settings.passwordSet ? "" : "required"} /></label>
        <div class="form-row">
          <label>From name <input class="field" name="fromName" required value="${escapeHtml(settings.fromName || "Japan Toy Shop")}" /></label>
          <label>From email <input class="field" name="fromEmail" type="email" required value="${escapeHtml(settings.fromEmail || settings.username || "")}" /></label>
        </div>
        <button class="primary-btn" type="submit">${icon("save")} Save SMTP</button>
      </form>
      <div class="panel smtp-help">
        <h3>Gmail setup</h3>
        <p>Use <strong>smtp.gmail.com</strong>, port <strong>587</strong>, and a Gmail App Password. Your normal Gmail password usually will not work.</p>
        <form class="admin-form" data-smtp-test-form>
          <label>Send test to <input class="field" name="to" type="email" required placeholder="you@example.com" /></label>
          <button class="secondary-btn" type="submit">${icon("mail")} Send Test Email</button>
        </form>
      </div>
    </div>
  `;
}

function renderPasswordAdmin() {
  return `
    <div class="panel-title">
      <h2>Change Admin Password</h2>
      <span class="status-chip">Protected</span>
    </div>
    <div class="admin-grid">
      <form class="admin-form" data-password-form>
        <label>Current password <input class="field" name="currentPassword" type="password" autocomplete="current-password" required /></label>
        <label>New password <input class="field" name="newPassword" type="password" autocomplete="new-password" minlength="6" required /></label>
        <label>Confirm new password <input class="field" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required /></label>
        <button class="primary-btn" type="submit">${icon("save")} Update Password</button>
      </form>
      <div class="panel smtp-help">
        <h3>After changing</h3>
        <p>You will be logged out automatically. Log in again with the new password to continue managing the backend.</p>
      </div>
    </div>
  `;
}

function providerSettings(provider) {
  return ui.aiSettings?.providers?.[provider] || {};
}

function renderAiProviderFields(provider, label, modelPlaceholder, endpoint = false) {
  const settings = providerSettings(provider);
  return `
    <div class="panel ai-provider-panel">
      <div class="panel-title">
        <h3>${label}</h3>
        <span class="status-chip">${settings.apiKeySet ? "Key saved" : "No key"}</span>
      </div>
      <label>Model <input class="field" name="${provider}Model" value="${escapeHtml(settings.model || "")}" placeholder="${modelPlaceholder}" /></label>
      ${endpoint ? `<label>Endpoint URI <input class="field" name="${provider}Endpoint" value="${escapeHtml(settings.endpoint || "")}" placeholder="https://api.example.com/v1/chat/completions" /></label>` : ""}
      <label>API key <input class="field" name="${provider}ApiKey" type="password" autocomplete="new-password" placeholder="${settings.apiKeySet ? "Saved - leave blank to keep existing" : "Paste API key"}" /></label>
    </div>
  `;
}

function renderAiAdmin() {
  if (!ui.aiSettings) {
    return `<div class="empty-state">Loading AI settings...</div>`;
  }
  return `
    <div class="panel-title">
      <h2>AI Product Autofill Settings</h2>
      <span class="status-chip">${escapeHtml(ui.aiSettings.defaultProvider)}</span>
    </div>
    <form class="admin-form ai-settings-form" data-ai-settings-form>
      <label>Default AI for product autofill
        <select class="select-field" name="defaultProvider">
          ${["openai", "gemini", "claude", "custom"].map((provider) => `<option value="${provider}" ${ui.aiSettings.defaultProvider === provider ? "selected" : ""}>${provider}</option>`).join("")}
        </select>
      </label>
      <div class="ai-provider-grid">
        ${renderAiProviderFields("openai", "OpenAI", "gpt-5-mini")}
        ${renderAiProviderFields("gemini", "Gemini", "gemini-2.5-flash")}
        ${renderAiProviderFields("claude", "Claude", "claude-sonnet-4-20250514")}
        ${renderAiProviderFields("custom", "Custom OpenAI-compatible", "your-model-name", true)}
      </div>
      <button class="primary-btn" type="submit">${icon("save")} Save AI Settings</button>
    </form>
  `;
}

function render() {
  const pageContent = ui.page === "admin" ? renderAdmin() : ui.page === "account" ? renderAccount() : ui.page === "product" ? renderProductDetailPage() : renderStore();
  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      ${pageContent}
      ${ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast)}</div>` : ""}
    </div>
  `;
}

function addToCart(productId) {
  const product = productById(productId);
  if (!product || product.stock < 1) return;
  const item = ui.cart.find((entry) => entry.productId === productId);
  if (item) {
    if (item.qty < product.stock) item.qty += 1;
  } else {
    ui.cart.push({ productId, qty: 1 });
  }
  persistCart();
  toast("Added to cart");
}

async function placeOrder(form) {
  const data = new FormData(form);
  const customer = {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    address: data.get("address"),
  };
  const response = await fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer,
      registerMember: data.get("registerMember") === "on",
      shippingId: data.get("shippingId"),
      items: ui.cart,
    }),
  });
  const result = await response.json().catch(() => ({ error: "Order failed" }));
  if (!response.ok) {
    throw new Error(result.error || "Order failed");
  }
  ui.cart = [];
  persistCart();
  await loadState();
  if (ui.customerAuthenticated) {
    ui.customerOrders = await fetch("/api/customer/orders").then((response) => response.json()).catch(() => ui.customerOrders);
  }
  toast(`Order ${result.order.id} placed`);
}

async function handleProductForm(form) {
  const data = new FormData(form);
  const id = data.get("id") || uid("prd");
  const existing = productById(id);
  const uploadedImages = await readImageFiles(form.elements.images);
  const existingImages = productImages(existing);
  const images = uploadedImages.length
    ? data.get("replaceImages") === "on"
      ? uploadedImages
      : [...existingImages, ...uploadedImages]
    : existingImages;
  const product = {
    id,
    name: data.get("name"),
    categoryId: data.get("categoryId"),
    price: Number(data.get("price")),
    stock: Number(data.get("stock")),
    rating: Number(data.get("rating")),
    accent: data.get("accent"),
    description: data.get("description"),
    details: data.get("details"),
    images,
    youtubeLinks: parseLinks(data.get("youtubeLinks")),
    reviewLinks: parseLinks(data.get("reviewLinks")),
  };
  const existingIndex = state.products.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.products[existingIndex] = product;
  else state.products.push(product);
  ui.editingProductId = null;
  await apiSave();
  toast("Product saved");
}

async function handleCategoryForm(form) {
  const data = new FormData(form);
  const id = data.get("id") || uid("cat");
  const existing = state.categories.find((category) => category.id === id);
  const uploadedImages = await readImageFiles(form.elements.image);
  const category = {
    id,
    name: data.get("name"),
    color: data.get("color"),
    image: uploadedImages[0] || existing?.image || "",
  };
  const existingIndex = state.categories.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.categories[existingIndex] = category;
  else state.categories.push(category);
  ui.editingCategoryId = null;
  await apiSave();
  toast("Category saved");
}

async function init() {
  await loadState();
  await loadCustomerSession();
  const session = await fetch("/api/admin/session").then((response) => response.json()).catch(() => ({ authenticated: false }));
  ui.adminAuthenticated = Boolean(session.authenticated);
  render();
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.page) {
    ui.page = button.dataset.page;
    if (ui.page === "store") {
      ui.selectedProductId = null;
      ui.selectedProductImageIndex = 0;
    }
    render();
    return;
  }

  if (button.dataset.backStore !== undefined) {
    ui.page = "store";
    ui.selectedProductId = null;
    ui.selectedProductImageIndex = 0;
    render();
    return;
  }

  if (button.dataset.scrollProducts !== undefined) {
    document.querySelector("#products")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (button.dataset.categoryFilter !== undefined) {
    ui.category = button.dataset.categoryFilter;
    render();
    return;
  }

  if (button.dataset.shippingOption) {
    ui.selectedShippingId = button.dataset.shippingOption;
    render();
    return;
  }

  if (button.dataset.adminTab) {
    ui.adminTab = button.dataset.adminTab;
    ui.editingProductId = null;
    ui.editingCategoryId = null;
    if (ui.adminTab === "smtp" && !ui.smtpSettings) {
      render();
      await loadSmtpSettings();
    }
    if (ui.adminTab === "ai" && !ui.aiSettings) {
      render();
      await loadAiSettings();
    }
    render();
    return;
  }

  if (button.dataset.adminLogout !== undefined) {
    await fetch("/api/admin/logout", { method: "POST" });
    ui.adminAuthenticated = false;
    render();
    toast("Logged out");
    return;
  }

  if (button.dataset.customerLogout !== undefined) {
    await fetch("/api/customer/logout", { method: "POST" });
    ui.customerAuthenticated = false;
    ui.customer = null;
    ui.customerAddresses = [];
    ui.customerOrders = [];
    render();
    toast("Logged out");
    return;
  }

  if (button.dataset.deleteAddress) {
    const response = await fetch(`/api/customer/addresses/${encodeURIComponent(button.dataset.deleteAddress)}`, { method: "DELETE" });
    ui.customerAddresses = await response.json();
    render();
    toast("Address deleted");
    return;
  }

  if (button.dataset.addCart) {
    addToCart(button.dataset.addCart);
    return;
  }

  if (button.dataset.aiProductFill !== undefined) {
    const form = button.closest("form");
    try {
      const id = new FormData(form).get("id");
      const existing = id ? productById(id) : null;
      const uploadedImages = await readImageFiles(form.elements.images);
      const imageDataUrl = uploadedImages[0] || productImages(existing)[0];
      if (!imageDataUrl) {
        throw new Error("กรุณาเลือกรูปสินค้าก่อนใช้ AI");
      }
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.textContent = "AI กำลังค้นหา...";
      const response = await fetch("/api/admin/ai/product-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          productNameHint: form.elements.name.value,
          categoryNames: state.categories.map((category) => category.name),
        }),
      });
      const result = await response.json().catch(() => ({ error: "AI fill failed" }));
      if (!response.ok) {
        throw new Error(result.error || "AI fill failed");
      }
      if (result.name) form.elements.name.value = result.name;
      if (result.description) form.elements.description.value = result.description;
      if (result.details) form.elements.details.value = result.details;
      if (result.estimatedPrice > 0) form.elements.price.value = Math.round(result.estimatedPrice);
      const suggestedCategoryId = categoryIdByName(result.categoryName);
      if (suggestedCategoryId) form.elements.categoryId.value = suggestedCategoryId;
      if (result.youtubeLinks?.length) form.elements.youtubeLinks.value = linksToText(result.youtubeLinks);
      if (result.reviewLinks?.length) form.elements.reviewLinks.value = linksToText(result.reviewLinks);
      passiveToast(result.notes ? `AI เติมข้อมูลแล้ว (${result.provider}): ${result.notes}` : `AI เติมข้อมูลสินค้าแล้ว (${result.provider})`);
    } catch (error) {
      passiveToast(error.message);
    } finally {
      button.disabled = false;
      if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
    }
    return;
  }

  if (button.dataset.viewProduct) {
    ui.selectedProductId = button.dataset.viewProduct;
    ui.selectedProductImageIndex = 0;
    ui.page = "product";
    render();
    return;
  }

  if (button.dataset.productImageIndex !== undefined) {
    ui.selectedProductImageIndex = Number(button.dataset.productImageIndex);
    render();
    return;
  }

  if (button.dataset.closeProductDetail !== undefined) {
    ui.selectedProductId = null;
    render();
    return;
  }

  if (button.dataset.cartInc) {
    addToCart(button.dataset.cartInc);
    return;
  }

  if (button.dataset.cartDec) {
    const item = ui.cart.find((entry) => entry.productId === button.dataset.cartDec);
    if (item) item.qty -= 1;
    ui.cart = ui.cart.filter((entry) => entry.qty > 0);
    persistCart();
    render();
    return;
  }

  if (button.dataset.editProduct) {
    ui.editingProductId = button.dataset.editProduct;
    render();
    return;
  }

  if (button.dataset.editCategory) {
    ui.editingCategoryId = button.dataset.editCategory;
    render();
    return;
  }

  if (button.dataset.cancelEdit !== undefined) {
    ui.editingProductId = null;
    render();
    return;
  }

  if (button.dataset.cancelCategoryEdit !== undefined) {
    ui.editingCategoryId = null;
    render();
    return;
  }

  if (button.dataset.deleteProduct) {
    state.products = state.products.filter((product) => product.id !== button.dataset.deleteProduct);
    ui.cart = ui.cart.filter((entry) => entry.productId !== button.dataset.deleteProduct);
    persistCart();
    await apiSave();
    toast("Product deleted");
    return;
  }

  if (button.dataset.deleteCategory) {
    state.categories = state.categories.filter((category) => category.id !== button.dataset.deleteCategory);
    await apiSave();
    toast("Category deleted");
    return;
  }

  if (button.dataset.deleteShipping) {
    state.shippingCosts = state.shippingCosts.filter((ship) => ship.id !== button.dataset.deleteShipping);
    await apiSave();
    toast("Shipping option deleted");
    return;
  }

  if (button.dataset.deleteStatus) {
    state.orderStatuses = state.orderStatuses.filter((status) => status !== button.dataset.deleteStatus);
    await apiSave();
    toast("Status deleted");
  }
});

app.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-product-detail]")) {
    ui.selectedProductId = null;
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.selectedProductId) {
    ui.selectedProductId = null;
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-search]")) {
    ui.search = event.target.value;
    render();
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.matches("[data-category-filter]")) {
    ui.category = event.target.value;
    render();
  }
  if (event.target.matches("[data-sort]")) {
    ui.sort = event.target.value;
    render();
  }
  if (event.target.matches("[data-checkout] [name='shippingId']")) {
    ui.selectedShippingId = event.target.value;
    render();
  }
  if (event.target.matches("[data-address-select]")) {
    const address = ui.customerAddresses.find((item) => item.id === event.target.value);
    const form = event.target.closest("form");
    if (address && form) {
      form.elements.name.value = address.recipientName;
      form.elements.phone.value = address.phone;
      form.elements.address.value = address.address;
    }
  }
  if (event.target.matches("[data-order-status]")) {
    const order = state.orders.find((item) => item.id === event.target.dataset.orderStatus);
    if (order) {
      order.status = event.target.value;
      await apiSave();
      toast("Order status updated");
    }
  }
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.matches("[data-checkout]")) await placeOrder(form);
    if (form.matches("[data-customer-register]")) {
      const data = new FormData(form);
      const response = await fetch("/api/customer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          password: data.get("password"),
        }),
      });
      const result = await response.json().catch(() => ({ error: "Register failed" }));
      if (!response.ok) throw new Error(result.error || "Register failed");
      toast("Registration email sent. Please confirm your email.");
    }
    if (form.matches("[data-customer-login]")) {
      const data = new FormData(form);
      const response = await fetch("/api/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json().catch(() => ({ error: "Login failed" }));
      if (!response.ok) throw new Error(result.error || "Login failed");
      await loadCustomerSession();
      toast("Customer logged in");
    }
    if (form.matches("[data-customer-profile]")) {
      const data = new FormData(form);
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), phone: data.get("phone") }),
      });
      const result = await response.json().catch(() => ({ error: "Profile save failed" }));
      if (!response.ok) throw new Error(result.error || "Profile save failed");
      ui.customer = result;
      toast("Profile saved");
    }
    if (form.matches("[data-customer-address]")) {
      const data = new FormData(form);
      const response = await fetch("/api/customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.get("id"),
          label: data.get("label"),
          recipientName: data.get("recipientName"),
          phone: data.get("phone"),
          address: data.get("address"),
          isDefault: data.get("isDefault") === "on",
        }),
      });
      const result = await response.json().catch(() => ({ error: "Address save failed" }));
      if (!response.ok) throw new Error(result.error || "Address save failed");
      ui.customerAddresses = result;
      form.reset();
      toast("Address saved");
    }
    if (form.matches("[data-admin-login]")) {
      const data = new FormData(form);
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.get("password") }),
      });
      const result = await response.json().catch(() => ({ error: "Login failed" }));
      if (!response.ok) throw new Error(result.error || "Login failed");
      ui.adminAuthenticated = true;
      if (ui.adminTab === "smtp") await loadSmtpSettings();
      if (ui.adminTab === "ai") await loadAiSettings();
      toast("Logged in");
    }
    if (form.matches("[data-product-form]")) await handleProductForm(form);
    if (form.matches("[data-category-form]")) await handleCategoryForm(form);
    if (form.matches("[data-store-settings-form]")) {
      const data = new FormData(form);
      const uploadedLogo = await readImageFiles(form.elements.logo);
      const response = await fetch("/api/admin/store-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: data.get("storeName"),
          logo: uploadedLogo[0] || storeSettings().logo || "",
          storefrontHeadline: data.get("storefrontHeadline"),
          storefrontMessage: data.get("storefrontMessage"),
        }),
      });
      const result = await response.json().catch(() => ({ error: "Store settings save failed" }));
      if (!response.ok) throw new Error(result.error || "Store settings save failed");
      state.storeSettings = result;
      toast("Store settings saved");
    }
    if (form.matches("[data-shipping-form]")) {
      const data = new FormData(form);
      state.shippingCosts.push({
        id: uid("ship"),
        zone: data.get("zone"),
        cost: Number(data.get("cost")),
        freeOver: Number(data.get("freeOver")),
        eta: data.get("eta"),
      });
      await apiSave();
      toast("Shipping option added");
    }
    if (form.matches("[data-status-form]")) {
      const data = new FormData(form);
      const name = String(data.get("name")).trim();
      if (name && !state.orderStatuses.includes(name)) {
        state.orderStatuses.push(name);
        await apiSave();
        toast("Status added");
      }
    }
    if (form.matches("[data-smtp-form]")) {
      const data = new FormData(form);
      const response = await fetch("/api/admin/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: data.get("enabled") === "on",
          host: data.get("host"),
          port: Number(data.get("port")),
          secure: data.get("secure") === "true",
          username: data.get("username"),
          password: data.get("password"),
          fromName: data.get("fromName"),
          fromEmail: data.get("fromEmail"),
        }),
      });
      const result = await response.json().catch(() => ({ error: "SMTP save failed" }));
      if (!response.ok) throw new Error(result.error || "SMTP save failed");
      ui.smtpSettings = result;
      toast("SMTP settings saved");
    }
    if (form.matches("[data-smtp-test-form]")) {
      const data = new FormData(form);
      const response = await fetch("/api/admin/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: data.get("to") }),
      });
      const result = await response.json().catch(() => ({ error: "Test email failed" }));
      if (!response.ok) throw new Error(result.error || "Test email failed");
      toast("Test email sent");
    }
    if (form.matches("[data-ai-settings-form]")) {
      const data = new FormData(form);
      const response = await fetch("/api/admin/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider: data.get("defaultProvider"),
          providers: {
            openai: { model: data.get("openaiModel"), apiKey: data.get("openaiApiKey") },
            gemini: { model: data.get("geminiModel"), apiKey: data.get("geminiApiKey") },
            claude: { model: data.get("claudeModel"), apiKey: data.get("claudeApiKey") },
            custom: { model: data.get("customModel"), endpoint: data.get("customEndpoint"), apiKey: data.get("customApiKey") },
          },
        }),
      });
      const result = await response.json().catch(() => ({ error: "AI settings save failed" }));
      if (!response.ok) throw new Error(result.error || "AI settings save failed");
      ui.aiSettings = result;
      toast("AI settings saved");
    }
    if (form.matches("[data-password-form]")) {
      const data = new FormData(form);
      const newPassword = String(data.get("newPassword"));
      const confirmPassword = String(data.get("confirmPassword"));
      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
      }
      const response = await fetch("/api/admin/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword,
        }),
      });
      const result = await response.json().catch(() => ({ error: "Password update failed" }));
      if (!response.ok) throw new Error(result.error || "Password update failed");
      ui.adminAuthenticated = false;
      ui.adminTab = "products";
      toast("Password updated. Please log in again.");
    }
    render();
  } catch (error) {
    toast(error.message);
  }
});

init().catch((error) => {
  app.innerHTML = `<main class="page"><div class="empty-state">${escapeHtml(error.message)}</div></main>`;
});
