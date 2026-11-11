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

Bill images are recognized in the browser with Tesseract.js and are not sent to an OCR service. The browser may download OCR worker and language resources. Review and edit item rows, quantities, prices, discounts, taxes/fees, and the receipt total before adding them. Receipt line totals are converted to unit prices, and the scanner flags totals that do not reconcile. Adding a reviewed bill replaces the current cart. Each item is split equally among its selected participants; there are no consumption-weight settings.

## MongoDB Atlas bill storage

The optional Vercel serverless API stores confirmed grocery bills in Atlas while retaining the existing browser ledger for immediate Budget Management updates. It also provides searchable bill history and rejects duplicate invoices when store name, invoice number, date, and total are all available. The API requires a shared administrator token; users enter it in the Bill History panel, where it is held in the current browser session only. This is not per-user authentication—use an identity provider before exposing private bill data to a broad public audience.

### Configure Atlas locally

1. Create an Atlas database user with read/write access only to the CartSync database. Add the development machine's IP to the Atlas network access list; avoid opening access to all IPs unless required.
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI`, `MONGODB_DB`, and a long random `CARTSYNC_API_TOKEN`. Keep `.env.local` private; it is ignored by Git.
3. Run the Vercel development server so the Vite app and `/api/bills` function run together:

   ```sh
   npx vercel dev
   ```

4. Open the local URL printed by Vercel, then enter the same API token in the Bill History panel.

### Configure Vercel

Set `MONGODB_URI`, `MONGODB_DB`, and `CARTSYNC_API_TOKEN` as encrypted environment variables in the Vercel project's Development, Preview, and Production environments as appropriate. Redeploy after changing variables. Do not use a `VITE_` prefix for secrets. The browser's `npm run dev` server alone does not run Vercel API functions.

The serverless API reuses one MongoDB client per warm function instance and uses a small pool (`maxPoolSize: 5`, `maxIdleTimeMS: 30s`) assuming low-volume, bursty Vercel usage. Leave Atlas connection and creation metrics enabled; investigate sustained pool wait queues, repeated connection creation, or `connections.current` approaching the cluster's limit before changing pool settings.
