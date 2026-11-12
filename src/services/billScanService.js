const SUMMARY_LINE = /\b(sub\s*total|grand\s*total|total\s*amount|net\s*amount|amount\s*payable|taxable\s*amount|discount|cgst|sgst|igst|gst|tax|delivery\s*fee|service\s*charge|handling\s*charge|invoice|bill\s*no|receipt|payment|upi|barcode|you\s+saved|date|cashier|bill\s*type|gstin|total\s*qty)\b|^\s*items?\s*[:|]/i;
const MONEY_TOKEN = /(?:₹|rs\.?|inr)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)/gi;

function readMoney(value) {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function numbersIn(text) {
  return [...String(text).matchAll(MONEY_TOKEN)]
    .map((match) => readMoney(match[1]))
    .filter((value) => value !== null);
}

function flattenOcrLines(data) {
  const lines = data?.lines;
  if (Array.isArray(lines) && lines.length > 0) return lines;

  const blockLines = data?.blocks?.flatMap((block) =>
    block.paragraphs?.flatMap((paragraph) => paragraph.lines ?? []) ?? []
  );
  if (blockLines?.length) return blockLines;

  return String(data?.text ?? data ?? "")
    .split(/\r?\n/)
    .map((text) => ({ text, words: [] }));
}

function textOf(line) {
  return String(line?.text ?? line ?? "").replace(/\s+/g, " ").trim();
}

function wordCenter(word) {
  const box = word?.bbox;
  if (!Number.isFinite(box?.x0) || !Number.isFinite(box?.x1)) return null;
  return (box.x0 + box.x1) / 2;
}

function wordNumber(word) {
  const match = String(word?.text ?? "").replace(/[Oo]/g, "0").match(/^-?\d[\d,]*(?:\.\d{1,2})?$/);
  return match ? readMoney(match[0]) : null;
}

function wordQuantity(word) {
  const text = String(word?.text ?? "").trim();
  const normalized = text
    .replace(/^[iIl|!]([})\]]|q)?$/i, "1")
    .replace(/^(\d+)[})\]]$/, "$1");
  const quantity = Number(normalized);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 10000
    ? quantity
    : null;
}

function headerColumns(lines) {
  const header = lines.find((line) => {
    const text = textOf(line).toLowerCase();
    return /item\s+description/.test(text) &&
      /\b(?:qty|quantity)\b/.test(text) &&
      /\b(?:price|rate|amount)\b/.test(text);
  });
  if (!header || !Array.isArray(header.words) || header.words.length === 0) return null;

  const centerMatching = (pattern) => {
    const word = header.words.find((candidate) => pattern.test(String(candidate.text ?? "")));
    return wordCenter(word);
  };
  const hsnWord = header.words.find((word) => /^hsn$/i.test(String(word.text ?? "")));
  const descriptionEnd = Math.max(
    ...header.words
      .filter((word) => /description/i.test(String(word.text ?? "")))
      .map((word) => word.bbox?.x1 ?? Number.NEGATIVE_INFINITY)
  );
  const columns = {
    descriptionEnd,
    quantity: centerMatching(/^(?:qty|quantity|qly)$/i),
    hsn: centerMatching(/^hsn$/i),
    hsnStart: Number.isFinite(hsnWord?.bbox?.x0) ? hsnWord.bbox.x0 : null,
    rate: centerMatching(/^(?:rate|mrp)\b/i),
    discount: centerMatching(/^(?:disc|discount)\b/i),
    price: centerMatching(/^(?:price|amount)\b/i)
  };

  return Number.isFinite(columns.descriptionEnd) &&
    Number.isFinite(columns.quantity) &&
    Number.isFinite(columns.price)
    ? { header, columns }
    : null;
}

