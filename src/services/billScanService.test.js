import assert from "node:assert/strict";
import test from "node:test";
import { parseBillScan } from "./billScanService.js";

test("parses all items and totals from the DMart tax invoice", () => {
  const text = `DMart
Avenue Supermarkets Ltd.
DMart, Sarjapur Main Road, Iblur Village,
Bengaluru - 560102, Karnataka
GSTIN: 29AABCA4581P1ZP
TAX INVOICE
Invoice No : DM/BLR/2026/001234
Date : 15 Jan 2026 14:37
Cashier : C0245
Bill Type : Retail
Payment : UPI
Sl Item Description Qty MRP (₹) Disc (₹) Price (₹)
1 Amul Toned Milk 500 ml 2 32.00 2.00 60.00
2 Aashirvaad Atta 5 kg 1 295.00 20.00 275.00
3 Fortune Sunflower Oil 1 L 1 165.00 10.00 155.00
4 Tata Salt 1 kg 1 28.00 2.00 26.00
5 Maggi 2-Min Noodles 70 g 4 15.00 0.00 60.00
6 Colgate Toothpaste 150 g 1 140.00 25.00 115.00
7 Dove Bathing Soap 100 g 3 55.00 6.00 159.00
Subtotal ₹850.00
Total Discount -₹65.00
Taxable Amount ₹785.00
CGST (2.5%) ₹19.63
SGST (2.5%) ₹19.63
Total Amount ₹3824.26
Items: 7 | Total Qty: 13
You Saved ₹65.00 on this Bill!
1001234567894`;

  const result = parseBillScan({ text });

  assert.deepEqual(result.items.map(({ name, quantity, lineTotal }) => ({
    name,
    quantity,
    lineTotal
  })), [
    { name: "Amul Toned Milk 500 ml", quantity: 2, lineTotal: 60 },
    { name: "Aashirvaad Atta 5 kg", quantity: 1, lineTotal: 275 },
    { name: "Fortune Sunflower Oil 1 L", quantity: 1, lineTotal: 155 },
    { name: "Tata Salt 1 kg", quantity: 1, lineTotal: 26 },
    { name: "Maggi 2-Min Noodles 70 g", quantity: 4, lineTotal: 60 },
    { name: "Colgate Toothpaste 150 g", quantity: 1, lineTotal: 115 },
    { name: "Dove Bathing Soap 100 g", quantity: 3, lineTotal: 159 }
  ]);
  assert.deepEqual(result.summary, {
    subtotal: 850,
    taxableAmount: 785,
    discount: 65,
    additionalFees: 39.26,
    expectedTotal: 824.26
  });
  assert.deepEqual(result.invoice, {
    storeName: "DMart",
    invoiceNumber: "DM/BLR/2026/001234",
    invoiceDate: "15 Jan 2026",
    paymentMethod: "UPI"
  });
});
