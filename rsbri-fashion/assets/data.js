/* RSBRI Fashion — catalogue data (demo content; replace with the real product feed). */
(function () {
  'use strict';

  var STORE = {
    code: 'en-pk',
    currency: 'Rs.',
    freeDeliveryThreshold: 3000,
    deliveryFee: 250,
    expressFee: 450,
    giftWrapFee: 250,
    prepaidDiscount: 100,
    whatsapp: '923001234567', // PLACEHOLDER — business WhatsApp number, country code first, digits only (e.g. 923XXXXXXXXX)
    couriers: ['Leopards', 'TCS'],
    facebook: 'https://www.facebook.com/RSBRiFashion/',
    discountCodes: { WELCOME10: { type: 'pct', value: 10, label: '10% off your first order' }, EID500: { type: 'flat', value: 500, min: 5000, label: 'Rs. 500 off orders over Rs. 5,000' } }
  };

  var COUNTRIES = [
    { code: 'pk', name: 'Pakistan', flag: '🇵🇰', currency: 'PKR', live: true },
    { code: 'ae', name: 'United Arab Emirates', flag: '🇦🇪', currency: 'AED', live: false },
    { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR', live: false },
    { code: 'gb', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', live: false }
  ];

  var CITIES = [
    /* Warehouse: Faisalabad. zone drives the delivery fee; express = next-working-day lanes. */
    { name: 'Faisalabad', zone: 'local', days: '1–2', express: true },
    { name: 'Lahore', zone: 'major', days: '1–2', express: true },
    { name: 'Karachi', zone: 'major', days: '2–4' },
    { name: 'Islamabad', zone: 'major', days: '2–3', express: true },
    { name: 'Rawalpindi', zone: 'major', days: '2–3', express: true },
    { name: 'Multan', zone: 'major', days: '2–3' },
    { name: 'Peshawar', zone: 'major', days: '2–4' },
    { name: 'Quetta', zone: 'rest', days: '4–7' },
    { name: 'Sialkot', zone: 'major', days: '2–3' },
    { name: 'Gujranwala', zone: 'major', days: '2–3' },
    { name: 'Hyderabad', zone: 'major', days: '3–4' },
    { name: 'Bahawalpur', zone: 'rest', days: '3–5' },
    { name: 'Sargodha', zone: 'rest', days: '3–5' },
    { name: 'Sukkur', zone: 'rest', days: '4–6' },
    { name: 'Abbottabad', zone: 'rest', days: '3–5' },
    { name: 'Mardan', zone: 'rest', days: '3–5' },
    { name: 'Gilgit', zone: 'rest', days: '5–7' },
    { name: 'Muzaffarabad', zone: 'rest', days: '4–6' },
    { name: 'Other city', zone: 'rest', days: '4–7' }
  ];

  var DEPARTMENTS = {
    women: {
      name: 'Women',
      blurb: 'Unstitched lawn to luxury formals — designed in Pakistan, made for every season.',
      cats: [
        { slug: 'unstitched', name: 'Unstitched', note: 'Lawn, Cambric, Khaddar, Karandi, Velvet, Chiffon' },
        { slug: 'pret', name: 'Ready-to-Wear', note: 'Kurtis, Suits, Co-ords' },
        { slug: 'luxury-pret', name: 'Luxury Pret & Formals' },
        { slug: 'bridal', name: 'Bridal & Wedding Wear' },
        { slug: 'bottoms', name: 'Bottoms', note: 'Trousers, Shalwar, Palazzo' },
        { slug: 'dupattas', name: 'Dupattas, Shawls & Stoles' },
        { slug: 'abayas', name: 'Abayas & Modest Wear' },
        { slug: 'nightwear', name: 'Nightwear & Loungewear' }
      ]
    },
    home: {
      name: 'Bedding & Home',
      blurb: 'Bedsheets, bridal sets and comforters in pure cotton and sateen — sized for Pakistani beds.',
      cats: [
        { slug: 'bedsheets', name: 'Bedsheets', note: 'Single, Double, King' },
        { slug: 'bridal-bed-sets', name: 'Bridal Bed Sets' },
        { slug: 'comforters', name: 'Comforter Sets' },
        { slug: 'duvets-quilts', name: 'Duvet Covers & Quilts (Razai)' },
        { slug: 'blankets', name: 'Blankets' },
        { slug: 'pillows', name: 'Pillows & Pillow Covers' },
        { slug: 'cushions', name: 'Cushions & Throws' },
        { slug: 'mattress-protectors', name: 'Mattress Protectors' }
      ]
    }
  };

  var COLLECTIONS = [
    { slug: 'summer-lawn', name: 'Summer Lawn', blurb: 'Breathable printed lawn for long Pakistani summers.', tone: ['#E9E4D8', '#1B2F5E', '#C9A23F'] },
    { slug: 'eid-edit', name: 'The Eid Edit', blurb: 'Festive pieces and gifting for Eid ul Fitr and Eid ul Adha.', tone: ['#1B2F5E', '#EDE6D6', '#D4AF4A'] },
    { slug: 'winter', name: 'Winter', blurb: 'Khaddar, karandi and velvet — warmth with craft.', tone: ['#3B3A4A', '#D9CBB3', '#A77B4F'] },
    { slug: 'wedding-season', name: 'Wedding Season', blurb: 'Formals and bridal bedding for shaadi season.', tone: ['#142650', '#F1E9D8', '#C9A23F'] }
  ];

  var SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  var BED_SIZES = [
    { name: 'Single', dims: '60 × 90 in (152 × 229 cm)' },
    { name: 'Double', dims: '90 × 100 in (229 × 254 cm)' },
    { name: 'King', dims: '100 × 108 in (254 × 274 cm)' },
    { name: 'Super King', dims: '108 × 108 in (274 × 274 cm)' }
  ];

  /* Compact product definitions. Prices in PKR, inclusive of sales tax. */
  var RAW = [
    // ---------- Women · Unstitched ----------
    ['Gulnar Embroidered Lawn', 'women', 'unstitched', 'summer-lawn', 'Lawn', 3, 6490, 4990, [['Rose', '#C98B8B'], ['Sage', '#8FA58C']], 'floral', 'folded', { occasion: 'Casual', embroidery: 'Neckline & daaman embroidery', badges: ['new', 'best'] }],
    ['Mehtab Printed Lawn 2-Piece', 'women', 'unstitched', 'summer-lawn', 'Lawn', 2, 3990, 0, [['Indigo', '#3F5277'], ['Mustard', '#C8A04A']], 'paisley', 'folded', { occasion: 'Casual', badges: ['new'] }],
    ['Saba Chikankari Lawn', 'women', 'unstitched', 'eid-edit', 'Lawn', 3, 8990, 0, [['Ivory', '#EDE3CF'], ['Mint', '#A9C9B8']], 'lattice', 'folded', { occasion: 'Festive', embroidery: 'Chikankari front', badges: ['best'] }],
    ['Noor Cambric Suit', 'women', 'unstitched', 'winter', 'Cambric', 3, 5490, 3990, [['Plum', '#6A3B55'], ['Teal', '#2F6B6B']], 'dots', 'folded', { occasion: 'Everyday', badges: [] }],
    ['Zarmeena Khaddar 3-Piece', 'women', 'unstitched', 'winter', 'Khaddar', 3, 6990, 0, [['Rust', '#A4532F'], ['Olive', '#6C6B3A']], 'check', 'folded', { occasion: 'Everyday', badges: ['new'], lowStock: true }],
    ['Shahana Velvet Shawl Suit', 'women', 'unstitched', 'wedding-season', 'Velvet', 3, 18990, 0, [['Bottle Green', '#1F4A3C'], ['Maroon', '#5E1A28']], 'lattice', 'folded', { occasion: 'Formal', embroidery: 'Zari & sequins', badges: [] }],
    ['Laila Karandi Suit', 'women', 'unstitched', 'winter', 'Karandi', 3, 7990, 5590, [['Charcoal', '#3D3B3C'], ['Camel', '#B48A5E']], 'stripe', 'folded', { occasion: 'Everyday', badges: ['best'] }],
    ['Areeba Chiffon Festive', 'women', 'unstitched', 'eid-edit', 'Chiffon', 3, 12990, 0, [['Blush', '#E5B9B0'], ['Powder Blue', '#A9BFD6']], 'floral', 'folded', { occasion: 'Festive', embroidery: 'Hand-finished tilla', badges: ['new'] }],

    // ---------- Women · Pret ----------
    ['Hira Printed Kurti', 'women', 'pret', 'summer-lawn', 'Lawn', 1, 2990, 0, [['Coral', '#D98166'], ['Navy', '#2B3A55']], 'floral', 'kurta', { occasion: 'Casual', stitched: true, badges: ['new', 'best'] }],
    ['Iman Co-ord Set', 'women', 'pret', 'summer-lawn', 'Linen', 2, 5990, 4490, [['Sand', '#D3B98F'], ['Moss', '#5E6D4A']], 'stripe', 'kurta', { occasion: 'Casual', stitched: true, badges: [] }],
    ['Rania Embroidered Suit', 'women', 'pret', 'eid-edit', 'Cambric', 3, 8490, 0, [['Teal', '#2F6B6B'], ['Wine', '#6B2737']], 'paisley', 'kurta', { occasion: 'Festive', stitched: true, badges: ['best'], soldOut: ['XS'] }],
    ['Kiran Khaddar Kurta', 'women', 'pret', 'winter', 'Khaddar', 1, 3990, 2790, [['Mustard', '#C8A04A'], ['Black', '#262424']], 'check', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],

    // ---------- Women · Luxury / Bridal ----------
    ['Mahnoor Organza Formal', 'women', 'luxury-pret', 'wedding-season', 'Organza', 3, 24990, 0, [['Champagne', '#E2CFA8'], ['Rose Gold', '#C99A8A']], 'lattice', 'kurta', { occasion: 'Formal', stitched: true, embroidery: 'Dabka, zardozi', badges: ['new'] }],
    ['Zoya Silk Pishwas', 'women', 'luxury-pret', 'eid-edit', 'Silk', 2, 19990, 15990, [['Emerald', '#1F5A45'], ['Ruby', '#8E2234']], 'floral', 'kurta', { occasion: 'Formal', stitched: true, badges: [] }],
    ['Rukhsati Bridal Lehenga', 'women', 'bridal', 'wedding-season', 'Silk', 3, 89990, 0, [['Bridal Red', '#8E1B2A'], ['Gold', '#B88A3A']], 'lattice', 'kurta', { occasion: 'Bridal', stitched: true, embroidery: 'Hand zardozi, kora, dabka', badges: [], lowStock: true }],

    // ---------- Women · Others ----------
    ['Straight Cotton Trouser', 'women', 'bottoms', null, 'Cambric', 1, 1990, 0, [['White', '#F1EEE7'], ['Black', '#262424']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: ['best'] }],
    ['Kashmiri Pashmina Shawl', 'women', 'dupattas', 'winter', 'Wool', 1, 6990, 0, [['Fawn', '#C4A57F'], ['Maroon', '#5E1A28']], 'paisley', 'dupatta', { occasion: 'Everyday', badges: ['new'] }],
    ['Nida Classic Abaya', 'women', 'abayas', null, 'Nida', 1, 7490, 5990, [['Black', '#232122'], ['Taupe', '#857463']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Lounge Lawn Pyjama Set', 'women', 'nightwear', 'summer-lawn', 'Lawn', 2, 3490, 0, [['Lilac', '#B7A5C9'], ['Peach', '#E8B79A']], 'dots', 'kurta', { occasion: 'Lounge', stitched: true, badges: [] }],

    // ---------- Home ----------
    ['Shireen Percale Bedsheet', 'home', 'bedsheets', null, 'Percale', 3, 4990, 3490, [['White', '#F3F0EA'], ['Dusty Rose', '#D4A6A1'], ['Grey', '#A9A6A3']], 'stripe', 'bed', { threadCount: 300, badges: ['best'] }],
    ['Bahaar Printed Cotton Bedsheet', 'home', 'bedsheets', 'summer-lawn', 'Cotton', 3, 3290, 0, [['Blue Floral', '#6E8DB5'], ['Green Floral', '#7EA27A']], 'floral', 'bed', { threadCount: 180, badges: ['new'] }],
    ['Shahi Sateen Bedsheet', 'home', 'bedsheets', 'eid-edit', 'Sateen', 3, 6990, 0, [['Ivory', '#EDE3CF'], ['Champagne', '#D8C29B'], ['Charcoal', '#4A4847']], 'plain', 'bed', { threadCount: 400, badges: [] }],
    ['Dulhan 8-Piece Bridal Bed Set', 'home', 'bridal-bed-sets', 'wedding-season', 'Sateen', 8, 34990, 27990, [['Royal Blue & Gold', '#1B2F5E'], ['Ivory & Gold', '#E9DCC0']], 'lattice', 'bed', { threadCount: 400, badges: ['best'], bridal: true }],
    ['Mehndi 10-Piece Bridal Set', 'home', 'bridal-bed-sets', 'wedding-season', 'Velvet', 10, 49990, 0, [['Emerald & Gold', '#1F4A3C'], ['Red & Gold', '#8E1B2A']], 'paisley', 'bed', { threadCount: 300, badges: ['new'], bridal: true, lowStock: true }],
    ['Cloud Microfibre Comforter Set', 'home', 'comforters', 'winter', 'Microfibre', 6, 14990, 11990, [['Silver', '#BDBAB6'], ['Blush', '#E5C4BC']], 'check', 'bed', { threadCount: 220, gsm: 300, badges: ['best'] }],
    ['Ajrak Cotton Razai', 'home', 'duvets-quilts', 'winter', 'Cotton', 1, 8990, 0, [['Ajrak Red', '#8C2A24'], ['Ajrak Indigo', '#24365A']], 'lattice', 'bed', { threadCount: 200, gsm: 400, badges: ['new'] }],
    ['Mink Double-Ply Blanket', 'home', 'blankets', 'winter', 'Microfibre', 1, 9990, 7990, [['Beige', '#C9B497'], ['Brown', '#6E5440']], 'floral', 'bed', { badges: [] }],
    ['Hollow-Fibre Pillow (Pair)', 'home', 'pillows', null, 'Cotton', 2, 2490, 0, [['White', '#F3F0EA']], 'plain', 'cushion', { badges: ['best'], noBedSize: true }],
    ['Block-Print Cushion Covers (Set of 4)', 'home', 'cushions', 'eid-edit', 'Cotton', 4, 2990, 2290, [['Indigo', '#2E4570'], ['Terracotta', '#B4623E']], 'paisley', 'cushion', { badges: [], noBedSize: true }],
    ['Velvet Throw with Tassels', 'home', 'cushions', 'winter', 'Velvet', 1, 4490, 0, [['Emerald', '#1F5A45'], ['Mustard', '#C8A04A']], 'plain', 'cushion', { badges: ['new'], noBedSize: true }],
    ['Waterproof Mattress Protector', 'home', 'mattress-protectors', null, 'Poly-cotton', 1, 3990, 0, [['White', '#F3F0EA']], 'check', 'bed', { badges: [] }],

    // ---------- More demo stock (temporary, replace with real products) ----------
    ['Mahira Digital Print Lawn 3-Piece', 'women', 'unstitched', 'summer-lawn', 'Lawn', 3, 4790, 0, [['Lilac', '#B7A5C9'], ['Peach', '#E8B79A']], 'floral', 'folded', { occasion: 'Casual', badges: ['new'] }],
    ['Sana Jacquard Lawn Suit', 'women', 'unstitched', 'summer-lawn', 'Lawn', 3, 5990, 4490, [['Sky', '#9BB8D3'], ['Lemon', '#E3D27A']], 'lattice', 'folded', { occasion: 'Everyday', badges: [] }],
    ['Hareem Embroidered Khaddar', 'women', 'unstitched', 'winter', 'Khaddar', 3, 7490, 0, [['Navy', '#2B3A55'], ['Maroon', '#6E2434']], 'paisley', 'folded', { occasion: 'Everyday', embroidery: 'Front & sleeve embroidery', badges: ['new'] }],
    ['Dua Velvet Formal 3-Piece', 'women', 'unstitched', 'wedding-season', 'Velvet', 3, 21990, 17590, [['Black', '#232122'], ['Royal Blue', '#24406B']], 'lattice', 'folded', { occasion: 'Formal', embroidery: 'Tilla & sequins', badges: [] }],
    ['Mehrunisa Chiffon Party Wear', 'women', 'unstitched', 'eid-edit', 'Chiffon', 3, 14990, 0, [['Mint', '#A9C9B8'], ['Gold', '#C9A24A']], 'floral', 'folded', { occasion: 'Festive', embroidery: 'Hand-finished pearls', badges: ['best'] }],
    ['Alina Cotton Kurti', 'women', 'pret', 'summer-lawn', 'Cambric', 1, 2490, 1990, [['White', '#F1EEE7'], ['Teal', '#2F6B6B']], 'dots', 'kurta', { occasion: 'Casual', stitched: true, badges: [] }],
    ['Zara Printed Co-ord', 'women', 'pret', null, 'Linen', 2, 4990, 0, [['Rust', '#A4532F'], ['Olive', '#6C6B3A']], 'stripe', 'kurta', { occasion: 'Casual', stitched: true, badges: ['new'] }],
    ['Noor-e-Eid Embroidered Kurta', 'women', 'pret', 'eid-edit', 'Lawn', 1, 4490, 0, [['Pistachio', '#B9C99A'], ['Pink', '#E2B4AE']], 'paisley', 'kurta', { occasion: 'Festive', stitched: true, badges: ['best'], soldOut: ['XL'] }],
    ['Karandi Winter Shirt', 'women', 'pret', 'winter', 'Karandi', 1, 3990, 0, [['Charcoal', '#3D3B3C'], ['Camel', '#B48A5E']], 'check', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Ayra Net Maxi', 'women', 'luxury-pret', 'wedding-season', 'Organza', 2, 32990, 0, [['Ivory', '#EDE3CF'], ['Mauve', '#B08A9A']], 'floral', 'kurta', { occasion: 'Formal', stitched: true, embroidery: 'Hand-crafted dabka', badges: ['new'] }],
    ['Baraat Red Bridal Gharara', 'women', 'bridal', 'wedding-season', 'Silk', 3, 129990, 0, [['Bridal Red', '#8E1B2A']], 'lattice', 'kurta', { occasion: 'Bridal', stitched: true, embroidery: 'Zardozi, kora, dabka', badges: [], lowStock: true }],
    ['Walima Pastel Bridal Lehenga', 'women', 'bridal', 'wedding-season', 'Organza', 3, 99990, 0, [['Champagne', '#E2CFA8'], ['Powder Pink', '#E5C4BC']], 'floral', 'kurta', { occasion: 'Bridal', stitched: true, embroidery: 'Pearls & sequins', badges: ['new'] }],
    ['Cotton Shalwar', 'women', 'bottoms', null, 'Cambric', 1, 1490, 0, [['White', '#F1EEE7'], ['Beige', '#D3C1A0'], ['Black', '#262424']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Embroidered Chiffon Dupatta', 'women', 'dupattas', 'eid-edit', 'Chiffon', 1, 3490, 2790, [['Pink', '#E2B4AE'], ['Ivory', '#EDE3CF']], 'floral', 'dupatta', { occasion: 'Festive', badges: [] }],
    ['Printed Lawn Dupatta', 'women', 'dupattas', 'summer-lawn', 'Lawn', 1, 1790, 0, [['Multi Blue', '#5E7FAF'], ['Multi Green', '#6E9A75']], 'paisley', 'dupatta', { occasion: 'Casual', badges: ['new'] }],
    ['Everyday Jersey Abaya', 'women', 'abayas', null, 'Jersey', 1, 5490, 0, [['Black', '#232122'], ['Navy', '#1E2A44']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: ['best'] }],
    ['Satin Night Suit', 'women', 'nightwear', null, 'Satin', 2, 3990, 2990, [['Champagne', '#E2CFA8'], ['Wine', '#6B2737']], 'plain', 'kurta', { occasion: 'Lounge', stitched: true, badges: [] }],
    ['Gulshan Floral Bedsheet', 'home', 'bedsheets', 'summer-lawn', 'Cotton', 3, 2990, 2390, [['Pink Floral', '#D99AA3'], ['Yellow Floral', '#D9BE6A']], 'floral', 'bed', { threadCount: 180, badges: ['best'] }],
    ['Hotel Stripe Sateen Bedsheet', 'home', 'bedsheets', null, 'Sateen', 3, 5990, 0, [['White', '#F3F0EA'], ['Silver', '#BDBAB6']], 'stripe', 'bed', { threadCount: 300, badges: ['new'] }],
    ['Polka Dot Cotton Bedsheet', 'home', 'bedsheets', null, 'Cotton', 3, 1990, 0, [['Sky Blue', '#9BB8D3'], ['Mint', '#A9C9B8']], 'dots', 'bed', { threadCount: 144, badges: [] }],
    ['Shahnameh 12-Piece Bridal Set', 'home', 'bridal-bed-sets', 'wedding-season', 'Velvet', 12, 64990, 54990, [['Maroon & Gold', '#6E1E2C'], ['Ivory & Gold', '#E9DCC0']], 'paisley', 'bed', { threadCount: 300, badges: [], bridal: true }],
    ['Winter Velvet Comforter Set', 'home', 'comforters', 'winter', 'Velvet', 7, 18990, 0, [['Emerald', '#1F5A45'], ['Plum', '#6A3B55']], 'lattice', 'bed', { threadCount: 250, gsm: 350, badges: ['new'] }],
    ['Summer Light Quilt', 'home', 'duvets-quilts', 'summer-lawn', 'Cotton', 1, 5990, 4790, [['Blue Floral', '#6E8DB5'], ['Rose', '#D4A6A1']], 'floral', 'bed', { threadCount: 200, gsm: 150, badges: [] }],
    ['Fleece Baby Blanket', 'home', 'blankets', 'winter', 'Microfibre', 1, 2490, 0, [['Pink', '#E5C4BC'], ['Blue', '#A9BFD6']], 'dots', 'cushion', { badges: ['new'], noBedSize: true }],
    ['Memory Foam Pillow', 'home', 'pillows', null, 'Microfibre', 1, 4490, 0, [['White', '#F3F0EA']], 'plain', 'cushion', { badges: [], noBedSize: true }],
    ['Embroidered Pillow Covers (Pair)', 'home', 'pillows', 'eid-edit', 'Cotton', 2, 1990, 1490, [['Ivory', '#EDE3CF'], ['Grey', '#A9A6A3']], 'lattice', 'cushion', { badges: ['best'], noBedSize: true }],
    ['Ralli Patchwork Cushion', 'home', 'cushions', null, 'Cotton', 1, 1990, 0, [['Red', '#9C2F2A'], ['Indigo', '#2E4570']], 'check', 'cushion', { badges: ['new'], noBedSize: true }],
    ['Quilted Mattress Protector', 'home', 'mattress-protectors', null, 'Cotton', 1, 4990, 3990, [['White', '#F3F0EA']], 'lattice', 'bed', { badges: [] }],

    // ---------- RSBRI's own lines (from the Facebook page: ladies' suits, waterproof mattress covers, printed bedsheets) ----------
    // Names, prices and colours are placeholders until real photos and details are supplied.
    ['RSBRI Waterproof Terry Mattress Cover', 'home', 'mattress-protectors', null, 'Cotton terry', 1, 2490, 1990, [['White', '#F3F0EA'], ['Grey', '#A9A6A3']], 'check', 'bed', { badges: ['best'] }],
    ['RSBRI Waterproof Zipper Mattress Cover', 'home', 'mattress-protectors', null, 'Poly-cotton', 1, 3290, 0, [['White', '#F3F0EA'], ['Beige', '#D3C1A0']], 'plain', 'bed', { badges: ['new'] }],
    ['RSBRI Waterproof Cover + 2 Pillow Protectors', 'home', 'mattress-protectors', null, 'Cotton terry', 3, 3490, 2990, [['White', '#F3F0EA'], ['Sky', '#9BB8D3']], 'check', 'bed', { badges: ['best'] }],
    ['RSBRI Waterproof Baby Cot Sheet', 'home', 'mattress-protectors', null, 'Cotton terry', 1, 1290, 0, [['White', '#F3F0EA'], ['Pink', '#E5C4BC']], 'dots', 'cushion', { badges: ['new'], noBedSize: true }],
    ['RSBRI Rang Bahar Printed Bedsheet', 'home', 'bedsheets', 'summer-lawn', 'Cotton', 3, 2290, 0, [['Pink Floral', '#D99AA3'], ['Blue Floral', '#6E8DB5']], 'floral', 'bed', { threadCount: 144, badges: ['best'] }],
    ['RSBRI Mughal Jaal Printed Bedsheet', 'home', 'bedsheets', 'eid-edit', 'Cotton', 3, 2690, 0, [['Teal', '#2F6B6B'], ['Maroon', '#6E2434']], 'lattice', 'bed', { threadCount: 160, badges: ['new'] }],
    ['RSBRI Geometric Print Bedsheet', 'home', 'bedsheets', null, 'Poly-cotton', 3, 1890, 1590, [['Grey', '#A9A6A3'], ['Mustard', '#C8A04A']], 'check', 'bed', { threadCount: 120, badges: [] }],
    ['RSBRI Crystal Cotton Printed Bedsheet', 'home', 'bedsheets', null, 'Cotton', 3, 2990, 0, [['Peach', '#E8B79A'], ['Lilac', '#B7A5C9']], 'paisley', 'bed', { threadCount: 180, badges: ['new'] }],
    ['RSBRI Star Print Kids Bedsheet', 'home', 'bedsheets', null, 'Cotton', 2, 1590, 0, [['Sky', '#9BB8D3'], ['Mint', '#A9C9B8']], 'dots', 'bed', { threadCount: 144, badges: [] }],
    ['RSBRI Printed Lawn 3-Piece', 'women', 'unstitched', 'summer-lawn', 'Lawn', 3, 3290, 0, [['Peach', '#E8B79A'], ['Teal', '#2F6B6B']], 'floral', 'folded', { occasion: 'Casual', badges: ['new', 'best'] }],
    ['RSBRI Embroidered Lawn 3-Piece', 'women', 'unstitched', 'eid-edit', 'Lawn', 3, 4590, 3990, [['White', '#F1EEE7'], ['Black', '#262424']], 'lattice', 'folded', { occasion: 'Festive', embroidery: 'Neckline embroidery', badges: ['best'] }],
    ['RSBRI Printed Khaddar 3-Piece', 'women', 'unstitched', 'winter', 'Khaddar', 3, 3790, 0, [['Mustard', '#C8A04A'], ['Brown', '#6E5440']], 'paisley', 'folded', { occasion: 'Everyday', badges: ['new'] }],
    ['RSBRI Cotton 2-Piece Suit', 'women', 'unstitched', null, 'Cambric', 2, 2490, 1990, [['Blue', '#3F5277'], ['Pink', '#D4A6A1']], 'dots', 'folded', { occasion: 'Everyday', badges: [] }],

    // ---------- More demo stock, priced in typical Pakistani mid-market ranges (placeholders) ----------
    ['Rida Printed Lawn 2-Piece', 'women', 'unstitched', 'summer-lawn', 'Lawn', 2, 2890, 2490, [['Coral', '#D98166'], ['Aqua', '#7FB7B2']], 'floral', 'folded', { occasion: 'Casual', badges: ['new'] }],
    ['Fiza Embroidered Lawn 3-Piece', 'women', 'unstitched', 'eid-edit', 'Lawn', 3, 6490, 0, [['Lilac', '#B7A5C9'], ['Mint', '#A9C9B8']], 'lattice', 'folded', { occasion: 'Festive', embroidery: 'Daaman & neckline embroidery', badges: ['best'] }],
    ['Kinza Cotton Satin 3-Piece', 'women', 'unstitched', null, 'Cotton satin', 3, 5290, 0, [['Navy', '#2B3A55'], ['Rust', '#A4532F']], 'paisley', 'folded', { occasion: 'Everyday', badges: [] }],
    ['Mishal Marina 3-Piece', 'women', 'unstitched', 'winter', 'Marina', 3, 4290, 3590, [['Maroon', '#6E2434'], ['Bottle Green', '#1F4A3C']], 'check', 'folded', { occasion: 'Everyday', badges: ['new'] }],
    ['Anaya Printed Linen 3-Piece', 'women', 'unstitched', 'winter', 'Linen', 3, 5990, 0, [['Camel', '#B48A5E'], ['Grey', '#8E8B88']], 'stripe', 'folded', { occasion: 'Everyday', badges: [] }],
    ['Mahnoor Embroidered Chiffon 3-Piece', 'women', 'unstitched', 'eid-edit', 'Chiffon', 3, 16990, 0, [['Peach', '#E8B79A'], ['Sea Green', '#5E9C8C']], 'floral', 'folded', { occasion: 'Festive', embroidery: 'Sequins & resham', badges: [] }],
    ['Iqra Printed Kurti', 'women', 'pret', 'summer-lawn', 'Lawn', 1, 1990, 0, [['Yellow', '#E3D27A'], ['Blue', '#5E7FAF']], 'floral', 'kurta', { occasion: 'Casual', stitched: true, badges: ['new'] }],
    ['Hania Embroidered 2-Piece Pret', 'women', 'pret', 'eid-edit', 'Cambric', 2, 5490, 4390, [['Black', '#262424'], ['Off White', '#EDE6D6']], 'paisley', 'kurta', { occasion: 'Festive', stitched: true, badges: ['best'] }],
    ['Rabia Khaddar 2-Piece Pret', 'women', 'pret', 'winter', 'Khaddar', 2, 4990, 0, [['Olive', '#6C6B3A'], ['Plum', '#6A3B55']], 'check', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Eman Short Kurti & Cigarette Pants', 'women', 'pret', null, 'Cotton', 2, 3990, 0, [['Pink', '#E2B4AE'], ['Sky', '#9BB8D3']], 'dots', 'kurta', { occasion: 'Casual', stitched: true, badges: ['new'] }],
    ['Zainab Raw Silk Formal', 'women', 'luxury-pret', 'wedding-season', 'Raw silk', 3, 24990, 0, [['Emerald', '#1F5A45'], ['Wine', '#6B2737']], 'lattice', 'kurta', { occasion: 'Formal', stitched: true, embroidery: 'Gota & zari', badges: [] }],
    ['Nikah Ivory Bridal Sharara', 'women', 'bridal', 'wedding-season', 'Organza', 3, 74990, 0, [['Ivory', '#EDE3CF']], 'floral', 'kurta', { occasion: 'Bridal', stitched: true, embroidery: 'Pearl & dabka', badges: ['new'], lowStock: true }],
    ['Cotton Palazzo Trouser', 'women', 'bottoms', null, 'Cambric', 1, 1790, 0, [['White', '#F1EEE7'], ['Black', '#262424']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Jamawar Shawl', 'women', 'dupattas', 'winter', 'Wool', 1, 4490, 0, [['Maroon', '#6E2434'], ['Black', '#262424']], 'paisley', 'dupatta', { occasion: 'Everyday', badges: ['new'] }],
    ['Front-Open Nida Abaya', 'women', 'abayas', null, 'Nida', 1, 4990, 4290, [['Black', '#232122'], ['Maroon', '#5E1A28']], 'plain', 'kurta', { occasion: 'Everyday', stitched: true, badges: [] }],
    ['Cotton King Bedsheet Set', 'home', 'bedsheets', null, 'Cotton', 3, 3490, 0, [['White Stripe', '#EEE9DF'], ['Grey Check', '#A9A6A3']], 'stripe', 'bed', { threadCount: 200, badges: ['best'] }],
    ['Embroidered Sateen Bedsheet', 'home', 'bedsheets', 'eid-edit', 'Sateen', 3, 6490, 5490, [['Ivory', '#EDE3CF'], ['Silver', '#BDBAB6']], 'lattice', 'bed', { threadCount: 300, badges: [] }],
    ['Jahez 9-Piece Bridal Bed Set', 'home', 'bridal-bed-sets', 'wedding-season', 'Sateen', 9, 22990, 0, [['Red & Gold', '#8E1B2A'], ['Pink & Gold', '#D4A6A1']], 'paisley', 'bed', { threadCount: 300, badges: ['new'], bridal: true }],
    ['Light Comforter 6-Piece Set', 'home', 'comforters', null, 'Microfibre', 6, 9990, 8490, [['Blue', '#6E8DB5'], ['Beige', '#D3C1A0']], 'floral', 'bed', { threadCount: 200, gsm: 250, badges: [] }],
    ['Hand-Filled Cotton Razai', 'home', 'duvets-quilts', 'winter', 'Cotton', 1, 6490, 0, [['Red Print', '#9C2F2A'], ['Green Print', '#5E8A5A']], 'floral', 'bed', { gsm: 450, badges: ['best'] }],
    ['Double Bed Mink Blanket', 'home', 'blankets', 'winter', 'Microfibre', 1, 7490, 0, [['Brown', '#6E5440'], ['Grey', '#8E8B88']], 'floral', 'bed', { badges: ['new'] }],
    ['Hollow Fibre Pillow', 'home', 'pillows', null, 'Polyester', 1, 1290, 0, [['White', '#F3F0EA']], 'plain', 'cushion', { badges: ['best'], noBedSize: true }],
    ['Printed Cushion Covers (Set of 5)', 'home', 'cushions', null, 'Cotton', 5, 1990, 0, [['Blue Print', '#3F5A85'], ['Orange Print', '#C47A3E']], 'paisley', 'cushion', { badges: [], noBedSize: true }]
  ];

  function slugify(s) { return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

  var day = 864e5;
  var now = Date.now();

  var PRODUCTS = RAW.map(function (r, i) {
    var o = r[11] || {};
    var dept = r[1];
    var isBed = dept === 'home' && !o.noBedSize && r[10] === 'bed';
    var stitched = !!o.stitched;
    var p = {
      id: 'RS' + (1001 + i),
      sku: (dept === 'women' ? 'W' : 'H') + '-' + (1001 + i),
      title: r[0],
      slug: slugify(r[0]),
      dept: dept,
      cat: r[2],
      collection: r[3],
      fabric: r[4],
      pieces: r[5],
      price: r[6],
      sale: r[7] || 0,
      colors: r[8].map(function (c) { return { name: c[0], hex: c[1] }; }),
      motif: r[9],
      shape: r[10],
      occasion: o.occasion || null,
      embroidery: o.embroidery || null,
      stitched: dept === 'women' ? stitched : null,
      sizes: dept === 'women' && stitched ? SIZES.slice() : null,
      bedSizes: isBed ? (o.bridal ? ['King', 'Super King'] : ['Single', 'Double', 'King']) : null,
      soldOut: o.soldOut || [],
      threadCount: o.threadCount || null,
      gsm: o.gsm || null,
      lowStock: !!o.lowStock,
      badges: o.badges || [],
      images: o.images || null, // real photos, e.g. ['assets/products/gulnar-1.webp', ...] — see assets/products/README.md
      added: now - (o.badges && o.badges.indexOf('new') > -1 ? (i % 7) : 20 + i) * day,
      sold: ((i * 37) % 97) + (o.badges && o.badges.indexOf('best') > -1 ? 200 : 0),
      rating: 4 + ((i * 7) % 10) / 10
    };
    if (dept === 'women') {
      p.type = stitched ? 'Stitched' : 'Unstitched';
      if (!stitched) {
        p.meters = p.pieces === 3 ? 'Shirt 3 m · Dupatta 2.5 m · Trouser 2.5 m' : 'Shirt 3 m · Trouser 2.5 m';
      }
      p.care = p.fabric === 'Velvet' || p.fabric === 'Silk' || p.fabric === 'Organza' || p.fabric === 'Chiffon'
        ? 'Dry clean only. Iron on reverse at low heat. Store in a muslin bag.'
        : 'Hand or gentle machine wash in cold water. Wash dark colours separately. Iron on reverse at medium heat. Dry in shade.';
    } else {
      p.care = 'Machine wash at 40°C with like colours. Colour-fast dyes. Tumble dry low or line dry in shade. Warm iron.';
    }
    p.desc = describe(p);
    return p;
  });

  function describe(p) {
    if (p.dept === 'women') {
      var base = p.stitched
        ? 'A ready-to-wear piece cut for an easy, flattering fit in soft ' + p.fabric.toLowerCase() + '.'
        : 'A ' + p.pieces + '-piece unstitched ' + p.fabric.toLowerCase() + ' suit, so you can tailor it exactly the way you like.';
      return base + (p.embroidery ? ' Finished with ' + p.embroidery.toLowerCase() + '.' : '') + ' Perfect for ' + (p.occasion || 'every day').toLowerCase() + ' wear.';
    }
    return 'Made from ' + p.fabric.toLowerCase() + (p.threadCount ? ' with a ' + p.threadCount + ' thread count' : '') + ', designed to feel cool in summer and cosy in winter. Includes ' + p.pieces + ' piece' + (p.pieces > 1 ? 's' : '') + '.';
  }

  /* Roman-Urdu search synonyms (PRD §8.4) */
  var SYNONYMS = {
    chadar: 'bedsheet', chaddar: 'bedsheet', 'bed sheet': 'bedsheet', kameez: 'kurti', kurta: 'kurti', qameez: 'kurti',
    razai: 'razai quilt', rajai: 'razai quilt', quilt: 'razai quilt', takia: 'pillow', takiya: 'pillow', gadda: 'mattress',
    shalwar: 'trouser', salwar: 'trouser', pajama: 'trouser pyjama', dupatta: 'dupatta shawl', chunri: 'dupatta',
    jahez: 'bridal', dulhan: 'bridal', shaadi: 'wedding bridal', shadi: 'wedding bridal', kambal: 'blanket', lawn: 'lawn'
  };

  window.RSBRI = {
    STORE: STORE, COUNTRIES: COUNTRIES, CITIES: CITIES, DEPARTMENTS: DEPARTMENTS,
    COLLECTIONS: COLLECTIONS, PRODUCTS: PRODUCTS, SIZES: SIZES, BED_SIZES: BED_SIZES, SYNONYMS: SYNONYMS
  };
})();