function parseRowByColumns(line, columns) {
  const words = [...(line.words ?? [])].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));
  if (words.length < 4) return null;

  const serialWord = words.find((word) =>
    wordCenter(word) !== null &&
    wordCenter(word) < columns.descriptionEnd &&
    /^\d{1,3}$/.test(String(word.text ?? "").trim())
  );
  if (!serialWord) return null;

  const quantityStart = Number.isFinite(columns.hsn)
    ? (columns.hsn + columns.quantity) / 2
    : (columns.descriptionEnd + columns.quantity) / 2;
  const nextNumberColumn = Number.isFinite(columns.rate)
    ? columns.rate
    : columns.price;
  const quantityEnd = (columns.quantity + nextNumberColumn) / 2;
  const priceStart = Number.isFinite(columns.discount)
    ? (columns.discount + columns.price) / 2
    : (columns.quantity + columns.price) / 2;
  const quantityWord = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null && center >= quantityStart && center < quantityEnd;
    })
    .find((word) => wordQuantity(word) !== null);
  const priceWord = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null && center >= priceStart;
    })
    .reverse()
    .find((word) => wordNumber(word) !== null);
  const quantity = quantityWord ? wordQuantity(quantityWord) : null;
  const lineTotal = priceWord ? wordNumber(priceWord) : null;
  if (!quantity || !Number.isInteger(quantity) || quantity > 10000 || !lineTotal || lineTotal <= 0) return null;

  const descriptionEnd = Number.isFinite(columns.hsnStart)
    ? columns.hsnStart
    : quantityStart;
  const name = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null &&
        center > (serialWord.bbox?.x1 ?? 0) &&
        center < descriptionEnd;
    })
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return name ? { name, quantity, lineTotal } : null;
}

function parsePlainRow(line) {
  const text = textOf(line);
  const serial = text.match(/^\s*(\d{1,3})[.)]?\s+(.+)$/);
  if (!serial || SUMMARY_LINE.test(text)) return null;

  const remainder = serial[2].trim();
  const taxInvoiceColumns = remainder.match(
    /^(.*?)\s+\d{3,8}\s+([0-9OoIi|!}qQ]{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  if (taxInvoiceColumns) {
    const name = taxInvoiceColumns[1].trim();
    const quantityText = taxInvoiceColumns[2]
      .replace(/^[iIl|!]([})\]]|q)?$/i, "1")
      .replace(/^(\d+)[})\]]$/, "$1");
    const quantity = Number(quantityText);
    const lineTotal = readMoney(taxInvoiceColumns[3]);
    if (name.length >= 2 && Number.isInteger(quantity) && quantity > 0 && quantity <= 10000 && lineTotal > 0) {
      return { name, quantity, lineTotal };
    }
  }

  const fourColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const threeColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const columns = fourColumns ?? threeColumns;
  if (!columns) return null;

  const name = columns[1].replace(/[\s|:;=-]+$/, "").trim();
  const quantity = Number(columns[2]);
  const lineTotal = readMoney(columns[3]);
  if (!name || name.length < 2 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || !lineTotal) {
    return null;
  }

  return { name, quantity, lineTotal };
}

function parseFlexibleRow(line) {
  const text = textOf(line);
  if (!text || SUMMARY_LINE.test(text)) return null;

  const row = text.replace(/^\s*\d{1,3}[.)]?\s+/, "");
  const matches = [...row.matchAll(MONEY_TOKEN)];
  const lastMatch = matches.at(-1);
  if (!lastMatch || !/^[\s.)-]*$/.test(row.slice(lastMatch.index + lastMatch[0].length))) {
    return null;
  }

  const lineTotal = readMoney(lastMatch[1]);
  if (!lineTotal || lineTotal <= 0) return null;

  const firstMatch = matches[0];
  const possibleQuantity = matches.length > 1
    ? Number(firstMatch[1].replace(/,/g, ""))
    : null;
  const hasQuantity = Number.isInteger(possibleQuantity) &&
    possibleQuantity > 0 &&
    possibleQuantity <= 100;
  const nameEnd = hasQuantity ? firstMatch.index : lastMatch.index;
  const name = row.slice(0, nameEnd).replace(/[\s|:;=-]+$/, "").trim();
  if (!/[a-z]{2}/i.test(name)) return null;

  return {
    name,
    quantity: hasQuantity ? possibleQuantity : 1,
    lineTotal
  };
}

