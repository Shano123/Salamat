# RSBRI Fashion — storefront prototype

A clickable, mobile-first storefront built from the **RSBRI Fashion Website PRD v2.0 (Pakistan edition)**. It covers every Phase 1 page, so the brand, layout and shopping flow can be reviewed and tested before the production build (Shopify or Next.js, PRD §13).

**Run it:** open `index.html` in a browser, or serve the folder from any static host. There is no build step and no backend. The cart, wishlist, orders and sign-in are saved in the browser's localStorage.

## What's included (mapped to the PRD)

| PRD | Built |
|---|---|
| §4 Brand | Champagne-ivory / ink / navy-blue palette with gold detailing, red only for sale. Cormorant Garamond headings + Inter body. Mughal-arch motif. |
| §5 Country stores & language | English `/en-pk/` and Urdu `/ur-pk/` (right-to-left, Noto Nastaliq Urdu, header/menu switch), hreflang for both; header + footer country selector (PK live; UAE/KSA/UK "coming soon" with waitlist), +92 phone validation, Pakistani city dropdown, **nearest landmark** field, PKT delivery promises. |
| §7 Navigation | Announcement bar, mega-menu (desktop), drawer (mobile), full footer, floating WhatsApp, cookie banner. |
| Catalogue | Unstitched suits only (Lawn, Cotton & Cambric, Winter, Formal & Party, Dupattas), each with fabric lengths per piece; no clothing sizes. Bedding & Home as before. |
| §8.1 Home | Hero slider with separate mobile art (H-1), department tiles (H-2), category circles (H-3), New In + Best Sellers carousels (H-4), deal strip with countdown (H-5), trust strip (H-6), shoppable social gallery (H-7), WhatsApp/email opt-in (H-8). |
| §8.2 Listing | 2/4-column grid with second image on hover, department-specific filters (women: type, pieces, fabric, size, colour, occasion, price; bedding: category, bed size, thread count, material, pieces, colour, price), 6 sort options, badges, quick view + quick add, "Load more" with `?page=` URLs. |
| §8.3 Product | Gallery + zoom + fabric close-up, price / strike-through / % saved, colour + size / bed-size selectors with sold-out greyed, size guides (in/cm), pieces & metres, care, delivery estimate by city, Add to bag / Buy now / Wishlist / Share on WhatsApp / Order on WhatsApp, Complete the look / Matching cushions, back-in-stock alert, recently viewed, Product JSON-LD. |
| §8.4 Search, cart, account | Predictive search with Roman-Urdu synonyms (chadar → bedsheet, razai → quilt, kameez → kurti…), mini cart + cart page, free-delivery progress bar, discount codes (`WELCOME10`, `EID500`), gift wrap, mobile + OTP sign-in, orders, re-order, saved address, exchange request. |
| §10 Checkout | One page: mobile → address → delivery (standard / express by city) → payment (COD, JazzCash, Easypaisa, cards via gateway, bank/IBFT/Raast), Rs. 100 prepaid incentive, COD cap, confirmation with WhatsApp confirm + order-status timeline, order tracking. |
| Other pages | About, Contact, Delivery, Exchange & Returns, Size Guide, Bedsheet Size Guide, FAQ, Fabric & Care, Privacy, Terms, Gift Cards, Journal, 404. |

## Store settings

- **Logo:** `assets/logo.webp` (header) and `assets/logo-light.webp` (dark footer), made from the brand logo file.
- **Warehouse:** Faisalabad. Delivery zones, times and express cities are set per city in `CITIES` in `assets/data.js`.
- **Free delivery:** orders over Rs. 3,000 (`STORE.freeDeliveryThreshold`).
- **Urdu:** interface text is translated in `assets/i18n.js`. Product names, fabric names and city names stay in English. Copy with inline formatting uses `T(english, urdu)` in `assets/app.js`.

## Back office (demo): stock, staff access, affiliates

Open **Staff login** in the footer (`#/en-pk/admin`). Demo accounts: Rizwan / Owner / PIN 1234, Sana / Order staff / 2222, Bilal / Stock keeper / 3333.

| Section | What it does in the prototype | On the live Shopify store |
|---|---|---|
| Overview | Sales today, COD orders waiting for confirmation, share paid online, low-stock and sold-out counts, affiliate sales | Shopify admin home and Analytics |
| Orders | Filter by status, move orders through Pending → Confirmed → Packed → Dispatched → Delivered, or cancel. Cancelling returns the items to stock. | Shopify Orders, plus a COD-confirmation app and the Leopards/TCS apps for booking |
| Stock | One quantity for each product, colour and size. Search, filter low or sold out, adjust with − / + / +10, set the low-stock alert level. The shop shows "Only N left", greys out sold-out sizes, stops the bag going over stock, and takes stock off when an order is placed. | Shopify Products → Inventory (per variant, CSV import/export, low-stock reports) |
| Staff & access | Add staff, give each one a role (Owner, Manager, Order staff, Stock keeper, Content editor), disable accounts, reset PINs. There is always at least one owner. A role only sees its own sections. | Shopify Settings → Users and permissions (staff accounts with their own logins, two-step verification, per-section permissions) |
| Affiliates | Set the commission %, customer discount % and link window (days). Approve, pause and add affiliates, copy links, record payouts. Each affiliate code works as a discount code and in a link (`?ref=CODE`). Commission is pending until the order is delivered. | An affiliate app from the Shopify App Store (for example UpPromote or GoAffPro), with payouts by JazzCash, Easypaisa or bank |
| Activity | Who changed what and when: stock, orders, staff, affiliates, sign-ins | Shopify's staff activity and order timeline |

Public affiliate sign-up page: footer → **Become an affiliate** (`#/en-pk/affiliates`), in English and Urdu.

The prototype keeps all of this in the browser's localStorage, so it is for trying the flows only. It is not secure (PINs are stored in the browser) and not shared between devices. The live store must use Shopify's own staff accounts.

## Placeholders to replace before launch

- **Imagery:** every product and banner image is generated SVG artwork (`assets/art.js`). Replace it with real photography (WebP, through a CDN).
- **Catalogue:** `assets/data.js` holds 31 demo products. Replace it with the real product feed.
- **WhatsApp number:** `STORE.whatsapp` in `assets/data.js`.
- **Payments, couriers, OTP and sign-in** are simulated in the prototype. Connect them to the real gateway, courier and SMS APIs in the production build.
- **Policy copy** (privacy, terms, bank details) is placeholder text. Have it reviewed by your legal and tax advisers.

## Files

```
index.html          page shell, header, footer, drawers, icons
assets/styles.css   design system and all components
assets/data.js      store settings, cities, categories, products, search synonyms
assets/art.js       SVG placeholder artwork generator
assets/app.js       routing, pages, cart, checkout, search, account
```
