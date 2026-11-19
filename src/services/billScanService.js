const SUMMARY_LINE = /^\s*(?:sub\s*total\b|grand\s*total\b|total\s*amount\b|net\s*amount\b|amount\s*payable\b|balance\s+due\b|invoice\s+total\b|bill\s+total\b|taxable\s*amount\b|total\s+discount\b|discount\b|cgst\b|sgst\b|igst\b|gst\b|vat\b|tax\b|tip\b|gratuity\b|round\s*(?:off|up|down)\b|delivery\s*fee\b|service\s*charge\b|handling\s*charge\b|packaging\s*charge\b|convenience\s*fee\b|invoice(?:\s+(?:no|number)\b)?|bill\s*no\b|receipt\b|payment\b|upi\b|barcode\b|you\s+saved\b|date\b|cashier\b|bill\s*type\b|gstin\b|total\s*qty\b|total(?:\s*[:₹$-]|\s+\d)|items?\s*[:|])/i;
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

function parseQuantityToken(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[Oo]/g, "0")
    .replace(/^[iIl|!]([})\]]|q)?$/i, "1");
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
  const discountStart = Number.isFinite(columns.discount)
    ? ((Number.isFinite(columns.rate) ? columns.rate : columns.quantity) + columns.discount) / 2
    : Number.POSITIVE_INFINITY;
  const discountEnd = Number.isFinite(columns.discount)
    ? (columns.discount + columns.price) / 2
    : Number.NEGATIVE_INFINITY;
  const discountWord = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null && center >= discountStart && center < discountEnd;
    })
    .reverse()
    .find((word) => wordNumber(word) !== null);
  const quantity = quantityWord ? wordQuantity(quantityWord) : null;
  const lineTotal = priceWord ? wordNumber(priceWord) : null;
  const discount = discountWord ? wordNumber(discountWord) : 0;
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

  return name ? { name, quantity, lineTotal, discount } : null;
}

function parsePlainRow(line) {
  const text = textOf(line);
  const serial = text.match(/^\s*(\d{1,3})[.)]?\s+(.+)$/);
  if (!serial || SUMMARY_LINE.test(text)) return null;

  const remainder = serial[2].trim();
  const taxInvoiceColumns = remainder.match(
    /^(.*?)\s+\d{3,8}\s+([0-9OoIi|!}qQ]{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+([\d,]+(?:\.\d{1,2})?)\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  if (taxInvoiceColumns) {
    const name = taxInvoiceColumns[1].trim();
    const quantityText = taxInvoiceColumns[2]
      .replace(/^[iIl|!]([})\]]|q)?$/i, "1")
      .replace(/^(\d+)[})\]]$/, "$1");
    const quantity = Number(quantityText);
    const discount = readMoney(taxInvoiceColumns[3]);
    const lineTotal = readMoney(taxInvoiceColumns[4]);
    if (name.length >= 2 && Number.isInteger(quantity) && quantity > 0 && quantity <= 10000 && lineTotal > 0) {
      return { name, quantity, lineTotal, discount };
    }
  }

  const fourColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+([\d,]+(?:\.\d{1,2})?)\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const threeColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const columns = fourColumns ?? threeColumns;
  if (!columns) return null;

  const name = columns[1].replace(/[\s|:;=-]+$/, "").trim();
  const quantity = Number(columns[2]);
  const hasDiscount = columns === fourColumns;
  const discount = hasDiscount ? readMoney(columns[3]) : 0;
  const lineTotal = readMoney(hasDiscount ? columns[4] : columns[3]);
  if (!name || name.length < 2 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || !lineTotal) {
    return null;
  }

  return { name, quantity, lineTotal, discount };
}