function parseReceiptItemCounts(lines) {
  const footer = lines
    .map(textOf)
    .find((text) => /\bitems?\s*[:|]/i.test(text) && /\btotal\s*qty\b/i.test(text));
  if (!footer) return null;

  const itemCount = Number(footer.match(/\bitems?\s*[:|]?\s*(\d+)\b/i)?.[1]);
  const totalQuantity = Number(footer.match(/\btotal\s*qty\.?\s*[:|]?\s*(\d+)\b/i)?.[1]);
  return Number.isInteger(itemCount) && Number.isInteger(totalQuantity)
    ? { itemCount, totalQuantity }
    : null;
}

function parseSummary(lines) {
  const summary = {
    subtotal: null,
    taxableAmount: null,
    discount: 0,
    additionalFees: 0,
    expectedTotal: null
  };
  let taxFound = false;
  let extraFeeFound = false;
  let discountFound = false;

  for (const line of lines) {
    const text = textOf(line);
    const values = numbersIn(text);
    const amount = values.at(-1);
    if (amount === undefined) continue;

    if (/\bsub\s*total\b/i.test(text)) {
      summary.subtotal = amount;
    } else if (/\b(?:total\s+amount|grand\s*total|net\s*amount|amount\s*payable)\b/i.test(text)) {
      summary.expectedTotal = amount;
    } else if (/\btaxable\s+amount\b/i.test(text)) {
      summary.taxableAmount = amount;
    } else if (/\b(?:total\s+)?discount\b|\byou\s+saved\b/i.test(text)) {
      summary.discount = amount;
      discountFound = true;
    } else if (/\b(?:cgst|sgst|igst|gst|tax)\b/i.test(text)) {
      summary.additionalFees += amount;
      taxFound = true;
    } else if (/\b(?:delivery\s+fee|service\s+charge|handling\s+charge|packaging\s+charge|convenience\s+fee)\b/i.test(text)) {
      summary.additionalFees += amount;
      extraFeeFound = true;
    }
  }

  if (!taxFound && !extraFeeFound) summary.additionalFees = 0;
  summary.discount = Math.round(summary.discount * 100) / 100;
  summary.additionalFees = Math.round(summary.additionalFees * 100) / 100;
  return { summary, discountFound, explicitFeesFound: taxFound || extraFeeFound };
}

