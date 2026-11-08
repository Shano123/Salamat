# RSBRI Fashion — Shopify theme setup guide

This theme is **Shopify Dawn** (Shopify's free official theme, version 16.1.1) set up for RSBRI Fashion:

- navy, gold and ivory colours, with red used only for sale badges
- Playfair Display headings
- the RSBRI logo in the header
- an announcement bar, home page layout and footer written for RSBRI
- a floating WhatsApp chat button
- an "Order on WhatsApp" button on product pages
- a free-delivery progress bar in the cart
- a size chart pop-up, plus Delivery & exchange and Fabric & care sections on product pages
- set up for **unstitched suits only** (no clothing sizes; each suit lists its fabric lengths)
- Urdu (right-to-left) support

Follow the steps in order. You don't need to write any code.

---

## Step 1 — Upload the theme

1. Log in to **Shopify admin** (shopify.com/admin, or the Shopify app).
2. Go to **Online Store → Themes**.
3. Scroll to **Theme library**, press **Add theme**, then **Upload zip file**.
4. Choose **`RSBRI-Shopify-theme.zip`** and wait until it shows "RSBRI Fashion".
5. Press **Customize** to see it. Press **Publish** when you're happy. Shopify only lets you publish after you choose a paid plan, but you can customise during the trial.

## Step 2 — Your WhatsApp number (Customize → Theme settings → RSBRI)

1. In **Customize**, click the **gear icon** (Theme settings), then **RSBRI**.
2. **WhatsApp number:** country code first, digits only, for example `923001234567`.
3. Turn the floating chat button and "Order on WhatsApp" on or off.
4. **Free delivery from (Rs.):** 3000. This only changes the message in the cart. Step 6 sets the real free-delivery rate.
5. Press **Save**.

The WhatsApp buttons stay hidden until a number is entered.

## Step 3 — Logo

The RSBRI logo already shows in the header. To use a sharper file, go to **Theme settings → Logo**, upload your logo (PNG with transparent background) and set **Logo width** to about 150.

## Step 4 — Products and collections

1. **Products → Add product.** For each product:
   - **Title**, **Description**, **Media** (2–5 photos, portrait 3:4 looks best).
   - **Price**, and **Compare-at price** for the old price. This shows the red **Sale** badge.
   - **Variants:** suits are unstitched, so they have **no clothing sizes**. Add only *Colour* for suits, and *Bed size* (Single, Double, King) plus *Colour* for bedding. Enter **stock** for each one.
   - In the **Description**, list the fabric in each piece, for example: *Shirt 3 m · Dupatta 2.5 m · Trouser 2.5 m*.
2. **Products → Collections → Create collection.** Suggested collections:
   - Lawn Suits
   - Cotton & Cambric
   - Winter Suits (khaddar, karandi, marina, linen)
   - Formal & Party Wear (chiffon, velvet, organza, silk)
   - Dupattas & Shawls
   - Bedsheets
   - Mattress Covers
   - Sale (set it to automatic: "Compare-at price is greater than 0")
3. In **Customize → Home page**, open these sections and pick your collections:
   - **Shop by category:** choose one collection for each of the 4 blocks.
   - **New In** and **Best Sellers:** choose a collection, or leave "All".
   - **Slideshow** and **Image with text:** upload banner photos (wide, at least 1600 px). Change each button link from "All products" to the right collection.

## Step 5 — Menus (Online Store → Navigation)

- **Main menu:** New In · Unstitched (with Lawn, Cotton & Cambric, Winter, Formal & Party, Dupattas under it) · Bedding & Home (with Bedsheets, Mattress Covers) · Sale
- **Footer menu:** Contact · Delivery information · Exchange & returns · Tailoring size chart · Track your order · Privacy policy

## Step 6 — Delivery (Settings → Shipping and delivery)

Create one shipping zone, **Pakistan**, with these rates:

| Rate | Price | Condition |
|---|---|---|
| Standard delivery | Rs. 250 | — |
| Free delivery | Rs. 0 | Order price Rs. 3,000 and up |

The Rs. 200 Faisalabad rate isn't in this table because Shopify's built-in rates can't price by city. A courier app can, or keep one Rs. 250 rate to start.

## Step 7 — Cash on Delivery (Settings → Payments)

**Manual payment methods → Cash on Delivery (COD) → Activate.** You can start selling with this alone.

Apply for **JazzCash**, **Easypaisa** and a card payment service (for example **PayFast** or **Safepay**). Each has a Shopify app or plugin, and approval takes a few weeks.

## Step 8 — Pages (Online Store → Pages)

Create these pages and paste in your text:

- **Tailoring size chart:** body measurements to give the tailor, plus the fabric length of each piece. Then go to **Customize → Products → Default product → "Size chart" pop-up** and choose this page.
- **Delivery information**
- **Exchange & returns**
- **Contact**
- **About RSBRI**

Policies go in **Settings → Policies**.

## Step 9 — Urdu store (optional, after launch)

1. **Settings → Languages → Add language → Urdu**, then **Publish**.
2. Install the free **Translate & Adapt** app (by Shopify) to translate product names and pages.
3. The theme turns the Urdu store **right-to-left** and uses the **Noto Nastaliq Urdu** font. The main buttons (Add to cart, Sold out, Cart, Checkout) and the RSBRI messages are already translated. Everything else shows English until you translate it in Translate & Adapt.
4. A language switcher appears in the header and footer once Urdu is published.

Shopify's own checkout pages follow Shopify's language support. Check them after adding Urdu.

## Step 10 — Apps worth adding

| Need | Search the Shopify App Store for |
|---|---|
| Courier booking & tracking | "Leopards" and "TCS" |
| COD confirmation by WhatsApp | "COD confirmation WhatsApp" |
| Affiliates | "UpPromote" or "GoAffPro" |
| Product reviews | "Judge.me" |

## Where the RSBRI changes are (for a developer)

| File | What it does |
|---|---|
| `assets/rsbri.css` | RSBRI styling: gold accents, button style, WhatsApp, free-delivery bar, right-to-left rules |
| `snippets/rsbri-*.liquid` | Logo fallback, WhatsApp float, Order-on-WhatsApp, free-delivery bar, WhatsApp icon |
| `layout/theme.liquid` | Loads `rsbri.css`, Urdu font and `dir="rtl"`, renders the WhatsApp float |
| `sections/header.liquid` | Shows the RSBRI logo until one is uploaded |
| `snippets/cart-drawer.liquid`, `sections/main-cart-footer.liquid` | Free-delivery bar |
| `config/settings_schema.json` | Adds the **RSBRI** settings panel |
| `config/settings_data.json`, `sections/*-group.json`, `templates/index.json`, `templates/product.json` | RSBRI colours, fonts, texts and layout |
| `locales/en.default.json`, `locales/ur.json` | RSBRI texts in English and Urdu |

When Shopify releases a new Dawn version, these are the only places to carry over.
