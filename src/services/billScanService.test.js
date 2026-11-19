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
    roundingAdjustment: 0,
    expectedTotal: 3824.26
  });
  assert.deepEqual(result.items.map(({ discount }) => discount), [2, 20, 10, 2, 0, 25, 6]);
  assert.deepEqual(result.invoice, {
    storeName: "DMart",
    invoiceNumber: "DM/BLR/2026/001234",
    invoiceDate: "15 Jan 2026",
    paymentMethod: "UPI"
  });
});

test("parses common receipt layouts from plain OCR text", () => {
  const text = `Fresh Market
Bill Total: $24.50
Subtotal $22.00
Tax 2.50
Milk 2 x 5.50 = 11.00
Bread @ 4.50
Eggs 1 5.50
Thank you`;

  const result = parseBillScan({ text });

  assert.deepEqual(result.items.map(({ name, quantity, lineTotal }) => ({
    name,
    quantity,
    lineTotal
  })), [
    { name: "Milk", quantity: 2, lineTotal: 11 },
    { name: "Bread", quantity: 1, lineTotal: 4.5 },
    { name: "Eggs", quantity: 1, lineTotal: 5.5 }
  ]);
  assert.equal(result.summary.subtotal, 22);
  assert.equal(result.summary.additionalFees, 2.5);
  assert.equal(result.summary.roundingAdjustment, 0);
  assert.equal(result.summary.expectedTotal, 24.5);
});

test("parses a twelve-row grocery receipt without changing its printed totals", () => {
  const additionalRows = [
    ["Whole Wheat Bread", 60],
    ["Basmati Rice 5kg", 250],
    ["Eggs 6 pack", 48],
    ["Bananas 1kg", 44],
    ["Curd 500g", 42],
    ["Potatoes 1kg", 35],
    ["Tomatoes 1kg", 40],
    ["Dish Soap 500ml", 175.5]
  ].map(([name, amount], index) => `${index + 5} ${name} 1 ${amount.toFixed(2)}`);
  const text = `Fresh Mart
Date: 19 Nov 2026
Item Description Qty Amount
1 Aashirvaad Atta 10kg 1 369.00
2 Amul Fresh Milk 1L 1 66.00
3 Maggi Noodles 70g 5 15.00 75.00
4 Dettol Handwash 250ml 1 89.10
${additionalRows.join("\n")}
Subtotal ₹1,293.60
CGST ₹32.34
SGST ₹32.34
Round Off -₹0.28
Total ₹1,358.00`;

  const result = parseBillScan({ text });
  const itemSubtotal = result.items.reduce((sum, item) => sum + item.lineTotal, 0);

  assert.equal(result.items.length, 12);
  assert.deepEqual(result.items.slice(0, 4).map(({ name, quantity, lineTotal }) => ({
    name,
    quantity,
    lineTotal
  })), [
    { name: "Aashirvaad Atta 10kg", quantity: 1, lineTotal: 369 },
    { name: "Amul Fresh Milk 1L", quantity: 1, lineTotal: 66 },
    { name: "Maggi Noodles 70g", quantity: 5, lineTotal: 75 },
    { name: "Dettol Handwash 250ml", quantity: 1, lineTotal: 89.1 }
  ]);
  assert.equal(Math.round(itemSubtotal * 100) / 100, 1293.6);
  assert.deepEqual(result.summary, {
    subtotal: 1293.6,
    taxableAmount: null,
    discount: 0,
    additionalFees: 64.68,
    roundingAdjustment: -0.28,
    expectedTotal: 1358
  });
  assert.equal(
    result.summary.subtotal + result.summary.additionalFees + result.summary.roundingAdjustment,
    result.summary.expectedTotal
  );
});

test("keeps repeated product rows instead of discarding a duplicate line", () => {
  const result = parseBillScan({
    text: `Market
Milk 1 3.50
Milk 1 3.50`
  });

  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.lineTotal), [3.5, 3.5]);
});
