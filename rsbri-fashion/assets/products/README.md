# Product photos

Put real product photos in this folder. Any product that lists photos shows them instead of the drawn placeholder artwork. Products without photos keep the artwork.

## 1. Prepare the photos

- **Shape:** portrait 3:4, for example 1200 × 1600 px. Square or landscape photos are cropped to fit.
- **Format:** WebP or JPG, under about 250 KB each, so pages load fast on mobile data.
- **Names:** lowercase with dashes, for example `gulnar-lawn-1.webp`, `gulnar-lawn-2.webp`.

For each product, up to four photos, in this order:

1. Front: the main image on listings and the product page
2. Styled or lifestyle: shown when a shopper hovers over the card
3. Fabric close-up
4. Detail: embroidery, border or packaging

One photo is enough to start. The site repeats it where a second photo is missing.

## 2. Attach the photos to a product

In `assets/data.js`, add `images` to the product's options. The options are the `{ ... }` at the end of its line:

```js
['Gulnar Embroidered Lawn', 'women', 'unstitched', 'summer-lawn', 'Lawn', 3, 6490, 4990,
  [['Rose', '#C98B8B'], ['Sage', '#8FA58C']], 'floral', 'folded',
  { occasion: 'Casual', badges: ['new', 'best'],
    images: ['assets/products/gulnar-lawn-1.webp', 'assets/products/gulnar-lawn-2.webp'] }],
```

If each colour has its own photos, give one list per colour, in the same order as the colours:

```js
images: [
  ['assets/products/gulnar-rose-1.webp', 'assets/products/gulnar-rose-2.webp'],   // Rose
  ['assets/products/gulnar-sage-1.webp', 'assets/products/gulnar-sage-2.webp']    // Sage
]
```
