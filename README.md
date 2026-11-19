# CartSync Analytics

CartSync Analytics is a React and Vite application for comparing grocery prices and splitting shared expenses.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run lint` and `npm run build` to check the application.
Run `npm test` for receipt-parsing and bill-split calculation tests.

## Grocery comparison data

Price comparison reads the bundled CSV files in `public/data/` directly in the browser. It does not use a product-search API or require a pincode. The bundled datasets include retailer listings, the JioMart scrape, and the Nandini multi-retailer CSV. Replace those files with updated datasets using the same column layouts to refresh the comparison data.

The JioMart scrape contains some price/pack entries without a matching product title; those incomplete entries are excluded rather than shown with a guessed product name.

## Bill scanning

Bill images are recognized in the browser with Tesseract.js and are not sent to an OCR service. The first scan needs an internet connection to download Tesseract's worker and English-language data; no OCR API key is required. Upload an image or take a photo, check the preview, and review or edit the store, date, item rows, quantities, prices, visible line discounts, tax/fees, receipt adjustment, and printed totals before adding the bill. Receipt row amounts and printed totals are kept as recognized: the scanner does not rewrite printed values to make the arithmetic reconcile. It warns when item rows differ from the printed subtotal or when subtotal, discount, tax/fees, adjustment, and total do not add up. Correct the values or explicitly acknowledge the warning before adding. A signed receipt adjustment supports printed rounding differences. Items are split equally among their selected people; tax/fees and receipt adjustments can be allocated proportionally to item shares or equally across all members. Adding a reviewed bill replaces the current cart.

OCR accuracy depends on image quality, orientation, legibility, and browser support for the image format. The scanner can show the OCR text for review; unsupported image formats should be converted to JPG or PNG. OCR results always require human review before confirming a split.

## Local MongoDB bill storage

The Vercel development API stores confirmed grocery bills in the local MongoDB database `cartsync`, collection `bills`, and provides searchable bill history. Budget Management continues to use the browser ledger for immediate updates. The API is intentionally available only from a non-production local development server connected to a MongoDB instance on localhost; it does not expose unauthenticated bill access to a production deployment.

### Configure local MongoDB

1. Install and start MongoDB Community locally. On the Homebrew setup used for this project, start it with `mongod --config /opt/homebrew/etc/mongod.conf --setParameter diagnosticDataCollectionEnabled=false --fork`; its configured data directory is `/opt/homebrew/var/mongodb`. Disabling the diagnostic collector avoids a local metrics-file crash seen in this environment. The default URI is `mongodb://localhost:27017`.
2. Copy `.env.example` to `.env.local` if needed. Set `MONGODB_URI=mongodb://localhost:27017` and `MONGODB_DB=cartsync`. Keep `.env.local` private; it is ignored by Git.
3. Run the Vite development server; it serves `/api/bills` locally as well:

   ```sh
   npm run dev
   ```

4. Open the local URL printed by Vite. Bill History connects automatically; existing confirmed bills in the browser spending ledger are copied to MongoDB when the local database is available. The browser ledger remains in place for Budget Management.

Alternatively, `npx vercel dev` can serve the app and API together. A deployed Vercel app cannot connect to your computer's localhost; this local database setup is for local development. Existing browser-ledger data is not automatically migrated into MongoDB.
