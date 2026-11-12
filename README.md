# CartSync Analytics

CartSync Analytics is a React and Vite application for comparing grocery prices and splitting shared expenses.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run lint` and `npm run build` to check the application.

## Grocery comparison data

Price comparison reads the bundled CSV files in `public/data/` directly in the browser. It does not use a product-search API or require a pincode. The bundled datasets include retailer listings, the JioMart scrape, and the Nandini multi-retailer CSV. Replace those files with updated datasets using the same column layouts to refresh the comparison data.

The JioMart scrape contains some price/pack entries without a matching product title; those incomplete entries are excluded rather than shown with a guessed product name.

## Bill scanning

Bill images are recognized in the browser with Tesseract.js and are not sent to an OCR service. The browser may download OCR worker and language resources. Review and edit item rows, quantities, prices, discounts, taxes/fees, and the receipt total before adding them. Receipt line totals are converted to unit prices, and the scanner flags totals that do not reconcile. Tax and fees are taken only from explicitly recognized receipt lines; the scanner does not invent a fee to force the total to match. When explicit discounts, fees, and total prove that OCR missed a leading digit in the subtotal, the subtotal is derived from those values. Mismatches remain available in a collapsed review panel and must be corrected or acknowledged before adding. Adding a reviewed bill replaces the current cart. Each item is split equally among its selected participants; there are no consumption-weight settings.

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