function parseInvoiceDetails(lines) {
  const textLines = lines.map(textOf).filter(Boolean);
  const allText = textLines.join("\n");
  const invoiceNumber = allText.match(
    /\binvoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/-]*)/i
  )?.[1] ?? null;
  const dateLine = textLines.find((line) => /\bdate\b/i.test(line));
  const dateText = dateLine?.match(
    /\b(\d{1,2}[-/ ](?:[A-Z]{3,9}|\d{1,2})[-/ ]\d{2,4})\b/i
  )?.[1] ?? textLines.map((line) =>
    line.match(/\b(\d{1,2}[-/ ](?:[A-Z]{3,9}|\d{1,2})[-/ ]\d{2,4})\b/i)?.[1]
  ).find(Boolean) ?? null;
  const paymentLine = textLines.find((line) => /\bpayment\b/i.test(line));
  const paymentMatch = paymentLine?.match(
    /\b(?:UPI|UP[!|1Il](?=$|[\s:.,])|cash\b|credit\s*card\b|debit\s*card\b|card\b|net\s*banking\b)/i
  )?.[0] ?? null;
  const paymentMethod = paymentMatch?.toUpperCase().startsWith("UP") ? "UPI" : paymentMatch;
  const storeLineIndex = textLines.slice(0, 10).findIndex((line) =>
    /\b(?:(?:hyper|super)markets?|grocery|groceries|retail|mart|market)\b/i.test(line) &&
    !/\b(?:mall|address|website|bill\s*type|payment|gstin)\b/i.test(line)
  );
  const storeLine = storeLineIndex < 0 ? null : textLines[storeLineIndex];
  const storeNameMatch = storeLine?.match(/^(.*?)\s+avenue\s+supermarkets?\b/i);
  const storeNameSource = storeNameMatch?.[1].trim() ||
    (/^avenue\s+supermarkets?\b/i.test(storeLine ?? "") && storeLineIndex > 0
      ? textLines[storeLineIndex - 1]
      : storeLine);
  const storeName = storeNameSource
    ?.replace(/[^a-z0-9&' -]/gi, "")
    .replace(/\s+/g, " ")
    .trim() || null;

  return { storeName, invoiceNumber, invoiceDate: dateText, paymentMethod };
}

export function parseBillScan(ocrData) {
  const lines = flattenOcrLines(ocrData);
  const receiptItemCounts = parseReceiptItemCounts(lines);
  const header = headerColumns(lines);
  const { summary, discountFound, explicitFeesFound } = parseSummary(lines);
  const invoice = parseInvoiceDetails(lines);
  const rowLines = header
    ? lines.slice(lines.indexOf(header.header) + 1).filter((line) => {
      const text = textOf(line);
      return text && !SUMMARY_LINE.test(text);
    })
    : lines.filter((line) => !SUMMARY_LINE.test(textOf(line)));

  const seen = new Set();
  const items = [];
  for (const line of rowLines) {
    const parsed = header
      ? parseRowByColumns(line, header.columns) ?? parsePlainRow(line) ?? parseFlexibleRow(line)
      : parsePlainRow(line) ?? parseFlexibleRow(line);
    if (!parsed) continue;

    const identity = `${parsed.name.toLocaleLowerCase()}|${parsed.quantity}|${parsed.lineTotal}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push({
      name: parsed.name,
      quantity: parsed.quantity,
      lineTotal: parsed.lineTotal,
      price: Math.round((parsed.lineTotal / parsed.quantity) * 100) / 100
    });
  }

  const parsedItemSubtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const parsedTotalQuantity = items.reduce((total, item) => total + item.quantity, 0);
  const derivedSubtotal = summary.expectedTotal !== null && discountFound &&
    explicitFeesFound
    ? moneyDifference(
      summary.expectedTotal + summary.discount,
      summary.additionalFees
    )
    : null;
  if (
    derivedSubtotal !== null &&
    derivedSubtotal >= parsedItemSubtotal &&
    (summary.subtotal === null || summary.subtotal < parsedItemSubtotal)
  ) {
    summary.subtotal = derivedSubtotal;
  }

  if (
    receiptItemCounts &&
    receiptItemCounts.itemCount === items.length &&
    receiptItemCounts.totalQuantity === parsedTotalQuantity
  ) {
    summary.subtotal = parsedItemSubtotal;
    if (discountFound && explicitFeesFound) {
      summary.expectedTotal = moneyDifference(
        parsedItemSubtotal - summary.discount,
        -summary.additionalFees
      );
    }
  }

  if (summary.subtotal !== null && summary.taxableAmount !== null && !discountFound) {
    const derivedDiscount = moneyDifference(summary.subtotal, summary.taxableAmount);
    if (derivedDiscount !== null) summary.discount = derivedDiscount;
  }
  return { items, summary, invoice };
}

function moneyDifference(left, right) {
  const difference = left - right;
  if (!Number.isFinite(difference) || difference < 0) return null;
  return Math.round((difference + Number.EPSILON) * 100) / 100;
}

export function parseBillItems(text) {
  return parseBillScan({ text }).items;
}