function parseFlexibleRow(line) {
  const text = textOf(line);
  if (!text || SUMMARY_LINE.test(text)) return null;

  let row = text.replace(/^\s*\d{1,3}[.)]?\s+/, "");
  row = row.replace(/[-‐‑–—]+\s*$/, "").trim();
  if (!row) return null;

  // Common receipt formats:
  //   2 x Milk 30.00 60.00
  //   Milk 2 x 30.00 = 60.00
  //   Milk @ 30.00 2 60.00
  const milkStyle = row.match(
    /^(.+?)\s+([0-9Oo1lIi|!]{1,4})\s*[x×]\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:=|[-‐‑–—])?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/
  );
  if (milkStyle) {
    const name = milkStyle[1].trim();
    const quantity = parseQuantityToken(milkStyle[2]);
    const lineTotal = readMoney(milkStyle[5] ?? milkStyle[4]);
    if (name && quantity && lineTotal > 0) return { name, quantity, lineTotal };
  }

  const atPrice = row.match(
    /^(.+?)\s*@\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/
  );
  if (atPrice) {
    const name = atPrice[1].trim();
    const lineTotal = readMoney(atPrice[2]);
    if (name && lineTotal > 0) return { name, quantity: 1, lineTotal };
  }

  const prefixedQuantity = row.match(
    /^(.+?)[\s:]*([0-9Oo1lIi|!]{1,4})\s*[x×]\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:=|of)?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/
  );
  if (prefixedQuantity) {
    const name = prefixedQuantity[1].trim();
    const quantity = parseQuantityToken(prefixedQuantity[2]);
    const lineTotal = readMoney(prefixedQuantity[4]);
    if (name && quantity && lineTotal > 0) return { name, quantity, lineTotal };
  }

  const quantityByAt = row.match(
    /^(.*?)\s*(?:qty\.?|quantity)?\s*[×x]?\s*(\d{1,4})\s*@\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:=|[-‐‑–—]?)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/
  );
  if (quantityByAt) {
    const name = quantityByAt[1].replace(/[\s|:;=-]+$/, "").trim();
    const quantity = Number(quantityByAt[2]);
    const lineTotal = readMoney(quantityByAt[4]);
    if (name.length >= 2 && quantity > 0 && quantity <= 10000 && lineTotal > 0) {
      return { name, quantity, lineTotal };
    }
  }

  const matches = [...row.matchAll(MONEY_TOKEN)];
  const lastMatch = matches.at(-1);
  if (!lastMatch || !/^[\s.)-]*$/.test(row.slice(lastMatch.index + lastMatch[0].length))) {
    return null;
  }

  const lineTotal = readMoney(lastMatch[1]);
  if (!lineTotal || lineTotal <= 0) return null;

  let name = row.slice(0, lastMatch.index).trim();
  let quantity = 1;

  // For "Name 2 60.00", the first numeric token is the quantity.
  // Keep only plausible quantities and require at least two numeric tokens.
  if (matches.length >= 2) {
    const quantityMatch = row.slice(0, lastMatch.index).match(
      /(?:^|\s)([0Oo1lIi|]{1,4}|[0-9]{1,3}(?:\.0+)?)$/
    );
    if (quantityMatch) {
      const possibleQuantity = parseQuantityToken(quantityMatch[1]);
      if (possibleQuantity && possibleQuantity <= 100) {
        const quantityIndex = quantityMatch.index;
        const candidateName = row.slice(0, quantityIndex).trim();
        if (candidateName.length >= 2) {
          name = candidateName;
          quantity = possibleQuantity;
        }
      }
    }
  }

  // For "Name 2 @ 30.00" without a repeated line total, derive the total.
  if (matches.length === 1) {
    const atPattern = name.match(
      /^(.+?)\s+([0Oo1lIi|]{1,4})\s*(?:@|×|x)\s*(?:₹|rs\.?|inr)?\s*[\d,.]+\s*$/
    );
    if (atPattern) {
      const possibleQuantity = parseQuantityToken(atPattern[2]);
      if (possibleQuantity) {
        name = atPattern[1].trim();
        quantity = possibleQuantity;
      }
    }
  }

  name = name.replace(/[\s|:;=-]+$/, "").trim();
  if (!/[a-z]{2}/i.test(name)) return null;

  return { name, quantity, lineTotal };
}

function parseSummary(lines) {
  const summary = {
    subtotal: null,
    taxableAmount: null,
    discount: 0,
    additionalFees: 0,
    roundingAdjustment: 0,
    expectedTotal: null
  };
  let taxFound = false;
  let extraFeeFound = false;

  for (const line of lines) {
    const text = textOf(line);
    const values = numbersIn(text);
    const amount = values.at(-1);
    if (amount === undefined) continue;

    if (/\bsub\s*total\b/i.test(text)) {
      summary.subtotal = amount;
    } else if (/\b(?:total\s+amount|grand\s*total|net\s*amount|amount\s*payable|balance\s+due|invoice\s+total|bill\s+total)\b|^total(?:\s*[:₹$-]|\s+\d)/i.test(text)) {
      summary.expectedTotal = amount;
    } else if (/\btaxable\s+amount\b/i.test(text)) {
      summary.taxableAmount = amount;
    } else if (/\b(?:total\s+)?discount\b|\byou\s+saved\b/i.test(text)) {
      summary.discount = amount;
    } else if (/\bround\s*(?:off|up|down)\b/i.test(text)) {
      const sign = /-\s*(?:₹|rs\.?|inr)?\s*\d/i.test(text) ? -1 : 1;
      summary.roundingAdjustment = Math.round(sign * amount * 100) / 100;
    } else if (/\b(?:cgst|sgst|igst|gst|vat|tax)\b/i.test(text)) {
      summary.additionalFees += amount;
      taxFound = true;
    } else if (/\b(?:delivery\s+fee|service\s+charge|handling\s+charge|packaging\s+charge|convenience\s+fee|tip|gratuity)\b/i.test(text)) {
      summary.additionalFees += amount;
      extraFeeFound = true;
    }
  }

  if (!taxFound && !extraFeeFound) summary.additionalFees = 0;
  summary.discount = Math.round(summary.discount * 100) / 100;
  summary.additionalFees = Math.round(summary.additionalFees * 100) / 100;
  return { summary };
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
  const header = headerColumns(lines);
  const { summary } = parseSummary(lines);
  const invoice = parseInvoiceDetails(lines);
  const rowLines = header
    ? lines.slice(lines.indexOf(header.header) + 1).filter((line) => {
      const text = textOf(line);
      return text && !SUMMARY_LINE.test(text);
    })
    : lines.filter((line) => !SUMMARY_LINE.test(textOf(line)));

  const items = [];
  for (const line of rowLines) {
    const parsed = header
      ? parseRowByColumns(line, header.columns) ?? parsePlainRow(line) ?? parseFlexibleRow(line)
      : parsePlainRow(line) ?? parseFlexibleRow(line);
    if (!parsed) continue;

    items.push({
      name: parsed.name,
      quantity: parsed.quantity,
      lineTotal: parsed.lineTotal,
      discount: Number(parsed.discount ?? 0),
      price: Math.round((parsed.lineTotal / parsed.quantity) * 100) / 100
    });
  }

  return { items, summary, invoice };
}

export function parseBillItems(text) {
  return parseBillScan({ text }).items;
}
