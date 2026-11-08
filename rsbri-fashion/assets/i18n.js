/* RSBRI Fashion — Urdu (ur-PK) interface layer.
   Translates interface text as it is rendered (text nodes + placeholder/aria-label/title)
   and switches the document to right-to-left. Product names, fabric names and prices
   stay as they are, as most Pakistani fashion sites do.
   Copy with inline markup is translated at source in app.js with T(en, ur). */
(function () {
  'use strict';

  var D = {
    /* header, nav, footer */
    'Skip to content': 'مواد پر جائیں',
    'Search lawn, bedsheets, chadar…': 'لان، بیڈ شیٹ، چادر تلاش کریں…',
    'Search for lawn, bedsheets, chadar, razai…': 'لان، بیڈ شیٹ، چادر، رضائی تلاش کریں…',
    'Search products': 'پراڈکٹس تلاش کریں',
    'Open menu': 'مینو کھولیں', 'Search': 'تلاش', 'Account': 'اکاؤنٹ', 'Wishlist': 'وش لسٹ', 'Open cart': 'بیگ کھولیں',
    'Change country and currency': 'ملک اور کرنسی تبدیل کریں', 'Close': 'بند کریں', 'Close menu': 'مینو بند کریں', 'Close search': 'تلاش بند کریں', 'Close bag': 'بیگ بند کریں', 'Close filters': 'فلٹر بند کریں',
    'New In': 'نئی آمد', 'Women': 'خواتین', 'Bedding & Home': 'بستر اور گھر', 'Collections': 'کلیکشنز', 'Best Sellers': 'سب سے زیادہ فروخت', 'Sale': 'سیل',
    'Gift Cards': 'گفٹ کارڈز', 'Shop': 'خریداری', 'Help': 'مدد', 'RSBRI': 'RSBRI',
    'Contact & WhatsApp': 'رابطہ اور واٹس ایپ', 'Track Your Order': 'اپنا آرڈر ٹریک کریں', 'Delivery Information': 'ڈیلیوری کی معلومات',
    'Exchange & Returns': 'تبادلہ اور واپسی', 'Size Guide': 'سائز گائیڈ', 'Bedsheet Size Guide': 'بیڈ شیٹ سائز گائیڈ', 'FAQ': 'عام سوالات',
    'About RSBRI': 'RSBRI کے بارے میں', 'Fabric & Care': 'کپڑا اور دیکھ بھال', 'Journal': 'جریدہ', 'Privacy Policy': 'پرائیویسی پالیسی', 'Terms of Service': 'شرائط و ضوابط',
    'Wedding Season': 'شادی سیزن',
    "Premium women's wear and home textiles, designed in Pakistan. Shop online 24/7 with Cash on Delivery, JazzCash and Easypaisa.": 'پاکستان میں ڈیزائن کیے گئے خواتین کے پریمیم ملبوسات اور گھریلو ٹیکسٹائل۔ کیش آن ڈیلیوری، جاز کیش اور ایزی پیسہ کے ساتھ 24/7 آن لائن خریداری کریں۔',
    'RSBRI Fashion. All prices in PKR and include sales tax.': 'RSBRI فیشن۔ تمام قیمتیں پاکستانی روپے میں اور سیلز ٹیکس سمیت ہیں۔',
    'Sign in / Register': 'سائن ان / رجسٹر', 'Track your order': 'اپنا آرڈر ٹریک کریں', 'WhatsApp us': 'واٹس ایپ کریں',
    'Your bag': 'آپ کا بیگ', 'Filter': 'فلٹر', 'Clear': 'صاف کریں', 'Show results': 'نتائج دکھائیں',
    'We use cookies to keep your bag, remember your preferences and measure site performance.': 'ہم آپ کا بیگ محفوظ رکھنے، آپ کی ترجیحات یاد رکھنے اور سائٹ کی کارکردگی جانچنے کے لیے کوکیز استعمال کرتے ہیں۔',
    'Privacy policy': 'پرائیویسی پالیسی', 'Accept all': 'سب قبول کریں', 'Essential only': 'صرف ضروری',
    'Chat with us on WhatsApp': 'واٹس ایپ پر بات کریں',

    /* announcements */
    'Cash on Delivery available nationwide': 'ملک بھر میں کیش آن ڈیلیوری دستیاب',
    'Easy 7-day exchange · WhatsApp us anytime': '7 دن میں آسان تبادلہ · کسی بھی وقت واٹس ایپ کریں',

    /* departments & categories */
    'Shop Women': 'خواتین کی خریداری', 'Shop Bedding & Home': 'بستر اور گھر کی خریداری', 'Shop Bedding': 'بیڈنگ خریدیں',
    'View all Women →': 'تمام خواتین ملبوسات ←', 'View all Bedding & Home →': 'تمام بستر و گھر ←', 'Shop all': 'سب دیکھیں',
    'Unstitched': 'ان سلا', 'Stitched': 'سلا ہوا', 'Ready-to-Wear': 'ریڈی ٹو ویئر', 'Ready-to-wear': 'ریڈی ٹو ویئر',
    'Luxury Pret & Formals': 'لگژری پریٹ اور فارمل', 'Bridal & Wedding Wear': 'دلہن اور شادی کے ملبوسات', 'Bottoms': 'ٹراؤزر و شلوار',
    'Dupattas, Shawls & Stoles': 'دوپٹے، شالیں اور اسٹولز', 'Abayas & Modest Wear': 'عبایا اور با پردہ لباس', 'Nightwear & Loungewear': 'نائٹ ویئر اور لاؤنج ویئر',
    'Bedsheets': 'بیڈ شیٹس', 'Bridal Bed Sets': 'برائیڈل بیڈ سیٹس', 'Comforter Sets': 'کمفرٹر سیٹس', 'Duvet Covers & Quilts (Razai)': 'ڈیویٹ کور اور رضائیاں',
    'Blankets': 'کمبل', 'Pillows & Pillow Covers': 'تکیے اور تکیہ غلاف', 'Cushions & Throws': 'کشن اور تھرو', 'Mattress Protectors': 'میٹرس پروٹیکٹر',
    'Lawn, Cambric, Khaddar, Karandi, Velvet, Chiffon': 'لان، کیمبرک، کھدر، کرینڈی، ویلوٹ، شیفون', 'Kurtis, Suits, Co-ords': 'کرتیاں، سوٹ، کو آرڈز',
    'Trousers, Shalwar, Palazzo': 'ٹراؤزر، شلوار، پلازو', 'Single, Double, King': 'سنگل، ڈبل، کنگ',
    'Unstitched lawn to luxury formals — designed in Pakistan, made for every season.': 'ان سلی لان سے لگژری فارمل تک — پاکستان میں ڈیزائن، ہر موسم کے لیے۔',
    'Bedsheets, bridal sets and comforters in pure cotton and sateen — sized for Pakistani beds.': 'خالص کاٹن اور ساٹن میں بیڈ شیٹس، برائیڈل سیٹس اور کمفرٹرز — پاکستانی بستروں کے سائز میں۔',
    'Summer Lawn': 'سمر لان', 'The Eid Edit': 'عید ایڈٹ', 'Winter': 'سرما',
    'Breathable printed lawn for long Pakistani summers.': 'طویل پاکستانی گرمیوں کے لیے ہوادار پرنٹڈ لان۔',
    'Festive pieces and gifting for Eid ul Fitr and Eid ul Adha.': 'عید الفطر اور عید الاضحیٰ کے لیے تہوار کے ملبوسات اور تحائف۔',
    'Khaddar, karandi and velvet — warmth with craft.': 'کھدر، کرینڈی اور ویلوٹ — گرماہٹ اور ہنر۔',
    'Formals and bridal bedding for shaadi season.': 'شادی سیزن کے لیے فارمل اور برائیڈل بیڈنگ۔',

    /* home */
    'Cash on Delivery': 'کیش آن ڈیلیوری', 'Pay when it arrives': 'سامان ملنے پر ادائیگی', 'Free delivery': 'مفت ڈیلیوری',
    '7-day exchange': '7 دن میں تبادلہ', 'Unused, with tags': 'غیر استعمال شدہ، ٹیگ کے ساتھ', 'Secure payment': 'محفوظ ادائیگی',
    'JazzCash · Easypaisa · Cards': 'جاز کیش · ایزی پیسہ · کارڈز',
    'Shop by category': 'کیٹیگری کے مطابق خریداری', 'Pret': 'پریٹ', 'Formals': 'فارمل', 'Bridal Sets': 'برائیڈل سیٹس', 'Comforters': 'کمفرٹرز', 'Shawls': 'شالیں', 'Cushions': 'کشن',
    'Department': 'شعبہ', 'Just landed': 'ابھی آیا ہے', 'View all': 'سب دیکھیں',
    'White Week · Limited time': 'وائٹ ویک · محدود وقت', 'On selected lawn, comforters and bed sets. While stocks last.': 'منتخب لان، کمفرٹرز اور بیڈ سیٹس پر۔ اسٹاک ختم ہونے تک۔',
    'Days': 'دن', 'Hrs': 'گھنٹے', 'Min': 'منٹ', 'Sec': 'سیکنڈ', 'Shop the Sale': 'سیل دیکھیں', 'Sale ends in': 'سیل ختم ہونے میں',
    'Loved across Pakistan': 'پورے پاکستان کی پسند', 'The Jahez Edit': 'جہیز ایڈٹ',
    'Our bridal sets arrive gift-boxed and ready for the rukhsati — every piece you need for a complete, coordinated bedroom.': 'ہمارے برائیڈل سیٹس گفٹ باکس میں رخصتی کے لیے تیار آتے ہیں — ایک مکمل اور ہم آہنگ بیڈروم کے لیے ہر چیز۔',
    'King and Super King sizes (100 × 108″ / 108 × 108″)': 'کنگ اور سپر کنگ سائز (100 × 108″ / 108 × 108″)',
    'Sateen and velvet, 300–400 thread count': 'ساٹن اور ویلوٹ، 300–400 تھریڈ کاؤنٹ',
    'Bedsheet, pillow covers, cushions, comforter & runner': 'بیڈ شیٹ، تکیہ غلاف، کشن، کمفرٹر اور رنر',
    'Free gift wrap and a handwritten card': 'مفت گفٹ ریپ اور ہاتھ سے لکھا کارڈ',
    'Shop Bridal Sets': 'برائیڈل سیٹس خریدیں', 'Seasonal': 'موسمی', 'Explore →': 'دیکھیں ←',
    'Styled by you': 'آپ کا انداز', 'Tag us on Instagram & TikTok to be featured. Tap a look to shop it.': 'نمایاں ہونے کے لیے انسٹاگرام اور ٹک ٹاک پر ہمیں ٹیگ کریں۔ خریدنے کے لیے کسی لُک پر ٹیپ کریں۔',
    'Join the RSBRI circle': 'RSBRI سرکل میں شامل ہوں', '10% off your first order': 'پہلے آرڈر پر 10% رعایت',
    'New launches, Eid drops and private sales — straight to your WhatsApp or inbox. No spam, unsubscribe anytime.': 'نئے کلیکشن، عید لانچ اور خصوصی سیلز — سیدھا آپ کے واٹس ایپ یا ای میل پر۔ کوئی اسپام نہیں، کسی بھی وقت ان سبسکرائب کریں۔',
    'WhatsApp': 'واٹس ایپ', 'Email': 'ای میل', 'Subscribe': 'سبسکرائب', 'WhatsApp number': 'واٹس ایپ نمبر', 'Email address': 'ای میل ایڈریس',
    'By subscribing you agree to receive marketing messages from RSBRI.': 'سبسکرائب کر کے آپ RSBRI سے مارکیٹنگ پیغامات وصول کرنے پر رضامند ہیں۔',
    'Previous slide': 'پچھلی سلائیڈ', 'Next slide': 'اگلی سلائیڈ', 'Previous': 'پچھلا', 'Next': 'اگلا',

    /* product cards & listing */
    'Quick view': 'فوری جائزہ', 'Quick add': 'فوری شامل کریں', 'New': 'نیا', 'Bestseller': 'بیسٹ سیلر', 'Low stock': 'محدود اسٹاک',
    'Add to wishlist': 'وش لسٹ میں شامل کریں', 'Remove from wishlist': 'وش لسٹ سے ہٹائیں',
    'Featured': 'نمایاں', 'Newest': 'نیا ترین', 'Best selling': 'سب سے زیادہ فروخت', 'Price: low to high': 'قیمت: کم سے زیادہ', 'Price: high to low': 'قیمت: زیادہ سے کم', 'Biggest discount': 'سب سے زیادہ رعایت',
    'Sort by': 'ترتیب', 'Type': 'قسم', 'Category': 'کیٹیگری', 'Pieces': 'پیس', 'Fabric': 'کپڑا', 'Material': 'میٹیریل', 'Size': 'سائز', 'Bed size': 'بیڈ سائز',
    'Thread count': 'تھریڈ کاؤنٹ', 'Colour': 'رنگ', 'Occasion': 'موقع', 'Price': 'قیمت',
    'Casual': 'کیژول', 'Festive': 'تہوار', 'Everyday': 'روزمرہ', 'Formal': 'فارمل', 'Bridal': 'دلہن', 'Lounge': 'لاؤنج',
    'White & Ivory': 'سفید و آئیوری', 'Black & Charcoal': 'سیاہ و چارکول', 'Grey & Silver': 'سرمئی و سلور', 'Pink & Blush': 'گلابی', 'Red & Maroon': 'سرخ و مہرون',
    'Beige & Camel': 'بیج و کیمل', 'Brown & Rust': 'بھورا', 'Yellow & Gold': 'پیلا و سنہری', 'Green': 'سبز', 'Blue': 'نیلا', 'Purple & Plum': 'جامنی',
    'No matches': 'کوئی نتیجہ نہیں', 'Try removing a filter or two.': 'ایک دو فلٹر ہٹا کر دیکھیں۔', 'Clear all filters': 'تمام فلٹر ہٹائیں', 'Load more': 'مزید دیکھیں',
    'No filters for this selection.': 'اس انتخاب کے لیے کوئی فلٹر نہیں۔', 'Home': 'ہوم', 'All': 'سب', 'Breadcrumb': 'راستہ',
    'The latest from the RSBRI studio — updated every week.': 'RSBRI اسٹوڈیو سے تازہ ترین — ہر ہفتے نیا۔', 'Most loved': 'سب سے پسندیدہ',
    'The pieces Pakistan keeps coming back for.': 'وہ ملبوسات جو پاکستان بار بار پسند کرتا ہے۔',
    'Limited stock at special prices. Sale items can be exchanged but not refunded.': 'خصوصی قیمتوں پر محدود اسٹاک۔ سیل کی اشیاء کا تبادلہ ہو سکتا ہے، رقم واپس نہیں۔',
    'Collection': 'کلیکشن', 'Seasonal edits for every chapter of the Pakistani calendar.': 'پاکستانی سال کے ہر موسم کے لیے خاص کلیکشنز۔',

    /* product page */
    'Colour:': 'رنگ:', 'Size:': 'سائز:', 'Bed size:': 'بیڈ سائز:', 'Select': 'منتخب کریں', 'Size guide': 'سائز گائیڈ', 'Bedsheet sizes': 'بیڈ شیٹ سائز',
    'Please select a size.': 'براہ کرم سائز منتخب کریں۔', 'Please select a bed size.': 'براہ کرم بیڈ سائز منتخب کریں۔',
    'Add to bag': 'بیگ میں ڈالیں', 'Sold out': 'ختم ہو گیا', 'Buy it now': 'ابھی خریدیں', 'Order on WhatsApp': 'واٹس ایپ پر آرڈر', 'Share': 'شیئر',
    'Delivery to': 'ڈیلیوری:', 'Free delivery on this item': 'اس آئٹم پر مفت ڈیلیوری',
    'Cash on Delivery available · JazzCash · Easypaisa · Cards': 'کیش آن ڈیلیوری دستیاب · جاز کیش · ایزی پیسہ · کارڈز',
    '7-day exchange on unused items with tags': 'ٹیگ والی غیر استعمال شدہ اشیاء کا 7 دن میں تبادلہ',
    '7-day exchange on unused items with tags (cut fabric excluded)': 'ٹیگ والی غیر استعمال شدہ اشیاء کا 7 دن میں تبادلہ (کٹا ہوا کپڑا شامل نہیں)',
    'Description': 'تفصیل', 'Details & pieces': 'تفصیلات اور پیس', 'Fabric & care': 'کپڑا اور دیکھ بھال', 'Delivery & exchange': 'ڈیلیوری اور تبادلہ',
    'Colours may vary slightly due to photography and screen settings.': 'تصویر اور اسکرین کی وجہ سے رنگ میں معمولی فرق ہو سکتا ہے۔',
    'Exchange policy': 'تبادلہ پالیسی',
    "Dispatched within 24 hours from our Faisalabad warehouse via Leopards / TCS. Faisalabad and Lahore 1–2 days, other major cities 2–4 days, rest of Pakistan 4–7 days. You'll get WhatsApp and SMS updates with your tracking number.": 'ہمارے فیصل آباد گودام سے Leopards / TCS کے ذریعے 24 گھنٹوں میں روانگی۔ فیصل آباد اور لاہور 1–2 دن، دیگر بڑے شہر 2–4 دن، باقی پاکستان 4–7 دن۔ ٹریکنگ نمبر کے ساتھ واٹس ایپ اور SMS پر اپ ڈیٹس ملیں گی۔',
    'Styled together': 'ساتھ میں پہنیں', 'Complete the look': 'لُک مکمل کریں', 'Matching cushions & pillow covers': 'میچنگ کشن اور تکیہ غلاف',
    'More like this': 'ایسی مزید', 'You may also like': 'آپ کو یہ بھی پسند آ سکتا ہے', 'Your history': 'آپ کی تاریخ', 'Recently viewed': 'حال ہی میں دیکھا',
    'Fabric close-up': 'کپڑے کا قریبی منظر', 'Front': 'سامنے', 'Styled': 'اسٹائل', 'Detail': 'تفصیل',
    'Fabric length': 'کپڑے کی لمبائی', 'Embroidery': 'کڑھائی', 'Pieces in set': 'سیٹ میں پیس', 'Filling': 'فلنگ', 'Sizes': 'سائز',
    'Notify me': 'مطلع کریں', 'Quantity': 'تعداد', 'Decrease quantity': 'کم کریں', 'Increase quantity': 'زیادہ کریں', 'City': 'شہر',
    'View full details': 'مکمل تفصیل دیکھیں', 'Please select a size': 'براہ کرم سائز منتخب کریں',

    /* bag */
    'Your bag is empty': 'آپ کا بیگ خالی ہے', 'Discover new arrivals and bestsellers.': 'نئی آمد اور بیسٹ سیلرز دیکھیں۔', 'Shop New In': 'نئی آمد دیکھیں',
    'Remove': 'ہٹائیں', 'You save': 'آپ کی بچت', 'Subtotal': 'ذیلی کل', 'Delivery and discounts calculated at checkout.': 'ڈیلیوری اور رعایت چیک آؤٹ پر شمار ہوں گی۔',
    'View bag': 'بیگ دیکھیں', 'Your next favourite outfit is waiting.': 'آپ کا اگلا پسندیدہ لباس منتظر ہے۔', 'Bag': 'بیگ', 'Order summary': 'آرڈر کا خلاصہ',
    'Discount code': 'ڈسکاؤنٹ کوڈ', 'Apply': 'لاگو کریں', 'Gift wrap': 'گفٹ ریپ', 'Delivery': 'ڈیلیوری', 'Free': 'مفت', 'Calculated at checkout': 'چیک آؤٹ پر',
    'Total': 'کل', 'Proceed to checkout': 'چیک آؤٹ کریں', 'Secure checkout': 'محفوظ چیک آؤٹ', 'remove': 'ہٹائیں',
    'Added to your bag': 'بیگ میں شامل کر دیا گیا', 'Saved to your wishlist': 'وش لسٹ میں محفوظ', 'Signed in': 'سائن ان ہو گیا',
    "That code isn't valid. Try WELCOME10": 'یہ کوڈ درست نہیں۔ WELCOME10 آزمائیں', 'Decrease': 'کم کریں', 'Increase': 'زیادہ کریں',

    /* checkout */
    'Checkout': 'چیک آؤٹ', 'Contact': 'رابطہ', 'Mobile number': 'موبائل نمبر', "We'll send order updates by WhatsApp & SMS.": 'آرڈر کی اپ ڈیٹس واٹس ایپ اور SMS پر بھیجی جائیں گی۔',
    '(optional)': '(اختیاری)', 'Send me new launches & offers on WhatsApp': 'نئے کلیکشن اور آفرز مجھے واٹس ایپ پر بھیجیں',
    'Delivery address': 'ڈیلیوری کا پتہ', 'First name': 'پہلا نام', 'Last name': 'آخری نام', 'Area / Sector': 'علاقہ / سیکٹر', 'Street & house no.': 'گلی اور مکان نمبر',
    'Nearest landmark': 'قریبی نشانی', 'Helps the courier find you faster.': 'کورئیر کو آپ تک جلد پہنچنے میں مدد ملتی ہے۔',
    'e.g. DHA Phase 5, Gulberg III, F-7/2': 'مثلاً ڈی ایچ اے فیز 5، گلبرگ III، F-7/2', 'House 12, Street 4': 'مکان 12، گلی 4',
    'e.g. Near Jamia Masjid, opposite Imtiaz Store': 'مثلاً جامع مسجد کے قریب، امتیاز اسٹور کے سامنے',
    'Delivery method': 'ڈیلیوری کا طریقہ', 'Standard delivery': 'عام ڈیلیوری', 'Express delivery': 'ایکسپریس ڈیلیوری',
    'Next working day if ordered before 2pm PKT': 'دوپہر 2 بجے سے پہلے آرڈر پر اگلے کاروباری دن', 'Payment': 'ادائیگی',
    "Pay in cash when your order arrives. We'll confirm by WhatsApp/SMS before dispatch.": 'آرڈر ملنے پر نقد ادائیگی کریں۔ روانگی سے پہلے ہم واٹس ایپ/SMS پر تصدیق کریں گے۔',
    'JazzCash': 'جاز کیش', 'Easypaisa': 'ایزی پیسہ', 'Pay from your JazzCash mobile wallet': 'اپنے جاز کیش موبائل والیٹ سے ادائیگی', 'JazzCash account number': 'جاز کیش اکاؤنٹ نمبر',
    "You'll get a prompt on your phone to approve the payment with your MPIN.": 'ادائیگی کی منظوری کے لیے آپ کے فون پر MPIN کا پیغام آئے گا۔',
    'Pay from your Easypaisa mobile account': 'اپنے ایزی پیسہ اکاؤنٹ سے ادائیگی', 'Easypaisa account number': 'ایزی پیسہ اکاؤنٹ نمبر',
    'Debit / Credit card': 'ڈیبٹ / کریڈٹ کارڈ',
    "You'll be redirected to our bank's secure payment page. RSBRI never stores your card details.": 'آپ کو بینک کے محفوظ ادائیگی صفحے پر بھیجا جائے گا۔ RSBRI آپ کے کارڈ کی تفصیلات محفوظ نہیں کرتا۔',
    'Bank transfer / IBFT / Raast': 'بینک ٹرانسفر / IBFT / راست', 'Transfer and share the receipt on WhatsApp': 'رقم بھیجیں اور رسید واٹس ایپ پر شیئر کریں',
    'Account details will be shown after you place the order. Your order is confirmed once payment is received.': 'آرڈر کے بعد اکاؤنٹ کی تفصیلات دکھائی جائیں گی۔ ادائیگی ملنے پر آرڈر کی تصدیق ہو گی۔',
    'Your order': 'آپ کا آرڈر', 'Online payment discount': 'آن لائن ادائیگی رعایت', 'Includes sales tax.': 'سیلز ٹیکس شامل ہے۔', 'Your information is protected': 'آپ کی معلومات محفوظ ہیں',
    'Enter a valid Pakistani mobile number, e.g. 0300-1234567': 'درست پاکستانی موبائل نمبر درج کریں، مثلاً 0300-1234567',
    'Enter a valid mobile number, e.g. 0300-1234567': 'درست موبائل نمبر درج کریں، مثلاً 0300-1234567', 'Enter a valid email address': 'درست ای میل درج کریں',
    'Please enter your first name': 'براہ کرم پہلا نام درج کریں', 'Please enter your last name': 'براہ کرم آخری نام درج کریں',
    'Please enter your area or sector': 'براہ کرم علاقہ یا سیکٹر درج کریں', 'Please enter your street and house number': 'براہ کرم گلی اور مکان نمبر درج کریں',
    'Enter your JazzCash number': 'اپنا جاز کیش نمبر درج کریں', 'Enter your Easypaisa number': 'اپنا ایزی پیسہ نمبر درج کریں',

    /* order, account, track, wishlist */
    'Your order is placed': 'آپ کا آرڈر موصول ہو گیا', 'Pending confirmation': 'تصدیق باقی', 'Confirmed': 'تصدیق شدہ', 'Packed': 'پیک', 'Dispatched': 'روانہ', 'Delivered': 'موصول',
    'Please confirm on WhatsApp': 'براہ کرم واٹس ایپ پر تصدیق کریں', 'Confirm on WhatsApp': 'واٹس ایپ پر تصدیق کریں', 'Delivering to': 'ڈیلیوری کا پتہ',
    'Estimated delivery': 'متوقع ڈیلیوری', 'Next working day': 'اگلا کاروباری دن', 'Updates via WhatsApp & SMS': 'واٹس ایپ اور SMS پر اپ ڈیٹس',
    'Continue shopping': 'خریداری جاری رکھیں', 'Track order': 'آرڈر ٹریک کریں', 'Bank transfer details': 'بینک ٹرانسفر کی تفصیلات',
    'Sign in': 'سائن ان', "Use your mobile number — we'll send a one-time code by SMS. No password needed.": 'اپنا موبائل نمبر استعمال کریں — ہم SMS پر ایک بار کا کوڈ بھیجیں گے۔ پاس ورڈ کی ضرورت نہیں۔',
    '6-digit code': '6 ہندسوں کا کوڈ', 'Demo: enter any 6 digits.': 'ڈیمو: کوئی بھی 6 ہندسے درج کریں۔', 'Send code': 'کوڈ بھیجیں', 'Verify & sign in': 'تصدیق کر کے سائن ان',
    'Enter the 6-digit code': '6 ہندسوں کا کوڈ درج کریں',
    'Continue with Google': 'گوگل کے ساتھ جاری رکھیں', 'Continue with email': 'ای میل کے ساتھ جاری رکھیں', 'My account': 'میرا اکاؤنٹ', 'Assalam o Alaikum': 'السلام علیکم',
    'Orders': 'آرڈرز', 'No orders yet.': 'ابھی کوئی آرڈر نہیں۔', 'View': 'دیکھیں', 'Re-order': 'دوبارہ آرڈر', 'Saved addresses': 'محفوظ پتے',
    'Your address will be saved at your next checkout.': 'آپ کا پتہ اگلے چیک آؤٹ پر محفوظ ہو جائے گا۔',
    'Exchange request': 'تبادلے کی درخواست', "Need a different size or colour? Raise a request within 7 days of delivery and we'll arrange a courier pickup.": 'مختلف سائز یا رنگ چاہیے؟ ڈیلیوری کے 7 دن کے اندر درخواست دیں، ہم کورئیر پک اپ کا انتظام کریں گے۔',
    'Request exchange on WhatsApp': 'واٹس ایپ پر تبادلے کی درخواست', 'Sign out': 'سائن آؤٹ', 'Signed in as': 'سائن ان:',
    'Enter your order number and the mobile number used at checkout.': 'اپنا آرڈر نمبر اور چیک آؤٹ پر استعمال ہونے والا موبائل نمبر درج کریں۔',
    'Order number': 'آرڈر نمبر', 'Track': 'ٹریک کریں',
    'Courier tracking number appears here once your order is dispatched.': 'آرڈر روانہ ہونے پر کورئیر ٹریکنگ نمبر یہاں نظر آئے گا۔',
    'Nothing saved yet': 'ابھی کچھ محفوظ نہیں', 'Tap the heart on any product to save it for later.': 'بعد کے لیے محفوظ کرنے کو کسی بھی پراڈکٹ پر دل کا نشان دبائیں۔', 'Browse best sellers': 'بیسٹ سیلرز دیکھیں',

    /* search, modals, pages */
    'Popular searches': 'مقبول تلاشیں', 'Trending now': 'ابھی مقبول', 'Try “lawn”, “bedsheet” or “bridal”.': '“lawn”، “bedsheet” یا “bridal” آزمائیں۔',
    'Choose your store': 'اپنا اسٹور منتخب کریں', 'Prices, payment and delivery options follow the store you choose.': 'قیمتیں، ادائیگی اور ڈیلیوری آپ کے منتخب اسٹور کے مطابق ہوں گی۔',
    'Pakistan': 'پاکستان', 'Live': 'فعال', 'Coming soon': 'جلد آ رہا ہے', "You're shopping the Pakistan store": 'آپ پاکستان اسٹور سے خریداری کر رہے ہیں',
    'Bedsheet size guide': 'بیڈ شیٹ سائز گائیڈ', 'Inches': 'انچ', 'cm': 'سینٹی میٹر', 'Chest': 'سینہ', 'Shirt length': 'قمیض کی لمبائی', 'Trouser length': 'ٹراؤزر کی لمبائی',
    'Bedsheet': 'بیڈ شیٹ', 'Fits mattress': 'میٹرس سائز', 'Pillow cover': 'تکیہ غلاف',
    'Measure your mattress and allow 10–12″ on each side for tucking.': 'اپنا میٹرس ناپیں اور اندر دبانے کے لیے ہر طرف 10–12 انچ اضافی رکھیں۔',
    'Body measurements. Between sizes? Choose the larger size for a relaxed fit.': 'جسمانی پیمائش۔ دو سائز کے بیچ ہیں؟ آرام دہ فٹنگ کے لیے بڑا سائز لیں۔',
    'Delivery information': 'ڈیلیوری کی معلومات', 'Exchange & returns': 'تبادلہ اور واپسی', 'Frequently asked questions': 'عام سوالات',
    'Terms of service': 'شرائط و ضوابط', 'Gift cards': 'گفٹ کارڈز', 'Zone': 'زون', 'Time': 'وقت', 'Fee': 'فیس', 'Major cities': 'بڑے شہر', 'Rest of Pakistan': 'باقی پاکستان',
    'This page has moved on': 'یہ صفحہ موجود نہیں', 'Go to homepage': 'ہوم پیج پر جائیں'
  };

  var M = '(Rs\\. [\\d,]+)';
  var RX = [
    [new RegExp('^Free delivery across Pakistan on orders above ' + M + '$'), 'پورے پاکستان میں $1 سے زائد کے آرڈرز پر مفت ڈیلیوری'],
    [new RegExp('^Pay online with JazzCash or Easypaisa & get ' + M + ' off$'), 'جاز کیش یا ایزی پیسہ سے آن لائن ادائیگی پر $1 کی رعایت'],
    [new RegExp('^On orders over ' + M + '$'), '$1 سے زائد کے آرڈرز پر'],
    [new RegExp('^Free delivery on orders over ' + M + '$'), '$1 سے زائد کے آرڈرز پر مفت ڈیلیوری'],
    [new RegExp('^Inclusive of sales tax · or pay online and save ' + M + '$'), 'سیلز ٹیکس سمیت · یا آن لائن ادائیگی پر $1 بچائیں'],
    [new RegExp('^Save (\\d+)% · ' + M + '$'), '$1% بچت · $2'],
    [new RegExp('^Save ' + M + '$'), '$1 بچائیں'],
    [new RegExp('^Checkout · ' + M + '$'), 'چیک آؤٹ · $1'],
    [new RegExp('^Place order · ' + M + '$'), 'آرڈر کریں · $1'],
    [new RegExp('^Pay ' + M + '$'), '$1 ادا کریں'],
    [new RegExp('^Under ' + M + '$'), '$1 سے کم'],
    [new RegExp('^' + M + ' & above$'), '$1 اور زائد'],
    [new RegExp('^Prices include sales tax\\. Pay online and save a further ' + M + '\\.$'), 'قیمتوں میں سیلز ٹیکس شامل ہے۔ آن لائن ادائیگی پر مزید $1 بچائیں۔'],
    [new RegExp('^Please keep the exact amount ready\\. Orders above ' + M + ' require advance payment\\.$'), 'براہ کرم پوری رقم تیار رکھیں۔ $1 سے زائد کے آرڈرز پر پیشگی ادائیگی ضروری ہے۔'],
    [new RegExp('^Orders above ' + M + ' need advance payment — please choose another method\\.$'), '$1 سے زائد کے آرڈرز پر پیشگی ادائیگی ضروری ہے — کوئی اور طریقہ منتخب کریں۔'],
    [/^(\d+) items?$/, '$1 اشیاء'],
    [/^(\d+) products?$/, '$1 پراڈکٹس'],
    [/^Showing (\d+) of (\d+)$/, '$2 میں سے $1'],
    [/^You've seen all (\d+) items$/, 'آپ نے تمام $1 اشیاء دیکھ لیں'],
    [/^Show (\d+) results$/, '$1 نتائج دکھائیں'],
    [/^See all (\d+) results$/, 'تمام $1 نتائج دیکھیں'],
    [/^Up to (\d+)% off$/, '$1% تک رعایت'],
    [/^Sale — up to (\d+)% off$/, 'سیل — $1% تک رعایت'],
    [/^(\d+)-Piece$/, '$1 پیس'],
    [/^Unstitched · (\d+)-Piece$/, 'ان سلا · $1 پیس'],
    [/^(\d+)-Piece · Ready-to-wear$/, '$1 پیس · ریڈی ٹو ویئر'],
    [/^(\d+–\d+) working days$/, '$1 کاروباری دن'],
    [/^(\d+–\d+) working days · Leopards \/ TCS$/, '$1 کاروباری دن · Leopards / TCS'],
    [/^Express is available in (.+)\.$/, 'ایکسپریس ان شہروں میں دستیاب ہے: $1۔'],
    [/^(\d\.\d) · (\d+) reviews$/, '$1 · $2 تبصرے'],
    [/^Shukriya, (.+)!$/, 'شکریہ، $1!'],
    [/^Discount \((.+)\)$/, 'رعایت ($1)'],
    [/^Code (\S+) applied$/, 'کوڈ $1 لاگو ہو گیا'],
    [/^Code sent to (.+)$/, 'کوڈ $1 پر بھیج دیا گیا'],
    [/^Results for “(.*)”$/, '“$1” کے نتائج'],
    [/^Showing results for$/, 'نتائج برائے'],
    [/^Shop (\d+) of (\d+)$/, '$2 میں سے $1']
  ];
  /* phrases replaced inside longer text nodes */
  var SUB = [['Pakistan · PKR', 'پاکستان · PKR']];

  /* keep number ranges (1–2, 300–400, 100 × 108″) reading left-to-right inside Urdu text */
  function iso(s) { return s.replace(/\d[\d,.]*″?(\s*[–×\/-]\s*\d[\d,.]*″?)+/g, function (m) { return '⁦' + m + '⁩'; }); }
  function tr(s) { var r = tr0(s); return r === null ? null : iso(r); }
  function tr0(s) {
    var t = s.trim();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(D, t)) return s.replace(t, function () { return D[t]; });
    for (var i = 0; i < RX.length; i++) if (RX[i][0].test(t)) { var out = t.replace(RX[i][0], RX[i][1]); return s.replace(t, function () { return out; }); }
    for (var j = 0; j < SUB.length; j++) if (t.indexOf(SUB[j][0]) > -1) return s.split(SUB[j][0]).join(SUB[j][1]);
    return null;
  }
  var ATTRS = ['placeholder', 'aria-label', 'title'];
  function skip(el) { return !el || /^(SCRIPT|STYLE|TEXTAREA)$/.test(el.nodeName) || (el.closest && el.closest('[translate="no"]')); }
  function doText(n) { if (skip(n.parentNode)) return; var r = tr(n.data); if (r !== null && r !== n.data) n.data = r; }
  function doAttrs(el) {
    ATTRS.forEach(function (a) { if (el.hasAttribute && el.hasAttribute(a)) { var r = tr(el.getAttribute(a)); if (r !== null) el.setAttribute(a, r); } });
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || skip(root)) return;
    doAttrs(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) doText(n);
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(doAttrs);
  }

  function init(lang) {
    if (lang !== 'ur') return;
    var html = document.documentElement;
    html.lang = 'ur-PK'; html.dir = 'rtl'; html.classList.add('ur');
    walk(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(walk); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.RSBRI = window.RSBRI || {};
  window.RSBRI.i18n = { init: init, t: function (s) { var r = tr(s); return r === null ? s : r; } };
})();
