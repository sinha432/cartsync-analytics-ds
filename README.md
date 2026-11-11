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
